// ============================================================
// Google ↔ platform bidirectional sync engine.
//
// - Docs are FULLY bidirectional: a pipeline's script.text mirrors a
//   Google Doc body. Whichever side changed since last sync wins; if
//   both changed it is a conflict and nothing is overwritten.
// - Sheets are best-effort: remote→platform pull writes the flattened
//   range into content_direction.research_notes; local→remote push
//   writes that same notes value back into `range`.
//
// syncLink() NEVER throws — every failure becomes a returned error
// result + an "error" status persisted on the sync_links row.
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";
import type { SyncLink, ContentPipeline } from "@/lib/types";
import { getGoogleAccessToken } from "@/lib/integrations/google/client";
import { readDoc, replaceDocBody } from "@/lib/integrations/google/docs";
import { readRange, writeRange } from "@/lib/integrations/google/sheets";

const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files";
const DEFAULT_SHEET_RANGE = "A1";
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export interface SyncOutcome {
  direction: string; // pull | push | none | conflict
  status: string; // active | error
  error?: string;
}

/** Parse a Google Docs / Sheets URL into its kind + document id. */
export function parseGoogleUrl(url: string): { kind: "doc" | "sheet"; id: string } | null {
  if (!url) return null;
  const doc = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (doc) return { kind: "doc", id: doc[1] };
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheet) return { kind: "sheet", id: sheet[1] };
  return null;
}

