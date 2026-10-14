import { describe, expect, it } from 'vitest'
import {
  MatchOrchestrator,
  MockAgentAlpha,
  MockAgentBeta,
  MockJudgeEngine,
  buildDevelopmentChallenge,
} from '../src/index.js'
import { ArenaDatasetSchema, canonicalizeMatch, createSilentLogger } from '@mcarena/shared'
import type { ArenaDataset } from '@mcarena/shared'

const logger = createSilentLogger()

/** 本地 mock 数据集夹具（不跨包依赖；仅用于本包测试） */
function buildDataset(): ArenaDataset {
  return ArenaDatasetSchema.parse({
    dataOrigin: 'mock',
    sourceRef: 'mock://dev-fixtures',
    capturedAt: '2026-10-14T05:00:00.000Z',
    toolsInvoked: ['query-meals'],
    store: null,
    menuItems: [
      { code: 'item-a', name: '测试餐品 A', category: '汉堡', priceCents: 1500, tags: ['burger'] },
      { code: 'item-b', name: '测试餐品 B', category: '小食', priceCents: 800, tags: ['side'] },
      { code: 'item-c', name: '测试餐品 C', category: '饮品', priceCents: 700, tags: ['drink'] },
    ],
    priceQuotes: [],
    coupons: [],
    timeInfo: null,
    sha256: null,
    notice: '本地测试夹具（模拟数据）',
  })
}

function makeOrchestrator() {
  return new MatchOrchestrator({
    agentAlpha: new MockAgentAlpha(),
    agentBeta: new MockAgentBeta(),
    judge: new MockJudgeEngine(),
    logger,
  })
}

describe('MatchOrchestrator（mock 引擎联调）', () => {
  it('完整跑通 data-source → 双 Agent → judge 流水线', async () => {
    const challenge = buildDevelopmentChallenge(42)
    const run = await makeOrchestrator().run({ challenge, dataset: buildDataset(), seed: 42 })

    expect(run.state).toBe('completed')
    expect(run.result).toBeDefined()
    expect(run.result?.agents).toHaveLength(2)
    expect(run.result?.judge.dimensions.length).toBeGreaterThan(0)
    expect(run.result?.agents[0]?.proposal?.items.length).toBeGreaterThan(0)
    expect(run.events.map((e) => e.type)).toContain('match.completed')
  })

  it('mock 数据集的结果被明确标注（dataOrigin 与 warnings）', async () => {
    const run = await makeOrchestrator().run({
      challenge: buildDevelopmentChallenge(7),
      dataset: buildDataset(),
      seed: 7,
    })

    expect(run.result?.dataOrigin).toBe('mock')
    expect(run.result?.warnings.join(' ')).toContain('模拟数据')
    expect(run.result?.agents.every((agent) => agent.engine === 'mock-dev-scaffold')).toBe(true)
  })

  it('相同输入 → 复现指纹一致（确定性）', async () => {
    const a = await makeOrchestrator().run({
      challenge: buildDevelopmentChallenge(42),
      dataset: buildDataset(),
      seed: 42,
      matchId: 'fixed-id',
    })
    const b = await makeOrchestrator().run({
      challenge: buildDevelopmentChallenge(42),
      dataset: buildDataset(),
      seed: 42,
      matchId: 'fixed-id',
    })

    expect(canonicalizeMatch(a.result!)).toBe(canonicalizeMatch(b.result!))
  })

  it('引擎异常时比赛进入 failed 状态并抛出', async () => {
    const failing = {
      id: 'alpha' as const,
      name: '故障 Agent',
      role: '测试',
      engine: 'failing-engine',
      engineVersion: '0.0.1',
      decide: () => Promise.reject(new Error('模拟引擎故障')),
    }
    const orchestrator = new MatchOrchestrator({
      agentAlpha: failing,
      agentBeta: new MockAgentBeta(),
      judge: new MockJudgeEngine(),
      logger,
    })
    await expect(
      orchestrator.run({ challenge: buildDevelopmentChallenge(1), dataset: buildDataset(), seed: 1 }),
    ).rejects.toThrow('模拟引擎故障')
  })
})
