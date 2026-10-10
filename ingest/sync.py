"""Sync vault/ -> Supabase (documents, chunks, project_facts) and build web/public/graph.json.

Usage:
  python ingest/sync.py             # full sync (needs SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, EMBED_SECRET)
  python ingest/sync.py --dry-run   # parse and chunk only; prints stats; writes graph.json
  python ingest/sync.py --include-local   # also index PDFs converted into corpus/local/vault (your own DB only)

Idempotent: unchanged notes are skipped; unchanged chunks reuse their stored embeddings.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import httpx
import yaml
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chunking import Chunk, Note, chunk_note, parse_note, project_of, wikilinks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEXED_DIRS = ["standards", "projects", "reports", "comms", "entities", "glossary"]
SKIP_FILES = {"README.md", "Dashboard.md"}


def load_notes(include_local: bool) -> list[Note]:
    notes: list[Note] = []
    roots = [ROOT / "vault"] + ([ROOT / "corpus/local/vault"] if include_local else [])
    for base in roots:
        for sub in INDEXED_DIRS if base.name == "vault" else ["."]:
            for f in sorted((base / sub).rglob("*.md")):
                if f.name in SKIP_FILES:
                    continue
                n = parse_note(str(f.relative_to(ROOT)), f.read_text())
                if n:
                    notes.append(n)
    ids = [n.id for n in notes]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"duplicate note ids: {sorted(dupes)}")
    return notes


def embed_text(note: Note, c: Chunk) -> str:
    return f"{note.meta['title']} | {c.section or ''}\n{c.content}"[:3800]


def embed_batch(client: httpx.Client, url: str, headers: dict, texts: list[str]) -> list[list[float]]:
    for attempt in range(4):
        try:
            r = client.post(url, headers=headers, json={"texts": texts}, timeout=120)
            r.raise_for_status()
            return r.json()["vectors"]
        except (httpx.HTTPError, KeyError) as e:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
            print(f"  embed retry {attempt + 1}: {e}", file=sys.stderr)
    raise RuntimeError("unreachable")


def vec_literal(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in v) + "]"


def build_graph(notes: list[Note]) -> dict:
    stem = {}
    for n in notes:
        stem[Path(n.path).stem.lower()] = n.id
        stem[str(n.meta.get("title", "")).lower()] = n.id
        stem[n.id.lower()] = n.id
    nodes = [dict(id=n.id, title=str(n.meta.get("title", n.id)), type=n.type, project=project_of(n.meta)) for n in notes]
    edges, seen = [], set()
    for n in notes:
        targets = wikilinks(n.raw)
        proj = project_of(n.meta)
        if proj:
            targets.append(proj)
        for t in targets:
            tid = stem.get(t.lower())
            if tid and tid != n.id and (n.id, tid) not in seen:
                seen.add((n.id, tid))
                edges.append(dict(source=n.id, target=tid))
    return dict(nodes=nodes, links=edges)


def facts_for(note: Note) -> list[tuple[str, object]]:
    keys = ["title", "code", "client", "project_manager", "status", "budget_aud", "committed_aud", "contaminants",
            "milestones", "exceedances", "decisions", "risks", "facts"]
    return [(k, note.meta[k]) for k in keys if k in note.meta]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--include-local", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-embed everything")
    args = ap.parse_args()
    load_dotenv(ROOT / ".env")

    notes = load_notes(args.include_local)
    plan = []
    for n in notes:
        corpus, chunks = chunk_note(n)
        plan.append((n, corpus, chunks))
    total = sum(len(c) for _, _, c in plan)
    by_type: dict[str, list[int]] = {}
    for n, _, c in plan:
        by_type.setdefault(n.type, []).append(len(c))
    print(f"{len(notes)} notes -> {total} chunks")
    for t, v in sorted(by_type.items()):
        print(f"  {t:10s} notes={len(v):3d} chunks={sum(v):5d} avg_chars={sum(len(ch.content) for n,_,c in plan if n.type==t for ch in c)//max(1,sum(v))}")

    graph = build_graph(notes)
    gp = ROOT / "web/public/graph.json"
    gp.parent.mkdir(parents=True, exist_ok=True)
    gp.write_text(json.dumps(graph, separators=(",", ":")))
    print(f"graph.json: {len(graph['nodes'])} nodes, {len(graph['links'])} links")

    if args.dry_run:
        return

    import psycopg  # imported lazily so --dry-run works without a database

    for k in ("SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "EMBED_SECRET"):
        if not os.environ.get(k):
            raise SystemExit(f"missing env var {k} (see .env.example)")
    embed_url = os.environ["SUPABASE_URL"].rstrip("/") + "/functions/v1/embed"
    headers = {"Authorization": "Bearer " + os.environ["SUPABASE_ANON_KEY"], "x-embed-secret": os.environ["EMBED_SECRET"]}

    stats = dict(skipped=0, updated=0, deleted=0, embedded=0, reused=0)
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], autocommit=False, prepare_threshold=None) as conn, httpx.Client() as http:
        cur = conn.cursor()
        cur.execute("select id, content_hash from documents")
        existing = dict(cur.fetchall())
        keep = {n.id for n in notes}
        for stale in set(existing) - keep:
            cur.execute("delete from documents where id = %s", (stale,))
            cur.execute("delete from project_facts where source_doc = %s", (stale,))
            stats["deleted"] += 1
        conn.commit()

        for n, corpus, chunks in plan:
            dh = hashlib.sha256(n.raw.encode()).hexdigest()
            if not args.force and existing.get(n.id) == dh:
                stats["skipped"] += 1
                continue
            cur.execute("select content_hash, embedding::text from chunks where doc_id = %s and embedding is not null", (n.id,))
            reuse = {} if args.force else dict(cur.fetchall())
            todo = [c for c in chunks if c.hash not in reuse]
            vectors: dict[str, str] = {}
            for i in range(0, len(todo), 16):
                batch = todo[i:i + 16]
                vs = embed_batch(http, embed_url, headers, [embed_text(n, c) for c in batch])
                for c, v in zip(batch, vs):
                    vectors[c.hash] = vec_literal(v)
                stats["embedded"] += len(batch)
            stats["reused"] += len(chunks) - len(todo)
            meta = {k: v for k, v in n.meta.items() if k in ("version", "status", "authors", "channel", "tags", "publisher", "short")}
            cur.execute(
                """insert into documents (id, type, title, short, project_id, source_type, doc_date, fictional, licence, source_url, pages, meta, body, content_hash, updated_at)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                   on conflict (id) do update set type=excluded.type, title=excluded.title, short=excluded.short, project_id=excluded.project_id,
                     source_type=excluded.source_type, doc_date=excluded.doc_date, fictional=excluded.fictional, licence=excluded.licence,
                     source_url=excluded.source_url, pages=excluded.pages, meta=excluded.meta, body=excluded.body,
                     content_hash=excluded.content_hash, updated_at=now()""",
                (n.id, n.type, n.meta["title"], n.meta.get("short"), project_of(n.meta), n.meta.get("source_type", n.type),
                 str(n.meta["date"]) if n.meta.get("date") else None, bool(n.meta.get("fictional", True)), n.meta.get("licence"),
                 n.meta.get("source_url"), n.meta.get("pages"), json.dumps(meta, default=str), n.body, dh),
            )
            cur.execute("delete from chunks where doc_id = %s", (n.id,))
            for c in chunks:
                emb = vectors.get(c.hash) or reuse.get(c.hash)
                cur.execute(
                    """insert into chunks (doc_id, ord, corpus, content, page, section, thread_id, project_id, meta, embedding, content_hash)
                       values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s)""",
                    (n.id, c.ord, corpus, c.content, c.page, c.section, c.thread_id, c.project_id, json.dumps(c.meta, default=str), emb, c.hash),
                )
            if n.type == "project":
                cur.execute("delete from project_facts where project_id = %s", (n.id,))
                for k, v in facts_for(n):
                    cur.execute("insert into project_facts (project_id, key, value, source_doc) values (%s,%s,%s,%s)",
                                (n.id, k, json.dumps(v, default=str), n.id))
            conn.commit()
            stats["updated"] += 1
            print(f"  synced {n.id} ({len(chunks)} chunks, {len(todo)} embedded)")
    print("done:", stats)


if __name__ == "__main__":
    main()
