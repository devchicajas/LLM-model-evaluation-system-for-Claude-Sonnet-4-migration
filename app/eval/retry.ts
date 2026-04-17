export async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

const DEFAULT_BACKOFF_MS = [1000, 2000] as const

/**
 * Runs `fn` up to 3 times (initial attempt + 2 retries) with 1s then 2s backoff.
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  ctx: { label: string },
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(attempt === 1 ? DEFAULT_BACKOFF_MS[0] : DEFAULT_BACKOFF_MS[1])
    }
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`Attempt ${attempt + 1}/3 failed for ${ctx.label}: ${msg}`)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
