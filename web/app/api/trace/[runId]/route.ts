import { getDb } from "@/lib/db";


/** A run's trace is visible to the visitor whose browser holds its thread id, or when it is a curated public example. */
export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const thread = new URL(req.url).searchParams.get("t");
  const db = getDb();
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  const { data: run } = await db.from("runs").select("id,thread_id,started_at,ended_at,kind,query,route,route_overridden,status,config_version,answer,tokens_in,tokens_out,jev_requests,cost_usd,public_example").eq("id", runId).maybeSingle();
  if (!run) return Response.json({ error: "not_found" }, { status: 404 });
  if (!run.public_example && run.thread_id !== thread) return Response.json({ error: "forbidden" }, { status: 403 });
  const { data: events } = await db.from("trace_events").select("seq,node,duration_ms,status,model,input,output,jev,tokens_in,tokens_out,error").eq("run_id", runId).order("seq");
  const { thread_id: _t, ...safe } = run;
  void _t;
  return Response.json({ run: safe, events: events ?? [] });
}
