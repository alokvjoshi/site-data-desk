"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { highlightRange } from "@/lib/verify";
import { Badge } from "./ui";

export interface DrawerSource {
  title: string;
  docId: string;
  docType?: string;
  date?: string | null;
  page?: number | null;
  section?: string | null;
  fictional?: boolean;
  passage: string;
  quote?: string;
  terms?: string[];
}

function Highlighted({ text, quote, terms }: { text: string; quote?: string; terms?: string[] }) {
  const range = quote ? highlightRange(text, quote) : null;
  if (range) {
    return (<>{text.slice(0, range[0])}<mark data-quote>{text.slice(range[0], range[1])}</mark>{text.slice(range[1])}</>);
  }
  if (terms?.length) {
    const re = new RegExp(`\\b(${terms.filter((t) => t.length > 2).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
    const parts = text.split(re);
    return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
  }
  return <>{text}</>;
}

export function SourceDrawer({ source, onClose }: { source: DrawerSource | null; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    ref.current?.querySelector("[data-quote]")?.scrollIntoView({ block: "center" });
    return () => window.removeEventListener("keydown", onKey);
  }, [source, onClose]);
  if (!source) return null;
  const href = `/doc/${encodeURIComponent(source.docId)}${source.page ? `#p${source.page}` : ""}`;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Source passage"
        className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-snug">{source.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {source.docType && <Badge>{source.docType}</Badge>}
              {source.date && <span>{source.date}</span>}
              {source.page ? <span>PDF page {source.page}</span> : null}
              {source.fictional && <Badge tone="warn">fictional demo data</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-2 py-1 text-sm hover:bg-surface2" aria-label="Close source">Close</button>
        </div>
        {source.section && <p className="mb-2 text-xs text-muted">Section: {source.section}</p>}
        <pre className="whitespace-pre-wrap rounded-lg bg-surface2 p-3 font-sans text-sm leading-relaxed"><Highlighted text={source.passage} quote={source.quote} terms={source.terms} /></pre>
        <p className="mt-3 text-sm"><Link href={href} className="text-accent underline" target="_blank">Open the full document</Link></p>
      </aside>
    </div>
  );
}
