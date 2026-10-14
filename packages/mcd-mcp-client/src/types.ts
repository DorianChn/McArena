import { z } from 'zod'
import type { Logger } from '@mcarena/shared'

/** MCP 协议消息类型（JSON-RPC 2.0，Streamable HTTP 传输） */

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpInitialized {
  protocolVersion?: string
  serverInfo?: { name?: string; version?: string }
  instructions?: string
}

/** MCP tools/call 的标准返回结构 */
export interface McpCallContent {
  type: string
  text?: string
  [key: string]: unknown
}

export interface McpCallRawResult {
  content?: McpCallContent[]
  isError?: boolean
  [key: string]: unknown
}

/**
 * McArena 使用的官方 MCP 适配器接口。
 * 两个实现：HttpMcpAdapter（官方实时）与 MockMcpAdapter（开发模拟，明确标注）。
 */
export interface McdMcpAdapter {
  readonly mode: 'live' | 'mock'
  initialize(): Promise<McpInitialized>
  listTools(): Promise<McpToolDefinition[]>
  call<T = unknown>(tool: string, args?: Record<string, unknown>): Promise<T>
}

export interface McpClientOptions {
  token: string
  baseUrl: string
  maxRequestsPerMinute: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
  logger?: Logger
  maxRetries?: number
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * 只读工具白名单（官方 README §3 已确认）。
 * 只有登记过的只读工具才允许调用。
 */
export const READ_ONLY_MCD_TOOLS = [
  'now-time-info',
  'query-nearby-stores',
  'query-meals',
  'query-meal-detail',
  'calculate-price',
  'query-store-coupons',
  'list-nutrition-foods',
  'campaign-calendar',
] as const

/**
 * 写操作黑名单（纵深防御）：会产生真实业务副作用的工具，
 * 即使未来加入白名单也默认拒绝，除非显式开启 MCD_ALLOW_WRITE_TOOLS。
 */
export const WRITE_MCD_TOOLS = [
  'create-order',
  'cancel-order',
  'mall-create-order',
  'delivery-create-address',
  'auto-bind-coupons',
  'party-order-create',
  'draw-lottery',
  'mall-points-products-order',
] as const

export const McpToolListSchema = z.object({
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        inputSchema: z.record(z.unknown()).optional(),
      }),
    )
    .default([]),
})
