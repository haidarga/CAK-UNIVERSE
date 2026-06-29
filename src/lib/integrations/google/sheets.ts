// ============================================================
// Google Sheets API — read + write A1 ranges (RAW input).
// All calls use a Bearer token from getGoogleAccessToken().
// ============================================================
import { getGoogleAccessToken } from "./client";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

interface ValueRange {
  values?: string[][];
}

/** Resolve the access token or throw a clear, caller-wrappable error. */
async function requireToken(): Promise<string> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Google not connected: no access token available");
  return token;
}

/** Read an A1 range. Returns rows of cell strings ([] when empty). */
export async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const token = await requireToken();
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets read ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as ValueRange;
  return body.values ?? [];
}

/** Write an A1 range with RAW value input (overwrites cells). */
export async function writeRange(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const token = await requireToken();
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}` +
    `?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets write ${res.status}: ${text.slice(0, 200)}`);
  }
}
