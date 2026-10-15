// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HealthResponseSchema, SnapshotInfoResponseSchema } from '@mcarena/shared'

const { startMatch } = vi.hoisted(() => ({ startMatch: vi.fn() }))
vi.mock('../src/state/match.js', () => ({ useApp: () => ({ startMatch }) }))

import { DataStatusCard } from '../src/pages/HomePage.js'
import { Radar } from '../src/components/ui/Radar.js'
import { SetupPage as ChallengeSetupPage } from '../src/pages/SetupPage.js'

afterEach(() => {
  cleanup()
  startMatch.mockReset()
})

const health = HealthResponseSchema.parse({
  status: 'ok',
  service: 'mcarena-api',
  version: '0.1.0',
  dataMode: 'mock',
  dataOrigin: 'mock',
  mcp: { configured: false, url: 'https://mcp.mcd.cn', allowWrite: false },
  uptimeSec: 10,
  time: '2026-10-14T00:00:00.000Z',
})

const snapshot = SnapshotInfoResponseSchema.parse({
  dataOrigin: 'mock',
  sourceRef: 'mock://test-fixture',
  capturedAt: '2026-10-14T00:00:00.000Z',
  sha256: null,
  notice: '模拟数据，不是官方菜单',
  menuItemCount: 4,
  couponCount: 1,
  toolsInvoked: [],
})

describe('React UI', () => {
  it('数据状态卡清楚区分模拟数据并展示菜单统计', () => {
    render(<DataStatusCard health={health} snapshot={snapshot} snapshotError={null} />)
    expect(screen.getByText('模拟数据（已标注）')).toBeTruthy()
    expect(screen.getByText(/餐品 4 项/)).toBeTruthy()
    expect(screen.getByText('模拟数据，不是官方菜单')).toBeTruthy()
  })

  it('数据状态卡无健康响应时显示加载状态', () => {
    render(<DataStatusCard health={null} snapshot={null} snapshotError={null} />)
    expect(screen.getByText('正在读取服务状态…')).toBeTruthy()
  })

  it('雷达图提供包含维度与数据的无障碍文本', () => {
    render(<Radar dimensions={['预算', '营养']} maxes={[10, 20]} series={[{ name: 'Agent α', values: [8, 15], color: '#c00' }]} />)
    expect(screen.getByRole('img', { name: /Agent α：预算 8.0、营养 15.0/ })).toBeTruthy()
  })

  it('挑战设置拒绝小数种子且不发起比赛', () => {
    render(<ChallengeSetupPage navigate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('留空则随机生成'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: /开始对决/ }))
    expect(screen.getByRole('alert').textContent).toContain('种子必须是整数')
    expect(startMatch).not.toHaveBeenCalled()
  })

  it('挑战设置预设会提交对应的真实约束对象', () => {
    startMatch.mockResolvedValue(null)
    render(<ChallengeSetupPage navigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /¥20 一人食/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始对决/ }))
    expect(startMatch).toHaveBeenCalledTimes(1)
    // 用 toMatchObject 做子集匹配：避免嵌套 expect.objectContaining（其返回 any 会触发 no-unsafe-assignment）
    expect(startMatch.mock.calls[0]?.[0]).toMatchObject({
      seed: 21,
      constraints: { people: 1, budgetCents: 2000, scene: 'dine-in' },
    })
  })
})
