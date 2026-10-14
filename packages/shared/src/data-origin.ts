import { z } from 'zod'

/**
 * 数据来源标识 —— 全项目最重要的契约之一。
 * 严格要求：模拟数据不得伪装为官方数据；官方数据必须标注「实时」或「快照回放」。
 */
export const DATA_ORIGINS = ['official-live', 'official-snapshot', 'mock'] as const

export const DataOriginSchema = z.enum(DATA_ORIGINS)
export type DataOrigin = z.infer<typeof DataOriginSchema>

export const DATA_ORIGIN_LABELS: Record<DataOrigin, { label: string; short: string; description: string; official: boolean }> = {
  'official-live': {
    label: '官方实时',
    short: '实时',
    description: '数据来自麦当劳中国官方 MCP Server（mcp.mcd.cn）的实时调用结果。',
    official: true,
  },
  'official-snapshot': {
    label: '官方快照回放',
    short: '快照',
    description: '数据来自录制的官方 MCP 响应快照（真实数据，非实时；快照携带 sha256 校验）。',
    official: true,
  },
  mock: {
    label: '模拟数据',
    short: '模拟',
    description: '开发用模拟数据（非官方数据）。仅用于无 Token 的开发联调，禁止用于任何正式结论或对外展示。',
    official: false,
  },
}

/** 是否为官方来源数据 */
export function isOfficialOrigin(origin: DataOrigin): boolean {
  return DATA_ORIGIN_LABELS[origin].official
}

/** 生成数据来源的中文描述（用于 UI 与日志） */
export function describeOrigin(origin: DataOrigin): string {
  return DATA_ORIGIN_LABELS[origin].description
}

/** 模拟数据专用警示语，任何 mock 结果必须携带 */
export const MOCK_DATA_WARNING = '本结果基于开发用模拟数据，非麦当劳官方数据，仅供参考。'
