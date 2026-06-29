// ============================================================
// Activity + notification helpers.
// Fire-and-forget side effects for the Work OS: writing to the
// cross-team activity feed and per-member notification inbox.
// These MUST NEVER throw — a failed log/notify should not break
// the primary mutation (task create, status change, comment, etc.).
// ============================================================
import { admin } from "./supabase";

export interface LogActivityArgs {
  actorId?: string | null;
  entityType: string; // task | dev_issue | pipeline | account | comment
  entityId?: string | null;
  action: string; // created | updated | status_changed | commented | completed
  summary?: string;
  brandId?: string | null;
}

/** Insert one row into activity_log. Swallows all errors. */
export async function logActivity(args: LogActivityArgs): Promise<void> {
  try {
    await admin()
      .from("activity_log")
      .insert({
        actor_id: args.actorId ?? null,
        entity_type: args.entityType,
        entity_id: args.entityId ?? null,
        action: args.action,
        summary: args.summary ?? null,
        brand_id: args.brandId ?? null,
      });
  } catch {
    // intentionally silent — activity logging is best-effort.
  }
}

export interface NotifyArgs {
  recipientId: string;
  type?: string; // info | assignment | mention | alert
  title: string;
  body?: string;
  link?: string;
}

/** Insert one row into notifications. Swallows all errors. */
export async function notify(args: NotifyArgs): Promise<void> {
  try {
    await admin()
      .from("notifications")
      .insert({
        recipient_id: args.recipientId,
        type: args.type ?? "info",
        title: args.title,
        body: args.body ?? null,
        link: args.link ?? null,
      });
  } catch {
    // intentionally silent — notifications are best-effort.
  }
}
