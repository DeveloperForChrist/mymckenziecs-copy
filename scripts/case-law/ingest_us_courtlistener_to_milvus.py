#!/usr/bin/env python3
"""Ingest U.S. case-law seed data from CourtListener into a separate Milvus collection.

Default behavior is intentionally conservative:
  - Uses CourtListener's public search API rather than scraping random court pages.
  - Writes to a separate collection named `case_law_us`.
  - Supports a physically separate Zilliz/Milvus cluster via US_MILVUS_* env vars.
  - Starts with small batches so API limits and embedding costs stay controlled.

Examples:
  python3 scripts/case-law/ingest_us_courtlistener_to_milvus.py --dry-run --max-records 5
  python3 scripts/case-law/ingest_us_courtlistener_to_milvus.py --max-records 25
  US_MILVUS_HOST=... US_ZILLIZ_API_KEY=... python3 scripts/case-law/ingest_us_courtlistener_to_milvus.py
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

COURTLISTENER_SEARCH_URL = "https://www.courtlistener.com/api/rest/v4/search/"
DEFAULT_QUERIES = [
    "contract dispute",
    "consumer protection",
    "landlord tenant",
    "family law custody",
    "small claims",
    "negligence",
    "employment discrimination",
    "criminal appeal",
]
DEFAULT_FEDERAL_COURTS = [
    "scotus",
    "ca1",
    "ca2",
    "ca3",
    "ca4",
    "ca5",
    "ca6",
    "ca7",
    "ca8",
    "ca9",
    "ca10",
    "ca11",
    "cadc",
]


def load_env_file(path: Path = Path(".env.local")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def clean_text(value: Any, max_chars: int = 65000) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def first_string(values: Iterable[Any]) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def citation_string(result: Dict[str, Any]) -> str:
    citations = result.get("citation")
    if isinstance(citations, list):
        return "; ".join(str(item).strip() for item in citations if str(item).strip())[:512]
    return str(citations or "")[:512]


def jurisdiction_code_for_result(result: Dict[str, Any]) -> str:
    court_id = str(result.get("court_id") or "").lower()
    if court_id.startswith("ca") or court_id in {"scotus", "dcd", "cit", "cafc", "cadc"}:
        return "US-FED"
    return "US"


def stable_id(result: Dict[str, Any], opinion: Optional[Dict[str, Any]] = None) -> str:
    source_id = first_string(
        [
            str(opinion.get("id")) if opinion else "",
            str(result.get("cluster_id") or ""),
            result.get("absolute_url"),
            result.get("caseNameFull"),
        ]
    )
    digest = hashlib.sha1(source_id.encode("utf-8")).hexdigest()[:24]
    return f"courtlistener-{digest}"


def courtlistener_headers() -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "MyMcKenzieCS-US-case-law-ingester/0.1 (admin@mymckenziecs.com)",
    }
    token = os.getenv("COURTLISTENER_API_TOKEN") or os.getenv("COURTLISTENER_TOKEN")
    if token:
        headers["Authorization"] = f"Token {token}"
    return headers


def fetch_json(url: str, *, sleep_seconds: float) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=courtlistener_headers())
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"CourtListener request failed: HTTP {error.code} {detail[:500]}") from error
    if sleep_seconds > 0:
        time.sleep(sleep_seconds)
    return json.loads(payload)


def build_search_url(query: str, court: Optional[str], page_size: int, cursor_url: Optional[str] = None) -> str:
    if cursor_url:
        return cursor_url
    params = {
        "type": "o",
        "q": query,
        "highlight": "off",
        "stat_Precedential": "on",
        "page_size": str(page_size),
    }
    if court:
        params["court"] = court
    return f"{COURTLISTENER_SEARCH_URL}?{urllib.parse.urlencode(params)}"


def result_to_record(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    opinions = result.get("opinions") if isinstance(result.get("opinions"), list) else []
    opinion = opinions[0] if opinions else {}
    title = first_string([result.get("caseNameFull"), result.get("caseName")])
    snippet = clean_text(opinion.get("snippet") or result.get("snippet") or result.get("syllabus") or "")
    if not title or not snippet:
        return None

    absolute_url = str(result.get("absolute_url") or "")
    source_url = f"https://www.courtlistener.com{absolute_url}" if absolute_url.startswith("/") else absolute_url
    court = clean_text(result.get("court"), 1024)
    citation = citation_string(result)
    summary_parts = [
        title,
        citation,
        court,
        clean_text(result.get("status"), 128),
        clean_text(result.get("procedural_history"), 2048),
        clean_text(result.get("posture"), 2048),
        snippet,
    ]
    summary = clean_text(" | ".join(part for part in summary_parts if part), 65000)

    return {
        "id": stable_id(result, opinion),
        "citation": citation,
        "title": clean_text(title, 2048),
        "url": clean_text(source_url, 2048),
        "summary": summary,
        "extracts": snippet,
        "court": court,
        "court_id": clean_text(result.get("court_id"), 128),
        "jurisdiction": jurisdiction_code_for_result(result),
        "decision_date": clean_text(result.get("dateFiled"), 64),
        "docket_number": clean_text(result.get("docketNumber"), 256),
        "source_provider": "courtlistener",
        "source_id": clean_text(result.get("cluster_id"), 128),
        "precedential_status": clean_text(result.get("status") or "Published", 128),
    }


def collect_records(args: argparse.Namespace) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    seen_ids = set()
    courts = args.court or DEFAULT_FEDERAL_COURTS if args.federal_seed else args.court or [None]
    queries = args.query or DEFAULT_QUERIES

    for court in courts:
        for query in queries:
            next_url: Optional[str] = None
            while len(records) < args.max_records:
                url = build_search_url(query, court, args.page_size, next_url)
                payload = fetch_json(url, sleep_seconds=args.sleep_seconds)
                for result in payload.get("results") or []:
                    record = result_to_record(result)
                    if not record or record["id"] in seen_ids:
                        continue
                    seen_ids.add(record["id"])
                    records.append(record)
                    if len(records) >= args.max_records:
                        break
                next_url = payload.get("next")
                if not next_url or len(records) >= args.max_records:
                    break
    return records


def get_env(*names: str, default: Optional[str] = None) -> Optional[str]:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return default


def get_milvus_imports():
    from pymilvus import (
        Collection,
        CollectionSchema,
        DataType,
        FieldSchema,
        connections,
        utility,
    )

    return Collection, CollectionSchema, DataType, FieldSchema, connections, utility


def connect_to_milvus() -> None:
    _, _, _, _, connections, _ = get_milvus_imports()
    host = get_env("US_MILVUS_HOST", "MILVUS_US_HOST", "MILVUS_HOST")
    port = int(get_env("US_MILVUS_PORT", "MILVUS_US_PORT", "MILVUS_PORT", default="19530") or "19530")
    if not host:
        raise SystemExit("MILVUS_HOST or US_MILVUS_HOST is required to connect to Milvus/Zilliz.")

    connect_kwargs: Dict[str, Any] = {}
    token = get_env("US_ZILLIZ_API_KEY", "ZILLIZ_US_API_KEY", "ZILLIZ_API_KEY")
    if token:
        connect_kwargs["token"] = token
    user = get_env("US_MILVUS_USER", "MILVUS_US_USER", "MILVUS_USER")
    password = get_env("US_MILVUS_PASSWORD", "MILVUS_US_PASSWORD", "MILVUS_PASSWORD")
    if user and password:
        connect_kwargs["user"] = user
        connect_kwargs["password"] = password

    secure_default = "1" if port == 443 else "0"
    secure = get_env("US_MILVUS_SECURE", "MILVUS_US_SECURE", "MILVUS_SECURE", default=secure_default) == "1"
    connections.connect(host=host, port=port, secure=secure, **connect_kwargs)


def ensure_us_collection(collection_name: str, vector_dim: int) -> Any:
    Collection, CollectionSchema, DataType, FieldSchema, _, utility = get_milvus_imports()
    fields = [
        FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=128, is_primary=True),
        FieldSchema(name="citation", dtype=DataType.VARCHAR, max_length=512),
        FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=2048),
        FieldSchema(name="url", dtype=DataType.VARCHAR, max_length=2048),
        FieldSchema(name="summary", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="extracts", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="court", dtype=DataType.VARCHAR, max_length=1024),
        FieldSchema(name="court_id", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(name="jurisdiction", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="decision_date", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="docket_number", dtype=DataType.VARCHAR, max_length=256),
        FieldSchema(name="source_provider", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(name="source_id", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(name="precedential_status", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=vector_dim),
    ]
    schema = CollectionSchema(fields, description="U.S. case law vectors from CourtListener")
    if utility.has_collection(collection_name):
        return Collection(collection_name)

    collection = Collection(name=collection_name, schema=schema)
    collection.create_index(
        "embedding",
        {
            "metric_type": "COSINE",
            "index_type": "AUTOINDEX",
            "params": {},
        },
    )
    return collection


def batched(items: List[Dict[str, Any]], batch_size: int) -> Iterable[List[Dict[str, Any]]]:
    for index in range(0, len(items), batch_size):
        yield items[index : index + batch_size]


def make_embedding_text(record: Dict[str, Any]) -> str:
    return "\n\n".join(
        str(record.get(key) or "")
        for key in ["title", "citation", "court", "jurisdiction", "summary", "extracts"]
        if record.get(key)
    )[:24000]


def insert_records(records: List[Dict[str, Any]], args: argparse.Namespace) -> None:
    if not records:
        print("No records collected; nothing to insert.")
        return

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise SystemExit("OPENAI_API_KEY is required to generate embeddings.")

    from openai import OpenAI

    client = OpenAI(api_key=openai_key)
    connect_to_milvus()
    collection = ensure_us_collection(args.collection, args.vector_dim)

    for batch_records in batched(records, args.embed_batch_size):
        embedding_inputs = [make_embedding_text(record) for record in batch_records]
        embedding_response = client.embeddings.create(model=args.embedding_model, input=embedding_inputs)
        vectors = [item.embedding for item in embedding_response.data]
        entities = [
            [record["id"] for record in batch_records],
            [record["citation"] for record in batch_records],
            [record["title"] for record in batch_records],
            [record["url"] for record in batch_records],
            [record["summary"] for record in batch_records],
            [record["extracts"] for record in batch_records],
            [record["court"] for record in batch_records],
            [record["court_id"] for record in batch_records],
            [record["jurisdiction"] for record in batch_records],
            [record["decision_date"] for record in batch_records],
            [record["docket_number"] for record in batch_records],
            [record["source_provider"] for record in batch_records],
            [record["source_id"] for record in batch_records],
            [record["precedential_status"] for record in batch_records],
            vectors,
        ]
        collection.upsert(entities)
        print(f"Upserted {len(batch_records)} records into {args.collection}")

    collection.flush()
    collection.load()
    print(f"U.S. case-law ingestion complete: {len(records)} records loaded into {args.collection}")


def write_snapshot(records: List[Dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed U.S. case law into Milvus from CourtListener.")
    parser.add_argument("--collection", default=os.getenv("MILVUS_US_COLLECTION", "case_law_us"))
    parser.add_argument("--max-records", type=int, default=int(os.getenv("US_CASE_LAW_MAX_RECORDS", "25")))
    parser.add_argument("--page-size", type=int, default=int(os.getenv("COURTLISTENER_PAGE_SIZE", "10")))
    parser.add_argument("--query", action="append", help="CourtListener search query. May be repeated.")
    parser.add_argument("--court", action="append", help="CourtListener court id, e.g. scotus, ca3, pa, fla.")
    parser.add_argument("--federal-seed", action="store_true", help="Seed common federal courts with default topics.")
    parser.add_argument("--sleep-seconds", type=float, default=float(os.getenv("COURTLISTENER_SLEEP_SECONDS", "1.2")))
    parser.add_argument("--embedding-model", default=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"))
    parser.add_argument("--vector-dim", type=int, default=int(os.getenv("VECTOR_DIM", "1536")))
    parser.add_argument("--embed-batch-size", type=int, default=int(os.getenv("EMBED_BATCH_SIZE", "16")))
    parser.add_argument("--snapshot", default=".data/bronze/case-law-us/courtlistener-seed.jsonl")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and snapshot records, but do not embed or insert.")
    parser.add_argument("--no-env-file", action="store_true", help="Do not load .env.local.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.no_env_file:
        load_env_file()

    if args.max_records <= 0:
        raise SystemExit("--max-records must be greater than zero.")

    print(f"Collecting up to {args.max_records} U.S. case-law records from CourtListener...")
    records = collect_records(args)
    write_snapshot(records, Path(args.snapshot))
    print(f"Collected {len(records)} records. Snapshot: {args.snapshot}")

    if args.dry_run:
        for record in records[:5]:
            print(f"- {record['title']} | {record['court']} | {record['decision_date']} | {record['url']}")
        print("Dry run complete; no embeddings generated and no Milvus writes performed.")
        return 0

    insert_records(records, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
