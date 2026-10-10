"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ask" },
  { href: "/search", label: "Search" },
  { href: "/insights", label: "Insights" },
  { href: "/graph", label: "Graph" },
  { href: "/how-it-works", label: "How it works" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-5 w-5 rounded-[5px] bg-accent" />
          Site Data Desk
        </Link>
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
              className={`py-1 text-sm ${active ? "border-b-2 border-accent font-medium text-ink" : "text-muted hover:text-ink"}`}>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
