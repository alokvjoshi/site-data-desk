import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadFacts } from "@/lib/graph/insights";
import { consumeQuota } from "@/lib/quota";
import { runDigest } from "@/lib/run";
import { ipHashFrom } from "@/lib/util";
import type { Answer } from "@/lib/types";

export const maxDuration = 60;

const CACHE_KEY = "digest:all";

/** Project cards (no model calls) plus the cached digest if one exists. */
export async function GET() {
  const facts = await loadFacts();
  const db = getDb();
  let digest: Answer | null = null;
  let cachedUntil: string | null = null;
  if (db) {
    const { data } = await db.from("insight_cache").select("value,expires_at").eq("key", CACHE_KEY).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) { digest = data.value as Answer; cachedUntil = data.expires_at as string; }
  }
  return Response.json({ projects: facts, digest, cachedUntil });
}

const Body = z.object({ refresh: z.boolean().default(false) });

export async function POST(req: Request) {
  const { refresh } = Body.parse(await req.json().catch(() => ({})));
  const db = getDb();
  if (db && !refresh) {
    const { data } = await db.from("insight_cache").select("value,expires_at").eq("key", CACHE_KEY).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) return Response.json({ digest: data.value, cached: true });
  }
  const ipHash = ipHashFrom(req.headers);
  const q = await consumeQuota(ipHash, { limit: undefined });
  if (!q.allowed) return Response.json({ error: "quota", detail: "Daily limit reached." }, { status: 429 });
  const { answer, ctx } = await runDigest({ threadId: crypto.randomUUID(), ipHash, llmKey: req.headers.get("x-openrouter-key")?.trim() || undefined });
  if (db && answer.status === "ok") {
    await db.from("insight_cache").upsert({ key: CACHE_KEY, value: { ...answer, data: undefined }, expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() });
  }
  after(() => ctx.flush().finally(() => ctx.dispose()));
  return Response.json({ digest: { ...answer, data: undefined }, cached: false });
}
