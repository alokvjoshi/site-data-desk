import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { config } from "./config";
import { clip } from "./util";

export interface JevRecord {
  label: string;
  questions: string[];
  answers?: unknown;
  usage?: { input_tokens: number; output_tokens: number };
  error?: string;
  capped?: boolean;
}

export class StepRecorder {
  inputData: unknown;
  outputData: unknown;
  jev: JevRecord[] = [];
  model?: string;
  tokensIn = 0;
  tokensOut = 0;
  status = "ok";
  error?: string;
  input(v: unknown) { this.inputData = v; }
  output(v: unknown) { this.outputData = v; }
  degrade(msg: string) { this.status = "degraded"; this.error = msg; }
}

const registry = new Map<string, RunContext>();
export const getCtx = (runId: string) => registry.get(runId);

/** One per request. Records a trace event per graph node and run-level totals (PRD 7.2). */
export class RunContext {
  readonly runId = randomUUID();
  seq = 0;
  jevRequests = 0;
  tokensIn = 0;
  tokensOut = 0;
  degraded = false;
  private pending: PromiseLike<unknown>[] = [];
  current: StepRecorder | null = null;

  constructor(
    readonly threadId: string,
    readonly ipHash: string,
    readonly opts: { isEval?: boolean; llmKey?: string; jevCap?: number } = {},
  ) {
    registry.set(this.runId, this);
  }

  get jevCap() { return this.opts.jevCap ?? Number(process.env.MAX_JEV_REQUESTS_PER_QUERY ?? 30); }

  private track(p: PromiseLike<unknown> | undefined) { if (p) this.pending.push(p); }

  async start(kind: string, query: string) {
    const db = getDb();
    if (!db) return;
    this.track(db.from("runs").insert({
      id: this.runId, thread_id: this.threadId, kind, query, ip_hash: this.ipHash,
      is_eval: !!this.opts.isEval, config_version: config.version,
    }).then((r) => { if (r.error) console.error("runs insert", r.error.message); }));
  }

  async step<T>(node: string, fn: (rec: StepRecorder) => Promise<T>): Promise<T> {
    const rec = new StepRecorder();
    const seq = ++this.seq;
    const started = new Date();
    this.current = rec;
    try {
      return await fn(rec);
    } catch (e) {
      rec.status = "error";
      rec.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.current = null;
      const ended = new Date();
      if (rec.status === "degraded") this.degraded = true;
      const db = getDb();
      if (db) {
        this.track(db.from("trace_events").insert({
          run_id: this.runId, seq, node, started_at: started.toISOString(), ended_at: ended.toISOString(),
          duration_ms: ended.getTime() - started.getTime(), status: rec.status, model: rec.model ?? null,
          input: rec.inputData ?? null, output: rec.outputData ?? null, jev: rec.jev.length ? rec.jev : null,
          tokens_in: rec.tokensIn, tokens_out: rec.tokensOut, error: rec.error ?? null,
        }).then((r) => { if (r.error) console.error("trace insert", r.error.message); }));
      }
    }
  }

  addLlmUsage(inTok: number, outTok: number) {
    this.tokensIn += inTok;
    this.tokensOut += outTok;
    if (this.current) { this.current.tokensIn += inTok; this.current.tokensOut += outTok; }
  }

  costUsd(): number {
    const p = config.prices;
    return (this.tokensIn * p.llm_in_per_million_usd + this.tokensOut * p.llm_out_per_million_usd) / 1e6 + this.jevRequests * p.jev_per_request_usd;
  }

  async finish(patch: { route?: string | null; routeOverridden?: boolean; status: string; answer?: unknown }) {
    const db = getDb();
    if (db) {
      this.track(db.from("runs").update({
        ended_at: new Date().toISOString(), route: patch.route ?? null, route_overridden: !!patch.routeOverridden,
        status: this.degraded && patch.status === "ok" ? "degraded" : patch.status,
        answer: patch.answer ? JSON.parse(clip(JSON.stringify(patch.answer), 60000)) : null,
        tokens_in: this.tokensIn, tokens_out: this.tokensOut, jev_requests: this.jevRequests, cost_usd: this.costUsd(),
      }).eq("id", this.runId).then((r) => { if (r.error) console.error("runs update", r.error.message); }));
    }
  }

  /** Wait for trace writes. Called after the response has been sent so it never adds user-visible latency. */
  async flush() {
    await Promise.allSettled(this.pending);
    this.pending = [];
  }

  dispose() { registry.delete(this.runId); }
}
