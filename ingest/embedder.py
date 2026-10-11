"""Embeddings through OpenRouter (default openai/text-embedding-3-small at 384 dimensions, matching vector(384)).

The same model must be used at ingest time and query time (web/lib/embed.ts). Vectors are L2-normalised so inner
product equals cosine similarity.

OpenRouter normally answers in about 2 seconds but occasionally stalls for 30 seconds while sending keep-alive bytes, so
a read timeout never fires. Each request therefore has a short hard deadline and is retried; batches run concurrently.
"""
from __future__ import annotations

import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

import httpx

MODEL = os.environ.get("EMBED_MODEL", "openai/text-embedding-3-small")
DIMS = int(os.environ.get("EMBED_DIMENSIONS", "384"))
MAX_CHARS = 6000
DEADLINE_S = 40
WORKERS = 8


def normalise(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def embed_texts(texts: list[str], batch: int = 16) -> list[list[float]]:
    key = os.environ["OPENROUTER_API_KEY"]
    pool = ThreadPoolExecutor(max_workers=WORKERS * 2)

    def call(part: list[str]) -> list[list[float]]:
        with httpx.Client(timeout=DEADLINE_S) as http:
            r = http.post("https://openrouter.ai/api/v1/embeddings",
                          headers={"Authorization": f"Bearer {key}", "X-Title": "Site Data Desk"},
                          json={"model": MODEL, "input": part, "dimensions": DIMS})
            if r.status_code in (429, 500, 502, 503, 504):
                raise httpx.HTTPError(f"status {r.status_code}")
            r.raise_for_status()
            data = sorted(r.json()["data"], key=lambda d: d["index"])
            return [normalise(d["embedding"]) for d in data]

    def with_retry(part: list[str]) -> list[list[float]]:
        for attempt in range(6):
            fut = pool.submit(call, part)
            try:
                return fut.result(timeout=DEADLINE_S + 3)
            except (httpx.HTTPError, KeyError, FutureTimeout) as e:
                if attempt == 5:
                    raise
                time.sleep(min(2 ** attempt, 8))
                print(f"  embed retry {attempt + 1}: {type(e).__name__}", flush=True)
        raise RuntimeError("unreachable")

    parts = [[t[:MAX_CHARS] for t in texts[i:i + batch]] for i in range(0, len(texts), batch)]
    outer = ThreadPoolExecutor(max_workers=WORKERS)
    try:
        results = list(outer.map(with_retry, parts))
    finally:
        outer.shutdown(wait=False, cancel_futures=True)
        pool.shutdown(wait=False, cancel_futures=True)
    out = [v for r in results for v in r]
    assert len(out) == len(texts) and all(len(v) == DIMS for v in out), "unexpected embedding result"
    return out
