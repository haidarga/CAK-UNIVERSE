import { cookies } from 'next/headers'

// The selected client workspace is kept in a cookie so server components can
// filter their queries by it. 'all' (or unset) means no filter — show everything.
export const ACTIVE_CLIENT_COOKIE = 'active_client'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Returns the active client id ONLY if the cookie holds a well-formed UUID. This
// value flows into PostgREST filters (including `.or('client_id.eq.<v>,...')`),
// so a non-UUID must never reach the query builder — a malformed/tampered cookie
// is treated as "no workspace selected" rather than injected into the filter.
// (RLS still scopes every query by created_by, so this is defense-in-depth, but
// it also prevents the .or() filter-string from being broken by stray chars.)
export async function getActiveClientId(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(ACTIVE_CLIENT_COOKIE)?.value
  if (!value || value === 'all' || !UUID_RE.test(value)) return null
  return value
}
