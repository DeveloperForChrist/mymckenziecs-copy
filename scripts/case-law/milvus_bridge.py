#!/usr/bin/env python3
"""Lightweight HTTP bridge for Milvus search using pymilvus and OpenAI embeddings.

Run directly: `python3 scripts/case-law/milvus_bridge.py`
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
import os
from pymilvus import connections, Collection
from openai import OpenAI


class EmbeddingRequest(BaseModel):
    embedding: List[float]
    topk: Optional[int] = 5


class TextRequest(BaseModel):
    text: Optional[str] = None
    embedding: Optional[List[float]] = None
    topk: Optional[int] = 5


app = FastAPI()


def connect_collection():
    host = os.getenv('MILVUS_HOST')
    port = int(os.getenv('MILVUS_PORT', '19530'))
    coll_name = os.getenv('MILVUS_COLLECTION', 'case_law')
    secure = True if str(port) == '443' or os.getenv('MILVUS_SECURE', '1') == '1' else False

    conn_kwargs = {}
    if os.getenv('ZILLIZ_API_KEY'):
        conn_kwargs['token'] = os.getenv('ZILLIZ_API_KEY')
    if os.getenv('MILVUS_USER') and os.getenv('MILVUS_PASSWORD'):
        conn_kwargs['user'] = os.getenv('MILVUS_USER')
        conn_kwargs['password'] = os.getenv('MILVUS_PASSWORD')

    if not host:
        raise RuntimeError('MILVUS_HOST is not configured')

    connections.connect(host=host, port=port, secure=secure, **conn_kwargs)
    return Collection(coll_name)


def format_hits(res: Any):
    results = []
    for hits in res:
        for hit in hits:
            entity = getattr(hit, 'entity', None)
            try:
                citation = entity.get('citation') if entity else None
            except Exception:
                citation = None
            try:
                title = entity.get('title') if entity else None
            except Exception:
                title = None
            try:
                url = entity.get('url') if entity else None
            except Exception:
                url = None
            try:
                summary = entity.get('summary') if entity else None
            except Exception:
                summary = None
            try:
                extracts = entity.get('extracts') if entity else None
            except Exception:
                extracts = None

            results.append({
                'id': str(hit.id),
                'score': float(getattr(hit, 'distance', getattr(hit, 'score', 0))),
                'citation': citation,
                'title': title,
                'url': url,
                'summary': summary,
                'extracts': extracts,
            })
    return results


@app.post('/search_embedding')
def search_embedding(req: EmbeddingRequest):
    try:
        coll = connect_collection()
        search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}
        schema_field_names = {f.name for f in (coll.schema.fields or [])}
        preferred_fields = ["citation", "title", "url", "summary", "extracts"]
        output_fields = [f for f in preferred_fields if f in schema_field_names]
        try:
            search_kwargs = {"param": search_params, "limit": req.topk}
            if output_fields:
                search_kwargs["output_fields"] = output_fields
            res = coll.search([req.embedding], "embedding", **search_kwargs) or []
        except Exception as e:
            # Fallback: some collections may not have stored fields; retry without output_fields
            msg = str(e)
            if 'not exist' in msg or 'field' in msg:
                res = coll.search([req.embedding], "embedding", param=search_params, limit=req.topk) or []
            else:
                raise
        return format_hits(res)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/search')
def search_text(req: TextRequest):
    if req.embedding:
        return search_embedding(EmbeddingRequest(embedding=req.embedding, topk=req.topk))

    if not req.text:
        raise HTTPException(status_code=400, detail='text or embedding required')

    openai_api_key = os.getenv('OPENAI_API_KEY')
    if not openai_api_key:
        raise HTTPException(status_code=500, detail='OPENAI_API_KEY not set')
    try:
        client = OpenAI(api_key=openai_api_key)
        emb_resp = client.embeddings.create(input=req.text, model='text-embedding-3-small')
        emb = emb_resp.data[0].embedding
    except Exception as e:
        raise HTTPException(status_code=500, detail='embedding failed: ' + str(e))

    return search_embedding(EmbeddingRequest(embedding=emb, topk=req.topk))


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000, reload=False)
