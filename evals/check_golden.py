"""Offline validation of the golden sets (no network, no keys).

Checks that every gold reference points at a real note and that the gold phrase really appears there (on the
stated PDF pages for standards), so a typo in a golden answer can't silently make the evals meaningless.
Also checks that every planted test case is covered. Run in CI: python evals/check_golden.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "evals/golden"
PLANTED = {"correction", "contradiction", "near_duplicate", "reversal", "unanswerable"}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("*", "")).lower().strip()


def load_notes() -> dict[str, str]:
    out = {}
    for f in (ROOT / "vault").rglob("*.md"):
        m = re.search(r"^id: (\S+)", f.read_text(), re.M)
        if m:
            out[m.group(1).strip("'\"")] = f.read_text()
    return out


def pages_of(text: str) -> dict[int, str]:
    parts = re.split(r"<!-- page: (\d+) -->", text)
    return {int(parts[i]): norm(parts[i + 1]) for i in range(1, len(parts), 2)}


def main() -> int:
    notes = load_notes()
    errors: list[str] = []
    tags: set[str] = set()
    total = 0
    for f in sorted(GOLD.glob("*.yaml")):
        if f.name == "judge_calibration.yaml":
            d = yaml.safe_load(f.read_text())
            assert len(d["pairs"]) >= 30, "need at least 30 calibration pairs"
            for p in d["pairs"]:
                if p["p"] not in d["passages"] or p["label"] not in ("supports", "contradicts", "unsupported"):
                    errors.append(f"{f.name}: bad pair {p}")
            continue
        for c in yaml.safe_load(f.read_text()):
            total += 1
            tags |= set(c.get("tags", []))
            if not c.get("query"):
                errors.append(f"{f.name}:{c.get('id')} missing query")
            for g in c.get("gold", []):
                text = notes.get(g["doc"])
                if text is None:
                    errors.append(f"{c['id']}: gold doc {g['doc']} not in vault")
                    continue
                ph = norm(g["phrase"])
                if g.get("pages"):
                    pg = pages_of(text)
                    if not any(ph in pg.get(p, "") for p in g["pages"]):
                        errors.append(f"{c['id']}: phrase {g['phrase']!r} not on pages {g['pages']} of {g['doc']}")
                elif ph not in norm(text):
                    errors.append(f"{c['id']}: phrase {g['phrase']!r} not in {g['doc']}")
            if c.get("answerable", True) and f.name in ("standards.yaml", "internal.yaml") and not c.get("gold"):
                errors.append(f"{c['id']}: answerable case without gold")
    missing = PLANTED - tags
    if missing:
        errors.append(f"planted cases not covered: {sorted(missing)}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"golden OK: {total} cases, planted coverage {sorted(PLANTED)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
