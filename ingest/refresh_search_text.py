"""Recompute chunks.search_text for existing rows (no re-embedding). Matches chunks by (doc_id, ord)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chunking import search_text  # noqa: E402
from sync import ROOT  # noqa: E402

load_dotenv(ROOT / ".env")
with psycopg.connect(os.environ["SUPABASE_DB_URL"], prepare_threshold=None, connect_timeout=20) as conn:
    rows = conn.execute("select id, content from chunks").fetchall()
    changed = 0
    with conn.cursor() as cur:
        data = [(search_text(c), i) for i, c in rows if search_text(c) != c]
        cur.executemany("update chunks set search_text = %s where id = %s", data)
        changed = len(data)
    conn.commit()
print(f"search_text updated for {changed} of {len(rows)} chunks")
