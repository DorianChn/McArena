import { describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../src/rate-limiter.js'

describe('RateLimiter', () => {
  it('拒绝非正整数配额', () => {
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new RateLimiter(limit)).toThrow('maxPerMinute 必须为正整数')
    }
  })

  it('在滑动窗口中过期回收用量', async () => {
    let now = 10_000
    const limiter = new RateLimiter(2, () => now)
    await limiter.acquire()
    await limiter.acquire()
    expect(limiter.pending).toBe(2)
    now += 60_000
    expect(limiter.pending).toBe(0)
  })

  it('超过配额后等待一个窗口再执行', async () => {
    vi.useFakeTimers()
    try {
      const limiter = new RateLimiter(1, () => Date.now())
      await limiter.acquire()
      let acquired = false
      const waiting = limiter.acquire().then(() => { acquired = true })
      await vi.advanceTimersByTimeAsync(60_004)
      expect(acquired).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await waiting
      expect(acquired).toBe(true)
      expect(limiter.pending).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
