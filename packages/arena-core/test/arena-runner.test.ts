import { describe, expect, it } from 'vitest'
import { ChallengeConstraintsSchema, MatchResultSchema, canonicalizeMatch } from '@mcarena/shared'
import type { MatchResult } from '@mcarena/shared'
import { buildScenarioDataset, renderMatchHtml, runArenaMatch } from '../src/index.js'

/**
 * 阶段06：单局运行器与 HTML 战报测试。
 *
 * runArenaMatch 是 Web API / CLI / Skill 共用的唯一「跑一局」入口，
 * 因此这里验证：真实产出 MatchResult、复现性、自定义约束生效、无解场景判定、HTML 转义。
 */

const dataset = buildScenarioDataset()

describe('runArenaMatch（共享单局运行器）', () => {
  it('产出完整 MatchResult（mock 数据集，双方引擎不同）', async () => {
    const outcome = await runArenaMatch({ dataset, seed: 42 })
    expect(outcome.error).toBeUndefined()
    const result = MatchResultSchema.parse(outcome.result)
    expect(result.dataOrigin).toBe('mock')
    expect(result.agents).toHaveLength(2)
    expect(result.agents[0]?.engine).toBe('speed-greedy')
    expect(result.agents[1]?.engine).toBe('optimizer-search')
    expect(result.judge.experimentId.startsWith('exp_')).toBe(true)
    expect(result.judge.rulesVersion).toBe('judge-rules/1.1.0')
    expect(result.warnings.join(' ')).toContain('非麦当劳官方数据')
  })

  it('复现性：同种子两次运行指纹一致', async () => {
    const a = await runArenaMatch({ dataset, seed: 7 })
    const b = await runArenaMatch({ dataset, seed: 7 })
    expect(a.result).not.toBeNull()
    expect(b.result).not.toBeNull()
    expect(canonicalizeMatch(a.result!)).toBe(canonicalizeMatch(b.result!))
    expect(a.result!.judge.experimentId).toBe(b.result!.judge.experimentId)
  })

  it('自定义约束生效：任务卡与约束一致', async () => {
    const constraints = ChallengeConstraintsSchema.parse({
      people: 3,
      budgetCents: 4500,
      scene: 'dine-in',
      requiredTags: ['burger'],
      preferCoupons: true,
    })
    const outcome = await runArenaMatch({ dataset, seed: 11, constraints })
    const result = MatchResultSchema.parse(outcome.result)
    expect(result.challenge.title).toContain('自定义挑战')
    expect(result.challenge.constraints.people).toBe(3)
    expect(result.challenge.constraints.budgetCents).toBe(4500)
    expect(result.challenge.constraints.requiredTags).toEqual(['burger'])
  })

  it('无解场景（预算 ¥5 + 必选 ¥15 汉堡 + 2 人）→ 双方失格、判平局', async () => {
    const constraints = ChallengeConstraintsSchema.parse({
      people: 2,
      budgetCents: 500,
      scene: 'dine-in',
      mustIncludeCodes: ['burger-classic'],
      preferCoupons: false,
    })
    const outcome = await runArenaMatch({ dataset, seed: 9, constraints })
    const result = MatchResultSchema.parse(outcome.result)
    expect(result.judge.winner).toBe('tie')
    expect(result.judge.verification.every((entry) => entry.eligible === false)).toBe(true)
    expect(result.judge.headline).toContain('无人胜出')
  })

  it('不同种子产出不同任务卡（随机但可复现）', async () => {
    const a = await runArenaMatch({ dataset, seed: 1 })
    const b = await runArenaMatch({ dataset, seed: 2 })
    expect(a.challenge.id).not.toBe(b.challenge.id)
    expect(a.result).not.toBeNull()
    expect(b.result).not.toBeNull()
  })

  it('事件序列包含完整阶段（含 match.completed）', async () => {
    const outcome = await runArenaMatch({ dataset, seed: 3 })
    const types = outcome.events.map((event) => event.type)
    expect(types).toContain('match.created')
    expect(types).toContain('agent.completed')
    expect(types).toContain('match.completed')
  })
})

