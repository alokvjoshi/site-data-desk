import { z } from "zod";
import { noul } from "@typesafe-ai/sdk";
import { T } from "@/lib/config";
import { judge } from "@/lib/jev";
import { consumeQuota } from "@/lib/quota";
import { expandTerms, hybridSearch } from "@/lib/retrieval";
import { RunContext } from "@/lib/trace";
import { clip, ipHashFrom } from "@/lib/util";
import { after } from "next/server";

export const maxDuration = 30;

const Body = z.object({
  query: z.string().min(2).max(300),
  corpus: z.enum(["both", "standards", "internal"]).default("both"),
  project: z.string().max(60).nullish(),
  docType: z.string().max(30).nullish(),
  rerank: z.boolean().default(false),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;
  const ipHash = ipHashFrom(req.headers);
  const s = await consumeQuota(ipHash, { limit: 200, global: 5000, prefix: "search:" });
  if (!s.allowed) return Response.json({ error: "quota", detail: "Search limit reached for today." }, { status: 429 });
  if (b.rerank) {
    const q = await consumeQuota(ipHash);
    if (!q.allowed) return Response.json({ error: "quota", detail: "Daily limit for AI-ranked search reached; plain search still works." }, { status: 429 });
  }

  const ctx = new RunContext("00000000-0000-4000-8000-000000000000", ipHash, {});
  await ctx.start("search", b.query);
  let results = await hybridSearch(b.query, { corpora: b.corpus === "both" ? null : [b.corpus], project: b.project ?? null, k: 24 });
  if (b.docType) results = results.filter((r) => r.doc_type === b.docType);
  let relevance: (number | null)[] = results.map(() => null);
  if (b.rerank && results.length) {
    await ctx.step("search_rerank", async (rec) => {
      const top = results.slice(0, T.rerank_max);
      const j = await Promise.all(top.map((c) => judge(ctx, "rerank", { query: b.query, passage: { source: c.doc_title, section: c.section, page: c.page, text: c.content.slice(0, 1500) } }, {
        relevant: noul("Does `passage.text` contain information that directly helps answer the question or topic in `query`?"),
      })));
      relevance = results.map((_, i) => (i < top.length ? j[i]?.noul("relevant") ?? null : null));
      rec.output({ scored: top.length });
    });
    const order = results.map((r, i) => ({ r, rel: relevance[i] })).sort((a, c) => (c.rel ?? -1) - (a.rel ?? -1) || c.r.rrf - a.r.rrf);
    results = order.map((o) => o.r);
    relevance = order.map((o) => o.rel);
  }
  await ctx.finish({ status: "ok", route: "search" });
  after(() => ctx.flush().finally(() => ctx.dispose()));
  return Response.json({
    terms: expandTerms(b.query),
    results: results.map((r, i) => ({
      id: r.id, docId: r.doc_id, title: r.doc_title, type: r.doc_type, date: r.doc_date, page: r.page, section: r.section,
      project: r.project_id, corpus: r.corpus, snippet: clip(r.content.replace(/^\[[^\]]*\]\s*/, ""), 600), content: r.content, fictional: r.doc_fictional ?? null, score: r.rrf, relevance: relevance[i],
    })),
  });
}
