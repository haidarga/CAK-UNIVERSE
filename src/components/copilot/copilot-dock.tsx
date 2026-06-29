"use client";

// ============================================================
// CopilotDock — floating, page-aware AI assistant on every page.
// Launcher orb (bottom-right) opens a glass chat panel that reads
// the live rendered page on each send via getPageContext().
// ============================================================
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, SendHorizonal, RotateCcw, Eraser } from "lucide-react";
import { useCopilot } from "./use-copilot";
import { CopilotMessageBubble, CopilotTyping } from "./copilot-message";

const SUGGESTIONS = [
  "Analisa halaman ini",
  "Brainstorm ide konten",
  "Apa yang harus aku prioritaskan?",
  "Ringkas data di layar",
];

/** Turn a pathname into a friendly tab name, e.g. "/tasks/123" -> "Tasks". */
function friendlyTab(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return "Dashboard";
  return seg
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CopilotDock({ memberRole }: { memberRole?: string }) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { messages, loading, send, retry, clear, hasError } = useCopilot({
    route: pathname,
    memberRole,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tab = friendlyTab(pathname);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  // Esc closes; focus input on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function submit(text: string) {
    void send(text);
    setDraft("");
  }

  function onInputKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) submit(draft);
    }
  }

  return (
    <>
      {/* Launcher orb */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open CAK AI Copilot"
          className="glow-primary glass fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-primary/15 transition-transform duration-300 hover:scale-110"
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
        >
          <Sparkles className="size-6 text-primary" strokeWidth={1.5} aria-hidden />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="CAK AI Copilot"
          className="bezel glass animate-fade-up fixed bottom-0 right-0 z-40 flex h-[100dvh] w-full flex-col sm:bottom-5 sm:right-5 sm:h-[560px] sm:max-h-[85dvh] sm:w-[380px] sm:rounded-3xl"
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="glow-primary grid size-9 place-items-center rounded-xl bg-primary/15" aria-hidden>
                <Sparkles className="size-5 text-primary" strokeWidth={1.5} />
              </span>
              <div className="leading-none">
                <p className="font-display text-sm font-bold tracking-tight text-fg">CAK AI Copilot</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                  {tab}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="btn-icon"
                  aria-label="Clear conversation"
                  title="Clear conversation"
                >
                  <Eraser className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-icon"
                aria-label="Close Copilot"
              >
                <X className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <EmptyState onPick={submit} />
            ) : (
              messages.map((m) => <CopilotMessageBubble key={m.id} message={m} />)
            )}
            {loading && <CopilotTyping />}
            {hasError && !loading && (
              <div className="flex justify-center">
                <button type="button" onClick={retry} className="chip gap-1.5">
                  <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden />
                  Coba lagi
                </button>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            <label htmlFor="copilot-input" className="sr-only">
              Message CAK AI Copilot
            </label>
            <div className="glass-2 flex items-end gap-2 rounded-2xl px-3 py-2">
              <textarea
                id="copilot-input"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onInputKey}
                rows={1}
                placeholder="Tanya apa saja soal halaman ini…"
                className="max-h-28 flex-1 resize-none bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
              />
              <button
                type="button"
                onClick={() => draft.trim() && submit(draft)}
                disabled={!draft.trim() || loading}
                className="btn-icon shrink-0 disabled:opacity-40"
                aria-label="Send message"
              >
                <SendHorizonal className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="animate-fade-up flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
      <span className="glow-primary grid size-12 place-items-center rounded-2xl bg-primary/15" aria-hidden>
        <Sparkles className="size-6 text-primary" strokeWidth={1.5} />
      </span>
      <div>
        <p className="font-display text-sm font-semibold text-fg">Halo! Aku lihat layar yang sama denganmu.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Tanya soal halaman ini, brainstorm, atau minta analisa data di layar.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)} className="chip glass-hover text-left">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
