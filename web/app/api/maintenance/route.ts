import { getDb } from "@/lib/db";


/** Nightly retention job. POST with `Authorization: Bearer $EVAL_KEY`. */
export async function POST(req: Request) {
  const key = process.env.EVAL_KEY;
  if (!key || req.headers.get("authorization") !== `Bearer ${key}`) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  const a = await db.rpc("prune_old_data");
  const b = await db.rpc("prune_checkpoints", { days: 2 });
  return Response.json({ pruned: !a.error, checkpoints_threads: b.data ?? null, errors: [a.error?.message, b.error?.message].filter(Boolean) });
}
