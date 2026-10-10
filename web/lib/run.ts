import { clearScratch, getQAGraph, NODE_LABELS } from "./graph/qa";
import { buildRows, loadFacts, narrateInsight } from "./graph/insights";
import { config } from "./config";
import { RunContext } from "./trace";
import type { Answer, Route, StatusEvent } from "./types";
import { scrubPii } from "./util";

export interface ChatArgs {
  message: string;
  threadId: string;
  ipHash: string;
  routeOverride?: Route | null;
  isEval?: boolean;
  /** Eval only: stop after routing so the router can be scored cheaply. */
  routeOnly?: boolean;
  llmKey?: string;
  onStatus?: (e: StatusEvent) => void;
}

function errorAnswer(ctx: RunContext, msg: string): Answer {
  return {
    status: "error", route: null, routeOverridden: false, markdown: msg, claims: [], sources: [], removed: [], closest: [],
    degraded: true, runId: ctx.runId, configVersion: config.version,
  };
}

/** Runs the QA graph for one message. Returns the context so the caller can flush trace writes after responding. */
export async function runChat(a: ChatArgs): Promise<{ answer: Answer; ctx: RunContext }> {
  const ctx = new RunContext(a.threadId, a.ipHash, { isEval: a.isEval, llmKey: a.llmKey });
  const clean = scrubPii(a.message).trim();
  await ctx.start("chat", clean);
  const t0 = Date.now();
  let final: Answer | null = null;
  try {
    const graph = await getQAGraph();
    const stream = await graph.stream(
      { runId: ctx.runId, query: clean, routeOverride: a.routeOverride ?? null },
      { configurable: { thread_id: a.threadId }, streamMode: "updates" },
    );
    for await (const update of stream) {
      for (const [node, delta] of Object.entries(update as Record<string, { result?: Answer | null } | undefined>)) {
        a.onStatus?.({ node, label: NODE_LABELS[node] ?? node, ms: Date.now() - t0 });
        if (delta?.result) final = delta.result;
        if (a.routeOnly && node === "intake") {
          const d = delta as { route?: Route | null; overridden?: boolean };
          final = { ...errorAnswer(ctx, ""), status: "ok", route: d.route ?? null, routeOverridden: !!d.overridden, degraded: ctx.degraded };
        }
      }
      if (final && a.routeOnly) break;
    }
    final ??= errorAnswer(ctx, "No answer was produced.");
  } catch (e) {
    console.error("runChat", e);
    final = errorAnswer(ctx, `Something went wrong while answering (${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}). Run ${ctx.runId.slice(0, 8)}.`);
  }
  final.degraded = final.degraded || ctx.degraded;
  await ctx.finish({ route: final.route, routeOverridden: final.routeOverridden, status: final.status, answer: { ...final, sources: final.sources.map((s) => ({ ...s, passage: undefined })) } });
  clearScratch(ctx.runId);
  return { answer: final, ctx };
}

/** Weekly digest for the Insights page: fixed tool (no routing), narrated and numerically verified. */
export async function runDigest(args: { threadId: string; ipHash: string; llmKey?: string }): Promise<{ answer: Answer; ctx: RunContext }> {
  const ctx = new RunContext(args.threadId, args.ipHash, { llmKey: args.llmKey });
  await ctx.start("digest", "weekly digest");
  let answer: Answer;
  try {
    const rows = await ctx.step("insight_query", async (rec) => {
      const facts = await loadFacts();
      const r = buildRows({ tool: "weekly_digest", project: null, degraded: false }, facts);
      rec.output({ rows: r.length });
      return r;
    });
    const n = await ctx.step("insight_narrate", async (rec) => {
      const out = rows.length ? await narrateInsight(ctx, "Write the weekly leadership digest across all projects.", rows) : null;
      rec.output({ bullets: out?.bullets.length ?? 0, removed: out?.removed });
      return out;
    });
    const refs = [...new Set((n?.bullets ?? []).map((b) => b.ref))];
    answer = {
      status: n && n.bullets.length ? "ok" : "not_found", route: "insights", routeOverridden: false,
      markdown: n && n.bullets.length ? n.bullets.map((b) => `- ${b.text.replace(/\s*\.?$/, ".")} [${refs.indexOf(b.ref) + 1}]`).join("\n") : "No digest could be verified against the project data.",
      claims: (n?.bullets ?? []).map((b, i) => ({ id: i + 1, text: b.text, evidence: refs.indexOf(b.ref) + 1, quote: b.ref })),
      sources: n?.sources ?? [], removed: n?.removed ?? [], closest: [], degraded: ctx.degraded, runId: ctx.runId, configVersion: config.version, data: rows,
    };
  } catch (e) {
    answer = errorAnswer(ctx, `Digest failed (${e instanceof Error ? e.message.slice(0, 120) : "unknown"}).`);
  }
  await ctx.finish({ route: "insights", status: answer.status, answer: { ...answer, data: undefined, sources: answer.sources.map((s) => ({ ...s, passage: undefined })) } });
  return { answer, ctx };
}
