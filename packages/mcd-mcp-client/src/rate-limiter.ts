/**
 * 客户端限流器：滑动窗口，保证请求速率低于官方上限（600 次/分钟）。
 * 默认配置 300 次/分钟，留有安全余量。
 */
export class RateLimiter {
  private readonly windowMs = 60_000
  private readonly timestamps: number[] = []

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(maxPerMinute) || maxPerMinute < 1) {
      throw new Error('RateLimiter: maxPerMinute 必须为正整数')
    }
  }

  /** 执行前调用：必要时等待到有空闲配额 */
  async acquire(): Promise<void> {
    for (;;) {
      const now = this.now()
      while (this.timestamps.length > 0 && (this.timestamps[0] ?? 0) <= now - this.windowMs) {
        this.timestamps.shift()
      }
      if (this.timestamps.length < this.maxPerMinute) {
        this.timestamps.push(now)
        return
      }
      const oldest = this.timestamps[0] ?? now
      const waitMs = Math.max(0, oldest + this.windowMs - now) + 5
      await sleep(waitMs)
    }
  }

  /** 在配额内执行一个异步任务 */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    return task()
  }

  /** 当前窗口内已用配额（测试/诊断用） */
  get pending(): number {
    const now = this.now()
    while (this.timestamps.length > 0 && (this.timestamps[0] ?? 0) <= now - this.windowMs) {
      this.timestamps.shift()
    }
    return this.timestamps.length
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
