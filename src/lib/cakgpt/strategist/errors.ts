// Shared error type for the scraper layer. Lives in its own module so the
// adapter registry (scraper.ts) and individual providers (providers/*.ts) can
// both throw/catch it without importing each other — that mutual import would
// be a cycle. Callers can `instanceof ScraperError` to distinguish an expected
// "couldn't fetch this account" (422 to the user) from an unexpected bug (500).
export class ScraperError extends Error {}
