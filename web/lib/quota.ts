import { getDb } from "./db";

export interface QuotaResult { allowed: boolean; used: number; limit: number; globalUsed: number }

export async function consumeQuota(ipHash: string, opts: { limit?: number; global?: number; prefix?: string } = {}): Promise<QuotaResult> {
  const limit = opts.limit ?? Number(process.env.DAILY_QUOTA_PER_IP ?? 20);
  const global = opts.global ?? Number(process.env.GLOBAL_DAILY_CAP ?? 500);
  const db = getDb();
  if (!db) return { allowed: true, used: 0, limit, globalUsed: 0 };
  const { data, error } = await db.rpc("consume_quota", { p_ip: (opts.prefix ?? "") + ipHash, p_limit: limit, p_global: global });
  if (error || !data?.[0]) throw new Error(`quota check failed: ${error?.message ?? "no data"}`);
  const r = data[0] as { allowed: boolean; used: number; global_used: number };
  return { allowed: r.allowed, used: r.used, limit, globalUsed: r.global_used };
}
