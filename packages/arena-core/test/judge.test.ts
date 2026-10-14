import { describe, expect, it } from 'vitest'
import {
  AgentExecutionSchema,
  ArenaDatasetSchema,
  ChallengeSchema,
  EvidenceRecordSchema,
  JudgeResultSchema,
  MatchResultSchema,
  canonicalizeMatch,
  createSilentLogger,
} from '@mcarena/shared'
import type { AgentExecution, ArenaDataset, Challenge, MealProposal } from '@mcarena/shared'
import { MatchOrchestrator, RuleBasedJudge, SpeedAgent, OptimizerAgent } from '../src/index.js'
import { buildScenarioDataset } from '../src/engine/scenarios.js'
import { ReplayPriceOracle } from '../src/engine/price-oracle.js'
import type { JudgeContext, PriceOracle } from '../src/types.js'

// ---------------------------------------------------------------- 测试夹具

const TS = '2026-10-14T05:00:00.000Z'
const logger = createSilentLogger()

function buildMenu(sha256: string | null = null): ArenaDataset {
  return ArenaDatasetSchema.parse({
    dataOrigin: 'mock',
    sourceRef: 'judge-fixture://judge',
    capturedAt: TS,
    toolsInvoked: ['query-meals', 'query-store-coupons'],
    store: null,
    menuItems: [
      {
        code: 'burger',
        name: '测试汉堡',
        category: '汉堡',
        priceCents: 1500,
        tags: ['burger'],
        available: true,
        nutrition: { kcal: 500, proteinG: 25, sodiumMg: 800 },
      },
      {
        code: 'fries',
        name: '测试薯条',
        category: '小食',
        priceCents: 800,
        tags: ['side'],
        available: true,
        nutrition: { kcal: 300, proteinG: 4, sodiumMg: 250 },
      },
      {
        code: 'cola',
        name: '测试可乐',
        category: '饮品',
        priceCents: 700,
        tags: ['drink'],
        available: true,
        nutrition: { kcal: 180, proteinG: 0, sodiumMg: 20 },
      },
    ],
    priceQuotes: [],
    coupons: [
      {
        code: 'coupon-threshold',
        name: '满 20 减 3 券',
        type: 'threshold-discount',
        valueCents: 300,
        thresholdCents: 2000,
        applicableTags: [],
      },
    ],
    timeInfo: null,
    sha256,
    notice: '裁判测试夹具（模拟数据）',
  })
}

function buildChallenge(overrides: Partial<Challenge['constraints']> = {}): Challenge {
  return ChallengeSchema.parse({
    id: 'judge-challenge-1',
    seed: 1,
    constraints: {
      people: 1,
      budgetCents: 3000,
      scene: 'dine-in',
      ...overrides,
    },
    title: '测试任务卡',
    brief: '裁判规则测试用',
    generatedAt: TS,
  })
}

/** 夹具餐品单价表（与 buildMenu 一致） */
const PRICE_BY_CODE: Record<string, number> = { burger: 1500, fries: 800, cola: 700 }

function item(code: string, qty = 1, priceCents?: number): MealProposal['items'][number] {
  const price = priceCents ?? PRICE_BY_CODE[code] ?? 1500
  return {
    code,
    name: `餐品 ${code}`,
    qty,
    unitPriceCents: price,
    lineTotalCents: price * qty,
  }
}

function proposal(overrides: Partial<MealProposal> = {}): MealProposal {
  const items = overrides.items ?? [item('burger')]
  const subtotal = items.reduce((sum, entry) => sum + entry.lineTotalCents, 0)
  return {
    items,
    subtotalCents: subtotal,
    deliveryFeeCents: 0,
    discountCents: 0,
    totalCents: subtotal,
    couponCodes: [],
    constraintChecks: [],
    priceOrigin: 'mock',
    ...overrides,
  }
}

function fullEvidence(): AgentExecution['evidence'] {
  return (
    [
      ['data-source', '数据来源'],
      ['selection', '选择策略'],
      ['price', '计价'],
      ['constraint-check', '约束检查'],
    ] as const
  ).map(([kind, message], index) =>
    EvidenceRecordSchema.parse({ id: `e${index}`, kind, message, at: TS }),
  )
}

