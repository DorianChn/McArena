/** 确定性伪随机数生成器（mulberry32）。
 *  任务卡生成的全部随机性来源于此，保证同 seed 同输出。 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 按权重选取：weights 与 values 等长，返回 value */
export function weightedPick<T>(rng: () => number, values: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let threshold = rng() * total
  for (let i = 0; i < values.length; i += 1) {
    threshold -= weights[i] ?? 0
    if (threshold <= 0) {
      return values[i] as T
    }
  }
  return values[values.length - 1] as T
}

/** 从数组中确定性选取 n 个（rng 驱动，不重复） */
export function sampleDeterministic<T>(rng: () => number, values: T[], n: number): T[] {
  const pool = [...values]
  const picked: T[] = []
  const count = Math.min(n, pool.length)
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(rng() * pool.length)
    picked.push(...pool.splice(index, 1))
  }
  return picked
}
