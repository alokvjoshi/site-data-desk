"use client";
import { useState } from "react";
import { SourceDrawer, type DrawerSource } from "@/components/SourceDrawer";
import { Badge, PageHeader, Segmented } from "@/components/ui";

interface Hit { id: string; docId: string; title: string; type: string; date: string | null; page: number | null; section: string | null; project: string | null; corpus: string; snippet: string; content: string; fictional: boolean | null; relevance: number | null }
type Corpus = "both" | "standards" | "internal";

const PROJECTS = [["", "All projects"], ["p1-halden-road", "P1 Halden Road"], ["p2-marlin-bay-pfas", "P2 Marlin Bay PFAS"], ["p3-brightwater-asbestos", "P3 Brightwater asbestos"], ["p4-ironbark-gme", "P4 Ironbark monitoring"]];

function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter((t) => t.length > 2).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`\\b(${words.join("|")})\\b`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [corpus, setCorpus] = useState<Corpus>("both");
  const [project, setProject] = useState("");
  const [rerank, setRerank] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [terms, setTerms] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<DrawerSource | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, corpus, project: project || null, rerank }) });
      const j = await res.json();
      if (!res.ok) { setErr(j.detail ?? "Search failed."); setHits(null); return; }
      setHits(j.results); setTerms(j.terms);
    } catch { setErr("Search failed. Please try again."); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Search" sub="Keyword and meaning search across the standards and the company records. No AI-written answer: you see the source text. Turn on AI ranking to reorder the top results by relevance." />
      <form onSubmit={run} className="space-y-3">
        <div className="flex gap-2">
          <label htmlFor="sq" className="sr-only">Search query</label>
          <input id="sq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. asbestos fines screening level, MW04 PFOS, lime dosing decision" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm" />
          <button disabled={busy || q.trim().length < 2} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accentink disabled:opacity-50">{busy ? "Searching…" : "Search"}</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Segmented<Corpus> label="Corpus" value={corpus} onChange={setCorpus} options={[{ value: "both", label: "All" }, { value: "standards", label: "Standards" }, { value: "internal", label: "Company" }]} />
          <label className="sr-only" htmlFor="proj">Project</label>
          <select id="proj" value={project} onChange={(e) => setProject(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5">{PROJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} /> AI ranking (uses 1 daily question)</label>
        </div>
      </form>
      {err && <p className="mt-4 rounded-lg bg-warnbg px-3 py-2 text-sm text-warn" role="alert">{err}</p>}
      {hits && (
        <ol className="mt-5 space-y-3" aria-label="Search results">
          {hits.length === 0 && <li className="text-sm text-muted">No results.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button onClick={() => setDrawer({ title: h.title, docId: h.docId, docType: h.type, date: h.date, page: h.page, section: h.section, fictional: h.fictional ?? undefined, passage: h.content, terms })} className="w-full rounded-xl border border-line bg-surface p-3.5 text-left hover:border-accent">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={h.corpus === "standards" ? "good" : "accent"}>{h.corpus === "standards" ? "standard" : h.type}</Badge>
                  {h.page ? <span>PDF p.{h.page}</span> : null}{h.date && <span>{h.date}</span>}
                  {h.relevance !== null && <span>relevance {Math.round(h.relevance * 100)}%</span>}
                </div>
                <h2 className="mt-1 text-sm font-medium">{h.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted"><Snippet text={h.snippet} terms={terms} /></p>
              </button>
            </li>
          ))}
        </ol>
      )}
      <SourceDrawer source={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
