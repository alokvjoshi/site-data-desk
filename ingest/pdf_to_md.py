"""Convert manifest PDFs to vault markdown with page markers.

Usage: python ingest/pdf_to_md.py [--only nepm-b1] [--include-local]

Output: vault/standards/<id>.md with frontmatter and `<!-- page: N -->` markers.
Page N is the PDF page index (1-based), which is what the source viewer links to.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

import pypdf
import yaml

ROOT = Path(__file__).resolve().parent.parent
HEADING_RE = re.compile(r"^(\d+(?:\.\d+){0,3})\s+([A-Z][^.]{2,90})$")
APPENDIX_RE = re.compile(r"^(Appendix|Schedule)\s+[A-Z0-9]+[a-z]?\b.{0,80}$")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_lines(pages: list[str]) -> list[list[str]]:
    """Drop lines that repeat on many pages (running headers/footers) and page-number-only lines."""
    split = [[ln.rstrip() for ln in p.splitlines()] for p in pages]
    counts: Counter[str] = Counter()
    for lines in split:
        for ln in set(l.strip() for l in lines if l.strip()):
            counts[ln] += 1
    threshold = max(4, int(len(pages) * 0.4))
    noise = {ln for ln, c in counts.items() if c >= threshold and len(ln) < 120}
    out = []
    for lines in split:
        kept = []
        for ln in lines:
            s = ln.strip()
            if not s or s in noise or re.fullmatch(r"\d{1,3}", s):
                if not s:
                    kept.append("")
                continue
            kept.append(s)
        out.append(kept)
    return out


def to_markdown(lines: list[str]) -> str:
    """Join wrapped lines into paragraphs, promote numbered headings, keep table-like lines intact."""
    out: list[str] = []
    para: list[str] = []

    def flush() -> None:
        if para:
            out.append(" ".join(para))
            para.clear()

    for ln in lines:
        if not ln:
            flush()
            continue
        if HEADING_RE.match(ln) and not re.search(r"\s\d{1,3}$", ln):  # skip contents-page lines
            flush()
            depth = min(ln.split()[0].count(".") + 2, 4)
            out.append("#" * depth + " " + ln)
        elif APPENDIX_RE.match(ln):
            flush()
            out.append("## " + ln)
        elif looks_tabular(ln):
            flush()
            out.append(ln + "  ")  # trailing double space keeps the line break in markdown
        else:
            para.append(ln)
    flush()
    return "\n\n".join(out)


def looks_tabular(ln: str) -> bool:
    nums = re.findall(r"\b\d[\d,.]*\b", ln)
    return len(nums) >= 3 or bool(re.match(r"^(Table|Figure)\s+\w+", ln))


def convert(doc: dict) -> Path:
    src = ROOT / doc["file"]
    if not src.exists():
        raise SystemExit(f"missing {src}; download it first (see corpus/manifest.yaml)")
    if doc.get("sha256") and sha256(src) != doc["sha256"]:
        raise SystemExit(f"checksum mismatch for {src}")
    reader = pypdf.PdfReader(str(src))
    raw = [(p.extract_text() or "") for p in reader.pages]
    pages = clean_lines(raw)
    body = []
    for i, lines in enumerate(pages, start=1):
        body.append(f"<!-- page: {i} -->\n\n{to_markdown(lines)}".rstrip())
    fm = {
        "id": doc["id"],
        "type": "standard",
        "title": doc["title"],
        "short": doc["short"],
        "date": "2013-05-15",
        "source_type": "standard",
        "publisher": doc["publisher"],
        "source_url": doc["url"],
        "licence": doc["licence"],
        "licence_source": doc.get("licence_source", ""),
        "fictional": False,
        "pages": len(reader.pages),
        "tags": ["standard", "contaminated-land", "nepm"],
    }
    attribution = (
        f"> Source: {doc['publisher']}. Licensed under {doc['licence']}. "
        "Text extracted from the official PDF and reformatted (page markers added, headings detected); "
        "tables may be flattened. Always check the original before relying on any value.\n"
    )
    out_dir = ROOT / ("vault/standards" if doc.get("public") else "corpus/local/vault")
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{doc['id']}.md"
    dest.write_text(
        "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n\n"
        f"# {doc['title']}\n\n{attribution}\n" + "\n\n".join(body) + "\n"
    )
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--include-local", action="store_true")
    args = ap.parse_args()
    docs = yaml.safe_load((ROOT / "corpus/manifest.yaml").read_text())["documents"]
    for d in docs:
        if args.only and d["id"] != args.only:
            continue
        if not d.get("public") and not args.include_local:
            continue
        if not d.get("licence_verified") and d.get("public"):
            print(f"skip {d['id']}: public but licence not verified", file=sys.stderr)
            continue
        dest = convert(d)
        print(f"{d['id']}: {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
