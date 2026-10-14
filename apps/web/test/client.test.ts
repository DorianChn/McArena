import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiClientError } from '../src/api/client.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(payload: { ok: boolean; status?: number; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: payload.ok,
        status: payload.status ?? (payload.ok ? 200 : 400),
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () =>
          Promise.resolve(payload.body === undefined ? '' : JSON.stringify(payload.body)),
      }),
    ),
  )
}

const healthBody = {
  status: 'ok',
  service: 'mcarena-api',
  version: '0.1.0',
  dataMode: 'mock',
  dataOrigin: 'mock',
  mcp: { configured: false, url: 'https://mcp.mcd.cn', allowWrite: false },
  uptimeSec: 3,
  time: '2026-10-14T05:00:00.000Z',
}

describe('API 客户端', () => {
  it('成功响应经 zod 契约校验后返回', async () => {
    stubFetch({ ok: true, body: healthBody })
    const health = await api.health()
    expect(health.dataMode).toBe('mock')
    expect(health.mcp.configured).toBe(false)
  })

  it('契约不符的响应被拒绝', async () => {
    stubFetch({ ok: true, body: { ...healthBody, dataMode: 'nope' } })
    await expect(api.health()).rejects.toThrow(ApiClientError)
  })

  it('HTTP 错误映射为 ApiClientError 并保留错误码', async () => {
    stubFetch({ ok: false, status: 404, body: { code: 'NOT_FOUND', message: '比赛不存在' } })
    await expect(api.startMatch({ seed: 1 })).rejects.toMatchObject({
      body: { code: 'NOT_FOUND', message: '比赛不存在' },
    })
  })

  it('网络层失败映射为可用错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    )
    await expect(api.health()).rejects.toThrow(/无法连接 API 服务/)
  })
})
