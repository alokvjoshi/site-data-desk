import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db) return <p className="text-sm text-muted">Database not configured.</p>;
  const { data: d } = await db.from("documents").select("id,type,title,doc_date,fictional,licence,source_url,pages,body").eq("id", id).maybeSingle();
  if (!d) notFound();
  const parts = d.body.split(/<!--\s*page:\s*(\d+)\s*-->/);
  const pages: { n: number | null; text: string }[] = [];
  if (parts.length === 1) pages.push({ n: null, text: d.body });
  else { if (parts[0].trim()) pages.push({ n: null, text: parts[0] }); for (let i = 1; i < parts.length; i += 2) pages.push({ n: Number(parts[i]), text: parts[i + 1] }); }
  return (
    <article>
      <h1 className="text-xl font-semibold">{d.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Badge>{d.type}</Badge>{d.doc_date && <span>{d.doc_date}</span>}{d.licence && <Badge tone="good">{d.licence}</Badge>}{d.fictional && <Badge tone="warn">fictional demo data</Badge>}
        {d.source_url && <a className="underline" href={d.source_url} target="_blank" rel="noreferrer">official source</a>}
      </div>
      <div className="mt-4 space-y-6">
        {pages.map((p, i) => (
          <section key={i} id={p.n ? `p${p.n}` : undefined} className="scroll-mt-20 target:rounded-lg target:bg-accentsoft/40">
            {p.n && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">PDF page {p.n}</p>}
            <Markdown>{p.text}</Markdown>
          </section>
        ))}
      </div>
    </article>
  );
}
