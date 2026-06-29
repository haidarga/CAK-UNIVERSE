// ============================================================
// Google Docs API — read plain text + replace the whole body.
// All calls use a Bearer token from getGoogleAccessToken().
// ============================================================
import { getGoogleAccessToken } from "./client";

const DOCS_BASE = "https://docs.googleapis.com/v1/documents";

interface TextRun {
  content?: string;
}

interface ParagraphElement {
  textRun?: TextRun;
}

interface Paragraph {
  elements?: ParagraphElement[];
}

interface StructuralElement {
  endIndex?: number;
  paragraph?: Paragraph;
}

interface DocumentBody {
  content?: StructuralElement[];
}

interface GoogleDoc {
  body?: DocumentBody;
}

/** Resolve the access token or throw a clear, caller-wrappable error. */
async function requireToken(): Promise<string> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Google not connected: no access token available");
  return token;
}

/** Flatten doc structural content into plain text. */
function flattenBody(body: DocumentBody | undefined): string {
  const content = body?.content ?? [];
  let out = "";
  for (const el of content) {
    const elements = el.paragraph?.elements ?? [];
    for (const e of elements) {
      out += e.textRun?.content ?? "";
    }
  }
  return out;
}

/** Read a Google Doc as plain text. Throws on API/auth error. */
export async function readDoc(documentId: string): Promise<string> {
  const token = await requireToken();
  const res = await fetch(`${DOCS_BASE}/${encodeURIComponent(documentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Docs read ${res.status}: ${text.slice(0, 200)}`);
  }
  const doc = (await res.json()) as GoogleDoc;
  return flattenBody(doc.body);
}

/** Find the body end index (Docs uses a trailing newline at the end). */
async function getBodyEndIndex(documentId: string, token: string): Promise<number> {
  const res = await fetch(`${DOCS_BASE}/${encodeURIComponent(documentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Docs read ${res.status}: ${text.slice(0, 200)}`);
  }
  const doc = (await res.json()) as GoogleDoc;
  const content = doc.body?.content ?? [];
  let end = 1;
  for (const el of content) {
    if (typeof el.endIndex === "number" && el.endIndex > end) end = el.endIndex;
  }
  return end;
}

interface BatchRequest {
  deleteContentRange?: { range: { startIndex: number; endIndex: number } };
  insertText?: { location: { index: number }; text: string };
}

/**
 * Replace the entire doc body with `text`.
 * Deletes the existing body range (when non-empty), then inserts at index 1.
 * Both ops go in one batchUpdate. Empty docs skip the delete.
 */
export async function replaceDocBody(documentId: string, text: string): Promise<void> {
  const token = await requireToken();
  const end = await getBodyEndIndex(documentId, token);

  const requests: BatchRequest[] = [];
  // The final segment end index includes a non-deletable trailing newline, so
  // the deletable range is [1, end-1). Only delete when there's real content.
  if (end > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } });
  }
  if (text.length > 0) {
    requests.push({ insertText: { location: { index: 1 }, text } });
  }

  if (requests.length === 0) return; // nothing to delete, nothing to insert

  const res = await fetch(`${DOCS_BASE}/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Docs batchUpdate ${res.status}: ${errText.slice(0, 200)}`);
  }
}