/** Small stable FNV-1a hash → hex string. Stable across runs/processes. */
export function hashText(s: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  // >>> 0 keeps it an unsigned 32-bit int before hex-encoding.
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Drive revision marker for any Doc/Sheet (Sheets are Drive files too).
 * Returns headRevisionId || modifiedTime || "" — never throws.
 */
async function getRemoteRevision(id: string): Promise<string> {
  try {
    const token = await getGoogleAccessToken();
    if (!token) return "";
    const url = `${DRIVE_FILE_URL}/${encodeURIComponent(id)}?fields=modifiedTime,headRevisionId`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return "";
    const json = (await res.json()) as { headRevisionId?: string; modifiedTime?: string };
    return json.headRevisionId || json.modifiedTime || "";
  } catch {
    return "";
  }
}

/** Flatten a sheet matrix into a stable string (rows joined by newline). */
function flattenRange(values: string[][]): string {
  return values.map((row) => row.join("\t")).join("\n");
}

/** Re-expand a flattened string back into a 2-D matrix for writeRange. */
function expandRange(text: string): string[][] {
  if (!text) return [[""]];
  return text.split("\n").map((line) => line.split("\t"));
}

async function loadPipeline(pipelineId: string): Promise<ContentPipeline | null> {
  const { data, error } = await admin()
    .from("content_pipeline")
    .select("*")
    .eq("id", pipelineId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ContentPipeline | null) ?? null;
}

/** The local mirror value for a link, read from its pipeline record. */
function localValueOf(link: SyncLink, pipeline: ContentPipeline | null): string {
  if (!pipeline) return "";
  if (link.kind === "doc") {
    return pipeline.script?.text ?? "";
  }
  // sheet: mirror content_direction.research_notes
  return pipeline.content_direction?.research_notes ?? "";
}

/** Persist a pulled remote value back into the pipeline record. */
async function writeLocalValue(link: SyncLink, pipeline: ContentPipeline, value: string): Promise<void> {
  const db = admin();
  if (link.kind === "doc") {
    const nextVersion = (pipeline.script?.version ?? 0) + 1;
    const { error } = await db
      .from("content_pipeline")
      .update({ script: { text: value, version: nextVersion }, updated_at: nowIso() })
      .eq("id", pipeline.id);
    if (error) throw new Error(error.message);
    return;
  }
  const direction = { ...(pipeline.content_direction ?? { title: "" }), research_notes: value };
  const { error } = await db
    .from("content_pipeline")
    .update({ content_direction: direction, updated_at: nowIso() })
    .eq("id", pipeline.id);
  if (error) throw new Error(error.message);
}

/** Read the current remote value (doc body or flattened range). */
async function readRemoteValue(link: SyncLink): Promise<string> {
  if (link.kind === "doc") return readDoc(link.external_id);
  const range = link.range || DEFAULT_SHEET_RANGE;
  const values = await readRange(link.external_id, range);
  return flattenRange(values);
}

/** Write a local value out to the remote (doc body or range). */
async function pushRemoteValue(link: SyncLink, value: string): Promise<void> {
  if (link.kind === "doc") {
    await replaceDocBody(link.external_id, value);
    return;
  }
  const range = link.range || DEFAULT_SHEET_RANGE;
  await writeRange(link.external_id, range, expandRange(value));
}

interface BookkeepingPatch {
  last_remote_rev?: string | null;
  last_local_hash?: string | null;
  last_synced_at?: string | null;
  last_direction: string;
  status: string;
  last_error: string | null;
  updated_at: string;
}

async function persistLink(linkId: string, patch: BookkeepingPatch): Promise<void> {
  await admin().from("sync_links").update(patch).eq("id", linkId);
}

/**
 * Reconcile one link between Google and the platform. Direction is
 * decided by comparing remote revision + local hash against the last
 * synced markers. Conflicts (both sides changed) are refused.
 */
export async function syncLink(link: SyncLink): Promise<SyncOutcome> {
  try {
    if (!link.pipeline_id) {
      const patch = errorPatch("link has no pipeline_id");
      await persistLink(link.id, patch);
      return { direction: "none", status: "error", error: "link has no pipeline_id" };
    }

    const pipeline = await loadPipeline(link.pipeline_id);
    if (!pipeline) {
      const patch = errorPatch("pipeline not found");
      await persistLink(link.id, patch);
      return { direction: "none", status: "error", error: "pipeline not found" };
    }

    const localValue = localValueOf(link, pipeline);
    const localHash = hashText(localValue);
    const remoteRev = await getRemoteRevision(link.external_id);

    const remoteChanged = remoteRev !== "" && remoteRev !== (link.last_remote_rev ?? "");
    const localChanged = localHash !== (link.last_local_hash ?? "");

    // Both sides changed → conflict, never overwrite.
    if (remoteChanged && localChanged) {
      const patch: BookkeepingPatch = {
        last_direction: "conflict",
        status: "error",
        last_error: "both sides changed — resolve manually",
        updated_at: nowIso(),
      };
      await persistLink(link.id, patch);
      return { direction: "conflict", status: "error", error: "both sides changed — resolve manually" };
    }

    // PULL: remote changed, local stable.
    if (remoteChanged) {
      const remoteValue = await readRemoteValue(link);
      await writeLocalValue(link, pipeline, remoteValue);
      const newRev = await getRemoteRevision(link.external_id);
      await persistLink(link.id, successPatch("pull", newRev || remoteRev, hashText(remoteValue)));
      await logActivity({
        entityType: "pipeline",
        entityId: link.pipeline_id,
        action: "synced",
        summary: `Pulled ${link.kind} from Google`,
        brandId: link.brand_id,
      });
      return { direction: "pull", status: "active" };
    }

    // PUSH: local changed, remote stable.
    if (localChanged) {
      await pushRemoteValue(link, localValue);
      const newRev = await getRemoteRevision(link.external_id);
      await persistLink(link.id, successPatch("push", newRev || remoteRev, localHash));
      await logActivity({
        entityType: "pipeline",
        entityId: link.pipeline_id,
        action: "synced",
        summary: `Pushed ${link.kind} to Google`,
        brandId: link.brand_id,
      });
      return { direction: "push", status: "active" };
    }

    // Neither changed → record the current markers, no transfer.
    await persistLink(link.id, successPatch("none", remoteRev, localHash));
    return { direction: "none", status: "active" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync failed";
    try {
      await persistLink(link.id, errorPatch(message));
    } catch {
      // swallow — bookkeeping write is best-effort.
    }
    return { direction: "none", status: "error", error: message };
  }
}

function successPatch(direction: string, remoteRev: string, localHash: string): BookkeepingPatch {
  return {
    last_remote_rev: remoteRev,
    last_local_hash: localHash,
    last_synced_at: nowIso(),
    last_direction: direction,
    status: "active",
    last_error: null,
    updated_at: nowIso(),
  };
}

function errorPatch(message: string): BookkeepingPatch {
  return {
    last_direction: "none",
    status: "error",
    last_error: message,
    updated_at: nowIso(),
  };
}
