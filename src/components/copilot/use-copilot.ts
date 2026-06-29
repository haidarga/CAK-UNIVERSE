"use client";

// ============================================================
// useCopilot — chat state + live page-context capture + DB-backed
// memory and multi-chatroom (thread) support.
//
// Persistence model:
//   - Logged-in members (memberId present): threads + messages live in
//     Supabase. On mount we load the most recent thread; each send carries
//     the active threadId and the server returns the resolved threadId.
//   - Guests (no memberId): fall back to the original sessionStorage behavior.
//
// The send() flow is DELIBERATELY ref-based: React state updates are async,
// so we build the wire payload from messagesRef (never from `messages`
// state read right after setState). Do not "simplify" this back.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import type { CopilotThread, CopilotMessageRow } from "@/lib/types";

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
  data: { reply: string; threadId: string | null } | null;
  error: string | null;
}

interface ThreadsResponse {
  success: boolean;
  data: { threads: CopilotThread[] } | null;
  error: string | null;
}

interface MessagesResponse {
  success: boolean;
  data: { messages: CopilotMessageRow[] } | null;
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

/** Map DB rows to the hook's in-memory message shape. */
function rowsToMessages(rows: CopilotMessageRow[]): CopilotMessage[] {
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content }));
}

interface ChatApiArgs {
  messages: CopilotMessage[];
  route: string;
  memberRole: string | undefined;
  memberId: string | undefined;
  threadId: string | null;
}

interface ChatApiResult {
  reply: string;
  threadId: string | null;
}

async function callChatApi(args: ChatApiArgs): Promise<ChatApiResult> {
  const wire = args.messages
    .filter((m) => !m.error && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("/api/copilot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: wire,
      route: args.route,
      pageContext: getPageContext(),
      memberRole: args.memberRole,
      memberId: args.memberId,
      threadId: args.threadId ?? undefined,
    }),
  });
  const json = (await res.json()) as ChatResponse;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return { reply: json.data.reply, threadId: json.data.threadId };
}

async function fetchThreads(memberId: string): Promise<CopilotThread[]> {
  const res = await fetch(`/api/copilot/threads?memberId=${encodeURIComponent(memberId)}`);
  const json = (await res.json()) as ThreadsResponse;
  if (!res.ok || !json.success || !json.data) return [];
  return json.data.threads;
}

async function fetchThreadMessages(threadId: string): Promise<CopilotMessage[]> {
  const res = await fetch(`/api/copilot/threads/${encodeURIComponent(threadId)}/messages`);
  const json = (await res.json()) as MessagesResponse;
  if (!res.ok || !json.success || !json.data) return [];
  return rowsToMessages(json.data.messages);
}

export function useCopilot(opts: { route: string; memberRole?: string; memberId?: string }) {
  const { route, memberRole, memberId } = opts;
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<CopilotThread[]>([]);

  // Synchronous in-flight guard + always-current message list (state updates are
  // async, so we keep a ref to build the wire payload deterministically).
  const loadingRef = useRef(false);
  const messagesRef = useRef<CopilotMessage[]>([]);
  const threadIdRef = useRef<string | null>(null);
  const lastUserRef = useRef<string | null>(null);
  const routeRef = useRef(route);
  const roleRef = useRef(memberRole);
  const memberIdRef = useRef(memberId);
  routeRef.current = route;
  roleRef.current = memberRole;
  memberIdRef.current = memberId;

  // Keep refs in sync with any external state change (e.g. restore/switch).
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  // Helpers that write both the ref and the state together.
  const commit = useCallback((next: CopilotMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);
  const commitThread = useCallback((id: string | null) => {
    threadIdRef.current = id;
    setThreadId(id);
  }, []);

  const refreshThreads = useCallback(async () => {
    const id = memberIdRef.current;
    if (!id) return;
    setThreads(await fetchThreads(id));
  }, []);

  // Mount: members load DB threads + most recent thread; guests use sessionStorage.
  useEffect(() => {
    let cancelled = false;

    if (!memberId) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CopilotMessage[];
          messagesRef.current = parsed;
          setMessages(parsed);
        }
      } catch {
        /* ignore corrupt storage */
      }
      return;
    }

    void (async () => {
      const list = await fetchThreads(memberId);
      if (cancelled) return;
      setThreads(list);
      const recent = list[0];
      if (recent) {
        const msgs = await fetchThreadMessages(recent.id);
        if (cancelled) return;
        commit(msgs);
        commitThread(recent.id);
      } else {
        commit([]);
        commitThread(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // memberId is the only identity-relevant input; commit helpers are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // Guests persist to sessionStorage on change. Members rely on the DB.
  useEffect(() => {
    if (memberIdRef.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota or disabled storage — non-fatal */
    }
  }, [messages]);

  const send = useCallback(
    async (text: string, opts2?: { resend?: boolean }) => {
      const content = text.trim();
      if (!content || loadingRef.current) return;
      loadingRef.current = true;
      lastUserRef.current = content;
      setLoading(true);

      // Build the next history from the CURRENT ref (deterministic, not async).
      const prev = messagesRef.current;
      const base: CopilotMessage[] = opts2?.resend
        ? prev.filter((m, i) => !(i === prev.length - 1 && m.error))
        : [...prev, { id: newId(), role: "user", content }];
      commit(base);

      // Whether this turn opens a brand-new thread (for list refresh).
      const wasNewThread = threadIdRef.current === null && !!memberIdRef.current;

      try {
        const result = await callChatApi({
          messages: base,
          route: routeRef.current,
          memberRole: roleRef.current,
          memberId: memberIdRef.current,
          threadId: threadIdRef.current,
        });
        commit([...messagesRef.current, { id: newId(), role: "assistant", content: result.reply }]);
        if (result.threadId && result.threadId !== threadIdRef.current) {
          commitThread(result.threadId);
        }
        if (wasNewThread) void refreshThreads();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        commit([
          ...messagesRef.current,
          { id: newId(), role: "assistant", content: `⚠️ ${msg}`, error: true },
        ]);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [commit, commitThread, refreshThreads],
  );

  const retry = useCallback(() => {
    if (loadingRef.current || !lastUserRef.current) return;
    void send(lastUserRef.current, { resend: true });
  }, [send]);

  const newChat = useCallback(() => {
    commit([]);
    commitThread(null);
    lastUserRef.current = null;
  }, [commit, commitThread]);

  const switchThread = useCallback(
    async (id: string) => {
      if (loadingRef.current || id === threadIdRef.current) return;
      const msgs = await fetchThreadMessages(id);
      commit(msgs);
      commitThread(id);
      lastUserRef.current = null;
    },
    [commit, commitThread],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/copilot/threads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {
        /* best-effort delete */
      }
      if (id === threadIdRef.current) {
        commit([]);
        commitThread(null);
        lastUserRef.current = null;
      }
      await refreshThreads();
    },
    [commit, commitThread, refreshThreads],
  );

  // Guest "clear" maps to newChat (no thread); kept for API compatibility.
  const clear = newChat;

  const hasError = messages.length > 0 && messages[messages.length - 1]?.error === true;

  return {
    messages,
    loading,
    send,
    retry,
    clear,
    hasError,
    threadId,
    threads,
    newChat,
    switchThread,
    deleteThread,
  };
}
