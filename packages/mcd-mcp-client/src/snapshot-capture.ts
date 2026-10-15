import type { McdMcpAdapter, McpInitialized, McpToolDefinition } from './types.js'

/**
 * 官方 MCP 只读数据快照采集（P1-5）。
 *
 * 设计原则（重要）：
 * - **只采集原始响应**：所有 tools/call 返回值按原样记录，不做任何字段映射/推断。
 *   官方各工具的返回 schema 尚未用真实 Token 实测（P1-4 BLOCKED），
 *   在实测校验前把响应映射成 `MCPDataSnapshot` 属于猜测字段，违背「不伪造数据」红线。
 * - 采集范围仅限只读白名单工具；调用方（CLI）负责落盘与 sha256 校验。
 * - 顺序执行 + 依赖适配器内置限流/退避，远低于官方 600 次/分钟上限。
 */

/** 采集的固定次序（与 MCP_INTEGRATION.md §3 调用流程一致） */
export const SNAPSHOT_TOOL_SEQUENCE = [
  'now-time-info',
  'query-nearby-stores',
  'query-meals',
  'query-store-coupons',
  'list-nutrition-foods',
  'campaign-calendar',
] as const

/** 采样 query-meal-detail 的最大餐品数（默认 5，menuItems 为空或不足时自动收敛） */
export const DEFAULT_DETAIL_SAMPLE = 5

export interface CaptureOptions {
  /** query-meal-detail 采样数量；0 = 不采样 */
  detailSample?: number
  /** calculate-price 采样购物车数；0 = 不采样（默认 0：采样篮需等 P1-4 实测 schema 后再定） */
  priceSample?: number
}

export interface CapturedSnapshot {
  capturedAt: string
  serverInfo: McpInitialized
  toolsListed: McpToolDefinition[]
  /** 实际调用过的工具名（含 query-meal-detail 采样） */
  toolsInvoked: string[]
  /** 工具名 → 原始响应（逐字节保真，未做任何转换） */
  responses: Record<string, unknown>
  /** 每次 query-meal-detail 的调用参数与原始响应对 */
  mealDetails: Array<{ code: string; response: unknown }>
}

/** 从 query-meals 原始响应中提取餐品编码（尽力而为，仅用于采样列表；提取失败则跳过采样） */
function extractMealCodes(mealsResponse: unknown, limit: number): string[] {
  if (limit <= 0) return []
  const candidates = [
    (mealsResponse as { items?: unknown })?.items,
    (mealsResponse as { meals?: unknown })?.meals,
    (mealsResponse as { data?: unknown })?.data,
  ]
  for (const list of candidates) {
    if (!Array.isArray(list)) continue
    const codes = list
      .map((entry) => {
        const code = (entry as { code?: unknown })?.code ?? (entry as { mealCode?: unknown })?.mealCode
        return typeof code === 'string' ? code : null
      })
      .filter((code): code is string => Boolean(code))
    if (codes.length > 0) return codes.slice(0, limit)
  }
  return []
}

/**
 * 执行完整采集序列。任何工具调用失败都会原样抛出（调用方按错误码分类处理），
 * 不吞掉错误也不生成「部分成功」的快照。
 */
export async function captureOfficialSnapshot(
  adapter: McdMcpAdapter,
  options: CaptureOptions = {},
): Promise<CapturedSnapshot> {
  const serverInfo = await adapter.initialize()
  const toolsListed = await adapter.listTools()

  const responses: Record<string, unknown> = {}
  const toolsInvoked: string[] = []

  for (const tool of SNAPSHOT_TOOL_SEQUENCE) {
    // 只读工具才会走到这一步（适配器自身有白名单，这里是双保险）
    const response = await adapter.call(tool, {})
    responses[tool] = response
    toolsInvoked.push(tool)
  }

  // 采样餐品详情（数量受控；编码提取失败时安全跳过，不影响主流程）
  const mealDetails: CapturedSnapshot['mealDetails'] = []
  const detailSample = options.detailSample ?? DEFAULT_DETAIL_SAMPLE
  for (const code of extractMealCodes(responses['query-meals'], detailSample)) {
    const response = await adapter.call('query-meal-detail', { code })
    mealDetails.push({ code, response })
    if (!toolsInvoked.includes('query-meal-detail')) toolsInvoked.push('query-meal-detail')
  }

  const captured: CapturedSnapshot = {
    capturedAt: new Date().toISOString(),
    serverInfo,
    toolsListed,
    toolsInvoked,
    responses,
    mealDetails,
  }
  // 自校验：声明与实际一致，防止未来改动漏记
  if (captured.responses['now-time-info'] === undefined) {
    throw new Error('captureOfficialSnapshot: now-time-info 未被采集（内部不变量被破坏）')
  }
  return captured
}
