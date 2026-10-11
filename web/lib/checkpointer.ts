import pg from "pg";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { optEnv } from "./env";

let saver: Promise<BaseCheckpointSaver> | null = null;

/** Postgres checkpointer on the Supabase session pooler (port 5432); in-memory fallback when no DB is configured. */
export function getCheckpointer(): Promise<BaseCheckpointSaver> {
  saver ??= (async () => {
    const url = optEnv("SUPABASE_DB_URL");
    if (!url) return new MemorySaver();
    const pool = new pg.Pool({
      connectionString: url, max: 2, ssl: { rejectUnauthorized: false },
      idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, keepAlive: true, query_timeout: 20000,
    });
    // The Supabase pooler resets idle connections. Without this handler the error is unhandled and the request wedges.
    pool.on("error", (e) => console.warn("checkpointer pool: idle client error (ignored):", e.message));
    const s = new PostgresSaver(pool);
    await s.setup();
    return s;
  })().catch((e) => { saver = null; throw e; });
  return saver;
}
