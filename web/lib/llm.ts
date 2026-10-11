import { z } from "zod";
import { env, optEnv } from "./env";
import type { RunContext } from "./trace";

interface ToolCallArgs<T> {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

/**
 * Structured generation through OpenRouter tool calling (the model's listing does not support response_format).
 * Validates with zod and retries once with the validation error. Never throws on bad model output after the retry;
 * returns null so callers can fall back.
 */
export async function callTool<T>(ctx: RunContext, a: ToolCallArgs<T>): Promise<T | null> {
  const key = ctx.opts.llmKey ?? optEnv("OPENROUTER_API_KEY");
  if (!key) return null;
  const model = optEnv("OPENROUTER_MODEL") ?? "deepseek/deepseek-v4.1-flash";
  if (ctx.current) ctx.current.model = model;
  const parameters = z.toJSONSchema(a.schema) as Record<string, unknown>;
  delete parameters.$schema;
  const messages: { role: string; content: string }[] = [
    { role: "system", content: `${a.system}\n\nRespond with ONLY a JSON object that matches this JSON Schema (no prose, no markdown fences):\n${JSON.stringify(parameters)}` },
    { role: "user", content: a.user },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": optEnv("APP_URL") ?? "https://site-data-desk.vercel.app",
        "X-Title": "Site Data Desk",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: a.maxTokens ?? 2500,
        // Structured extraction/drafting does not need chain-of-thought; thinking tokens made replies slow and got them cut off.
        reasoning: { enabled: false },
        // Native structured output: this model emitted raw tool-call markup as text when tool calling was forced.
        response_format: { type: "json_schema", json_schema: { name: a.toolName, strict: false, schema: parameters } },
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) {
      lastError = `OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`;
      if (res.status >= 500 || res.status === 429) { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); continue; }
      throw new Error(lastError);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { function?: { arguments?: string } }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    ctx.addLlmUsage(json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0);
    const msg = json.choices?.[0]?.message;
    const raw = msg?.content ?? msg?.tool_calls?.[0]?.function?.arguments ?? "";
    try {
      const body = raw.includes("{") ? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1) : raw;
      const parsed = a.schema.safeParse(JSON.parse(body));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message.slice(0, 400);
    } catch (e) {
      lastError = `invalid JSON: ${(e as Error).message}`;
    }
    messages.push({ role: "assistant", content: raw.slice(0, 2000) });
    messages.push({ role: "user", content: `Your previous output was invalid (${lastError}). Reply again with only the valid JSON object.` });
  }
  if (ctx.current) ctx.current.degrade(`model output invalid: ${lastError}`);
  return null;
}

export const llmConfigured = () => !!optEnv("OPENROUTER_API_KEY");
export { env };