function agent(
  agentId: 'alpha' | 'beta',
  name: string,
  overrides: Partial<AgentExecution> = {},
): AgentExecution {
  return AgentExecutionSchema.parse({
    agentId,
    name,
    role: '测试',
    engine: agentId === 'alpha' ? 'speed-greedy' : 'optimizer-search',
    engineVersion: '1.0.0',
    status: 'completed',
    dataOrigin: 'mock',
    proposal: proposal(),
    evidence: fullEvidence(),
    startedAt: TS,
    finishedAt: TS,
    durationMs: 10,
    toolCalls: [],
    phases: [],
    recovery: { used: false, reason: '' },
    ...overrides,
  })
}

/** 按购物车内容分别报价的预言机 */
function perCartOracle(prices: Record<string, number>): PriceOracle {
  return {
    quote: (cart) => {
      const key = cart.items
        .map((i) => `${i.code}x${i.qty}`)
        .sort()
        .join('+')
      const total = prices[key]
      if (total === undefined) return Promise.resolve(null)
      return Promise.resolve({
        quoteId: `q-${key}`,
        itemCodes: cart.items.map((i) => i.code),
        subtotalCents: total,
        deliveryFeeCents: 0,
        discountCents: 0,
        totalCents: total,
        couponCodesApplied: [],
        priceOrigin: 'mock' as const,
      })
    },
  }
}

function contextOf(input: {
  challenge?: Challenge
  dataset?: ArenaDataset
  agents: [AgentExecution, AgentExecution]
  priceOracle?: PriceOracle
  seed?: number
}): JudgeContext {
  return {
    challenge: input.challenge ?? buildChallenge(),
    dataset: input.dataset ?? buildMenu(),
    agents: input.agents,
    logger,
    priceOracle: input.priceOracle,
    seed: input.seed ?? 1,
  }
}

const judge = new RuleBasedJudge()

describe('RuleBasedJudge：独立验证（不信任 Agent 自述）', () => {
  it('Agent 自述全部满足但实际缺必选餐品 → 需求满足度按裁判校验扣分', async () => {
    const liar = agent('alpha', '虚报 Agent', {
      proposal: proposal({
        items: [item('cola')],
        constraintChecks: [
          { name: '必选餐品：fries', satisfied: true, detail: '虚报：已包含' },
          { name: '预算约束', satisfied: true, detail: '虚报：满足' },
        ],
      }),
    })
    const honest = agent('beta', '诚实 Agent', { proposal: proposal({ items: [item('burger'), item('fries')] }) })
    const result = await judge.evaluate(
      contextOf({
        challenge: buildChallenge({ mustIncludeCodes: ['fries'] }),
        agents: [liar, honest],
      }),
    )
    // 裁判校验：α 缺必选 fries → 未通过项计入 checks，requirement-fit 非满分
    const alphaFit = result.verification[0]!
    expect(alphaFit.eligible).toBe(false) // 虚报导致致命违规
    expect(alphaFit.checks.find((c) => c.name === '必选餐品：fries')?.passed).toBe(false)
    const requirementDim = result.dimensions.find((d) => d.key === 'requirement-fit')
    expect(requirementDim?.score).toBeLessThan(30)
  })

  it('预算控制维度使用裁判重算成本，而非 Agent 自述 totalCents', async () => {
    // α 自述 ¥5，但重算成本 ¥23 → budget-control 必须按 ¥23 判定
    const cheapTalker = agent('alpha', '虚报低价 Agent', {
      proposal: proposal({
        items: [item('burger'), item('fries')],
        subtotalCents: 500,
        totalCents: 500,
      }),
    })
    const normal = agent('beta', '正常 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const result = await judge.evaluate(
      contextOf({ challenge: buildChallenge({ budgetCents: 3000 }), agents: [cheapTalker, normal] }),
    )
    expect(result.verification[0]!.effectiveCostCents).toBe(2300)
    expect(result.verification[0]!.claimedCostCents).toBe(500)
  })
})

