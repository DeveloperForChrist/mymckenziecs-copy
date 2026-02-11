#!/usr/bin/env python3
"""Upload case-law entries to Milvus (Zilliz).

Usage:
  - Set env vars: MILVUS_HOST, MILVUS_PORT (e.g. 19530), MILVUS_COLLECTION (default: case_law), OPENAI_API_KEY
  - Install deps: pip install -r scripts/case-law/requirements-milvus.txt
  - Run: python3 scripts/case-law/upload_to_milvus.py

Notes:
  - This script batches embedding generation and insertion. It requires network access to OpenAI and Milvus.
  - If you want me to run it here, add MILVUS details to `.env.local` and tell me to proceed.
"""
import os
import json
import time
from pathlib import Path
from typing import List, Dict

from openai import OpenAI
from pymilvus import (
    connections,
    FieldSchema,
    CollectionSchema,
    DataType,
    Collection,
    utility,
)


DATA_DIR = Path(".data/bronze/case-law")
CURATED = DATA_DIR / "curated.json"
CANDIDATES = DATA_DIR / "uksc-candidates.jsonl"

MILVUS_HOST = os.getenv("MILVUS_HOST")
MILVUS_PORT = os.getenv("MILVUS_PORT", "19530")
MILVUS_COLLECTION = os.getenv("MILVUS_COLLECTION", "case_law")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
VECTOR_DIM = int(os.getenv("VECTOR_DIM", "1536"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if OPENAI_API_KEY is None:
    raise SystemExit("OPENAI_API_KEY is required in environment to generate embeddings.")


def load_curated() -> List[Dict]:
    if not CURATED.exists():
        return []
    return json.loads(CURATED.read_text())


def load_candidates() -> List[Dict]:
    if not CANDIDATES.exists():
        return []
    items = []
    with open(CANDIDATES, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                continue
    return items


def dedupe_by_citation(records: List[Dict]) -> List[Dict]:
    seen = set()
    out = []
    for r in records:
        cit = (r.get("citation") or "").strip()
        if not cit:
            # fall back to title key
            cit = (r.get("title_key") or r.get("title") or "").strip()
        if cit in seen:
            continue
        seen.add(cit)
        out.append(r)
    return out


def make_input_text(r: Dict) -> str:
    title = r.get("title") or ""
    summary = r.get("summary") or ""
    return f"{title}\n\n{summary}".strip()


def ensure_collection(collection_name: str):
    # Define schema: id (varchar PK), citation, title, url, embedding
    fields = [
        FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=128, is_primary=True),
        FieldSchema(name="citation", dtype=DataType.VARCHAR, max_length=256),
        FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=1024),
        FieldSchema(name="url", dtype=DataType.VARCHAR, max_length=1024),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=VECTOR_DIM),
    ]
    schema = CollectionSchema(fields, description="case law vectors")

    if utility.has_collection(collection_name):
        coll = Collection(collection_name)
        return coll

    coll = Collection(name=collection_name, schema=schema)
    return coll


def batch(iterable, n=32):
    for i in range(0, len(iterable), n):
        yield iterable[i : i + n]


def main():
    all_records = []
    all_records.extend(load_curated())
    all_records.extend(load_candidates())
    print(f"Loaded curated={len(load_curated())}, candidates={len(load_candidates())}")

    records = dedupe_by_citation(all_records)
    print(f"Deduped -> {len(records)} records to process")

    # Connect to OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)

    # Connect to Milvus / Zilliz Cloud with TLS/token auth when available
    if not MILVUS_HOST:
        raise SystemExit("MILVUS_HOST is required in environment to connect to Milvus.")
    connect_kwargs = {}
    if os.getenv("ZILLIZ_API_KEY"):
        connect_kwargs["token"] = os.getenv("ZILLIZ_API_KEY")
    if os.getenv("MILVUS_USER") and os.getenv("MILVUS_PASSWORD"):
        connect_kwargs["user"] = os.getenv("MILVUS_USER")
        connect_kwargs["password"] = os.getenv("MILVUS_PASSWORD")
    # prefer secure/TLS for cloud deployments (port 443) unless disabled
    secure = True if str(MILVUS_PORT) == "443" or os.getenv("MILVUS_SECURE", "1") == "1" else False
    connections.connect(host=MILVUS_HOST, port=int(MILVUS_PORT), secure=secure, **connect_kwargs)

    coll = ensure_collection(MILVUS_COLLECTION)
    # create index and load later if desired — keep defaults for now

    to_insert_ids = []
    to_insert_citation = []
    to_insert_title = []
    to_insert_url = []
    to_insert_vectors = []

    for batch_records in batch(records, n=64):
        inputs = [make_input_text(r) for r in batch_records]
        # generate embeddings
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=inputs)
        vectors = [e.embedding for e in resp.data]

        for r, vec in zip(batch_records, vectors):
            cid = (r.get("citation") or r.get("title_key") or r.get("title") or "").strip()
            if not cid:
                # fallback to generated id
                cid = f"case-{int(time.time()*1000)}-{len(to_insert_ids)}"
            to_insert_ids.append(cid)
            to_insert_citation.append(r.get("citation") or "")
            to_insert_title.append(r.get("title") or "")
            to_insert_url.append(r.get("url") or "")
            to_insert_vectors.append(vec)

        # insert in batches to Milvus
        entities = [to_insert_ids, to_insert_citation, to_insert_title, to_insert_url, to_insert_vectors]
        coll.insert(entities)
        print(f"Inserted {len(to_insert_ids)} vectors so far")
        to_insert_ids = []
        to_insert_citation = []
        to_insert_title = []
        to_insert_url = []
        to_insert_vectors = []

    # load collection for search
    coll.load()
    print("Upload complete and collection loaded")


if __name__ == "__main__":
    main()
