import { getDb } from "./db";
import { env, optEnv } from "./env";
import { sha256 } from "./util";

const MODEL = () => optEnv("EMBED_MODEL") ?? "openai/text-embedding-3-small";
const DIMS = () => Number(optEnv("EMBED_DIMENSIONS") ?? 384);

function normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/**
 * Query embedding through OpenRouter. Must use the same model and dimensions as ingest/embedder.py.
 * Results are cached (keyed by model + text) so repeated questions cost nothing.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const db = getDb();
  const hash = sha256(`${MODEL()}:${DIMS()}:${text.trim().toLowerCase()}`);
  if (db) {
    const { data } = await db.from("embed_cache").select("vec").eq("hash", hash).maybeSingle();
    if (data?.vec) return typeof data.vec === "string" ? JSON.parse(data.vec) : (data.vec as number[]);
  }
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENROUTER_API_KEY")}`, "Content-Type": "application/json", "X-Title": "Site Data Desk" },
    body: JSON.stringify({ model: MODEL(), input: [text.slice(0, 1500)], dimensions: DIMS() }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const vec = normalise(((await res.json()) as { data: { embedding: number[] }[] }).data[0].embedding);
  if (db) void db.from("embed_cache").upsert({ hash, vec: JSON.stringify(vec) }).then(() => undefined);
  return vec;
}
