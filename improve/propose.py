"""Turn triaged feedback into reviewable improvement proposals (never auto-applied).

  python improve/propose.py                 # draft up to the open-proposal cap, write vault/proposals/*.md
  python improve/propose.py --apply <id>    # create a git branch with the change; open a PR; CI runs the eval gate

Allowed artifacts: glossary synonyms, a small set of retrieval thresholds, and the draft prompt. Guardrail thresholds,
the eval floors and the eval baseline are locked. A proposal ships only through a PR whose CI run passes `make eval`.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path

import httpx
import psycopg
import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

MAX_OPEN = 3
TUNABLE = {"rerank_keep": (0.1, 0.8), "support_confidence": (0.6, 0.95), "keep_ratio": (0.3, 0.9), "retrieval_k": (15, 50), "rerank_max": (6, 16)}
LOCKED = {"attack", "out_of_scope", "injection", "out_flag", "eval_floors", "eval_regression_tolerance", "max_query_chars"}
CAUSE_KIND = {"retrieval_miss": "glossary", "wrong_route": "prompt", "bad_synthesis": "prompt", "missing_content": "content"}


def ask_llm(system: str, user: str) -> dict:
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "X-Title": "Site Data Desk improve"},
        json={"model": os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash"), "temperature": 0, "max_tokens": 1200,
              "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
        timeout=60,
    )
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"]
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0)) if m else {}


def validate(p: dict) -> str | None:
    kind = p.get("kind")
    if kind == "glossary":
        add = p.get("add")
        if not isinstance(add, dict) or not add or len(add) > 5:
            return "glossary proposal needs 1-5 terms"
        if any(not isinstance(v, list) or not all(isinstance(s, str) and 2 < len(s) < 60 for s in v) for v in add.values()):
            return "synonyms must be short strings"
    elif kind == "threshold":
        k, v = p.get("key"), p.get("value")
        if k in LOCKED or k not in TUNABLE:
            return f"threshold {k} is not tunable"
        if not isinstance(v, (int, float)) or not (TUNABLE[k][0] <= v <= TUNABLE[k][1]):
            return f"value out of allowed range {TUNABLE.get(k)}"
    elif kind == "prompt":
        new = p.get("new_text", "")
        old = (ROOT / "config/prompts/draft.md").read_text()
        if "{{claims_max}}" not in new or "VERBATIM" not in new or "not_found" not in new:
            return "prompt must keep {{claims_max}}, the verbatim-quote rule and not_found"
        diff = sum(1 for a, b in zip(old.splitlines(), new.splitlines()) if a != b) + abs(len(old.splitlines()) - len(new.splitlines()))
        if diff > 12:
            return "prompt change too large (>12 lines); propose a smaller edit"
    else:
        return "unsupported kind (content gaps are reported, not auto-proposed)"
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply")
    args = ap.parse_args()
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], prepare_threshold=None) as conn:
        if args.apply:
            return apply(conn, args.apply)
        open_n = conn.execute("select count(*) from proposals where status = 'open'").fetchone()[0]
        room = MAX_OPEN - open_n
        if room <= 0:
            print(f"{open_n} proposals already open (cap {MAX_OPEN}); review them first")
            return
        rows = conn.execute(
            """select f.id, f.triage->>'cause', f.comment, r.query, r.id, r.answer->>'markdown'
               from feedback f join runs r on r.id = f.run_id
               where f.triage is not null and (f.triage->>'actionable')::float >= 0.5 and (f.triage->>'spam')::float < 0.5
                 and f.id not in (select unnest(source_feedback) from proposals)""").fetchall()
        groups: dict[str, list] = defaultdict(list)
        for fid, cause, comment, query, rid, answer in rows:
            groups[cause].append((fid, comment, query, rid, answer))
        made = 0
        for cause, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            if made >= room:
                break
            kind = CAUSE_KIND.get(cause)
            if not kind:
                continue
            if kind == "content":
                print(f"content gap reported by {len(items)} item(s): {[i[2] for i in items][:5]}")
                continue
            glossary = (ROOT / "config/glossary.json").read_text()
            thresholds = (ROOT / "config/thresholds.json").read_text()
            user = json.dumps({"cause": cause, "kind_hint": kind, "feedback": [dict(query=q, comment=c, answer=(a or "")[:400]) for _, c, q, _, a in items][:6],
                               "glossary_terms": list(json.loads(glossary))[:60], "tunable_thresholds": TUNABLE})
            system = ("You propose ONE minimal, reversible improvement to a RAG assistant from user feedback. Reply with JSON only. "
                      'Forms: {"kind":"glossary","add":{"TERM":["synonym",...]},"rationale":"..."} | {"kind":"threshold","key":"rerank_keep","value":0.3,"rationale":"..."} | '
                      '{"kind":"prompt","new_text":"<the full draft prompt with a small edit>","rationale":"..."}. '
                      "Never touch guardrail settings. Prefer glossary for retrieval misses.")
            if kind == "prompt":
                user += "\n\nCurrent draft prompt:\n" + (ROOT / "config/prompts/draft.md").read_text()
            p = ask_llm(system, user)
            err = validate(p)
            if err:
                print(f"discarded proposal for {cause}: {err}")
                continue
            pid = uuid.uuid4().hex[:8]
            note = ROOT / f"vault/proposals/{pid}.md"
            fm = dict(id=f"proposal-{pid}", type="proposal", title=f"{p['kind']} change from {len(items)} feedback item(s) ({cause})", kind=p["kind"],
                      status="open", date=str(date.today()), cause=cause, fictional=False, tags=["proposal"])
            body = f"# Proposal {pid}\n\n**Cause:** {cause}  \n**Kind:** {p['kind']}\n\n## Rationale\n\n{p.get('rationale', '')}\n\n## Change\n\n```json\n{json.dumps({k: v for k, v in p.items() if k != 'rationale'}, indent=1)[:3000]}\n```\n\n## Evidence\n\n" + "\n".join(f"- run {r}: \"{q}\"" for _, _, q, r, _ in items[:6]) + \
                "\n\n## Gate\n\nThis proposal ships only if `make eval` passes on the PR branch with no regression against `evals/baseline.json`.\n"
            note.write_text("---\n" + yaml.safe_dump(fm, sort_keys=False) + "---\n\n" + body)
            conn.execute("insert into proposals (id, kind, title, diff, rationale, source_feedback) values (%s,%s,%s,%s,%s,%s)",
                         (uuid.UUID(pid.ljust(32, "0")), p["kind"], fm["title"], json.dumps({k: v for k, v in p.items() if k != "rationale"}), p.get("rationale"), [i[0] for i in items]))
            conn.commit()
            made += 1
            print(f"proposal {pid}: {fm['title']} -> {note.relative_to(ROOT)}")
        print(f"{made} proposal(s) drafted")


def apply(conn, pid: str) -> None:
    row = conn.execute("select id, diff from proposals where id::text like %s and status = 'open'", (pid + "%",)).fetchone()
    if not row:
        raise SystemExit("no open proposal with that id")
    p = json.loads(row[1]) if isinstance(row[1], str) else row[1]
    err = validate(p)
    if err:
        raise SystemExit(f"proposal no longer valid: {err}")
    branch = f"improve/{pid}"
    subprocess.run(["git", "checkout", "-b", branch], cwd=ROOT, check=True)
    if p["kind"] == "glossary":
        gp = ROOT / "config/glossary.json"
        g = json.loads(gp.read_text())
        for k, v in p["add"].items():
            g[k] = sorted(set(g.get(k, []) + v))
        gp.write_text(json.dumps(g, indent=1, sort_keys=True) + "\n")
    elif p["kind"] == "threshold":
        tp = ROOT / "config/thresholds.json"
        t = json.loads(tp.read_text())
        t[p["key"]] = p["value"]
        tp.write_text(json.dumps(t, indent=2) + "\n")
    elif p["kind"] == "prompt":
        (ROOT / "config/prompts/draft.md").write_text(p["new_text"].rstrip() + "\n")
    subprocess.run(["node", "scripts/build-config.mjs"], cwd=ROOT / "web", check=True)
    log = ROOT / "vault/agent-memory/changelog.md"
    log.write_text(log.read_text().replace("(none yet)", "").rstrip() + f"\n\n- {date.today()} proposal {pid} ({p['kind']}): pending eval gate and review\n")
    subprocess.run(["git", "add", "-A", "config", "web/lib/config.generated.json", "vault"], cwd=ROOT, check=True)
    subprocess.run(["git", "commit", "-m", f"improve: apply proposal {pid} ({p['kind']})"], cwd=ROOT, check=True)
    print(f"branch {branch} created. Push it and open a PR; the CI eval gate decides whether it can merge.")


if __name__ == "__main__":
    main()
