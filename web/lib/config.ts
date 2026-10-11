import raw from "./config.generated.json";

export interface Thresholds {
  route_min_confidence: number;
  route_min_prob: number;
  route_min_margin: number;
  attack: number;
  out_of_scope: number;
  needs_clarification: number;
  injection: number;
  rerank_keep: number;
  support_confidence: number;
  keep_ratio: number;
  out_flag: number;
  retrieval_k: number;
  rerank_max: number;
  evidence_max: number;
  claims_max: number;
  history_turns: number;
  max_query_chars: number;
  eval_floors: Record<string, number>;
  eval_regression_tolerance: number;
}

export const config = raw as unknown as {
  version: string;
  thresholds: Thresholds;
  prices: { llm_in_per_million_usd: number; llm_out_per_million_usd: number; jev_per_request_usd: number };
  glossary: Record<string, string[]>;
  prompts: Record<string, string>;
};

export const T = config.thresholds;

export function prompt(name: string, vars: Record<string, string | number> = {}): string {
  let text = config.prompts[name];
  if (!text) throw new Error(`missing prompt ${name}`);
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, String(v));
  return text;
}
