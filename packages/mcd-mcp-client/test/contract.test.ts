import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HttpMcpAdapter } from '../src/http-adapter.js'
import type { McpClientOptions } from '../src/types.js'
import { parseSseFrames, extractJsonRpcMessages } from '../src/sse.js'
import { ValidationError, AuthError } from '@mcarena/shared'

/**
 * 用本地假 MCP Server 验证 HttpMcpAdapter 的协议行为。
 * 假服务器实现了 initialize / tools/list / tools/call，并支持 SSE 与 JSON 两种响应格式。
 */

interface FakeServerState {
  calls: Array<{ method: string; params: unknown }>
  authHeaders: Array<string | undefined>
  rateLimitHits: number
  unauthorized: boolean
  unauthorizedAfterInitialize: boolean
}

const state: FakeServerState = { calls: [], authHeaders: [], rateLimitHits: 0, unauthorized: false, unauthorizedAfterInitialize: false }

function jsonRpcResult(id: number, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

const TOOLS = [
  { name: 'now-time-info', description: '时间' },
  { name: 'query-meals', description: '菜单' },
  { name: 'calculate-price', description: '计价' },
  { name: 'create-order', description: '下单（写操作）' },
]

const server: Server = createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      id: number
      method: string
      params?: Record<string, unknown>
    }
    state.calls.push({ method: body.method, params: body.params ?? null })
    state.authHeaders.push(req.headers.authorization)
    const wantsSse = String(req.headers.accept ?? '').includes('text/event-stream')

    const sendJson = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    const sendSse = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'text/event-stream' })
      res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`)
    }
    const send = (payload: unknown) => (wantsSse ? sendSse(200, payload) : sendJson(200, payload))

    if (state.unauthorized || (state.unauthorizedAfterInitialize && body.method === 'tools/call')) {
      sendJson(401, jsonRpcResult(body.id, { error: 'unauthorized' }))
      return
    }

    switch (body.method) {
      case 'initialize':
        send(jsonRpcResult(body.id, {
          protocolVersion: '2025-03-26',
          serverInfo: { name: 'fake-mcd-mcp', version: '9.9.9' },
        }))
        return
      case 'notifications/initialized':
        // notification：无响应体，直接 202
        res.writeHead(202)
        res.end()
        return
      case 'tools/list':
        send(jsonRpcResult(body.id, { tools: TOOLS }))
        return
      case 'tools/call': {
        const name = typeof body.params?.name === 'string' ? body.params.name : ''
        const toolArgs = (body.params?.arguments ?? {}) as Record<string, unknown>
        if (name === 'query-meals' && toolArgs.force429) {
          if (state.rateLimitHits === 0) {
            state.rateLimitHits += 1
            res.writeHead(429, { 'retry-after': '0' })
            res.end()
            return
          }
          send(
            jsonRpcResult(body.id, {
              content: [{ type: 'text', text: '{"ok":true,"afterRetry":true}' }],
            }),
          )
          return
        }
        if (name === 'query-meals' && toolArgs.forceError) {
          send(
            jsonRpcResult(body.id, {
              content: [{ type: 'text', text: '门店暂停营业（模拟错误）' }],
              isError: true,
            }),
          )
          return
        }
        send(
          jsonRpcResult(body.id, {
            content: [{ type: 'text', text: JSON.stringify({ tool: name, echo: body.params?.arguments ?? null }) }],
          }),
        )
        return
      }
      default:
        send(jsonRpcResult(body.id, {}))
    }
  })
})

let baseUrl = ''

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  state.calls = []
  state.authHeaders = []
  state.rateLimitHits = 0
  state.unauthorized = false
  state.unauthorizedAfterInitialize = false
})

function makeAdapter(overrides: Partial<McpClientOptions> & { allowWrite?: boolean } = {}) {
  return new HttpMcpAdapter({
    token: 'test-token',
    baseUrl,
    maxRequestsPerMinute: 600,
    maxRetries: 2,
    ...overrides,
  })
}

describe('SSE 解析', () => {
  it('解析多 data 行与多帧', () => {
    const text = 'event: message\ndata: {"a":1}\ndata: {"b":2}\n\n: heartbeat\ndata: {"c":3}\n\n'
    expect(parseSseFrames(text)).toEqual(['{"a":1}\n{"b":2}', '{"c":3}'])
  })

  it('extractJsonRpcMessages 兼容 JSON 数组与单对象', () => {
    expect(extractJsonRpcMessages('[{"id":1}]', 'application/json')).toEqual([{ id: 1 }])
    expect(extractJsonRpcMessages('{"id":1}', 'application/json')).toEqual([{ id: 1 }])
    expect(extractJsonRpcMessages('data: {"id":1}\n\n', 'text/event-stream')).toEqual([{ id: 1 }])
  })
})

describe('HttpMcpAdapter 协议行为', () => {
  it('完整握手并携带 Authorization 头', async () => {
    const adapter = makeAdapter()
    const info = await adapter.initialize()
    expect(info.serverInfo?.name).toBe('fake-mcd-mcp')
    expect(state.calls[0]?.method).toBe('initialize')
    expect(state.authHeaders[0]).toBe('Bearer test-token')
  })

  it('listTools 返回工具清单', async () => {
    const adapter = makeAdapter()
    const tools = await adapter.listTools()
    expect(tools.map((t) => t.name)).toContain('query-meals')
  })

  it('call 解析 MCP content 文本载荷', async () => {
    const adapter = makeAdapter()
    const result = await adapter.call<{ tool: string; echo: unknown }>('query-meals', { scene: 'dine-in' })
    expect(result.tool).toBe('query-meals')
    expect(result.echo).toEqual({ scene: 'dine-in' })
  })

  it('SSE 响应格式同样可解析', async () => {
    // 假服务器根据 Accept 头返回 SSE；默认 accept 已包含 text/event-stream
    const adapter = makeAdapter()
    const result = await adapter.call<{ tool: string }>('now-time-info')
    expect(result.tool).toBe('now-time-info')
  })

  it('写操作工具被拒绝且不发出网络请求', async () => {
    const adapter = makeAdapter()
    await expect(adapter.call('create-order', { items: [] })).rejects.toThrow(ValidationError)
    expect(state.calls.some((c) => c.method === 'tools/call')).toBe(false)
  })

  it('白名单外工具被拒绝', async () => {
    const adapter = makeAdapter()
    await expect(adapter.call('query-my-account')).rejects.toThrow(ValidationError)
  })

  it('allowWrite=true 时仅解除黑名单，白名单外仍拒绝', async () => {
    const adapter = makeAdapter({ allowWrite: true })
    await expect(adapter.call('query-my-account')).rejects.toThrow(ValidationError)
    // create-order 属于黑名单，显式开启后允许（假服务器回显）
    const result = await adapter.call<{ tool: string }>('create-order', {})
    expect(result.tool).toBe('create-order')
  })

  it('429 后指数退避重试并最终成功', async () => {
    const adapter = makeAdapter()
    const result = await adapter.call<{ ok: boolean; afterRetry: boolean }>('query-meals', { force429: true })
    expect(result.afterRetry).toBe(true)
    expect(state.rateLimitHits).toBe(1)
  })

  it('401 直接抛 AuthError，不重试（握手阶段即拦截）', async () => {
    state.unauthorized = true
    const adapter = makeAdapter()
    await expect(adapter.call('query-meals')).rejects.toThrow(AuthError)
    // 401 发生在 initialize 阶段，不会发出 tools/call 请求
    expect(state.calls.some((c) => c.method === 'tools/call')).toBe(false)
  })

  it('初始化后 Token 失效时工具调用抛 AuthError 且不重试', async () => {
    const adapter = makeAdapter()
    await adapter.initialize()
    state.calls = []
    state.authHeaders = []
    state.unauthorizedAfterInitialize = true
    await expect(adapter.call('query-meals')).rejects.toThrow(AuthError)
    expect(state.calls.filter((call) => call.method === 'tools/call')).toHaveLength(1)
  })

  it('isError=true 的工具结果抛 McpProtocolError', async () => {
    const adapter = makeAdapter()
    await expect(adapter.call('query-meals', { forceError: true })).rejects.toThrow(/MCP 工具返回错误结果/)
  })

  it('缺失 Token 时构造即失败', () => {
    expect(() => makeAdapter({ token: '' })).toThrow(AuthError)
  })
})
