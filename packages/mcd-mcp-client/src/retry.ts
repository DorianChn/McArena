import { McpUnavailableError, RateLimitError } from '@mcarena/shared'

/**
 * 指数退避重试（带抖动）。仅对可恢复错误重试：
 * RateLimitError / 网络错误 / 5xx（由调用方以 McpUnavailableError 表达）。
 */
export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitterRatio?: number
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
  random?: () => number
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError || error instanceof McpUnavailableError) {
    return true
  }
  if (error instanceof Error) {
    const name = (error as Error & { code?: string }).code ?? ''
    return ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(name) ||
      error.name === 'AbortError' ||
      error.name === 'TimeoutError'
  }
  return false
}

export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 500
  const maxDelayMs = options.maxDelayMs ?? 8_000
  const jitterRatio = options.jitterRatio ?? 0.2
  const random = options.random ?? Math.random

  let attempt = 0
  for (;;) {
    try {
      return await task()
    } catch (error) {
      if (attempt >= retries || !isRetryableError(error)) {
        throw error
      }
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      const jitter = exponential * jitterRatio * (random() * 2 - 1)
      const delayMs = Math.max(0, Math.round(exponential + jitter))
      attempt += 1
      options.onRetry?.(error, attempt, delayMs)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
