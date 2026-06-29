"use client";

// ============================================================
// useCopilot — chat state + live page-context capture.
// Reads the rendered <main> on every send so the assistant
// always reflects the tab the user is currently looking at.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const MAX_PAGE_CONTEXT = 6000;
const STORAGE_KEY = "cak-copilot-messages";

interface ChatResponse {
  success: boolean;
  data: { reply: string } | null;
  error: string | null;
}

let _idSeq = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  _idSeq += 1;
  return `m${Date.now()}-${_idSeq}`;
}

/** Snapshot of the live page: title + collapsed innerText of <main>. */
export function getPageContext(): string {
  if (typeof document === "undefined") return "";
  const title = document.title || "";
  const main = document.querySelector("main")?.innerText ?? "";
  const collapsed = main.replace(/\s+/g, " ").trim();
  const body = `TITLE: ${title}\n\n${collapsed}`;
  return body.slice(0, MAX_PAGE_CONTEXT);
}

async function callApi(
  messages: CopilotMessage[],
  route: string,
  memberRole: string | undefined
): Promise<string> {
  const wire = messages
    .filter((m) => !m.error)
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("/api/copilot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: wire, route, pageContext: getPageContext(), memberRole }),
  });
  const json = (await res.json()) as ChatResponse;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data.reply;
}

export function useCopilot(opts: { route: string; memberRole?: string }) {
  const { route, memberRole } = opts;
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Synchronous in-flight guard — survives rapid double-sends before state flushes.
  const loadingRef = useRef(false);
  const lastUserRef = useRef<string | null>(null);
  // Always-fresh values for the stable `send` callback.
  const routeRef = useRef(route);
  const roleRef = useRef(memberRole);
  routeRef.current = route;
  roleRef.current = memberRole;

  // Restore from sessionStorage once on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw) as CopilotMessage[]);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota or disabled storage — non-fatal */
    }
  }, [messages]);

  const send = useCallback(async (text: string, opts2?: { resend?: boolean }) => {
    const content = text.trim();
    if (!content || loadingRef.current) return;
    loadingRef.current = true;
    lastUserRef.current = content;
    setLoading(true);

    // Build the next history from the COMMITTED state (functional updater),
    // then snapshot it for the wire payload.
    let snapshot: CopilotMessage[] = [];
    setMessages((prev) => {
      const base = opts2?.resend
        ? prev.filter((m, i) => !(i === prev.length - 1 && m.error))
        : [...prev, { id: newId(), role: "user" as const, content }];
      snapshot = base;
      return base;
    });

    try {
      const reply = await callApi(snapshot, routeRef.current, roleRef.current);
      setMessages((m) => [...m, { id: newId(), role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMessages((m) => [...m, { id: newId(), role: "assistant", content: `⚠️ ${msg}`, error: true }]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (loadingRef.current || !lastUserRef.current) return;
    void send(lastUserRef.current, { resend: true });
  }, [send]);

  const clear = useCallback(() => {
    setMessages([]);
    lastUserRef.current = null;
  }, []);

  const hasError = messages.length > 0 && messages[messages.length - 1]?.error === true;

  return { messages, loading, send, retry, clear, hasError };
}
