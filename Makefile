PY := .venv/bin/python
.PHONY: setup seed standards sync sync-dry eval eval-subset eval-baseline check test dev build improve triage export-traces

setup:            ## python venv + web deps
	python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
	cd web && npm install

seed:             ## regenerate the fictional company vault (deterministic)
	$(PY) seed/generate.py

standards:        ## convert the manifest's public PDFs into vault/standards (needs corpus/cache/*.pdf)
	$(PY) ingest/pdf_to_md.py && $(PY) ingest/docx_to_md.py

sync:             ## vault -> Supabase (documents, chunks, embeddings, facts) + web/public/graph.json
	$(PY) ingest/sync.py

sync-dry:         ## parse and chunk only, no database
	$(PY) ingest/sync.py --dry-run

eval:             ## full eval run with the gate (needs a running app + EVAL_KEY)
	$(PY) evals/runner.py --record

eval-subset:      ## quick subset used on pull requests
	$(PY) evals/runner.py --subset 15

eval-baseline:    ## accept the current run as the new baseline (deliberate human action)
	$(PY) evals/runner.py --update-baseline

check:            ## offline checks: seed determinism, golden sets, python tests
	$(PY) seed/generate.py --check && $(PY) evals/check_golden.py && $(PY) -m pytest -q tests

test:             ## web unit + graph tests
	cd web && npm test && npm run typecheck

dev:
	cd web && npm run dev

build:
	cd web && npm run build

triage:           ## Jev triage of negative feedback
	$(PY) improve/triage.py

improve:          ## draft gated improvement proposals from triaged feedback
	$(PY) improve/propose.py

export-traces:    ## write recent runs into the vault as linked notes
	$(PY) ingest/export_traces.py
