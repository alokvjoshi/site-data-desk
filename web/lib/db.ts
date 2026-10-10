import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasDb, env } from "./env";

let client: SupabaseClient | null = null;

/** Server-side Supabase client (service role). Returns null when the database is not configured (local dev). */
export function getDb(): SupabaseClient | null {
  if (!hasDb()) return null;
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
