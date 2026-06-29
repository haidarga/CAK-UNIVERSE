import type { ReactNode } from "react";

/** Inline bold (**text**) -> <strong>. Splits on the marker, no nesting. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Minimal, dependency-free Markdown renderer for executive reports.
 * Supports h1-h3, unordered/ordered lists, and paragraphs.
 */
export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/```[a-z]*\n?/gi, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = list.map((li, i) => (
      <li key={i} className="text-sm leading-relaxed text-fg/90">
        {renderInline(li)}
      </li>
    ));
    blocks.push(
      ordered ? (
        <ol key={key++} className="ml-5 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="ml-5 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const content = renderInline(h[2]);
      if (level === 1)
        blocks.push(
          <h2 key={key++} className="text-lg font-bold tracking-tight text-fg">
            {content}
          </h2>,
        );
      else if (level === 2)
        blocks.push(
          <h3 key={key++} className="mt-2 text-base font-semibold text-fg">
            {content}
          </h3>,
        );
      else
        blocks.push(
          <h4 key={key++} className="mt-1 text-sm font-semibold text-muted">
            {content}
          </h4>,
        );
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul) {
      if (ordered && list.length) flushList();
      ordered = false;
      list.push(ul[1]);
      continue;
    }
    if (ol) {
      if (!ordered && list.length) flushList();
      ordered = true;
      list.push(ol[1]);
      continue;
    }
    flushList();
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-fg/90">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
