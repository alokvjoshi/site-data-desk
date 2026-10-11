import { z } from "zod";
import { choice } from "@typesafe-ai/sdk";
import { getDb } from "../db";
import { judge } from "../jev";
import { callTool } from "../llm";
import { prompt } from "../config";
import { missingNumbers } from "../verify";
import type { RunContext } from "../trace";
import type { Removed, Source } from "../types";

/** "As of" date for the fictional company data (so delayed/overdue is stable, not wall-clock dependent). */
export const AS_OF = process.env.INSIGHTS_AS_OF ?? "2026-10-11";

export const INSIGHT_TOOLS = {
  portfolio_status: "Project status, budget and spend (including which projects are over budget or under budget) and overall progress, for all projects or one project.",
  open_exceedances: "Only for questions about contamination exceedances (analyte results above a criterion) that are still open or unresolved. Not about budget, schedule or decisions.",
  exceedances: "All exceedances, open and closed, with their status.",
  milestones_risks: "Delayed or open milestones and registered risks.",
  decisions_log: "Decisions taken, who approved them, and any that were reversed.",
  weekly_digest: "A short digest across projects: status, delays, open exceedances, risks, reversals.",
  project_detail: "Everything known about one named project.",
} as const;
export type InsightTool = keyof typeof INSIGHT_TOOLS;

export interface InsightPlan { tool: InsightTool; project: string | null; degraded: boolean }
export interface InsightRow { ref: string; project: string; [k: string]: unknown }

type Facts = Record<string, Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadFacts(): Promise<Facts> {
  const db = getDb();
  if (!db) return {};
  const { data, error } = await db.from("project_facts").select("project_id,key,value");
  if (error) throw new Error(`project_facts: ${error.message}`);
  const out: Facts = {};
  for (const r of data ?? []) (out[r.project_id] ??= {})[r.key] = r.value;
  return out;
}

export async function planInsight(ctx: RunContext, query: string, facts: Facts): Promise<InsightPlan> {
  const projects = Object.fromEntries([
    ...Object.entries(facts).map(([id, f]) => [id, `${f.code ?? ""} ${f.title ?? id}`.trim()]),
    ["all", "All projects, or the question does not name one project."],
  ]);
  const j = await judge(ctx, "insight_plan", { query }, {
    tool: choice("Which analysis does the question in `query` need?", { ...INSIGHT_TOOLS }),
    project: choice("Which project does `query` ask about?", projects),
  });
  if (!j) {
    const hit = Object.entries(facts).find(([id, f]) => new RegExp(`\\b${String(f.code ?? id)}\\b|${id}`, "i").test(query));
    return { tool: "weekly_digest", project: hit?.[0] ?? null, degraded: true };
  }
  const p = j.choice("project").label;
  return { tool: j.choice("tool").label as InsightTool, project: p === "all" ? null : p, degraded: false };
}

const isOpenExceedance = (s: string) => !/removed|below|resolved|excavated/i.test(s);

export function buildRows(plan: InsightPlan, facts: Facts): InsightRow[] {
  const rows: InsightRow[] = [];
  const ids = Object.keys(facts).filter((id) => !plan.project || id === plan.project).sort();
  for (const pid of ids) {
    const f = facts[pid];
    const title = f.title as string;
    const status = (): InsightRow => ({ ref: `${pid}.status`, project: pid, title, status: f.status, budget_aud: f.budget_aud, committed_aud: f.committed_aud, client: f.client, project_manager: f.project_manager });
    const exc = (onlyOpen: boolean) => (f.exceedances ?? []).forEach((x: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!onlyOpen || isOpenExceedance(x.status)) rows.push({ ref: `${pid}.exceedances[${i}]`, project: pid, title, ...x, open: isOpenExceedance(x.status) });
    });
    const miles = (onlyProblems: boolean) => (f.milestones ?? []).forEach((m: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const delayed = (m.done && m.done > m.due) || (!m.done && m.due < AS_OF);
      if (!onlyProblems || delayed) rows.push({ ref: `${pid}.milestones[${i}]`, project: pid, title, ...m, delayed: !!delayed });
    });
    const risks = (all: boolean) => (f.risks ?? []).forEach((r: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (all || r.level === "high" || r.level === "medium") rows.push({ ref: `${pid}.risks[${i}]`, project: pid, title, ...r });
    });
    const decisions = (all: boolean) => (f.decisions ?? []).forEach((d: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (all || /reversed/i.test(d.text)) rows.push({ ref: `${pid}.decisions[${i}]`, project: pid, title, ...d });
    });
    switch (plan.tool) {
      case "portfolio_status": rows.push(status()); miles(false); break;
      case "open_exceedances": exc(true); break;
      case "exceedances": exc(false); break;
      case "milestones_risks": miles(true); risks(true); break;
      case "decisions_log": decisions(true); break;
      case "weekly_digest": rows.push(status()); miles(true); exc(true); risks(false); decisions(false); break;
      case "project_detail": rows.push(status()); miles(false); exc(false); risks(true); decisions(true); break;
    }
  }
  return rows.slice(0, 60);
}

const BulletsSchema = z.object({
  bullets: z.array(z.object({ text: z.string().min(10).max(400), ref: z.string() })).max(8),
});

export interface Narrative {
  bullets: { text: string; ref: string }[];
  removed: Removed[];
  sources: Source[];
}

export async function narrateInsight(ctx: RunContext, question: string, rows: InsightRow[]): Promise<Narrative | null> {
  const out = await callTool(ctx, {
    system: prompt("insight"),
    user: `Question: ${question}\n\n<data>\n${JSON.stringify(rows)}\n</data>`,
    toolName: "submit_insights",
    toolDescription: "Submit the insight bullets, each citing a data row ref.",
    schema: BulletsSchema,
    maxTokens: 1200,
  });
  if (!out) return null;
  const byRef = new Map(rows.map((r) => [r.ref, r]));
  const kept: { text: string; ref: string }[] = [];
  const removed: Removed[] = [];
  for (const b of out.bullets) {
    const row = byRef.get(b.ref);
    if (!row) { removed.push({ text: b.text, reason: `unknown row ref ${b.ref}` }); continue; }
    const missing = missingNumbers(b.text, JSON.stringify(row));
    if (missing.length) { removed.push({ text: b.text, reason: `numbers not in row: ${missing.join(", ")}` }); continue; }
    kept.push(b);
  }
  const sources: Source[] = [];
  const order: string[] = [];
  for (const b of kept) if (!order.includes(b.ref)) order.push(b.ref);
  order.forEach((ref, i) => {
    const row = byRef.get(ref)!;
    sources.push({
      n: i + 1, chunkId: ref, docId: row.project, title: String(row.title ?? row.project), docType: "project", date: null, page: null,
      section: ref.split(".").slice(1).join("."), threadId: null, corpus: "internal", fictional: true,
      quote: JSON.stringify(row), passage: Object.entries(row).filter(([k]) => k !== "ref").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n"),
    });
  });
  return { bullets: kept, removed, sources };
}
