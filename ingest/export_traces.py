"""Export recent runs as Obsidian notes (vault/traces) that link to the source notes they used, so the graph view shows
how questions reach sources. Eval runs and runs that were not answered are skipped.

  python ingest/export_traces.py [--limit 25]
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=25)
    args = ap.parse_args()
    out = ROOT / "vault/traces"
    out.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], prepare_threshold=None) as conn:
        runs = conn.execute(
            """select id, started_at::date, query, route, status, answer from runs
               where kind = 'chat' and not is_eval and status in ('ok','not_found','degraded') and answer is not null
               order by started_at desc limit %s""", (args.limit,)).fetchall()
        for rid, day, query, route, status, answer in runs:
            docs = sorted({s["docId"] for s in (answer or {}).get("sources", [])})
            steps = conn.execute("select node, duration_ms, status from trace_events where run_id = %s order by seq", (rid,)).fetchall()
            fm = dict(id=f"trace-{str(rid)[:8]}", type="trace", title=f"Run {str(rid)[:8]}", date=str(day), route=route, status=status, fictional=False, tags=["trace"])
            body = f"# Run {str(rid)[:8]}\n\n**Question:** {query}\n\n**Route:** {route} · **Status:** {status}\n\n## Steps\n\n" + \
                "\n".join(f"- {n} ({ms} ms){'' if st == 'ok' else ' - ' + st}" for n, ms, st in steps) + \
                "\n\n## Sources used\n\n" + ("\n".join(f"- [[{d}]]" for d in docs) or "- none") + "\n"
            (out / f"{str(rid)[:8]}.md").write_text("---\n" + yaml.safe_dump(fm, sort_keys=False) + "---\n\n" + body)
        print(f"exported {len(runs)} trace note(s) to vault/traces")


if __name__ == "__main__":
    main()
