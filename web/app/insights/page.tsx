"use client";
import { useEffect, useState } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { SourceDrawer, type DrawerSource } from "@/components/SourceDrawer";
import { Badge, Card, PageHeader } from "@/components/ui";
import type { Answer } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Facts = Record<string, Record<string, any>>;
const money = (n: number) => `A$${Math.round(n).toLocaleString("en-AU")}`;
const AS_OF = "2026-10-11";

export default function InsightsPage() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [digest, setDigest] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerSource | null>(null);

  useEffect(() => {
    fetch("/api/insights").then((r) => r.json()).then((j) => { setFacts(j.projects); setDigest(j.digest); }).catch(() => setErr("Could not load project data."));
  }, []);

  async function generate(refresh: boolean) {
    setBusy(true); setErr(null);
    try {
      const byo = (() => { try { return localStorage.getItem("sdd-byo") ?? ""; } catch { return ""; } })();
      const res = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json", ...(byo ? { "x-openrouter-key": byo } : {}) }, body: JSON.stringify({ refresh }) });
      const j = await res.json();
      if (!res.ok) setErr(j.detail ?? "Could not generate the digest."); else setDigest(j.digest);
    } catch { setErr("Could not generate the digest."); } finally { setBusy(false); }
  }

  const projects = facts ? Object.entries(facts).sort(([a], [b]) => a.localeCompare(b)) : [];
  return (
    <div>
      <PageHeader title="Insights" sub={`Portfolio view for leadership, as of ${AS_OF}. Cards read structured project data directly. The digest is written by a model and every number is checked against the data.`} />
      <Card className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Weekly digest</h2>
          <div className="flex gap-2">
            <button onClick={() => void generate(false)} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accentink disabled:opacity-50">{busy ? "Generating…" : digest ? "Show digest" : "Generate digest"}</button>
            {digest && <button onClick={() => void generate(true)} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50">Regenerate</button>}
          </div>
        </div>
        {err && <p className="mb-2 text-sm text-warn" role="alert">{err}</p>}
        {digest ? <AnswerCard answer={digest} threadId="" onOpenSource={setDrawer} /> : <p className="text-sm text-muted">Generated on demand and cached for 24 hours to save quota.</p>}
      </Card>

      {!facts && !err && <p className="text-sm text-muted">Loading projects…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map(([id, f]) => {
          const pct = f.budget_aud ? Math.min(100, Math.round((f.committed_aud / f.budget_aud) * 100)) : 0;
          const over = f.committed_aud > f.budget_aud;
          return (
            <Card key={id}>
              <div className="mb-1 flex items-start justify-between gap-2"><h3 className="font-medium leading-snug">{f.code} · {f.title}</h3></div>
              <p className="text-sm text-muted">{f.client} · PM {String(f.project_manager).replace(/\[|\]/g, "")}</p>
              <p className="mt-2 text-sm">{f.status}</p>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted"><span>Committed {money(f.committed_aud)}</span><span>Budget {money(f.budget_aud)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-surface2" role="img" aria-label={`${pct}% of budget committed`}><div className={`h-full ${over ? "bg-bad" : "bg-accent"}`} style={{ width: `${pct}%` }} /></div>
                {over && <p className="mt-1 text-xs text-bad">Over budget</p>}
              </div>
              <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Milestones</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {(f.milestones ?? []).map((m: any, i: number) => {
                  const late = (m.done && m.done > m.due) || (!m.done && m.due < AS_OF);
                  return <li key={i} className="flex flex-wrap items-center gap-1.5"><span className={m.done ? "text-good" : "text-muted"} aria-hidden>{m.done ? "●" : "○"}</span>{m.name}<span className="text-xs text-muted">{m.done ?? `due ${m.due}`}</span>{late && <Badge tone="warn">{m.done ? "delayed" : "overdue"}</Badge>}</li>;
                })}
              </ul>
              <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Exceedances</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {(f.exceedances ?? []).map((x: any, i: number) => <li key={i}>{x.analyte} at {x.location}: <strong>{x.result} {x.unit}</strong>{x.criterion != null ? ` (criterion ${x.criterion})` : ""} <Badge tone={/removed|below|resolved|excavated/i.test(x.status) ? "good" : "warn"}>{x.status}</Badge></li>)}
              </ul>
              {(f.risks ?? []).length > 0 && (<><h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Risks</h4><ul className="mt-1 space-y-1 text-sm">{f.risks.map((r: any, i: number) => <li key={i}><Badge tone={r.level === "high" ? "bad" : r.level === "medium" ? "warn" : "neutral"}>{r.level}</Badge> {r.text}</li>)}</ul></>)}
            </Card>
          );
        })}
      </div>
      <SourceDrawer source={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
