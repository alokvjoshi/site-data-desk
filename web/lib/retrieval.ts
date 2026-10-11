import { getDb } from "./db";
import { config, T } from "./config";
import { embedQuery } from "./embed";
import type { Candidate } from "./types";

const STOP = new Set(("a an and are as at be been but by can could did do does for from had has have how i if in into is it its of on or " +
  "our so than that the their then there these they this to was we were what when where which who whom why will with would you your about " +
  "tell show give me please").split(" "));

/** Expand known terms/acronyms with glossary synonyms (code, not a model). */
export function expandTerms(query: string): string[] {
  const lower = query.toLowerCase();
  const words = lower.match(/[a-z0-9]+/g) ?? [];
  const out = new Set(words.filter((w) => w.length >= 2 && !STOP.has(w)));
  for (const [term, syns] of Object.entries(config.glossary)) {
    const t = term.toLowerCase();
    const hit = new RegExp(`(^|[^a-z0-9])${t.replace(/[/()]/g, "\\$&")}([^a-z0-9]|$)`).test(lower);
    const synHit = syns.find((s) => lower.includes(s.toLowerCase()));
    if (hit) syns.forEach((s) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).forEach((w) => w.length >= 3 && !STOP.has(w) && out.add(w)));
    if (synHit) (t.match(/[a-z0-9]+/g) ?? []).forEach((w) => out.add(w));
  }
  return [...out].slice(0, 24);
}

export const toFtsQuery = (query: string) => expandTerms(query).join(" | ");

// Generic words that appear in most passages of a contaminated-land standard: useless for a strict match.
const GENERIC = new Set(("value values level levels investigation health hil hsl eil esl acl guideline guidelines nepm schedule table " +
  "criteria criterion limit limits residential garden access use land site sites say says state states define defined mean means").split(" "));

/** Strict AND query over the distinctive words only (at most 5), so rare terms like an analyte name dominate. */
export function toStrictQuery(query: string): string {
  const words = [...new Set((query.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !STOP.has(w) && !GENERIC.has(w)))];
  return words.length >= 2 ? words.slice(0, 5).join(" & ") : "";
}

export interface SearchOpts {
  corpora?: ("standards" | "internal")[] | null;
  project?: string | null;
  docs?: string[] | null;
  k?: number;
}

export async function hybridSearch(query: string, opts: SearchOpts = {}): Promise<Candidate[]> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const emb = await embedQuery(query);
  const { data, error } = await db.rpc("hybrid_search", {
    q_emb: JSON.stringify(emb),
    fts_query: toFtsQuery(query),
    fts_strict: toStrictQuery(query),
    corpora: opts.corpora ?? null,
    proj: opts.project ?? null,
    doc_filter: opts.docs ?? null,
    k: opts.k ?? T.retrieval_k,
  });
  if (error) throw new Error(`hybrid_search: ${error.message}`);
  return (data ?? []) as Candidate[];
}
