/**
 * Shared timeout and retry helpers for external APIs and LLM calls (T4.3).
 */

export async function withTimeout(promise, ms, label = 'operation') {
  if (!ms || ms <= 0) return promise
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function withRetry(
  fn,
  { retries = 2, delayMs = 200, timeoutMs = 15000, label = 'operation' } = {},
) {
  let lastError
  const attempts = Math.max(1, retries + 1)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withTimeout(Promise.resolve().then(() => fn(attempt)), timeoutMs, label)
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
  }

  throw lastError
}

