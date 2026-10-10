// Embeds text with Supabase's built-in gte-small model (384 dims, mean-pooled, normalised).
// POST { texts: string[] }  ->  { vectors: number[][] }
// Auth: Supabase JWT (anon key) plus the shared x-embed-secret header.
// deno-lint-ignore-file no-explicit-any
declare const Supabase: any;

const session = new Supabase.ai.Session("gte-small");
const MAX_BATCH = 16;
const MAX_CHARS = 4000;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("EMBED_SECRET");
  if (!secret || req.headers.get("x-embed-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  let body: { texts?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const texts = Array.isArray(body.texts) ? (body.texts as unknown[]) : [];
  if (texts.length === 0 || texts.length > MAX_BATCH || texts.some((t) => typeof t !== "string")) {
    return new Response(`texts must be 1..${MAX_BATCH} strings`, { status: 400 });
  }
  const vectors: number[][] = [];
  for (const t of texts as string[]) {
    const out = await session.run(t.slice(0, MAX_CHARS), { mean_pool: true, normalize: true });
    vectors.push(Array.from(out as ArrayLike<number>));
  }
  return Response.json({ vectors });
});
