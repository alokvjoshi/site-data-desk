"""Run the eval suite against a running Site Data Desk (local or deployed) and apply the gate.

  python evals/runner.py --base-url http://localhost:3000            # full run
  python evals/runner.py --subset 15                                  # quick PR subset
  python evals/runner.py --record                                     # also store the result in eval_runs
  python evals/runner.py --update-baseline                            # accept this run as the new baseline (human action)

Needs EVAL_KEY (bypasses quotas, tags runs as eval) and TYPESAFE_API_KEY (independent Jev judge). Exit code 1 when the
gate fails: any metric below its floor in config/thresholds.json, or worse than evals/baseline.json by more than the
regression tolerance.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "evals/golden"
load_dotenv(ROOT / ".env")

SUPPORT_Q = dict(
    instructions="Does `passage.text` support the statement in `claim`?",
    criteria={
        "supports": "The passage explicitly states the claim or directly implies it, including the specific values, names and dates in the claim.",
        "contradicts": "The passage says something that conflicts with the claim, such as a different value, date, outcome or a later correction.",
        "unsupported": "The passage does not address the claim, covers a different subject, or lacks the specific value or date the claim asserts.",
    },
)


def norm(s: str) -> str:
    s = s.lower().replace("’", "'").replace("*", "")
    s = re.sub(r"(?<=\d)[,\s](?=\d{3}\b)", "", s)  # 1,500 and 1 500 -> 1500
    return re.sub(r"\s+", " ", s).strip()


def contains_groups(text: str, groups: list[list[str]]) -> bool:
    t = norm(text)
    return all(any(norm(alt) in t for alt in g) for g in groups)


def numbers(s: str) -> set[str]:
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", s)}


def load(name: str) -> list[dict]:
    return yaml.safe_load((GOLD / name).read_text())


class Client:
    def __init__(self, base: str, key: str):
        self.base, self.key = base.rstrip("/"), key
        self.http = httpx.Client(timeout=90)

    def chat(self, q: str, route_only: bool = False, route: str | None = None) -> tuple[dict, int, str]:
        thread = str(uuid.uuid4())
        headers = {"x-eval-key": self.key, "accept": "application/json"}
        if route_only:
            headers["x-eval-route-only"] = "1"
        t0 = time.time()
        for attempt in range(3):
            try:
                r = self.http.post(f"{self.base}/api/chat", json={"message": q, "threadId": thread, "route": route}, headers=headers)
                if r.status_code >= 500 and attempt < 2:
                    time.sleep(2)
                    continue
                r.raise_for_status()
                return r.json(), int((time.time() - t0) * 1000), thread
            except httpx.HTTPError:
                if attempt == 2:
                    raise
                time.sleep(2)
        raise RuntimeError("unreachable")

    def trace(self, run_id: str, thread: str) -> dict | None:
        try:
            r = self.http.get(f"{self.base}/api/trace/{run_id}", params={"t": thread})
            return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None


def kept_pages(trace: dict | None) -> list[tuple[str, int | None]]:
    if not trace:
        return []
    for e in trace["events"]:
        if e["node"] == "rerank" and e.get("output"):
            return [(k["doc"], k.get("page")) for k in e["output"].get("kept", [])]
    return []


def jev_support(claim: str, passage: str, source: str = "") -> str | None:
    if not os.environ.get("TYPESAFE_API_KEY"):
        return None
    from typesafe_sdk import Choice, TypeSafeClient

    with TypeSafeClient() as c:
        r = c.system_one(state={"claim": claim, "passage": {"source": source, "text": passage[:2400]}},
                         questions={"support": Choice(instructions=SUPPORT_Q["instructions"], criteria=SUPPORT_Q["criteria"])})
    return r.choices["support"].choice


def judge_agreement() -> tuple[float, list[dict]]:
    d = yaml.safe_load((GOLD / "judge_calibration.yaml").read_text())
    rows = []

    def one(p: dict) -> dict:
        got = jev_support(p["claim"], d["passages"][p["p"]])
        return dict(claim=p["claim"], label=p["label"], got=got)

    with ThreadPoolExecutor(6) as ex:
        rows = list(ex.map(one, d["pairs"]))
    ok = sum(1 for r in rows if r["got"] == r["label"])
    return ok / len(rows), [r for r in rows if r["got"] != r["label"]]


def p95(xs: list[float]) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, math.ceil(0.95 * len(xs)) - 1)] if xs else 0.0


def run(args) -> dict:
    key = os.environ.get("EVAL_KEY", "")
    if not key:
        sys.exit("EVAL_KEY is not set (see .env.example)")
    cli = Client(args.base_url, key)
    standards, internal, insights, routing, safety = (load(f"{n}.yaml") for n in ("standards", "internal", "insights", "routing", "safety"))
    qa = [dict(c, _set="qa") for c in standards + internal]
    if args.subset:
        by = lambda xs, n: xs[:n]  # noqa: E731
        qa = by([c for c in qa if c.get("answerable", True)], max(1, args.subset - 6)) + [c for c in qa if not c.get("answerable", True)][:3]
        insights, routing, safety = by(insights, 2), by(routing, 4), by(safety, 4)

    failures: list[dict] = []
    lat: list[float] = []
    costs: list[float] = []
    cite_total = cite_ok = 0
    sup_total = sup_ok = 0
    ans_total = ans_hit = 0
    refusal_total = refusal_wrong = 0
    unans_total = unans_ok = 0
    recall_total = recall_hit = 0

    def do_qa(c: dict):
        return c, *cli.chat(c["query"])

    with ThreadPoolExecutor(args.workers) as ex:
        results = list(ex.map(do_qa, qa))
    for c, a, ms, thread in results:
        if c.get("answerable", True):
            lat.append(ms)
            ans_total += 1
            ok = a["status"] == "ok" and contains_groups(a["markdown"], c.get("must_contain", []))
            ans_hit += ok
            refusal_total += 1
            refusal_wrong += a["status"] in ("not_found", "refused", "error")
            if not ok:
                failures.append(dict(id=c["id"], kind="answer", status=a["status"], markdown=a["markdown"][:300], run=a["runId"]))
            if c.get("expected_route") and a.get("route") != c["expected_route"] and not a.get("routeOverridden"):
                failures.append(dict(id=c["id"], kind="route_in_qa", expected=c["expected_route"], got=a.get("route")))
            for s in a["sources"]:
                cite_total += 1
                cite_ok += norm(s["quote"]) in norm(s["passage"])
            tr = cli.trace(a["runId"], thread)
            if tr:
                costs.append(float(tr["run"].get("cost_usd") or 0))
                kept = kept_pages(tr)[:5]
                if c.get("gold"):
                    recall_total += 1
                    hit = any(g["doc"] == d and (not g.get("pages") or p in g["pages"]) for g in c["gold"] for d, p in kept)
                    recall_hit += hit
                    if not hit:
                        failures.append(dict(id=c["id"], kind="recall", kept=kept, gold=[g["doc"] for g in c["gold"]]))
            if not os.environ.get("SKIP_JEV_JUDGE"):
                for cl in a["claims"]:
                    src = next((s for s in a["sources"] if s["n"] == cl["evidence"]), None)
                    if src:
                        sup_total += 1
                        sup_ok += jev_support(cl["text"], src["passage"], src["title"]) == "supports"
        else:
            unans_total += 1
            good = a["status"] == "not_found"
            unans_ok += good
            if not good:
                failures.append(dict(id=c["id"], kind="should_decline", status=a["status"], markdown=a["markdown"][:300], run=a["runId"]))

    # insights: numbers in the narrative must come from the data rows
    num_total = num_ok = 0
    for c in insights:
        a, ms, thread = cli.chat(c["query"], route="insights")
        ok = a["status"] == "ok" and contains_groups(a["markdown"], c.get("must_contain", []))
        if not ok:
            failures.append(dict(id=c["id"], kind="insight", status=a["status"], markdown=a["markdown"][:300], run=a["runId"]))
        body = re.sub(r"\[\d+\]", "", a["markdown"])
        data_nums = numbers(json.dumps(a.get("data") or []))
        for n in numbers(body):
            num_total += 1
            num_ok += n in data_nums or n in {"2026", "2027"}

    # routing (router only; cheap)
    route_ok = 0
    for c in routing:
        a, _, _ = cli.chat(c["query"], route_only=True)
        good = a.get("route") == c["expected_route"]
        route_ok += good
        if not good:
            failures.append(dict(id=c["id"], kind="route", expected=c["expected_route"], got=a.get("route")))

    # safety
    safe_ok = 0
    for c in safety:
        a, _, _ = cli.chat(c["query"])
        md = norm(a["markdown"])
        good = a["status"] in c["expected_status"] and not any(norm(x) in md for x in c.get("must_not_contain", []))
        safe_ok += good
        if not good:
            failures.append(dict(id=c["id"], kind="safety", status=a["status"], markdown=a["markdown"][:300], run=a["runId"]))

    agree, disagree = (judge_agreement() if os.environ.get("TYPESAFE_API_KEY") and not args.subset else (None, []))

    def rate(a: int, b: int, default: float = 1.0) -> float:
        return a / b if b else default

    metrics = {
        "citation_validity": rate(cite_ok, cite_total),
        "support_rate": rate(sup_ok, sup_total),
        "correct_not_found": rate(unans_ok, unans_total),
        "recall_at_5": rate(recall_hit, recall_total),
        "routing_accuracy": rate(route_ok, len(routing)),
        "injection_resistance": rate(safe_ok, len(safety)),
        "numeric_fidelity": rate(num_ok, num_total),
        "false_refusal_rate": rate(refusal_wrong, refusal_total, 0.0),
        "answer_accuracy": rate(ans_hit, ans_total),
        "p95_latency_ms": p95(lat),
        "cost_per_query_usd": (sum(costs) / len(costs)) if costs else 0.0,
        "n_cases": len(qa) + len(insights) + len(routing) + len(safety),
    }
    if agree is not None:
        metrics["judge_agreement"] = agree
    return dict(metrics=metrics, failures=failures, judge_disagreements=disagree)


def gate(metrics: dict, th: dict, baseline: dict | None) -> list[str]:
    fl, tol = th["eval_floors"], th["eval_regression_tolerance"]
    bad = []
    for k, floor in fl.items():
        if k.endswith("_max"):
            name = k[:-4]
            if name in metrics and metrics[name] > floor:
                bad.append(f"{name} {metrics[name]:.4g} above ceiling {floor}")
        elif k in metrics and metrics[k] < floor:
            bad.append(f"{k} {metrics[k]:.3f} below floor {floor}")
    if "judge_agreement" in metrics and metrics["judge_agreement"] < 0.9:
        bad.append(f"judge_agreement {metrics['judge_agreement']:.3f} below 0.9")
    if baseline:
        b = baseline["metrics"]
        for k in ("citation_validity", "support_rate", "correct_not_found", "recall_at_5", "routing_accuracy", "injection_resistance", "numeric_fidelity", "answer_accuracy"):
            if k in b and k in metrics and metrics[k] < b[k] - tol:
                bad.append(f"{k} regressed {b[k]:.3f} -> {metrics[k]:.3f}")
        for k in ("false_refusal_rate",):
            if k in b and metrics[k] > b[k] + tol:
                bad.append(f"{k} regressed {b[k]:.3f} -> {metrics[k]:.3f}")
    return bad


def record(res: dict, passed: bool) -> None:
    import psycopg

    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("SUPABASE_DB_URL not set; not recorded")
        return
    sha = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip() or None
    cfg = json.loads((ROOT / "web/lib/config.generated.json").read_text())["version"]
    with psycopg.connect(url, prepare_threshold=None) as conn:
        conn.execute("insert into eval_runs (git_sha, config_version, metrics, failures, passed) values (%s,%s,%s,%s,%s)",
                     (sha, cfg, json.dumps(res["metrics"]), json.dumps(res["failures"][:50]), passed))
    print("recorded in eval_runs")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.environ.get("EVAL_BASE_URL", "http://localhost:3000"))
    ap.add_argument("--subset", type=int, default=0)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--record", action="store_true")
    ap.add_argument("--update-baseline", action="store_true")
    args = ap.parse_args()

    th = json.loads((ROOT / "config/thresholds.json").read_text())
    bp = ROOT / "evals/baseline.json"
    baseline = json.loads(bp.read_text()) if bp.exists() else None
    res = run(args)
    m = res["metrics"]
    print("\nMetric                    Result")
    for k, v in m.items():
        print(f"  {k:24s} {v:.4f}" if isinstance(v, float) else f"  {k:24s} {v}")
    for f in res["failures"][:25]:
        print("  FAIL", json.dumps(f)[:240])
    bad = gate(m, th, baseline if not args.subset else None)
    (ROOT / "evals/last_run.json").write_text(json.dumps(res, indent=1))
    passed = not bad
    print("\nGATE:", "PASS" if passed else "FAIL\n  " + "\n  ".join(bad))
    if args.record and not args.subset:
        record(res, passed)
    if args.update_baseline:
        bp.write_text(json.dumps(dict(metrics=m, updated=time.strftime("%Y-%m-%d")), indent=1))
        print("baseline updated (commit it deliberately)")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
