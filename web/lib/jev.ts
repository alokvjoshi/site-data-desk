import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { optEnv } from "./env";
import type { RunContext } from "./trace";

let client: TypeSafeClient | null = null;
function getClient() {
  client ??= new TypeSafeClient({ apiKey: optEnv("TYPESAFE_API_KEY"), defaultModel: optEnv("JEV_MODEL") ?? "jev-latest", timeout: 15000 });
  return client;
}

export interface Judged {
  noul(key: string): number;
  choice(key: string): { label: string; confidence: number; probs: Record<string, number> };
}

/**
 * One Jev request with several independent questions over the same state (they run in parallel server-side).
 * Returns null on failure or when the per-query request cap is reached; callers then degrade (PRD 3.6).
 */
export async function judge(ctx: RunContext, label: string, state: Record<string, unknown>, questions: Questions): Promise<Judged | null> {
  const rec = ctx.current;
  const names = Object.keys(questions);
  if (!optEnv("TYPESAFE_API_KEY")) {
    rec?.jev.push({ label, questions: names, error: "TYPESAFE_API_KEY not set" });
    return null;
  }
  if (ctx.jevRequests >= ctx.jevCap) {
    rec?.jev.push({ label, questions: names, capped: true });
    return null;
  }
  ctx.jevRequests++;
  try {
    const res = await getClient().systemOne({ state: state as never, questions });
    const answers = res.answers as unknown as Record<string, { noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number> }>;
    rec?.jev.push({ label, questions: names, answers, usage: res.usage });
    return {
      noul: (k) => answers[k]?.noul ?? 0,
      choice: (k) => ({ label: answers[k]?.choice ?? "", confidence: answers[k]?.confidence ?? 0, probs: answers[k]?.probabilities ?? {} }),
    };
  } catch (e) {
    rec?.jev.push({ label, questions: names, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
