import { getDb } from "@/lib/db";
import { config } from "@/lib/config";


/** Keep-alive target (scheduled GitHub Action) so the free Supabase project is not paused. */
export async function GET() {
  const db = getDb();
  let dbOk = false;
  if (db) {
    const { data } = await db.rpc("ping");
    dbOk = data === "ok";
  }
  return Response.json({ ok: true, db: dbOk, configVersion: config.version, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
