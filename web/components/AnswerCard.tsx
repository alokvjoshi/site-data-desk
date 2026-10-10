"use client";
import Link from "next/link";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Answer } from "@/lib/types";
import { Badge } from "./ui";
import type { DrawerSource } from "./SourceDrawer";

const ROUTE_LABEL: Record<string, string> = { standards: "Standards", internal: "Company records", both: "Standards + company records", insights: "Project data" };

function Feedback({ runId }: { runId: string }) {
  const [state, setState] = useState<"idle" | "down" | "sent">("idle");
  const [category, setCategory] = useState("wrong_answer");
  const [comment, setComment] = useState("");
  async function send(rating: 1 | -1, extra?: { category?: string; comment?: string }) {
    setState("sent");
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, rating, ...extra }) }).catch(() => undefined);
  }
  if (state === "sent") return <span className="text-xs text-muted">Thanks, feedback recorded.</span>;
  if (state === "down") {
    return (
      <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={(e) => { e.preventDefault(); void send(-1, { category, comment: comment || undefined }); }}>
        <label className="sr-only" htmlFor={`cat-${runId}`}>What went wrong</label>
        <select id={`cat-${runId}`} value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-line bg-surface px-1.5 py-1">
          <option value="wrong_answer">Wrong answer</option><option value="wrong_source">Wrong source</option><option value="missing_document">Missing document</option>
          <option value="bad_routing">Searched the wrong place</option><option value="slow">Too slow</option><option value="other">Other</option>
        </select>
        <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={400} placeholder="Optional detail (no personal info)" aria-label="Optional detail" className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1" />
        <button className="rounded bg-accent px-2 py-1 text-accentink" type="submit">Send</button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      Helpful?
      <button className="rounded border border-line px-2 py-0.5 hover:bg-surface2" onClick={() => void send(1)} aria-label="Helpful">Yes</button>
      <button className="rounded border border-line px-2 py-0.5 hover:bg-surface2" onClick={() => setState("down")} aria-label="Not helpful">No</button>
    </div>
  );
}

export function AnswerCard({ answer, threadId, onOpenSource }: { answer: Answer; threadId: string; onOpenSource: (s: DrawerSource) => void }) {
  const open = (n: number) => {
    const s = answer.sources.find((x) => x.n === n);
    if (s) onOpenSource({ title: s.title, docId: s.docId, docType: s.docType, date: s.date, page: s.page, section: s.section, fictional: s.fictional, passage: s.passage, quote: s.quote });
  };
  const md = answer.markdown.replace(/\[(\d+)\]/g, "[$1](#cite-$1)");
  const tone = answer.status === "ok" ? "border-line" : answer.status === "not_found" ? "border-warn/50" : answer.status === "error" || answer.status === "refused" ? "border-bad/50" : "border-line";
  return (
    <article className={`rounded-xl border ${tone} bg-surface p-4`} aria-label="Answer">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {answer.route && ROUTE_LABEL[answer.route] && (
          <Badge tone="accent">Searched: {ROUTE_LABEL[answer.route]}{answer.routeOverridden ? " (your choice)" : " (auto)"}</Badge>
        )}
        {answer.status === "not_found" && <Badge tone="warn">Not found in sources</Badge>}
        {answer.status === "refused" && <Badge tone="bad">Declined</Badge>}
        {answer.degraded && <Badge tone="warn">Checks degraded</Badge>}
      </div>
      <div className="prose-sdd text-[0.95rem]">
        <ReactMarkdown components={{
          a: ({ href, children }) => {
            const m = href?.match(/^#cite-(\d+)$/);
            if (m) return <button type="button" onClick={() => open(Number(m[1]))} aria-label={`Open source ${m[1]}`} className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-accentsoft px-1 align-text-top text-[11px] font-semibold text-accent hover:underline">{children}</button>;
            return <a href={href} className="text-accent underline">{children}</a>;
          },
        }}>{md}</ReactMarkdown>
      </div>
      {answer.notice && <p className="mt-1 text-xs text-warn">{answer.notice}</p>}
      {answer.sources.length > 0 && (
        <ol className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {answer.sources.map((s) => (
            <li key={s.n}>
              <button onClick={() => open(s.n)} className="text-left hover:underline">
                <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-accentsoft px-1 text-[11px] font-semibold text-accent">{s.n}</span>
                <span>{s.title}</span>
                <span className="text-muted">{s.page ? ` · PDF p.${s.page}` : s.section ? ` · ${s.section}` : ""}{s.date ? ` · ${s.date}` : ""}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {answer.status === "not_found" && answer.closest.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 text-xs font-medium text-muted">Closest sources (not verified as answers)</p>
          <ul className="space-y-1.5 text-sm">
            {answer.closest.map((c, i) => (
              <li key={i}><Link className="text-accent underline" href={`/doc/${encodeURIComponent(c.docId)}${c.page ? `#p${c.page}` : ""}`} target="_blank">{c.title}{c.page ? ` (p.${c.page})` : ""}</Link><span className="block text-xs text-muted">{c.snippet}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs"><Link href="/search" className="underline">Try the search page instead</Link></p>
        </div>
      )}
      {answer.removed.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">{answer.removed.length} statement{answer.removed.length > 1 ? "s" : ""} removed because they could not be verified</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">{answer.removed.map((r, i) => <li key={i}>{r.text} <em>({r.reason})</em></li>)}</ul>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Feedback runId={answer.runId} />
        <Link href={`/trace/${answer.runId}?t=${threadId}`} className="text-xs text-muted underline">How was this answered?</Link>
      </div>
    </article>
  );
}
