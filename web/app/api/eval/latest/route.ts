import { getDb } from "@/lib/db";


export async function GET() {
  const db = getDb();
  if (!db) return Response.json({ latest: null });
  const { data } = await db.from("eval_runs").select("id,git_sha,config_version,metrics,passed,created_at").order("created_at", { ascending: false }).limit(5);
  return Response.json({ latest: data?.[0] ?? null, history: data ?? [] }, { headers: { "Cache-Control": "public, max-age=60" } });
}
