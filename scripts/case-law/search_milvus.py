#!/usr/bin/env python3
"""Search Milvus collection using an embedding passed as JSON on stdin.

Input JSON (stdin): { "embedding": [...], "topk": 5 }

Outputs JSON array of hits to stdout.
"""
import sys
import os
import json
from pymilvus import connections, Collection


def main():
    payload = json.load(sys.stdin)
    emb = payload.get("embedding")
    topk = int(payload.get("topk", 5))

    host = os.getenv('MILVUS_HOST')
    port = int(os.getenv('MILVUS_PORT', '19530'))
    coll_name = os.getenv('MILVUS_COLLECTION', 'case_law')
    secure = True if str(port) == '443' or os.getenv('MILVUS_SECURE','1') == '1' else False

    conn_kwargs = {}
    if os.getenv('ZILLIZ_API_KEY'):
        conn_kwargs['token'] = os.getenv('ZILLIZ_API_KEY')
    if os.getenv('MILVUS_USER') and os.getenv('MILVUS_PASSWORD'):
        conn_kwargs['user'] = os.getenv('MILVUS_USER')
        conn_kwargs['password'] = os.getenv('MILVUS_PASSWORD')

    if not host:
        print(json.dumps({"error": "MILVUS_HOST not set"}))
        sys.exit(1)

    connections.connect(host=host, port=port, secure=secure, **conn_kwargs)
    coll = Collection(coll_name)
    schema_field_names = {f.name for f in (coll.schema.fields or [])}
    preferred_fields = ["citation", "title", "url", "summary", "extracts"]
    output_fields = [f for f in preferred_fields if f in schema_field_names]

    search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}

    results = []
    try:
        try:
            search_kwargs = {"param": search_params, "limit": topk}
            if output_fields:
                search_kwargs["output_fields"] = output_fields
            res = coll.search([emb], "embedding", **search_kwargs) or []
        except Exception as e:
            # Fallback if some output fields don't exist
            msg = str(e)
            if 'not exist' in msg or 'field' in msg:
                res = coll.search([emb], "embedding", param=search_params, limit=topk) or []
            else:
                raise

        # res is a list (per query) of lists of hits
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
                summary = None
                try:
                    extracts = entity.get('extracts') if entity else None
                except Exception:
                    extracts = None

                results.append({
                    'id': str(hit.id),
                    'score': float(hit.distance),
                    'citation': citation,
                    'title': title,
                    'url': url,
                    'summary': summary,
                    'extracts': extracts
                })

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)

    print(json.dumps(results))


if __name__ == '__main__':
    main()
