// ============================================================
// API helpers — consistent response envelope + cron auth.
// ============================================================
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ success: true, data, error: null, ...(meta ? { meta } : {}) });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ success: false, data: null, error: message }, { status });
}

/** Verify a Vercel Cron request via the shared CRON_SECRET (constant-time). */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when unconfigured
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
