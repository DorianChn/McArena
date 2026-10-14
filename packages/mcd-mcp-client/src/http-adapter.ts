import {
  AuthError,
  McpProtocolError,
  McpUnavailableError,
  RateLimitError,
  ValidationError,
  createLogger,
} from '@mcarena/shared'
import { extractJsonRpcMessages, isEventStream, parseSseFrames } from './sse.js'
import { RateLimiter } from './rate-limiter.js'
import { withRetry } from './retry.js'
import { McpToolListSchema } from './types.js'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McdMcpAdapter,
  McpClientOptions,
  McpInitialized,
  McpToolDefinition,
} from './types.js'
import { READ_ONLY_MCD_TOOLS, WRITE_MCD_TOOLS } from './types.js'

const MCP_PROTOCOL_VERSION = '2025-03-26'
const CLIENT_INFO = { name: 'McArena', version: '0.1.0' }

/**
 * 麦当劳官方 MCP Server 适配器（Streamable HTTP）。
 *
 * 安全约束：
 * - Token 仅通过构造函数注入（调用方从环境变量读取），本类不读取任何环境变量；
 * - 只读工具白名单之外的调用直接拒绝（不发出任何网络请求）；
 * - 写操作黑名单默认拒绝，需显式 allowWrite 才放行；
 * - 429 指数退避重试，客户端速率限制保证远低于官方 600 次/分钟上限。
 */
export class HttpMcpAdapter implements McdMcpAdapter {
  readonly mode = 'live' as const

  private readonly token: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly limiter: RateLimiter
  private readonly logger: ReturnType<typeof createLogger>
  private readonly maxRetries: number
  private readonly allowWrite: boolean

  private nextId = 1
  private initialized = false
  private serverInfo: McpInitialized | null = null

  constructor(options: McpClientOptions & { allowWrite?: boolean }) {
    if (!options.token) {
      throw new AuthError('未提供 MCD_MCP_TOKEN：请先在 https://open.mcd.cn/mcp 申请')
    }
    this.token = options.token
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.limiter = new RateLimiter(options.maxRequestsPerMinute)
    this.logger = options.logger ?? createLogger({ base: { module: 'mcd-mcp-client' } })
    this.maxRetries = options.maxRetries ?? 3
    this.allowWrite = options.allowWrite ?? false
  }

  async initialize(): Promise<McpInitialized> {
    if (this.initialized && this.serverInfo) {
      return this.serverInfo
    }
    const result = (await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    })) as McpInitialized
    // 完成握手通知（notification 无响应）
    await this.request('notifications/initialized', undefined, { notification: true })
    this.serverInfo = result
    this.initialized = true
    this.logger.info('MCP 握手完成', { serverInfo: result.serverInfo ?? null })
    return result
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.initialize()
    const result = await this.request('tools/list', {})
    const parsed = McpToolListSchema.parse(result)
    return parsed.tools
  }

  async call<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    this.assertToolAllowed(tool)
    await this.initialize()
    this.logger.debug('MCP 工具调用', { tool })
    const result = await this.request('tools/call', { name: tool, arguments: args })
    return extractCallPayload<T>(result)
  }

  private assertToolAllowed(tool: string): void {
    if (WRITE_MCD_TOOLS.includes(tool as (typeof WRITE_MCD_TOOLS)[number])) {
      if (!this.allowWrite) {
        throw new ValidationError(
          `工具 ${tool} 属于写操作（会产生真实业务副作用），McArena 默认禁止调用。` +
            '如确需开启，请设置 MCD_ALLOW_WRITE_TOOLS=true 并充分评估风险。',
        )
      }
      return
    }
    if (!READ_ONLY_MCD_TOOLS.includes(tool as (typeof READ_ONLY_MCD_TOOLS)[number])) {
      throw new ValidationError(
        `工具 ${tool} 未登记在 McArena 只读白名单中，已拒绝调用。` +
          '如需新增工具，请先在 MCP_INTEGRATION.md 登记并经评审。',
      )
    }
  }

  private async request(
    method: string,
    params: unknown,
    options: { notification?: boolean } = {},
  ): Promise<unknown> {
    return this.limiter.run(() =>
      withRetry(
        async () => {
          const id = this.nextId++
          const body: JsonRpcRequest = { jsonrpc: '2.0', id, method }
          if (params !== undefined) {
            body.params = params
          }

          const response = await this.fetchImpl(this.baseUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
          })

          if (response.status === 401) {
            throw new AuthError(
              '麦当劳 MCP Token 无效或已过期（401）。请在 https://open.mcd.cn/mcp 控制台重新申请，并更新 .env 中的 MCD_MCP_TOKEN。',
            )
          }
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get('retry-after') ?? '') || undefined
            throw new RateLimitError('麦当劳 MCP 触发限流（429）', {
              retryAfterMs: retryAfter ? retryAfter * 1000 : undefined,
            })
          }
          if (!response.ok) {
            throw new McpUnavailableError(`麦当劳 MCP Server 返回 HTTP ${response.status}`, {
              cause: undefined,
            })
          }

          if (options.notification) {
            // JSON-RPC notification：无响应体；仅检查传输层状态
            if (!response.ok) {
              throw new McpUnavailableError(
                `MCP ${method} 通知返回 HTTP ${response.status}`,
              )
            }
            return undefined
          }

          const text = await response.text()
          const messages = extractJsonRpcMessages(text, response.headers.get('content-type'))
          if (messages.length === 0) {
            throw new McpProtocolError(`MCP ${method} 响应为空或无法解析`)
          }
          const match = messages.find(
            (msg): msg is JsonRpcResponse =>
              typeof msg === 'object' && msg !== null && (msg as JsonRpcResponse).id === id,
          )
          const target = match ?? (messages.length === 1 ? (messages[0] as JsonRpcResponse) : undefined)
          if (!target || typeof target !== 'object') {
            throw new McpProtocolError(`MCP ${method} 响应中未找到对应请求的结果`)
          }
          if (target.error) {
            throw new McpProtocolError(`MCP ${method} 返回错误：${target.error.message}`, {
              details: target.error,
            })
          }
          return target.result
        },
        { retries: this.maxRetries },
      ),
    )
  }
}

/** 提取 tools/call 的业务载荷（MCP content 数组 → 解析 JSON 文本） */
export function extractCallPayload<T>(raw: unknown): T {
  if (raw === null || typeof raw !== 'object') {
    return raw as T
  }
  const result = raw as { content?: unknown; isError?: boolean }
  if (result.isError === true) {
    const text = contentToText(result)
    throw new McpProtocolError(`MCP 工具返回错误结果：${text}`)
  }
  if (!Array.isArray(result.content)) {
    return raw as T
  }
  const text = contentToText(result)
  if (!text) {
    return raw as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

function contentToText(result: { content?: unknown }): string {
  if (!Array.isArray(result.content)) {
    return ''
  }
  return result.content
    .map((entry) => {
      if (entry !== null && typeof entry === 'object' && (entry as { type?: string }).type === 'text') {
        const text = (entry as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }
      return ''
    })
    .filter((part) => part.length > 0)
    .join('\n')
}

export { parseSseFrames, isEventStream }
