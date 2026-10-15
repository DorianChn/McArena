import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpUnavailableError, RateLimitError } from '@mcarena/shared'
import { isRetryableError, withRetry } from '../src/retry.js'

afterEach(() => vi.useRealTimers())

describe('MCP retry policy', () => {
  it('classifies only transient errors as retryable', () => {
    expect(isRetryableError(new RateLimitError())).toBe(true)
    expect(isRetryableError(new McpUnavailableError('HTTP 503'))).toBe(true)
    expect(isRetryableError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe(true)
    expect(isRetryableError(new Error('bad request'))).toBe(false)
    expect(isRetryableError('network error')).toBe(false)
  })

  it('retries transient failure with bounded deterministic delay and succeeds', async () => {
    vi.useFakeTimers()
    let calls = 0
    const retried = vi.fn()
    const resultPromise = withRetry(() => {
      calls += 1
      if (calls === 1) return Promise.reject(new RateLimitError())
      return Promise.resolve('ok')
    }, { retries: 2, baseDelayMs: 100, jitterRatio: 0.2, random: () => 1, onRetry: retried })
    await vi.advanceTimersByTimeAsync(120)
    await expect(resultPromise).resolves.toBe('ok')
    expect(calls).toBe(2)
    expect(retried).toHaveBeenCalledWith(expect.any(RateLimitError), 1, 120)
  })

  it('does not retry permanent failures or exceed retry count', async () => {
    const permanent = vi.fn().mockRejectedValue(new Error('invalid request'))
    await expect(withRetry(permanent, { retries: 3, baseDelayMs: 0 })).rejects.toThrow('invalid request')
    expect(permanent).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    let attempts = 0
    const exhausted = withRetry(() => {
      attempts += 1
      return Promise.reject(new RateLimitError())
    }, { retries: 2, baseDelayMs: 0, jitterRatio: 0 })
    const assertion = expect(exhausted).rejects.toBeInstanceOf(RateLimitError)
    await vi.runAllTimersAsync()
    await assertion
    expect(attempts).toBe(3)
  })
})
