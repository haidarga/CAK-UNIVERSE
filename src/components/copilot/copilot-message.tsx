"use client";

// ============================================================
// CopilotMessage — a single chat bubble (user right, assistant left).
// ============================================================
import { Sparkles, AlertTriangle } from "lucide-react";
import type { CopilotMessage as Msg } from "./use-copilot";

export function CopilotMessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="animate-fade-up flex justify-end">
        <div className="glass-2 max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed text-fg">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex items-start gap-2">
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
          message.error ? "bg-danger/15" : "bg-primary/15 glow-primary"
        }`}
        aria-hidden
      >
        {message.error ? (
          <AlertTriangle className="size-4 text-danger" strokeWidth={1.5} />
        ) : (
          <Sparkles className="size-4 text-primary" strokeWidth={1.5} />
        )}
      </span>
      <div
        className={`glass max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed ${
          message.error ? "text-danger" : "text-fg"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

export function CopilotTyping() {
  return (
    <div className="animate-fade-up flex items-center gap-2">
      <span className="bg-primary/15 glow-primary mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg" aria-hidden>
        <Sparkles className="size-4 text-primary" strokeWidth={1.5} />
      </span>
      <div className="glass flex items-center gap-1 rounded-2xl rounded-tl-sm px-3.5 py-3" aria-label="Copilot is typing">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}
