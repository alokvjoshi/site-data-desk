import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { T } from "@/lib/config";

export const dynamic = "force-dynamic";

interface EvalRow { metrics: Record<string, number>; passed: boolean; created_at: string; git_sha: string | null }

const STEPS = [
  ["Understand", "One Jev request decides the route (standards, company records, both, portfolio), flags manipulation attempts and vague questions."],
  ["Retrieve", "Hybrid search in Postgres: meaning (pgvector) and keywords, fused with reciprocal rank fusion. Acronyms are expanded from a glossary."],
  ["Rank and screen", "Jev scores each top passage for relevance and checks it for hidden instructions. Flagged passages are dropped."],
  ["Draft", "A language model writes claims, each with a verbatim quote from one numbered passage. It can only say 'not found'."],
  ["Verify", "Code checks each quote exists word for word and each number appears in the source. Jev then judges whether the passage truly supports the claim."],
  ["Decide", "Unsupported claims are removed. If too few survive, it redrafts once; if still nothing, it says not found."],
  ["Safety check", "A final Jev check blocks leaked instructions, sign-off style advice and secrets."],
];

const LABELS: Record<string, string> = {
  citation_validity: "Quotes found verbatim", support_rate: "Claims supported", correct_not_found: "Correct 'not found'", recall_at_5: "Retrieval recall@5",
  routing_accuracy: "Routing accuracy", injection_resistance: "Injection resistance", numeric_fidelity: "Numeric fidelity", false_refusal_rate: "False refusals",
  p95_latency_ms: "p95 latency (ms)", cost_per_query_usd: "Cost per query (USD)",
};

export default async function HowItWorks() {
  const db = getDb();
  let latest: EvalRow | null = null as EvalRow | null;
  if (db) {
    const { data } = await db.from("eval_runs").select("metrics,passed,created_at,git_sha").order("created_at", { ascending: false }).limit(1).maybeSingle();
    latest = data as EvalRow | null;
  }
  const floors = T.eval_floors;
  return (
    <div>
      <PageHeader title="How it works" sub="An answer is only shown if every statement in it survives checking against a quoted source. Here is the pipeline and the latest evaluation results." />
      <ol className="mb-8 grid gap-3 sm:grid-cols-2">
        {STEPS.map(([t, d], i) => (
          <li key={t}><Card className="h-full"><p className="text-xs font-medium text-accent">Step {i + 1}</p><h2 className="font-medium">{t}</h2><p className="mt-1 text-sm text-muted">{d}</p></Card></li>
        ))}
      </ol>
      <h2 className="mb-2 text-lg font-semibold">Latest evaluation</h2>
      {latest ? (
        <Card>
          <p className="mb-2 text-sm text-muted">Run {new Date(latest.created_at).toLocaleString("en-AU")}{latest.git_sha ? ` · ${latest.git_sha.slice(0, 7)}` : ""} · {latest.passed ? "gate passed" : "gate failed"}</p>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1">Metric</th><th>Result</th></tr></thead>
            <tbody>{Object.entries(latest.metrics).filter(([k]) => LABELS[k]).map(([k, v]) => <tr key={k} className="border-t border-line"><td className="py-1.5">{LABELS[k]}</td><td>{typeof v === "number" ? (k.includes("ms") || k.includes("usd") ? v : `${Math.round(v * 1000) / 10}%`) : String(v)}</td></tr>)}</tbody></table>
        </Card>
      ) : <p className="text-sm text-muted">No evaluation run has been recorded yet. Floors the gate enforces: {Object.entries(floors).map(([k, v]) => `${k} ${v}`).join(", ")}.</p>}
      <h2 className="mb-2 mt-8 text-lg font-semibold">Stack</h2>
      <p className="max-w-3xl text-sm text-muted">Next.js on Vercel · LangGraph with a Postgres checkpointer · Supabase (Postgres, pgvector) · DeepSeek via OpenRouter for writing · TypeSafe Jev for every judgment and structured decision · an Obsidian vault as the source of truth, synced into the search index by one script.</p>
    </div>
  );
}
