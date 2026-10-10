"""Convert manifest DOCX documents (format: docx) to vault markdown.

Word has no fixed pages, so citations point at sections (headings), not page numbers.
Usage: python ingest/docx_to_md.py [--only epa-vic-3010]
"""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

import yaml
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent.parent
FIELD_JUNK = re.compile(r"^(TOC\s|TITLE\s|PAGEREF|REF\s|SEQ\s|HYPERLINK)|\\\*\s*MERGEFORMAT", re.I)


def clean(text: str) -> str:
    text = re.sub(r"\s*(?:REF|PAGEREF|SEQ|HYPERLINK)\s+[_\w.\"/:-]+(?:\s+\\[\w\\*]+)*\s*", " ", text)
    text = re.sub(r"\s*\\\*\s*\w+", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def table_md(t: Table) -> str:
    rows = []
    for r in t.rows:
        cells, last = [], None
        for c in r.cells:
            if c._tc is last:  # merged cell repeats
                continue
            last = c._tc
            cells.append(clean(c.text.replace("\n", " ")).replace("|", "/"))
        rows.append(cells)
    rows = [r for r in rows if any(r)]
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)


def body_blocks(doc: Document):
    for el in doc.element.body.iterchildren():
        if el.tag.endswith("}p"):
            yield Paragraph(el, doc)
        elif el.tag.endswith("}tbl"):
            yield Table(el, doc)


def convert(d: dict) -> Path:
    src = ROOT / d["file"]
    if hashlib.sha256(src.read_bytes()).hexdigest() != d["sha256"]:
        raise SystemExit(f"checksum mismatch for {src}")
    doc = Document(str(src))
    out: list[str] = []
    past_toc = False
    for b in body_blocks(doc):
        if isinstance(b, Table):
            md = table_md(b)
            if md and past_toc:
                out.append(md)
            continue
        style = (b.style.name if b.style is not None else "") or ""
        text = clean(b.text)
        if not text or FIELD_JUNK.search(b.text.strip()):
            continue
        if style.lower().startswith("toc"):
            continue
        m = re.match(r"heading\s*(\d)", style, re.I)
        if m:
            past_toc = True
            out.append("#" * (int(m.group(1)) + 1) + " " + text)
        elif not past_toc:
            continue  # cover page and contents
        elif "list" in style.lower() or b._p.pPr is not None and b._p.pPr.numPr is not None:
            out.append("- " + text)
        else:
            out.append(text)
    # merge consecutive list items into one block
    blocks, cur = [], []
    for line in out:
        if line.startswith("- "):
            cur.append(line)
            continue
        if cur:
            blocks.append("\n".join(cur)); cur = []
        blocks.append(line)
    if cur:
        blocks.append("\n".join(cur))
    fm = {
        "id": d["id"], "type": "standard", "title": d["title"], "short": d["short"], "date": d.get("date", "2024-04-01"),
        "source_type": "standard", "publisher": d["publisher"], "source_url": d["url"], "licence": d["licence"],
        "licence_source": d.get("licence_source", ""), "fictional": False, "pages": None, "tags": d.get("tags", ["standard"]),
    }
    note = (f"> Source: {d['publisher']}. Licensed under {d['licence']} (see licence source). Text extracted from the official "
            "Word document and reformatted; figures and some tables are omitted. Content supplied by third parties inside the "
            "document may be excluded from the licence. Citations point to sections because the Word format has no fixed pages.\n")
    dest = ROOT / "vault/standards" / f"{d['id']}.md"
    dest.write_text("---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n\n" + f"# {d['title']}\n\n{note}\n" + "\n\n".join(blocks) + "\n")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    args = ap.parse_args()
    for d in yaml.safe_load((ROOT / "corpus/manifest.yaml").read_text())["documents"]:
        if d.get("format") != "docx" or not d.get("public") or not d.get("licence_verified"):
            continue
        if args.only and d["id"] != args.only:
            continue
        dest = convert(d)
        print(f"{d['id']}: {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
