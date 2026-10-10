"""Generate the FICTIONAL company vault. Deterministic: same code -> byte-identical output.

Usage: python seed/generate.py [--check]
  --check  regenerate into memory and compare with vault/.seed-manifest.json (used in CI)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import content as C  # noqa: E402
from reports import REPORTS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VAULT = ROOT / "vault"
FILES: dict[str, str] = {}  # relative path (from vault/) -> text


def fm(data: dict) -> str:
    return "---\n" + yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=1000) + "---\n\n"


def link(key: str) -> str:
    return f"[[{C.name(key)}]]"


def put(path: str, text: str) -> None:
    FILES[path] = text


def tags(*t: str) -> list[str]:
    return sorted(set(t))


def gen_entities() -> None:
    by_person: dict[str, list[str]] = defaultdict(list)
    for pid, p in C.PROJECTS.items():
        by_person[p["pm"]].append(pid)
    for key, p in C.PEOPLE.items():
        projs = ", ".join(f"[[{pid}]]" for pid in by_person.get(key, [])) or "none as project manager"
        put(
            f"entities/{p['name']}.md",
            fm(dict(id=f"person-{key}", type="entity", title=p["name"], kind="person", role=p["role"],
                    organisation=C.COMPANY, email=C.addr(key).split("<")[1].rstrip(">"), fictional=True,
                    tags=tags("person", "staff")))
            + f"# {p['name']}\n\n{p['role']} at {C.COMPANY}. Skills: {', '.join(p['skills'])}.\n\nProject manager for: {projs}.\n",
        )
    for key, e in C.EXTERNAL.items():
        proj = next((pid for pid, p in C.PROJECTS.items() if p["client"] == key), None)
        extra = f"\n\nClient contact for [[{proj}]]." if proj else ""
        put(
            f"entities/{e['name']}.md",
            fm(dict(id=f"person-{key}", type="entity", title=e["name"], kind="external", role=e["role"],
                    organisation=e["org"], fictional=True, tags=tags("person", "external")))
            + f"# {e['name']}\n\n{e['role']}, {e['org']}.{extra}\n",
        )


def md_table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    for r in rows:
        out.append("| " + " | ".join("" if v is None else str(v) for v in r) + " |")
    return "\n".join(out)


def gen_projects() -> None:
    for pid, p in C.PROJECTS.items():
        reports = [r for r in REPORTS if r["project"] == pid]
        threads = sorted({e["thread"] for e in C.E if e["project"] == pid})
        data = dict(
            id=pid, type="project", title=p["title"], code=p["code"], date=p["milestones"][0]["due"],
            client=C.EXTERNAL[p["client"]]["org"], project_manager=f"[[{C.name(p['pm'])}]]",
            status=p["status"], budget_aud=p["budget_aud"], committed_aud=p["committed_aud"],
            contaminants=p["contaminants"], milestones=p["milestones"], exceedances=p["exceedances"],
            decisions=[dict(d, by=C.name(d["by"])) for d in p["decisions"]], risks=p["risks"], facts=p["facts"],
            fictional=True, tags=tags("project", *p["tags"]),
        )
        body = f"# {p['title']}\n\n**Client:** {C.EXTERNAL[p['client']]['org']}  \n**Project manager:** {link(p['pm'])}  \n**Status:** {p['status']}  \n**Budget:** A${p['budget_aud']:,}; committed A${p['committed_aud']:,}\n\n"
        body += "## Milestones\n\n" + md_table(
            ["Milestone", "Due", "Completed", "Note"],
            [[m["name"], m["due"], m["done"] or "open", m.get("note", "")] for m in p["milestones"]]) + "\n\n"
        body += "## Exceedances\n\n" + md_table(
            ["Analyte", "Location", "Result", "Criterion", "Basis", "Status"],
            [[x["analyte"], x["location"], f"{x['result']} {x['unit']}", "" if x["criterion"] is None else f"{x['criterion']} {x['unit']}", x["basis"], x["status"]] for x in p["exceedances"]]) + "\n\n"
        body += "## Decisions\n\n" + "\n".join(f"- {d['date']}: {d['text']} (approved by {link(d['by'])})" for d in p["decisions"]) + "\n\n"
        body += "## Risks\n\n" + "\n".join(f"- ({r['level']}) {r['text']}" for r in p["risks"]) + "\n\n"
        body += "## Records\n\n" + "\n".join(f"- Report: [[{r['id']}]]" for r in reports) + "\n"
        body += f"- Slack: [[slack-{pid[:2]}-index]]\n" if False else ""
        put(f"projects/{pid}.md", fm(data) + body)


def gen_reports() -> None:
    for r in REPORTS:
        data = dict(id=r["id"], type="report", title=r["title"], date=r["date"], project=f"[[{r['project']}]]",
                    source_type="report", version=r["version"], status=r["status"], authors=[f"[[{C.name(r['author'])}]]"],
                    fictional=True, tags=tags("report", r["project"][:2]))
        body = f"# {r['title']}\n\n**Version:** {r['version']} ({r['status']})  \n**Date:** {r['date']}  \n**Author:** {link(r['author'])}  \n**Project:** [[{r['project']}]]\n\n"
        body += "> FICTIONAL DEMONSTRATION DOCUMENT. Not a real report.\n\n"
        for h, text in r["sections"]:
            body += f"## {h}\n\n{text}\n\n"
        put(f"reports/{r['id']}.md", fm(data) + body.rstrip() + "\n")


# Emails that continue one conversation share a thread id (so retrieval can show the whole exchange).
THREAD_ALIAS = {
    "p1-t11": "p1-t10", "p1-t12": "p1-t10", "p1-t08": "p1-t07",
    "p2-t09": "p2-t08", "p2-t10": "p2-t08",
    "p4-t05": "p4-t04", "p4-t08": "p4-t07", "p4-t14": "p4-t13",
}


def gen_emails() -> None:
    for e in C.E:
        thread = THREAD_ALIAS.get(e["thread"], e["thread"])
        data = dict(id=e["id"], type="email", title=e["subject"], date=e["date"], project=f"[[{e['project']}]]",
                    source_type="email", thread_id=thread, sender=C.addr(e["frm"]),
                    recipients=[C.addr(t) for t in e["to"]], fictional=True, tags=tags("email", e["project"][:2]))
        body = (f"# {e['subject']}\n\n**From:** {link(e['frm'])} <{C.addr(e['frm']).split('<')[1].rstrip('>')}>  \n"
                f"**To:** {', '.join(link(t) for t in e['to'])}  \n**Date:** {e['date']}  \n**Subject:** {e['subject']}\n\n{e['body']}\n")
        put(f"comms/emails/{e['id']}.md", fm(data) + body)


def gen_slack() -> None:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for m in C.S:
        groups[(m["channel"], m["date"][:7])].append(m)
    for (channel, month), msgs in sorted(groups.items()):
        proj = msgs[0]["project"]
        sid = f"slack-{proj[:2]}-{month}"
        data = dict(id=sid, type="slack", title=f"#{channel} {month}", date=msgs[0]["date"], project=f"[[{proj}]]",
                    source_type="slack", thread_id=f"{proj[:2]}-slack-{month}", channel=channel, fictional=True,
                    tags=tags("slack", proj[:2]))
        body = f"# #{channel} ({month})\n\n" + "\n".join(f"- **{m['date']} {link(m['user'])}:** {m['text']}" for m in msgs) + "\n"
        put(f"comms/slack/{sid}.md", fm(data) + body)


def gen_glossary_and_meta() -> None:
    rows = "\n".join(f"| {k} | {', '.join(v)} |" for k, v in sorted(C.GLOSSARY.items()))
    put("glossary/glossary.md",
        fm(dict(id="glossary", type="glossary", title="Glossary of terms and synonyms", date="2026-01-01", fictional=False, tags=["glossary"]))
        + f"# Glossary\n\nTerms and synonyms used to expand search queries.\n\n| Term | Synonyms |\n|---|---|\n{rows}\n")
    put("README.md",
        "# Site Data Desk vault\n\nThis Obsidian vault is the source of truth for all content. Open this folder as a vault in Obsidian "
        "to browse the graph. Folders: `standards/` (real, CC BY 4.0), `projects/`, `reports/`, `comms/`, `entities/` (all FICTIONAL), "
        "`glossary/`, `agent-memory/`, `proposals/`, `traces/`.\n\nEverything for the fictional company 'Kestrel Environmental Group' is invented.\n")
    put("Dashboard.md",
        "# Dashboard\n\nRequires the Dataview community plugin.\n\n## Projects\n\n```dataview\nTABLE status, budget_aud, committed_aud\nFROM \"projects\"\nSORT code ASC\n```\n\n"
        "## Open proposals\n\n```dataview\nTABLE kind, status\nFROM \"proposals\"\nWHERE status = \"open\"\n```\n\n"
        "## Recent traces\n\n```dataview\nTABLE date, route, status\nFROM \"traces\"\nSORT date DESC\nLIMIT 20\n```\n")
    put("agent-memory/changelog.md",
        fm(dict(id="changelog", type="memory", title="Agent changelog", date="2026-10-11", fictional=False, tags=["agent-memory"]))
        + "# Agent changelog\n\nApproved changes to prompts, thresholds and glossary are logged here with the evidence behind them.\n\n(none yet)\n")
    put(".obsidian/graph.json", json.dumps({
        "colorGroups": [
            {"query": "path:standards", "color": {"a": 1, "rgb": 3900150}},
            {"query": "path:projects", "color": {"a": 1, "rgb": 15105570}},
            {"query": "path:reports", "color": {"a": 1, "rgb": 10181046}},
            {"query": "path:comms", "color": {"a": 1, "rgb": 3066993}},
            {"query": "path:entities", "color": {"a": 1, "rgb": 15844367}},
            {"query": "path:traces", "color": {"a": 1, "rgb": 9807270}},
        ]}, indent=2) + "\n")


def build() -> None:
    FILES.clear()
    gen_entities()
    gen_projects()
    gen_reports()
    gen_emails()
    gen_slack()
    gen_glossary_and_meta()


def manifest() -> dict[str, str]:
    return {p: hashlib.sha256(t.encode()).hexdigest() for p, t in sorted(FILES.items())}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    build()
    man = manifest()
    mp = VAULT / ".seed-manifest.json"
    if args.check:
        if not mp.exists() or json.loads(mp.read_text()) != man:
            raise SystemExit("seed output differs from vault/.seed-manifest.json (not deterministic or not regenerated)")
        print(f"seed check OK: {len(man)} files")
        return
    for sub in ["projects", "reports", "comms/emails", "comms/slack", "entities", "glossary"]:  # clear stale generated notes
        for f in (VAULT / sub).glob("*.md"):
            f.unlink()
    for rel, text in FILES.items():
        dest = VAULT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text)
    mp.write_text(json.dumps(man, indent=1) + "\n")
    (ROOT / "config").mkdir(exist_ok=True)
    (ROOT / "config/glossary.json").write_text(json.dumps(C.GLOSSARY, indent=1, sort_keys=True) + "\n")
    counts = defaultdict(int)
    for rel in FILES:
        counts[rel.split("/")[0] if "/" in rel else "root"] += 1
    print("generated", len(FILES), "files:", dict(counts))
    leaks = [r for r, t in FILES.items() if re.search(r"[\w.]+@(?!(?:[\w-]+\.)?example\.com)[\w.-]+\.\w+", t)]
    if leaks:
        raise SystemExit(f"non-example.com email addresses found in: {leaks}")


if __name__ == "__main__":
    main()
