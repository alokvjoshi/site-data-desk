import { z } from "zod";
import { getDb } from "@/lib/db";
import { consumeQuota } from "@/lib/quota";
import { ipHashFrom, scrubPii } from "@/lib/util";


const Body = z.object({
  runId: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  category: z.enum(["wrong_source", "wrong_answer", "missing_document", "bad_routing", "slow", "other"]).nullish(),
  comment: z.string().max(600).nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const q = await consumeQuota(ipHashFrom(req.headers), { limit: 30, global: 2000, prefix: "fb:" });
  if (!q.allowed) return Response.json({ error: "quota" }, { status: 429 });
  const db = getDb();
  if (!db) return Response.json({ ok: true, stored: false });
  const b = parsed.data;
  const { error } = await db.from("feedback").insert({ run_id: b.runId, rating: b.rating, category: b.category ?? null, comment: b.comment ? scrubPii(b.comment) : null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, stored: true });
}
