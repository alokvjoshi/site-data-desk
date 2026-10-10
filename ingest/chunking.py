"""Type-aware chunking for vault notes. Pure functions (no I/O) so they are easy to test.

Rules (see PRD 5.1):
- standards: one page at a time (page = PDF page from <!-- page: N --> markers), split on paragraphs to
  <= TARGET chars, never split a table (tabular block) across chunks if it fits in HARD_MAX.
- emails: one chunk per message. slack: one chunk per note window. reports/projects: by '## ' section.
- Every non-standard chunk starts with a context line "[title - section]" so full-text search can find it.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

import yaml

TARGET = 1600
HARD_MAX = 3200
PAGE_RE = re.compile(r"<!--\s*page:\s*(\d+)\s*-->")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")


@dataclass
class Note:
    path: str
    meta: dict
    body: str
    raw: str

    @property
    def id(self) -> str:
        return str(self.meta["id"])

    @property
    def type(self) -> str:
        return str(self.meta["type"])


@dataclass
class Chunk:
    ord: int
    content: str
    page: int | None = None
    section: str | None = None
    thread_id: str | None = None
    project_id: str | None = None
    meta: dict = field(default_factory=dict)

    @property
    def hash(self) -> str:
        return hashlib.sha256(self.content.encode()).hexdigest()


def parse_note(path: str, raw: str) -> Note | None:
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        return None
    meta = yaml.safe_load(m.group(1)) or {}
    if "id" not in meta or "type" not in meta:
        return None
    return Note(path=path, meta=meta, body=m.group(2).strip("\n"), raw=raw)


def project_of(meta: dict) -> str | None:
    p = meta.get("project")
    if isinstance(p, str):
        m = WIKILINK_RE.search(p)
        return m.group(1) if m else p
    return meta.get("id") if meta.get("type") == "project" else None


def is_tabular(block: str) -> bool:
    lines = [l for l in block.split("\n") if l.strip()]
    if not lines:
        return False
    if all(l.lstrip().startswith("|") for l in lines):
        return True
    pipes_or_pairs = sum(1 for l in lines if l.endswith("  ") or re.match(r"^(Table|Figure)\s+\w+", l))
    return pipes_or_pairs >= max(2, len(lines) // 2)


def split_blocks(text: str) -> list[str]:
    return [b.strip("\n") for b in re.split(r"\n{2,}", text) if b.strip()]


def pack(blocks: list[str], target: int = TARGET, hard_max: int = HARD_MAX) -> list[str]:
    """Greedy-pack blocks into chunks. A tabular block and its caption (previous block) stay together."""
    out: list[str] = []
    cur: list[str] = []
    size = 0
    i = 0
    while i < len(blocks):
        b = blocks[i]
        unit = [b]
        if is_tabular(b):
            # keep consecutive tabular blocks (table continues across blank lines) together
            while i + 1 < len(blocks) and is_tabular(blocks[i + 1]) and sum(len(x) for x in unit) < hard_max:
                i += 1
                unit.append(blocks[i])
        ulen = sum(len(x) for x in unit) + 2 * (len(unit) - 1)
        if cur and size + ulen > target and not (is_tabular(b) and size + ulen <= hard_max):
            out.append("\n\n".join(cur))
            cur, size = [], 0
        if ulen > hard_max and not is_tabular(b):
            for piece in split_long(unit[0], target):
                if cur:
                    out.append("\n\n".join(cur))
                    cur, size = [], 0
                out.append(piece)
        else:
            cur.append("\n\n".join(unit))
            size += ulen
        i += 1
    if cur:
        out.append("\n\n".join(cur))
    return out


def split_long(text: str, target: int) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out, cur = [], ""
    for s in sentences:
        if cur and len(cur) + len(s) + 1 > target:
            out.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        out.append(cur)
    return out


def current_section(text: str, previous: str | None) -> str | None:
    sec = previous
    for line in text.split("\n"):
        m = HEADING_RE.match(line)
        if m and len(m.group(2)) > 2:
            sec = m.group(2).strip()
    return sec


def chunk_standard(note: Note) -> list[Chunk]:
    title = note.meta.get("short") or note.meta["title"]
    parts = PAGE_RE.split(note.body)
    # parts: [preamble, page1, text1, page2, text2, ...]
    chunks: list[Chunk] = []
    section: str | None = None
    ord_ = 0
    for k in range(1, len(parts), 2):
        page = int(parts[k])
        text = parts[k + 1]
        start_section = section
        for piece in pack(split_blocks(text)):
            sec = current_section(piece, start_section)
            start_section = sec
            body = f"[{title} - p.{page}" + (f" - {sec}" if sec else "") + f"]\n\n{piece}"
            chunks.append(Chunk(ord=ord_, content=body, page=page, section=sec))
            ord_ += 1
        section = current_section(text, section)
    return chunks


def strip_title(body: str) -> str:
    return re.sub(r"^# .*\n+", "", body, count=1)


def chunk_email(note: Note) -> list[Chunk]:
    title = note.meta["title"]
    pid = project_of(note.meta)
    text = note.body
    pieces = pack(split_blocks(text), target=2400, hard_max=4000)
    out = []
    for i, p in enumerate(pieces):
        ctx = f"[email - {title} - {note.meta['date']}]\n\n"
        out.append(Chunk(ord=i, content=ctx + p, thread_id=note.meta.get("thread_id"), project_id=pid,
                         meta=dict(date=str(note.meta["date"]), sender=note.meta.get("sender"), subject=title)))
    return out


def chunk_by_sections(note: Note, kind: str) -> list[Chunk]:
    pid = project_of(note.meta)
    title = note.meta["title"]
    body = strip_title(note.body)
    secs = re.split(r"(?m)^(?=## )", body)
    out: list[Chunk] = []
    ord_ = 0
    for s in secs:
        s = s.strip()
        if not s:
            continue
        m = re.match(r"^##\s+(.*)", s)
        sec = m.group(1).strip() if m else "Summary"
        for piece in pack(split_blocks(s)):
            out.append(Chunk(ord=ord_, content=f"[{title} - {sec}]\n\n{piece}", section=sec, project_id=pid,
                             thread_id=note.meta.get("thread_id"),
                             meta=dict(date=str(note.meta.get("date")), version=note.meta.get("version"), status=note.meta.get("status"))))
            ord_ += 1
    return out


def chunk_slack(note: Note) -> list[Chunk]:
    pid = project_of(note.meta)
    lines = [l for l in strip_title(note.body).split("\n") if l.strip()]
    out, cur, ord_ = [], [], 0
    for l in lines:
        if cur and sum(len(x) for x in cur) + len(l) > 1800:
            out.append(Chunk(ord=ord_, content=f"[slack #{note.meta.get('channel')} - {note.meta['title']}]\n\n" + "\n".join(cur),
                             project_id=pid, thread_id=note.meta.get("thread_id"), meta=dict(date=str(note.meta["date"]))))
            ord_ += 1
            cur = []
        cur.append(l)
    if cur:
        out.append(Chunk(ord=ord_, content=f"[slack #{note.meta.get('channel')} - {note.meta['title']}]\n\n" + "\n".join(cur),
                         project_id=pid, thread_id=note.meta.get("thread_id"), meta=dict(date=str(note.meta["date"]))))
    return out


def chunk_note(note: Note) -> tuple[str, list[Chunk]]:
    """Return (corpus, chunks)."""
    t = note.type
    if t == "standard":
        return "standards", chunk_standard(note)
    if t == "email":
        return "internal", chunk_email(note)
    if t == "slack":
        return "internal", chunk_slack(note)
    if t in ("report", "project"):
        return "internal", chunk_by_sections(note, t)
    return "internal", chunk_by_sections(note, t)


def wikilinks(text: str) -> list[str]:
    return [m.group(1).strip() for m in WIKILINK_RE.finditer(text)]
