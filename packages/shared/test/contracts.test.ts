import { describe, expect, it } from 'vitest'
import {
  ArenaDatasetSchema,
  ChallengeSchema,
  MatchResultSchema,
  MenuItemSchema,
  ValidationError,
  canonicalizeMatch,
  parseOrThrow,
  stableStringify,
} from '../src/index.js'
import type { MatchResult } from '../src/index.js'

function makeChallenge() {
  return ChallengeSchema.parse({
    id: 'ch-1',
    seed: 42,
    constraints: {
      people: 2,
      budgetCents: 6000,
      scene: 'dine-in',
    },
    title: '2 人堂食 · 预算 ¥60',
    brief: '为 2 位顾客搭配堂食套餐',
    generatedAt: '2026-10-14T05:00:00.000Z',
  })
}

function makeMenuItem() {
  return MenuItemSchema.parse({
    code: 'burger-001',
    name: '经典汉堡',
    category: '汉堡',
    priceCents: 1500,
    tags: ['burger'],
    available: true,
    nutrition: { kcal: 500, proteinG: 25, fatG: 20, carbG: 45, sodiumMg: 800 },
  })
}

/** 阶段04：单个 Agent 的独立验证报告夹具 */
function verificationFixture(): MatchResult['judge']['verification'] {
  return (['alpha', 'beta'] as const).map((agentId) => ({
    agentId,
    engine: 'mock-dev-scaffold@0.1.0',
    eligible: true,
    priceStatus: 'not-verified' as const,
    officialCostCents: null,
    claimedCostCents: 2000,
    recomputedCostCents: 2000,
    effectiveCostCents: 2000,
    targetAchievement: null,
    verifiedSubtotalCents: 2000,
    verifiedDeliveryCents: 0,
    verifiedDiscountCents: 0,
    validCouponCodes: [],
    responseMs: 0,
    checks: [],
    violations: [],
  }))
}

function makeResult(overrides: Partial<MatchResult> = {}): MatchResult {
  const base: MatchResult = {
    matchId: 'match-1',
    seed: 42,
    challenge: makeChallenge(),
    dataOrigin: 'mock',
    dataset: {
      sourceRef: 'mock://dev-fixtures',
      sha256: null,
      notice: '模拟数据',
      capturedAt: '2026-10-14T05:00:00.000Z',
    },
    agents: [
      {
        agentId: 'alpha',
        name: '预算猎手',
        role: '预算优先',
        engine: 'mock-dev-scaffold',
        engineVersion: '0.1.0',
        status: 'completed',
        dataOrigin: 'mock',
        proposal: null,
        evidence: [],
        startedAt: '2026-10-14T05:00:01.000Z',
        finishedAt: '2026-10-14T05:00:01.100Z',
        toolCalls: [],
        phases: [],
        recovery: { used: false, reason: '' },
      },
      {
        agentId: 'beta',
        name: '营养均衡派',
        role: '营养优先',
        engine: 'mock-dev-scaffold',
        engineVersion: '0.1.0',
        status: 'completed',
        dataOrigin: 'mock',
        proposal: null,
        evidence: [],
        startedAt: '2026-10-14T05:00:01.000Z',
        finishedAt: '2026-10-14T05:00:01.100Z',
        toolCalls: [],
        phases: [],
        recovery: { used: false, reason: '' },
      },
    ],
    judge: {
      dimensions: [
        {
          key: 'budget-control',
          label: '预算控制',
          score: 20,
          max: 25,
          weight: 0.25,
          formula: 'score = 15 + 10 * (1 - total/budget)',
          evidence: [],
        },
      ],
      totalScore: 20,
      totalMax: 100,
      winner: 'alpha',
      headline: '预算猎手胜出',
      notes: [],
      rulesVersion: 'judge-rules/1.1.0',
      experimentId: 'exp_test_00000000',
      costBasis: 'claimed-unverified',
      verification: verificationFixture(),
      agentScores: [
        {
          agentId: 'alpha',
          total: 20,
          dimensions: {
            'requirement-fit': 0,
            'budget-control': 20,
            'nutrition-balance': 0,
            'coupon-usage': 0,
            explainability: 0,
          },
        },
        {
          agentId: 'beta',
          total: 0,
          dimensions: {
            'requirement-fit': 0,
            'budget-control': 0,
            'nutrition-balance': 0,
            'coupon-usage': 0,
            explainability: 0,
          },
        },
      ],
      allViolations: [],
    },
    engineVersions: {
      orchestrator: '0.1.0',
      agentAlpha: 'mock-dev-scaffold@0.1.0',
      agentBeta: 'mock-dev-scaffold@0.1.0',
      judge: 'mock-dev-scaffold@0.1.0',
    },
    createdAt: '2026-10-14T05:00:00.000Z',
    warnings: ['模拟数据'],
  }
  return MatchResultSchema.parse({ ...base, ...overrides })
}

describe('核心契约', () => {
  it('MenuItem 校验通过并填充默认值', () => {
    const item = makeMenuItem()
    expect(item.tags).toEqual(['burger'])
    expect(item.available).toBe(true)
  })

  it('MenuItem 拒绝非法价格', () => {
    const result = MenuItemSchema.safeParse({ code: 'x', name: 'x', category: 'c', priceCents: -1 })
    expect(result.success).toBe(false)
  })

  it('Challenge 约束默认值正确', () => {
    const challenge = makeChallenge()
    expect(challenge.constraints.mustIncludeCodes).toEqual([])
    expect(challenge.constraints.preferCoupons).toBe(true)
  })

  it('ArenaDataset 允许三种来源', () => {
    for (const dataOrigin of ['official-live', 'official-snapshot', 'mock'] as const) {
      const dataset = ArenaDatasetSchema.parse({
        dataOrigin,
        sourceRef: 'test',
        capturedAt: '2026-10-14T05:00:00.000Z',
        menuItems: [makeMenuItem()],
      })
      expect(dataset.dataOrigin).toBe(dataOrigin)
    }
  })

  it('parseOrThrow 失败时抛出 ValidationError 且带路径信息', () => {
    expect(() => parseOrThrow(MenuItemSchema, { code: 'x' }, '餐品')).toThrow(ValidationError)
    try {
      parseOrThrow(MenuItemSchema, { code: 'x' }, '餐品')
    } catch (error) {
      expect((error as Error).message).toContain('餐品 数据校验失败')
      expect((error as Error).message).toContain('name')
    }
  })
})

describe('复现性指纹', () => {
  it('剔除易变字段：不同 matchId/时间戳得到相同指纹', () => {
    const a = canonicalizeMatch(makeResult({ matchId: 'match-a', createdAt: '2026-10-14T06:00:00.000Z' }))
    const b = canonicalizeMatch(makeResult({ matchId: 'match-b', createdAt: '2026-10-15T06:00:00.000Z' }))
    expect(a).toBe(b)
  })

  it('不同 seed 得到不同指纹', () => {
    const a = canonicalizeMatch(makeResult())
    const b = canonicalizeMatch(makeResult({ seed: 43 }))
    expect(a).not.toBe(b)
  })

  it('stableStringify 键序稳定', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
})
