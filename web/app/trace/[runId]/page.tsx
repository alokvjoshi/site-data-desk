"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Badge, Card, PageHeader } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function TracePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    fetch(`/api/trace/${runId}?t=${encodeURIComponent(t)}`).then(async (r) => { const j = await r.json(); if (!r.ok) setErr(r.status === 403 ? "This trace belongs to another visitor." : "Trace not found."); else setData(j); }).catch(() => setErr("Could not load the trace."));
  }, [runId]);
  if (err) return <p className="text-sm text-warn">{err} <Link className="underline" href="/">Back</Link></p>;
  if (!data) return <p className="text-sm text-muted">Loading trace…</p>;
  const { run, events } = data;
  return (
    <div>
      <PageHeader title="How this answer was produced" sub="Every step of the run is recorded: the model calls, the Jev judgments with their probabilities, and what was kept or dropped." />
      <Card className="mb-4 text-sm">
        <p><strong>Question:</strong> {run.query}</p>
        <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="accent">route: {run.route ?? "n/a"}</Badge><Badge>{run.status}</Badge><Badge>{run.jev_requests} Jev requests</Badge><Badge>{run.tokens_in + run.tokens_out} LLM tokens</Badge><Badge>config {run.config_version}</Badge></div>
      </Card>
      <ol className="space-y-3">
        {events.map((e: any) => (
          <li key={e.seq}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium"><span className="mr-2 text-muted">{e.seq}</span>{e.node}</h2>
                <div className="flex gap-1.5">{e.status !== "ok" && <Badge tone={e.status === "error" ? "bad" : "warn"}>{e.status}</Badge>}{e.model && <Badge>{e.model}</Badge>}<Badge>{e.duration_ms} ms</Badge></div>
              </div>
              {e.error && <p className="mt-1 text-xs text-warn">{e.error}</p>}
              {e.input && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted">Input</summary><pre className="mt-1 overflow-x-auto rounded bg-surface2 p-2">{JSON.stringify(e.input, null, 2)}</pre></details>}
              {e.jev && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted">Jev judgments ({e.jev.length})</summary><pre className="mt-1 max-h-72 overflow-auto rounded bg-surface2 p-2">{JSON.stringify(e.jev, null, 2)}</pre></details>}
              {e.output && <details className="mt-2 text-xs" open><summary className="cursor-pointer text-muted">Output</summary><pre className="mt-1 max-h-72 overflow-auto rounded bg-surface2 p-2">{JSON.stringify(e.output, null, 2)}</pre></details>}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