describe('RuleBasedJudge：资格硬门槛', () => {
  it('无效方案不能凭低价赢：α 有致命违规且成本极低 → β 胜出', async () => {
    const invalid = agent('alpha', '违规 Agent', {
      proposal: proposal({ items: [item('ghost', 1, 100)] }),
    })
    const valid = agent('beta', '有效 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const result = await judge.evaluate(contextOf({ agents: [invalid, valid] }))
    expect(result.winner).toBe('beta')
    expect(result.headline).toContain('无效方案不能凭低价取胜')
    expect(result.verification[0]!.eligible).toBe(false)
    expect(result.verification[1]!.eligible).toBe(true)
  })

  it('双方均有致命违规 → 平局，headline 说明无人胜出', async () => {
    const a = agent('alpha', '甲', { proposal: proposal({ items: [item('ghost-a', 1, 100)] }) })
    const b = agent('beta', '乙', { proposal: proposal({ items: [item('ghost-b', 1, 200)] }) })
    const result = await judge.evaluate(contextOf({ agents: [a, b] }))
    expect(result.winner).toBe('tie')
    expect(result.headline).toContain('无人胜出')
    expect(result.notes.join('')).toContain('失去获胜资格')
  })

  it('一方无提案（空结果）→ 另一方胜出', async () => {
    const empty = agent('alpha', '空结果 Agent', { proposal: null })
    const valid = agent('beta', '有效 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const result = await judge.evaluate(contextOf({ agents: [empty, valid] }))
    expect(result.winner).toBe('beta')
    expect(result.verification[0]!.violations.map((v) => v.code)).toContain('empty-proposal')
  })
})

describe('RuleBasedJudge：成本比较', () => {
  it('双方均通过官方核价 → 已验证成本低者胜', async () => {
    const cheap = agent('alpha', '低价 Agent', { proposal: proposal({ items: [item('cola')] }) })
    const pricey = agent('beta', '高价 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const result = await judge.evaluate(
      contextOf({
        agents: [cheap, pricey],
        priceOracle: perCartOracle({ 'colax1': 700, 'burgerx1': 1500 }),
      }),
    )
    expect(result.costBasis).toBe('official-verified')
    expect(result.winner).toBe('alpha')
    expect(result.headline).toContain('官方')
  })

  it('仅一方通过官方核价 → 核验方胜（另一方 NOT_VERIFIED）', async () => {
    const verified = agent('alpha', '已核价 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const unverified = agent('beta', '未核价 Agent', { proposal: proposal({ items: [item('cola')] }) })
    const result = await judge.evaluate(
      contextOf({
        agents: [verified, unverified],
        priceOracle: perCartOracle({ 'burgerx1': 1500 }), // cola 购物车无记录
      }),
    )
    expect(result.costBasis).toBe('claimed-unverified')
    expect(result.winner).toBe('alpha')
    expect(result.notes.join('')).toContain('NOT_VERIFIED')
  })

  it('双方均无官方核价 → 按裁判重算成本比较，costBasis = claimed-unverified', async () => {
    const cheap = agent('alpha', '低价 Agent', { proposal: proposal({ items: [item('cola')] }) })
    const pricey = agent('beta', '高价 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const result = await judge.evaluate(contextOf({ agents: [cheap, pricey] }))
    expect(result.costBasis).toBe('claimed-unverified')
    expect(result.winner).toBe('alpha')
    expect(result.verification.every((v) => v.priceStatus === 'not-verified')).toBe(true)
  })

  it('申报价与官方价不一致 → mismatch 采用官方值参与比较', async () => {
    // α 自述 ¥99，官方 ¥500；β 重算 ¥700 无核价 → α 的官方 ¥500 更低
    const liar = agent('alpha', '虚报 Agent', {
      proposal: proposal({ items: [item('cola')], totalCents: 99 }),
    })
    const other = agent('beta', '乙方', { proposal: proposal({ items: [item('burger'), item('fries')] }) })
    const result = await judge.evaluate(
      contextOf({ agents: [liar, other], priceOracle: perCartOracle({ 'colax1': 500 }) }),
    )
    expect(result.verification[0]!.priceStatus).toBe('mismatch')
    expect(result.verification[0]!.effectiveCostCents).toBe(500)
    expect(result.winner).toBe('alpha')
  })
})

describe('RuleBasedJudge：次级维度与平局', () => {
  it('成本相同 → 营养/目标达成率高者胜', async () => {
    // 双方重算成本均 ¥23（burger+fries），但营养达成不同
    const lowNutrition = agent('alpha', '低营养 Agent', { proposal: proposal({ items: [item('cola'), item('fries')] }) })
    const highNutrition = agent('beta', '高营养 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const result = await judge.evaluate(
      contextOf({
        challenge: buildChallenge({ nutritionTarget: { kcal: 500 } }),
        agents: [lowNutrition, highNutrition],
        priceOracle: perCartOracle({ 'colax1+friesx1': 1500, 'burgerx1': 1500 }),
      }),
    )
    expect(result.verification[0]!.effectiveCostCents).toBe(result.verification[1]!.effectiveCostCents)
    expect(result.winner).toBe('beta')
    expect(result.headline).toContain('达成率')
  })

  it('成本与营养都相同 → 响应时间短者胜（真实测量值）', async () => {
    const slow = agent('alpha', '慢 Agent', { proposal: proposal({ items: [item('burger')] }), durationMs: 50 })
    const fast = agent('beta', '快 Agent', { proposal: proposal({ items: [item('fries'), item('cola')] }), durationMs: 5 })
    const result = await judge.evaluate(
      contextOf({
        agents: [slow, fast],
        priceOracle: perCartOracle({ 'burgerx1': 1500, 'colax1+friesx1': 1500 }),
      }),
    )
    expect(result.verification[0]!.effectiveCostCents).toBe(result.verification[1]!.effectiveCostCents)
    expect(result.winner).toBe('beta')
    expect(result.headline).toContain('响应时间')
  })

  it('资格/成本/营养/速度全部一致 → 平局', async () => {
    const a = agent('alpha', '甲', { proposal: proposal({ items: [item('burger')] }), durationMs: 7 })
    const b = agent('beta', '乙', { proposal: proposal({ items: [item('burger')] }), durationMs: 7 })
    const result = await judge.evaluate(contextOf({ agents: [a, b] }))
    expect(result.winner).toBe('tie')
    expect(result.headline).toContain('战平')
  })
})

describe('RuleBasedJudge：可解释报告', () => {
  it('experimentId 对相同输入完全确定', async () => {
    const agents: [AgentExecution, AgentExecution] = [
      agent('alpha', '甲', { proposal: proposal({ items: [item('burger'), item('fries')] }) }),
      agent('beta', '乙', { proposal: proposal({ items: [item('cola')] }) }),
    ]
    const a = await judge.evaluate(contextOf({ agents, seed: 42 }))
    const b = await judge.evaluate(contextOf({ agents, seed: 42 }))
    expect(a.experimentId).toBe(b.experimentId)
    expect(a.experimentId).toMatch(/^exp_[0-9a-f]{16}$/)
  })

  it('experimentId 随数据集指纹变化', async () => {
    const agents: [AgentExecution, AgentExecution] = [
      agent('alpha', '甲'),
      agent('beta', '乙', { proposal: proposal({ items: [item('cola')] }) }),
    ]
    const a = await judge.evaluate(contextOf({ agents, dataset: buildMenu('sha-a') }))
    const b = await judge.evaluate(contextOf({ agents, dataset: buildMenu('sha-b') }))
    expect(a.experimentId).not.toBe(b.experimentId)
  })

  it('allViolations 扁平汇总并带 agentId', async () => {
    const badAlpha = agent('alpha', '违规 Agent', { proposal: proposal({ items: [item('ghost')] }) })
    const badBeta = agent('beta', '违规 Agent', {
      proposal: proposal({ items: [item('cola')] }),
    })
    const result = await judge.evaluate(
      contextOf({
        challenge: buildChallenge({ mustIncludeCodes: ['burger'] }),
        agents: [badAlpha, badBeta],
      }),
    )
    expect(result.allViolations.length).toBeGreaterThanOrEqual(2)
    for (const violation of result.allViolations) {
      expect(['alpha', 'beta']).toContain(violation.agentId)
      expect(violation.message.length).toBeGreaterThan(0)
    }
    expect(result.allViolations.some((v) => v.agentId === 'alpha' && v.code === 'unknown-item')).toBe(true)
    expect(result.allViolations.some((v) => v.agentId === 'beta' && v.code === 'missing-required-code')).toBe(true)
  })

  it('五维结构与满分 100 的权重符合规范', async () => {
    const result = await judge.evaluate(
      contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙', { proposal: proposal({ items: [item('cola')] }) })] }),
    )
    expect(result.dimensions).toHaveLength(5)
    const expected = new Map<string, [number, number]>([
      ['requirement-fit', [30, 0.3]],
      ['budget-control', [25, 0.25]],
      ['nutrition-balance', [20, 0.2]],
      ['coupon-usage', [15, 0.15]],
      ['explainability', [10, 0.1]],
    ])
    let sumMax = 0
    for (const dimension of result.dimensions) {
      const meta = expected.get(dimension.key)
      expect(meta).toBeDefined()
      expect(dimension.max).toBe(meta![0])
      expect(dimension.weight).toBeCloseTo(meta![1], 6)
      expect(dimension.score).toBeGreaterThanOrEqual(0)
      expect(dimension.score).toBeLessThanOrEqual(dimension.max)
      expect(dimension.formula.length).toBeGreaterThan(0)
      sumMax += dimension.max
    }
    expect(sumMax).toBe(100)
    expect(result.totalMax).toBe(100)
  })

  it('每个维度给出双方证据引用', async () => {
    const result = await judge.evaluate(
      contextOf({ agents: [agent('alpha', '极速猎手'), agent('beta', '深度优化师')] }),
    )
    for (const dimension of result.dimensions) {
      expect(dimension.evidence.length).toBe(2)
      expect(dimension.evidence[0]?.message).toContain('极速猎手')
      expect(dimension.evidence[1]?.message).toContain('深度优化师')
    }
  })

  it('notes 说明评分规则版本与判定顺序', async () => {
    const result = await judge.evaluate(
      contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙')] }),
    )
    const notes = result.notes.join('\n')
    expect(notes).toContain('judge-rules/1.1.0')
    expect(notes).toContain('资格 → 已验证成本 → 营养/目标达成率 → 响应速度')
    expect(notes).toContain('不采信 Agent 自述')
  })

  it('无预算时预算控制按 15 分基础分计', async () => {
    const result = await judge.evaluate(
      contextOf({
        challenge: buildChallenge({ budgetCents: undefined }),
        agents: [agent('alpha', '甲'), agent('beta', '乙')],
      }),
    )
    const dim = result.dimensions.find((d) => d.key === 'budget-control')
    expect(dim?.score).toBeGreaterThanOrEqual(15)
  })

  it('超预算 Agent 的预算控制得 0 分并失去资格', async () => {
    const over = agent('alpha', '超支 Agent', { proposal: proposal({ items: [item('burger'), item('fries'), item('cola')] }) })
    const ok = agent('beta', '合规 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const scores = await judge.scoreAgents(
      contextOf({ challenge: buildChallenge({ budgetCents: 2000 }), agents: [over, ok] }),
    )
    expect(scores[0]['budget-control'].score).toBe(0)
    const result = await judge.evaluate(
      contextOf({ challenge: buildChallenge({ budgetCents: 2000 }), agents: [over, ok] }),
    )
    expect(result.verification[0]!.eligible).toBe(false)
  })

  it('无营养目标 → 营养维度中性 10 分', async () => {
    const scores = await judge.scoreAgents(contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙')] }))
    expect(scores[0]['nutrition-balance'].score).toBeCloseTo(10, 6)
  })

  it('有效优惠券进入优惠利用得分', async () => {
    const withCoupon = agent('alpha', '用券 Agent', {
      proposal: proposal({
        items: [item('burger'), item('fries')],
        couponCodes: ['coupon-threshold'],
        discountCents: 300,
        totalCents: 2000,
      }),
    })
    const without = agent('beta', '无券 Agent', { proposal: proposal({ items: [item('burger')] }) })
    const scores = await judge.scoreAgents(contextOf({ agents: [withCoupon, without] }))
    expect(scores[0]['coupon-usage'].score).toBeGreaterThan(0)
    expect(scores[1]['coupon-usage'].score).toBe(0)
  })

  it('证据完整 + 校验说明完整 → 可解释性满分', async () => {
    const scores = await judge.scoreAgents(contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙')] }))
    expect(scores[0].explainability.score).toBeCloseTo(10, 6)
  })

  it('scoreAgents 与 evaluate 的内部评分一致', async () => {
    const agents: [AgentExecution, AgentExecution] = [
      agent('alpha', '甲', { proposal: proposal({ items: [item('burger'), item('fries')] }) }),
      agent('beta', '乙', { proposal: proposal({ items: [item('cola')] }) }),
    ]
    const context = contextOf({ agents })
    const scores = await judge.scoreAgents(context)
    const result = await judge.evaluate(context)
    const totalAlpha = Object.values(scores[0]).reduce((sum, entry) => sum + entry.score, 0)
    const totalBeta = Object.values(scores[1]).reduce((sum, entry) => sum + entry.score, 0)
    expect(result.totalScore).toBeCloseTo(Math.max(totalAlpha, totalBeta), 6)
  })
})

describe('RuleBasedJudge：契约与无效参数', () => {
  it('裁判结果通过 JudgeResultSchema 校验并可 JSON 往返', async () => {
    const result = await judge.evaluate(
      contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙')] }),
    )
    const roundTrip = JudgeResultSchema.parse(JSON.parse(JSON.stringify(result)))
    expect(roundTrip.experimentId).toBe(result.experimentId)
    expect(roundTrip.winner).toBe(result.winner)
    expect(roundTrip.verification).toHaveLength(2)
  })

  it('verification 固定为两个 Agent 各一份', async () => {
    const result = await judge.evaluate(contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙')] }))
    expect(result.verification.map((v) => v.agentId)).toEqual(['alpha', 'beta'])
  })

  it('无效参数（people=0）在契约层被拒绝', () => {
    expect(() =>
      ChallengeSchema.parse({
        id: 'bad',
        seed: 1,
        constraints: { people: 0, scene: 'dine-in' },
        title: '无效',
        brief: '无效',
        generatedAt: TS,
      }),
    ).toThrow()
  })

  it('无效数据集（单价为负）在契约层被拒绝', () => {
    expect(() =>
      ArenaDatasetSchema.parse({
        dataOrigin: 'mock',
        sourceRef: 'x',
        capturedAt: TS,
        menuItems: [
          { code: 'bad', name: '坏餐品', category: '汉堡', priceCents: -1, tags: [] },
        ],
        priceQuotes: [],
        coupons: [],
        notice: '',
      }),
    ).toThrow()
  })

  it('裁判输出的 winner 只能是 alpha/beta/tie（契约约束）', async () => {
    const result = await judge.evaluate(contextOf({ agents: [agent('alpha', '甲'), agent('beta', '乙')] }))
    expect(['alpha', 'beta', 'tie']).toContain(result.winner)
  })
})

describe('RuleBasedJudge：与真实双 Agent 的端到端对局', () => {
  it('真实 Agent + 真实裁判 → 结构合法、可复现、含独立验证', async () => {
    const runOnce = async () => {
      const dataset = buildScenarioDataset()
      const challenge = ChallengeSchema.parse({
        id: 'judge-e2e',
        seed: 3,
        constraints: {
          people: 2,
          budgetCents: 4000,
          scene: 'dine-in',
          maxDistinctItems: 4,
          nutritionTarget: { kcal: 500, proteinG: 20 },
        },
        title: '端到端对局',
        brief: '双 Agent 独立裁判测试',
        generatedAt: TS,
      })
      const orchestrator = new MatchOrchestrator({
        agentAlpha: new SpeedAgent(),
        agentBeta: new OptimizerAgent(),
        judge: new RuleBasedJudge(),
        logger,
      })
      return orchestrator.run({
        challenge,
        dataset,
        seed: 3,
        matchId: 'judge-e2e-fixed',
        priceOracle: new ReplayPriceOracle(dataset),
      })
    }

    const a = await runOnce()
    const b = await runOnce()
    expect(a.state).toBe('completed')
    expect(b.state).toBe('completed')
    const resultA = MatchResultSchema.parse(a.result)
    const resultB = MatchResultSchema.parse(b.result)
    expect(resultA.judge.verification).toHaveLength(2)
    expect(resultA.judge.winner).toBe(resultB.judge.winner)
    expect(resultA.judge.experimentId).toBe(resultB.judge.experimentId)
    expect(canonicalizeMatch(resultA)).toBe(canonicalizeMatch(resultB))
  })

  it('裁判对无效对局（预算冲突场景）给出明确违规说明', async () => {
    const dataset = buildScenarioDataset()
    const challenge = ChallengeSchema.parse({
      id: 'judge-no-solution',
      seed: 5,
      constraints: {
        people: 2,
        budgetCents: 500,
        scene: 'dine-in',
        mustIncludeCodes: ['burger-classic'],
      },
      title: '预算冲突',
      brief: '必选 ¥15 汉堡但预算 ¥5',
      generatedAt: TS,
    })
    const orchestrator = new MatchOrchestrator({
      agentAlpha: new SpeedAgent(),
      agentBeta: new OptimizerAgent(),
      judge: new RuleBasedJudge(),
      logger,
    })
    const run = await orchestrator.run({ challenge, dataset, seed: 5, matchId: 'no-solution-1' })
    const result = MatchResultSchema.parse(run.result)
    expect(result.judge.verification.some((v) => !v.eligible)).toBe(true)
    expect(result.judge.allViolations.some((v) => v.code === 'budget-exceeded')).toBe(true)
    expect(['alpha', 'beta', 'tie']).toContain(result.judge.winner)
  })
})



