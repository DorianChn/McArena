/** 展示层格式化工具（纯函数） */

/** 分 → 人民币字符串 */
export function yuan(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return `¥${(cents / 100).toFixed(2)}`
}

/** 毫秒 → 人类可读耗时 */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** 0–1 → 百分比 */
export function percent(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined) return '—'
  return `${(rate * 100).toFixed(digits)}%`
}

export function sceneLabel(scene: string): string {
  if (scene === 'dine-in') return '堂食'
  if (scene === 'take-away') return '外带'
  if (scene === 'delivery') return '外送'
  return scene
}

export function agentLabel(agentId: 'alpha' | 'beta'): string {
  return agentId === 'alpha' ? 'Agent α · 极速猎手' : 'Agent β · 深度优化师'
}

/** 缩短 sha256 展示 */
export function shortHash(hash: string | null): string {
  if (!hash) return '（无校验值）'
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export function compactNumber(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return String(value)
}
