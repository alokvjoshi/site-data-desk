"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Answer, Route, StatusEvent } from "@/lib/types";
import { AnswerCard } from "./AnswerCard";
import { SourceDrawer, type DrawerSource } from "./SourceDrawer";
import { Segmented } from "./ui";

interface Msg { id: string; q: string; steps: StatusEvent[]; answer?: Answer; error?: string }
type Mode = "auto" | "standards" | "internal" | "both" | "insights";

const SUGGESTIONS = [
  "What is the health investigation level for arsenic in residential soil with garden access?",
  "How much soil was excavated at Halden Road, and was the figure ever corrected?",
  "Which projects have open exceedances, and what is the status of each?",
  "What are the asbestos screening levels for bonded ACM in residential A land use?",
  "What is the PFOS drinking water guideline in the PFAS NEMP?",
];

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }

export function Chat() {
  const [threadId, setThreadId] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<DrawerSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [byoKey, setByoKey] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = safeGet("sdd-thread");
    if (!id) { id = crypto.randomUUID(); safeSet("sdd-thread", id); }
    setThreadId(id);
    setByoKey(safeGet("sdd-byo") ?? "");
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy || !threadId) return;
    setBusy(true); setNotice(null); setInput("");
    const id = crypto.randomUUID();
    setMsgs((m) => [...m, { id, q, steps: [] }]);
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m) => (m.id === id ? fn(m) : m)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(byoKey ? { "x-openrouter-key": byoKey } : {}) },
        body: JSON.stringify({ message: q, threadId, route: mode === "auto" ? null : (mode as Route) }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ detail: "Request failed." }));
        patch((m) => ({ ...m, error: j.detail ?? "Request failed." }));
        if (res.status === 429) setNotice(j.detail);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const ev = f.match(/^event: (\w+)/m)?.[1];
          const data = f.match(/^data: (.*)$/m)?.[1];
          if (!ev || !data) continue;
          const parsed = JSON.parse(data);
          if (ev === "status") patch((m) => ({ ...m, steps: [...m.steps, parsed as StatusEvent] }));
          if (ev === "result") patch((m) => ({ ...m, answer: parsed as Answer }));
        }
      }
    } catch (e) {
      patch((m) => ({ ...m, error: e instanceof Error ? e.message : "Network error" }));
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, mode, byoKey]);

  function reset() { const id = crypto.randomUUID(); safeSet("sdd-thread", id); setThreadId(id); setMsgs([]); setNotice(null); }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented<Mode> label="Where to search" value={mode} onChange={setMode} options={[
          { value: "auto", label: "Auto" }, { value: "standards", label: "Standards" }, { value: "internal", label: "Company" }, { value: "both", label: "Both" }, { value: "insights", label: "Projects" },
        ]} />
        {msgs.length > 0 && <button onClick={reset} className="text-sm text-muted underline">New conversation</button>}
      </div>

      {msgs.length === 0 && (
        <div className="my-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ask the standards and the project files.</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">Every statement is checked against a quoted source before it is shown. If the sources don&apos;t support an answer, you get &quot;not found&quot; instead of a guess.</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}><button onClick={() => void ask(s)} className="w-full rounded-lg border border-line bg-surface p-3 text-left text-sm hover:border-accent">{s}</button></li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className="space-y-2">
            <div className="ml-auto max-w-[85%] rounded-xl bg-accentsoft px-3.5 py-2 text-sm">{m.q}</div>
            {m.answer ? (
              <AnswerCard answer={m.answer} threadId={threadId} onOpenSource={setDrawer} />
            ) : m.error ? (
              <div className="rounded-xl border border-bad/50 bg-badbg p-3 text-sm text-bad">{m.error}</div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-3 text-sm text-muted" role="status">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                {m.steps.at(-1)?.label ?? "Starting"}…
                <ol className="mt-1 flex flex-wrap gap-x-3 text-xs">{m.steps.slice(0, -1).map((s, i) => <li key={i}>✓ {s.label}</li>)}</ol>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="sticky bottom-0 mt-6 bg-bg/90 pb-2 pt-3 backdrop-blur" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
        {notice && <p className="mb-2 rounded-lg bg-warnbg px-3 py-2 text-sm text-warn" role="alert">{notice}</p>}
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">Your question</label>
          <input id="q" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} disabled={busy} autoComplete="off"
            placeholder="Ask about a standard, a project or the portfolio" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm" />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accentink disabled:opacity-50">Ask</button>
        </div>
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Daily limit reached or want more? Use your own OpenRouter key</summary>
          <div className="mt-2 flex gap-2">
            <label className="sr-only" htmlFor="byo">OpenRouter API key</label>
            <input id="byo" type="password" value={byoKey} onChange={(e) => { setByoKey(e.target.value); safeSet("sdd-byo", e.target.value); }} placeholder="sk-or-..." autoComplete="off" className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5" />
          </div>
          <p className="mt-1">Stored only in this browser and sent with your requests for the language-model step. It is never saved on the server.</p>
        </details>
      </form>
      <SourceDrawer source={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
