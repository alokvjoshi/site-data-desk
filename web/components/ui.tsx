import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "bad" | "good" | "accent" }) {
  const tones = {
    neutral: "bg-surface2 text-muted",
    warn: "bg-warnbg text-warn",
    bad: "bg-badbg text-bad",
    good: "bg-accentsoft text-good",
    accent: "bg-accentsoft text-accent",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} type="button"
          className={`rounded-md px-2.5 py-1 ${value === o.value ? "bg-accent text-accentink" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 max-w-3xl text-sm text-muted">{sub}</p>}
    </header>
  );
}
