import { describe, expect, it } from 'vitest'
import type { McdMcpAdapter, McpInitialized, McpToolDefinition } from '../src/types.js'
import { SNAPSHOT_TOOL_SEQUENCE, captureOfficialSnapshot } from '../src/snapshot-capture.js'

/** 记录调用的假适配器：不走网络，验证采集序列与原始响应保真 */
class FakeRecordingAdapter implements McdMcpAdapter {
  readonly mode = 'mock' as const
  readonly calls: Array<{ tool: string; args: Record<string, unknown> }> = []

  initialize(): Promise<McpInitialized> {
    return Promise.resolve({
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'fake-mcd-mcp', version: '9.9.9' },
      instructions: 'fixture',
    })
  }

  listTools(): Promise<McpToolDefinition[]> {
    return Promise.resolve([
      { name: 'now-time-info', description: 'time' },
      { name: 'query-meals', description: 'meals' },
    ])
  }

  call<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ tool, args })
    if (tool === 'query-meal-detail') {
      const code = typeof args.code === 'string' ? args.code : ''
      return Promise.resolve({ code, nutrition: { kcal: 100 } } as T)
    }
    if (tool === 'query-meals') {
      return Promise.resolve({ items: [{ code: 'buger-a' }, { code: 'fries-b' }], total: 2 } as T)
    }
    if (tool === 'campaign-calendar') {
      return Promise.resolve({ campaigns: [] } as T)
    }
    return Promise.resolve({ tool, at: 'fixture' } as T)
  }
}

describe('官方快照采集（P1-5）', () => {
  it('按固定序列调用全部只读工具，并按原样记录响应', async () => {
    const adapter = new FakeRecordingAdapter()
    const captured = await captureOfficialSnapshot(adapter)

    for (const tool of SNAPSHOT_TOOL_SEQUENCE) {
      expect(adapter.calls.map((entry) => entry.tool)).toContain(tool)
      expect(captured.responses[tool]).toEqual(expectedResponseFor(tool))
    }
    expect(captured.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(captured.serverInfo.serverInfo).toEqual({ name: 'fake-mcd-mcp', version: '9.9.9' })
    expect(captured.toolsListed).toHaveLength(2)
    expect(captured.toolsInvoked).toContain('query-meal-detail')
  })

  it('query-meal-detail 采样数量受控（默认 5，可配置 0 关闭）', async () => {
    const adapter = new FakeRecordingAdapter()
    const captured = await captureOfficialSnapshot(adapter, { detailSample: 1 })

    expect(captured.mealDetails).toHaveLength(1)
    expect(captured.mealDetails[0]?.code).toBe('buger-a')
    expect(captured.mealDetails[0]?.response).toEqual({ code: 'buger-a', nutrition: { kcal: 100 } })

    const adapter2 = new FakeRecordingAdapter()
    const captured2 = await captureOfficialSnapshot(adapter2, { detailSample: 0 })
    expect(captured2.mealDetails).toHaveLength(0)
    expect(captured2.toolsInvoked).not.toContain('query-meal-detail')
  })

  it('菜单编码提取失败时安全跳过详情采样（不伪造、不崩溃）', async () => {
    const adapter = new FakeRecordingAdapter()
    const originalCall = adapter.call.bind(adapter)
    adapter.call = <T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> => {
      if (tool === 'query-meals') return Promise.resolve({ unexpectedShape: true } as T)
      return originalCall<T>(tool, args)
    }
    const captured = await captureOfficialSnapshot(adapter)
    expect(captured.mealDetails).toHaveLength(0)
    expect(captured.toolsInvoked).not.toContain('query-meal-detail')
    // 主流程不受影响：其余工具照常采集
    expect(captured.toolsInvoked).toEqual([...SNAPSHOT_TOOL_SEQUENCE])
  })

  it('任一工具调用失败 → 原样抛出，不产出部分快照', async () => {
    const adapter = new FakeRecordingAdapter()
    adapter.call = <T = unknown>(tool: string): Promise<T> => {
      if (tool === 'query-store-coupons') return Promise.reject(new Error('502 bad gateway'))
      return Promise.resolve({ tool } as T)
    }
    await expect(captureOfficialSnapshot(adapter)).rejects.toThrow('502 bad gateway')
  })
})

/** 假适配器各工具的确定性返回（与 FakeRecordingAdapter.call 保持一致） */
function expectedResponseFor(tool: string): unknown {
  if (tool === 'query-meals') return { items: [{ code: 'buger-a' }, { code: 'fries-b' }], total: 2 }
  if (tool === 'campaign-calendar') return { campaigns: [] }
  return { tool, at: 'fixture' }
}
