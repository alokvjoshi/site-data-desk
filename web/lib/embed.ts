import { getDb } from "./db";
import { env } from "./env";
import { sha256 } from "./util";

/** Query embedding through the Supabase gte-small Edge Function, with a 7-day cache table. */
export async function embedQuery(text: string): Promise<number[]> {
  const db = getDb();
  const hash = sha256(text.trim().toLowerCase());
  if (db) {
    const { data } = await db.from("embed_cache").select("vec").eq("hash", hash).maybeSingle();
    if (data?.vec) return typeof data.vec === "string" ? JSON.parse(data.vec) : (data.vec as number[]);
  }
  const res = await fetch(env("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("SUPABASE_ANON_KEY")}`,
      "x-embed-secret": env("EMBED_SECRET"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts: [text.slice(0, 1200)] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`embed function ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const vec = ((await res.json()) as { vectors: number[][] }).vectors[0];
  if (db) void db.from("embed_cache").upsert({ hash, vec: JSON.stringify(vec) }).then(() => undefined);
  return vec;
}
