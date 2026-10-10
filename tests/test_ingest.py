import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))
from chunking import chunk_note, pack, parse_note, split_blocks, is_tabular  # noqa: E402


def load(rel):
    return parse_note(rel, (ROOT / rel).read_text())


def test_standard_chunks_keep_pages_and_are_verbatim():
    note = load("vault/standards/nepm-b1.md")
    corpus, chunks = chunk_note(note)
    assert corpus == "standards"
    assert chunks and all(c.page for c in chunks)
    pages = {c.page for c in chunks}
    assert 53 in pages  # the HIL table page
    hil = [c for c in chunks if c.page == 53 and "Arsenic" in c.content]
    assert hil, "HIL table chunk missing"
    assert "100 500 300 3 000" in re.sub(r"\s+", " ", hil[0].content)
    assert max(len(c.content) for c in chunks) < 4200


def test_table_rows_are_not_split_from_header():
    block_table = "Table 1A(1) Health investigation levels  \n\nChemical A B C D  \n\nArsenic 100 500 300 3 000  \n\nLead 300 1200 600 1 500  "
    filler = ["Some paragraph text. " * 40] * 3
    chunks = pack(split_blocks("\n\n".join(filler + [block_table])))
    joined = [c for c in chunks if "Arsenic" in c]
    assert joined and "Lead 300" in joined[0] and "Chemical" in joined[0]


def test_email_chunk_has_thread_and_project():
    note = load("vault/comms/emails/email-p1-012.md")
    corpus, chunks = chunk_note(note)
    assert corpus == "internal"
    assert chunks[0].thread_id == "p1-t10"
    assert chunks[0].project_id == "p1-halden-road"
    assert "2,860 m3" in chunks[0].content


def test_chunk_hash_changes_with_content():
    a = load("vault/comms/emails/email-p1-010.md")
    _, c1 = chunk_note(a)
    assert c1[0].hash != chunk_note(load("vault/comms/emails/email-p1-011.md"))[1][0].hash


def test_seed_is_deterministic_and_clean():
    r = subprocess.run([str(ROOT / ".venv/bin/python"), str(ROOT / "seed/generate.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
