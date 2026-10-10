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
    { role: "system", content: a.system },
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
        max_tokens: a.maxTokens ?? 1500,
        tools: [{ type: "function", function: { name: a.toolName, description: a.toolDescription, parameters } }],
        tool_choice: { type: "function", function: { name: a.toolName } },
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
    const raw = msg?.tool_calls?.[0]?.function?.arguments ?? msg?.content ?? "";
    try {
      const parsed = a.schema.safeParse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message.slice(0, 400);
    } catch (e) {
      lastError = `invalid JSON: ${(e as Error).message}`;
    }
    messages.push({ role: "assistant", content: raw.slice(0, 2000) });
    messages.push({ role: "user", content: `Your previous output was invalid (${lastError}). Call ${a.toolName} again with valid arguments only.` });
  }
  if (ctx.current) ctx.current.degrade(`model output invalid: ${lastError}`);
  return null;
}

export const llmConfigured = () => !!optEnv("OPENROUTER_API_KEY");
export { env };
