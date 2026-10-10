"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GNode { id: string; title: string; type: string; project: string | null; x?: number; y?: number }
interface GLink { source: string; target: string }

const COLORS: Record<string, string> = { standard: "#3b82c4", project: "#e8842a", report: "#9b59b6", email: "#2ecc71", slack: "#16a085", entity: "#e6b422", glossary: "#7f8c8d" };

export default function GraphPage() {
  const [data, setData] = useState<{ nodes: GNode[]; links: GLink[] } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GNode | null>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });

  useEffect(() => {
    fetch("/graph.json").then((r) => r.json()).then(setData).catch(() => setData({ nodes: [], links: [] }));
    const onResize = () => setSize({ w: Math.min(1000, window.innerWidth - 32), h: Math.max(420, Math.min(640, window.innerHeight - 260)) });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const graph = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const nodes = data.nodes.filter((n) => !hidden.has(n.type)).map((n) => ({ ...n }));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, links: data.links.filter((l) => ids.has(l.source as string) && ids.has(l.target as string)).map((l) => ({ ...l })) };
  }, [data, hidden]);

  const types = [...new Set(data?.nodes.map((n) => n.type) ?? [])];
  return (
    <div>
      <PageHeader title="Knowledge graph" sub="The same notes you would see in Obsidian's graph view. Links come from wikilinks and project membership. Open the vault/ folder in Obsidian for the full experience." />
      <div className="mb-3 flex flex-wrap gap-2 text-sm" role="group" aria-label="Filter node types">
        {types.map((t) => (
          <button key={t} aria-pressed={!hidden.has(t)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${hidden.has(t) ? "border-line text-muted line-through" : "border-line"}`}>
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[t] ?? "#999" }} />{t}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {data ? (
          <ForceGraph2D width={size.w} height={size.h} graphData={graph} nodeLabel={(n) => (n as GNode).title} nodeColor={(n) => COLORS[(n as GNode).type] ?? "#999"}
            nodeRelSize={4} linkColor={() => "rgba(120,140,130,0.35)"} cooldownTicks={120} onNodeClick={(n) => setSelected(n as GNode)} />
        ) : <p className="p-6 text-sm text-muted">Loading graph…</p>}
      </div>
      {selected && (
        <p className="mt-3 text-sm"><strong>{selected.title}</strong> <span className="text-muted">({selected.type})</span> · <Link className="text-accent underline" href={`/doc/${encodeURIComponent(selected.id)}`}>open note</Link></p>
      )}
    </div>
  );
}
