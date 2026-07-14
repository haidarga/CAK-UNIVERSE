// A platform-level function kill (Vercel hits maxDuration, or OOM) happens
// OUTSIDE the JS call stack — no try/catch in our own code can intercept it,
// because the whole process is terminated before any catch block would run.
// The only real defense is to never let our own work run long enough to
// trigger that: race it against our OWN shorter deadline and return a clean,
// actionable JSON error well before Vercel would ever step in.
export class DeadlineExceededError extends Error {}

export async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(`${label} took too long (over ${Math.round(ms / 1000)}s)`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}
