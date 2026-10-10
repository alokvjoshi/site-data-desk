import { getDb } from "@/lib/db";


export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  const { data, error } = await db.from("documents").select("id,type,title,short,project_id,doc_date,fictional,licence,source_url,pages,body").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
}
