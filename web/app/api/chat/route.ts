import { after } from "next/server";
import { z } from "zod";
import { T } from "@/lib/config";
import { consumeQuota } from "@/lib/quota";
import { runChat } from "@/lib/run";
import { ipHashFrom } from "@/lib/util";

export const maxDuration = 60;

const Body = z.object({
  message: z.string().min(1).max(T.max_query_chars),
  threadId: z.string().uuid(),
  route: z.enum(["standards", "internal", "both", "insights"]).nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request", detail: parsed.error.issues[0]?.message }, { status: 400 });
  const { message, threadId, route } = parsed.data;

  const isEval = !!process.env.EVAL_KEY && req.headers.get("x-eval-key") === process.env.EVAL_KEY;
  const llmKey = req.headers.get("x-openrouter-key")?.trim() || undefined;
  if (llmKey && !/^sk-or-[\w-]{10,200}$/.test(llmKey)) return Response.json({ error: "bad_key", detail: "That doesn't look like an OpenRouter key." }, { status: 400 });
  const ipHash = ipHashFrom(req.headers);

  if (!isEval) {
    const q = await consumeQuota(ipHash, { limit: llmKey ? 100 : undefined });
    if (!q.allowed) {
      const globalHit = q.used < q.limit;
      return Response.json(
        { error: "quota", used: q.used, limit: q.limit, detail: globalHit ? "The demo has reached its daily capacity. Please try again tomorrow." : `Daily limit of ${q.limit} questions reached. Add your own OpenRouter key to continue, or come back tomorrow.` },
        { status: 429 },
      );
    }
  }

  const wantsJson = req.headers.get("accept")?.includes("application/json");
  if (wantsJson) {
    const routeOnly = isEval && req.headers.get("x-eval-route-only") === "1";
    const { answer, ctx } = await runChat({ message, threadId, ipHash, routeOverride: route ?? null, isEval, llmKey, routeOnly });
    after(() => ctx.flush().finally(() => ctx.dispose()));
    return Response.json(answer);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("status", { node: "start", label: "Starting", ms: 0 });
      const { answer, ctx } = await runChat({ message, threadId, ipHash, routeOverride: route ?? null, isEval, llmKey, onStatus: (e) => send("status", e) });
      send("result", answer);
      controller.close();
      after(() => ctx.flush().finally(() => ctx.dispose()));
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