describe('renderMatchHtml（自包含战报）', () => {
  it('渲染关键信息且不含未转义标签', async () => {
    const outcome = await runArenaMatch({ dataset, seed: 42 })
    const html = renderMatchHtml(outcome.result!, {
      reproducibleConfig: { seed: 42, mode: 'mock' },
      title: '测试战报',
    })
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('麦门 AI 竞技场')
    expect(html).toContain('极速猎手')
    expect(html).toContain('深度优化师')
    expect(html).toContain('裁判结论')
    expect(html).toContain('可复现配置')
    expect(html).toContain('非麦当劳官方产品')
    expect(html).toContain(outcome.result!.judge.experimentId)
    // 自包含：无外部资源引用
    expect(html).not.toContain('<script')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
  })

  it('对注入内容做 HTML 转义', () => {
    const outcome = { ...buildResultStub(), warnings: ['<script>alert(1)</script>'] }
    const html = renderMatchHtml(outcome as unknown as MatchResult)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})

/** 构造一个最小可渲染的 MatchResult 存根（仅用于转义测试） */
function buildResultStub() {
  return {
    matchId: 'match_test',
    seed: 1,
    challenge: {
      id: 'c1',
      seed: 1,
      constraints: {
        people: 1,
        scene: 'dine-in',
        mustIncludeCodes: [],
        excludedCodes: [],
        requiredTags: [],
        requiredCategories: [],
        preferCoupons: false,
      },
      title: 't',
      brief: 'b',
      generatedAt: '2026-10-14T00:00:00.000Z',
    },
    dataOrigin: 'mock',
    dataset: { sourceRef: 'x', sha256: null, notice: '', capturedAt: '2026-10-14T00:00:00.000Z' },
    agents: [
      agentStub('alpha'),
      agentStub('beta'),
    ],
    judge: {
      dimensions: [{ key: 'requirement-fit', label: '需求满足度', score: 0, max: 30, weight: 0.3, formula: 'f', evidence: [] }],
      totalScore: 0,
      totalMax: 100,
      winner: 'tie',
      headline: 'h',
      notes: [],
      rulesVersion: 'judge-rules/1.1.0',
      experimentId: 'exp_test',
      costBasis: 'claimed-unverified',
      verification: [verificationStub('alpha'), verificationStub('beta')],
      agentScores: [
        { agentId: 'alpha', total: 0, dimensions: { 'requirement-fit': 0, 'budget-control': 0, 'nutrition-balance': 0, 'coupon-usage': 0, explainability: 0 } },
        { agentId: 'beta', total: 0, dimensions: { 'requirement-fit': 0, 'budget-control': 0, 'nutrition-balance': 0, 'coupon-usage': 0, explainability: 0 } },
      ],
      allViolations: [],
    },
    engineVersions: { orchestrator: '0', agentAlpha: 'a', agentBeta: 'b', judge: 'j' },
    createdAt: '2026-10-14T00:00:00.000Z',
    warnings: [],
  }
}

function agentStub(agentId: 'alpha' | 'beta') {
  return {
    agentId,
    name: agentId,
    role: 'r',
    engine: 'e',
    engineVersion: '1',
    status: 'completed',
    dataOrigin: 'mock',
    proposal: null,
    evidence: [],
    startedAt: '2026-10-14T00:00:00.000Z',
    finishedAt: '2026-10-14T00:00:00.000Z',
    durationMs: 0,
    candidateCount: 0,
    toolCallCount: 0,
    toolCalls: [],
    phases: [],
    recovery: { used: false, reason: '' },
  }
}

function verificationStub(agentId: 'alpha' | 'beta') {
  return {
    agentId,
    engine: 'e',
    eligible: true,
    priceStatus: 'not-verified' as const,
    officialCostCents: null,
    claimedCostCents: null,
    recomputedCostCents: null,
    effectiveCostCents: null,
    targetAchievement: null,
    verifiedSubtotalCents: null,
    verifiedDeliveryCents: null,
    verifiedDiscountCents: null,
    validCouponCodes: [],
    responseMs: 0,
    checks: [],
    violations: [],
  }
}
