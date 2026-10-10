"""Triage negative feedback with Jev (cause, actionable, spam) and attach the failing step from the trace.

  python improve/triage.py [--limit 50]
Needs SUPABASE_DB_URL and TYPESAFE_API_KEY.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from typesafe_sdk import Choice, Noul, TypeSafeClient

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

CAUSES = {
    "retrieval_miss": "The right source exists in the knowledge base but was not retrieved or was ranked out.",
    "bad_synthesis": "The right sources were retrieved but the answer misstated, over-stated or omitted what they say.",
    "wrong_route": "The question was sent to the wrong corpus (standards vs company records vs portfolio).",
    "missing_content": "The knowledge base does not contain the document or fact the user wanted.",
    "ui_issue": "The complaint is about the interface, speed or availability, not answer quality.",
    "spam_or_noise": "Not a genuine complaint: spam, abuse, a test, or meaningless text.",
}


def failing_step(events: list[dict]) -> str:
    for e in events:
        if e["status"] in ("error", "degraded"):
            return f"{e['node']}: {e['status']}"
    kept = next((e for e in events if e["node"] == "verify" and e.get("output")), None)
    if kept and kept["output"].get("removed"):
        return f"verify removed {len(kept['output']['removed'])} claim(s)"
    return "no failing step recorded"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], prepare_threshold=None) as conn, TypeSafeClient() as jev:
        rows = conn.execute(
            """select f.id, f.category, f.comment, r.id, r.query, r.route, r.status, r.answer->>'markdown'
               from feedback f join runs r on r.id = f.run_id
               where f.rating = -1 and f.triage is null order by f.created_at limit %s""", (args.limit,)).fetchall()
        for fid, category, comment, rid, query, route, status, answer in rows:
            events = [dict(node=n, status=s, output=o) for n, s, o in conn.execute(
                "select node, status, output from trace_events where run_id = %s order by seq", (rid,)).fetchall()]
            state = dict(question=query, answer=(answer or "")[:800], user_category=category, user_comment=comment,
                         route=route, run_status=status, failing_step=failing_step(events))
            r = jev.system_one(state=state, questions={
                "cause": Choice(instructions="What most likely caused the problem the user reported in `user_comment` / `user_category`, given `failing_step`?", criteria=CAUSES),
                "actionable": Noul(instructions="Is the feedback specific enough that a change to the system (prompt, glossary, threshold or content) could address it?"),
                "spam": Noul(instructions="Is the feedback spam, abusive, a test, or meaningless?"),
            })
            triage = dict(cause=r.choices["cause"].choice, actionable=r.nouls["actionable"].noul, spam=r.nouls["spam"].noul,
                          failing_step=state["failing_step"], run_id=str(rid))
            conn.execute("update feedback set triage = %s where id = %s", (json.dumps(triage), fid))
            print(fid, triage)
        conn.commit()
        print(f"triaged {len(rows)} feedback item(s)")


if __name__ == "__main__":
    main()
