import { ArenaDatasetSchema, ChallengeSchema, createSilentLogger } from '@mcarena/shared'
import type { ArenaDataset, Challenge, Logger, MenuItem } from '@mcarena/shared'
import type { AgentExecution } from '@mcarena/shared'
import type { AgentEngine } from '../types.js'
import { runAgent } from './agent-runner.js'
import { ReplayPriceOracle } from './price-oracle.js'
import { RuleBasedJudge, totalAgentScore } from './judge.js'
import { OptimizerAgent } from './agents/optimizer-agent.js'
import { SpeedAgent } from './agents/speed-agent.js'

/**
 * 阶段03 官方测试场景与基准对比。
 *
 * 场景清单严格对应验收要求：
 *   ¥20 预算 / ¥30 预算 / ¥50 预算 / 双人套餐 / 指定蛋白质目标 /
 *   指定商品类别 / 优惠券组合 / 没有有效解。
 *
 * 对比指标：有效率、费用、约束满足度、运行时间（真实测量）、工具调用数量。
 * 全部指标来自一次真实执行（runAgent + RuleBasedJudge），不做任何估算。
 */

// ---------------------------------------------------------------- 测试数据集

/** 场景专用测试菜单（与 mock 夹具相互独立，覆盖 ¥6–¥25 价格带） */
export const SCENARIO_MENU: MenuItem[] = [
  {
    code: 'burger-classic',
    name: '经典牛肉堡',
    category: '汉堡',
    priceCents: 1500,
    tags: ['burger', 'beef'],
    available: true,
    nutrition: { kcal: 520, proteinG: 26, fatG: 22, carbG: 45, sodiumMg: 820 },
    description: '测试数据：经典牛肉汉堡',
  },
  {
    code: 'burger-chicken',
    name: '香辣鸡腿堡',
    category: '汉堡',
    priceCents: 1700,
    tags: ['burger', 'chicken', 'spicy'],
    available: true,
    nutrition: { kcal: 560, proteinG: 24, fatG: 25, carbG: 48, sodiumMg: 910 },
  },
  {
    code: 'combo-two',
    name: '双人分享餐',
    category: '套餐',
    priceCents: 2500,
    tags: ['combo', 'value', 'burger', 'drink'],
    available: true,
    nutrition: { kcal: 980, proteinG: 42, fatG: 40, carbG: 96, sodiumMg: 1480 },
  },
  {
    code: 'fries-medium',
    name: '薯条（中）',
    category: '小食',
    priceCents: 800,
    tags: ['side', 'fried'],
    available: true,
    nutrition: { kcal: 320, proteinG: 4, fatG: 15, carbG: 41, sodiumMg: 260 },
  },
  {
    code: 'nuggets-5',
    name: '鸡块（5 块）',
    category: '小食',
    priceCents: 900,
    tags: ['side', 'chicken'],
    available: true,
    nutrition: { kcal: 230, proteinG: 13, fatG: 14, carbG: 13, sodiumMg: 480 },
  },
  {
    code: 'cola-medium',
    name: '可乐（中）',
    category: '饮品',
    priceCents: 700,
    tags: ['drink'],
    available: true,
    nutrition: { kcal: 180, proteinG: 0, fatG: 0, carbG: 45, sodiumMg: 20 },
  },
  {
    code: 'coffee-latte',
    name: '拿铁咖啡',
    category: '饮品',
    priceCents: 1000,
    tags: ['drink', 'hot'],
    available: true,
    nutrition: { kcal: 150, proteinG: 8, fatG: 6, carbG: 18, sodiumMg: 75 },
  },
  {
    code: 'salad-veg',
    name: '蔬菜沙拉',
    category: '轻食',
    priceCents: 1200,
    tags: ['light', 'vegetable'],
    available: true,
    nutrition: { kcal: 150, proteinG: 5, fatG: 7, carbG: 14, sodiumMg: 220 },
  },
  {
    code: 'soup-corn',
    name: '玉米浓汤',
    category: '汤品',
    priceCents: 600,
    tags: ['soup', 'warm'],
    available: true,
    nutrition: { kcal: 140, proteinG: 3, fatG: 5, carbG: 20, sodiumMg: 480 },
  },
  {
    code: 'sundae-strawberry',
    name: '草莓圣代',
    category: '甜品',
    priceCents: 650,
    tags: ['dessert', 'cold'],
    available: true,
    nutrition: { kcal: 210, proteinG: 4, fatG: 6, carbG: 34, sodiumMg: 70 },
  },
]

/** 场景数据集（模拟数据，明确标注；含 2 张券用于「优惠券组合」场景） */
export function buildScenarioDataset(options: { snapshotId?: string } = {}): ArenaDataset {
  return ArenaDatasetSchema.parse({
    dataOrigin: 'mock',
    sourceRef: 'scenario://stage03-fixtures',
    snapshotId: options.snapshotId,
    capturedAt: '2026-10-14T00:00:00.000Z',
    toolsInvoked: ['query-meals', 'query-store-coupons'],
    store: null,
    menuItems: SCENARIO_MENU,
    priceQuotes: [
      {
        quoteId: 'scenario-quote-burger',
        itemCodes: ['burger-classic'],
        subtotalCents: 1500,
        deliveryFeeCents: 0,
        discountCents: 0,
        totalCents: 1500,
        couponCodesApplied: [],
        priceOrigin: 'mock',
      },
    ],
    coupons: [
      {
        code: 'coupon-threshold-30-5',
        name: '满 30 减 5 券',
        type: 'threshold-discount',
        valueCents: 500,
        thresholdCents: 3000,
        applicableTags: [],
      },
      {
        code: 'coupon-side-3',
        name: '小食立减 3 元券',
        type: 'item-discount',
        valueCents: 300,
        thresholdCents: 0,
        applicableTags: ['side'],
      },
    ],
    timeInfo: { iso: '2026-10-14T00:00:00.000Z', timezone: 'Asia/Shanghai', daypart: 'lunch' },
    sha256: null,
    notice: '阶段03 场景测试数据集（模拟数据，非麦当劳官方数据）',
  })
}

// ---------------------------------------------------------------- 场景定义

export interface BenchmarkScenario {
  id: string
  /** 中文场景名 */
  name: string
  description: string
  /** 期望：是否应存在满足全部硬约束的有效解 */
  expectFeasible: boolean
  build: (seed: number) => Challenge
}

function challengeOf(
  seed: number,
  id: string,
  constraints: Challenge['constraints'],
  title: string,
  brief: string,
): Challenge {
  return ChallengeSchema.parse({
    id: `scenario-${id}-${seed}`,
    seed,
    constraints,
    title,
    brief,
    generatedAt: '2026-10-14T00:00:00.000Z',
  })
}

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    id: 'budget-20',
    name: '20 元预算',
    description: '1 人堂食、预算 ¥20、必选经典牛肉堡',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'budget-20',
        {
          people: 1,
          budgetCents: 2000,
          scene: 'dine-in',
          mustIncludeCodes: ['burger-classic'],
          excludedCodes: [],
          requiredTags: [],
          requiredCategories: [],
          preferCoupons: false,
        },
        '20 元预算 · 1 人堂食',
        '预算 ¥20 内完成 1 人点餐，必须包含经典牛肉堡。',
      ),
  },
  {
    id: 'budget-30',
    name: '30 元预算',
    description: '2 人堂食、预算 ¥30、最多 4 种餐品',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'budget-30',
        {
          people: 2,
          budgetCents: 3000,
          scene: 'dine-in',
          maxDistinctItems: 4,
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: [],
          requiredCategories: [],
          preferCoupons: false,
        },
        '30 元预算 · 2 人堂食',
        '预算 ¥30 内完成 2 人点餐，餐品种类不超过 4 种。',
      ),
  },
  {
    id: 'budget-50',
    name: '50 元预算',
    description: '4 人堂食、预算 ¥50、最多 5 种餐品、要求蛋白质 ≥ 60g',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'budget-50',
        {
          people: 4,
          budgetCents: 5000,
          scene: 'dine-in',
          maxDistinctItems: 5,
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: [],
          requiredCategories: [],
          nutritionTarget: { proteinG: 15 },
          preferCoupons: false,
        },
        '50 元预算 · 4 人堂食',
        '预算 ¥50 内完成 4 人点餐，人均蛋白质不低于 15g，种类不超过 5 种。',
      ),
  },
  {
    id: 'two-person-set',
    name: '双人套餐',
    description: '2 人、不限预算、必须包含汉堡/小食/饮品三类',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'two-person-set',
        {
          people: 2,
          scene: 'dine-in',
          maxDistinctItems: 4,
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: ['burger', 'side', 'drink'],
          requiredCategories: [],
          nutritionTarget: { kcal: 500, proteinG: 20 },
          preferCoupons: false,
        },
        '双人套餐 · 2 人堂食',
        '为 2 人搭配一套完整套餐：汉堡 + 小食 + 饮品各至少一件，人均 500kcal、20g 蛋白质。',
      ),
  },
  {
    id: 'protein-target',
    name: '指定蛋白质目标',
    description: '2 人、预算 ¥40、蛋白质 ≥ 50g（合计）',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'protein-target',
        {
          people: 2,
          budgetCents: 4000,
          scene: 'dine-in',
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: [],
          requiredCategories: [],
          nutritionTarget: { proteinG: 25 },
          preferCoupons: false,
        },
        '蛋白质目标 · 2 人',
        '预算 ¥40 内为 2 人点餐，人均蛋白质不低于 25g。',
      ),
  },
  {
    id: 'category-constraint',
    name: '指定商品类别',
    description: '3 人、预算 ¥45、必须包含「汉堡」类别',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'category-constraint',
        {
          people: 3,
          budgetCents: 4500,
          scene: 'dine-in',
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: [],
          requiredCategories: ['汉堡'],
          preferCoupons: false,
        },
        '商品类别约束 · 3 人',
        '预算 ¥45 内为 3 人点餐，套餐中必须出现「汉堡」类别。',
      ),
  },
  {
    id: 'coupon-combo',
    name: '优惠券组合',
    description: '4 人、预算 ¥60、优先用券（数据集含满 30 减 5 + 小食立减 3）',
    expectFeasible: true,
    build: (seed) =>
      challengeOf(
        seed,
        'coupon-combo',
        {
          people: 4,
          budgetCents: 6000,
          scene: 'dine-in',
          maxDistinctItems: 6,
          mustIncludeCodes: [],
          excludedCodes: [],
          requiredTags: ['burger', 'side'],
          requiredCategories: [],
          preferCoupons: true,
        },
        '优惠券组合 · 4 人',
        '预算 ¥60 内为 4 人点餐，须包含汉堡与小食，并尽量使用可用优惠券。',
      ),
  },
  {
    id: 'no-solution',
    name: '没有有效解',
    description: '必选经典牛肉堡（¥15）+ 预算 ¥5 + 2 人：硬约束冲突',
    expectFeasible: false,
    build: (seed) =>
      challengeOf(
        seed,
        'no-solution',
        {
          people: 2,
          budgetCents: 500,
          scene: 'dine-in',
          mustIncludeCodes: ['burger-classic'],
          excludedCodes: [],
          requiredTags: [],
          requiredCategories: [],
          preferCoupons: false,
        },
        '无有效解 · 预算冲突',
        '预算 ¥5 却必须包含 ¥15 的经典牛肉堡并覆盖 2 人：不存在满足全部硬约束的方案。',
      ),
  },
]

// ---------------------------------------------------------------- 单场景执行

export interface AgentScenarioMetrics {
  agentId: 'alpha' | 'beta'
  engine: string
  status: 'completed' | 'failed'
  /** 有效解：有提案且全部约束自检通过 */
  valid: boolean
  proposal: boolean
  totalCents: number | null
  satisfiedChecks: number
  totalChecks: number
  durationMs: number
  toolCallCount: number
  candidateCount: number
  recoveryUsed: boolean
}

export interface ScenarioRunResult {
  scenarioId: string
  scenarioName: string
  seed: number
  expectFeasible: boolean
  alpha: AgentScenarioMetrics
  beta: AgentScenarioMetrics
  /** 裁判总分（满分 100）与胜者 */
  judge: { totalAlpha: number; totalBeta: number; winner: 'alpha' | 'beta' | 'tie' } | null
}

function metricsOf(execution: AgentExecution): AgentScenarioMetrics {
  const proposal = execution.proposal
  const checks = proposal?.constraintChecks ?? []
  return {
    agentId: execution.agentId,
    engine: `${execution.engine}@${execution.engineVersion}`,
    status: execution.status,
    valid: proposal !== null && checks.length > 0 && checks.every((check) => check.satisfied),
    proposal: proposal !== null,
    totalCents: proposal?.totalCents ?? null,
    satisfiedChecks: checks.filter((check) => check.satisfied).length,
    totalChecks: checks.length,
    durationMs: execution.durationMs ?? 0,
    toolCallCount: execution.toolCallCount ?? 0,
    candidateCount: execution.candidateCount ?? 0,
    recoveryUsed: execution.recovery.used,
  }
}

/** 在给定数据集上跑一个场景，返回两个 Agent 的真实执行指标 */
export async function benchmarkScenario(input: {
  scenario: BenchmarkScenario
  dataset: ArenaDataset
  seed?: number
  logger?: Logger
}): Promise<ScenarioRunResult> {
  const { scenario, dataset } = input
  const seed = input.seed ?? 1
  const logger = input.logger ?? createSilentLogger()
  const challenge = scenario.build(seed)
  const priceOracle = new ReplayPriceOracle(dataset)
  const context = { challenge, dataset, logger, priceOracle }

  const [alpha, beta] = await Promise.all([
    runAgent({ agent: new SpeedAgent(), context, recovery: 'propagate', logger }),
    runAgent({ agent: new OptimizerAgent(), context, recovery: 'propagate', logger }),
  ])

  const judgeEngine = new RuleBasedJudge()
  const judgeContext = { challenge, dataset, agents: [alpha, beta] as [AgentExecution, AgentExecution], logger }
  const [scoreAlpha, scoreBeta] = judgeEngine.scoreAgents(judgeContext)
  const judge = await judgeEngine.evaluate(judgeContext)

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    seed,
    expectFeasible: scenario.expectFeasible,
    alpha: metricsOf(alpha),
    beta: metricsOf(beta),
    judge: {
      totalAlpha: Math.round(totalAgentScore(scoreAlpha) * 10) / 10,
      totalBeta: Math.round(totalAgentScore(scoreBeta) * 10) / 10,
      winner: judge.winner,
    },
  }
}

// ---------------------------------------------------------------- 汇总对比

export interface AgentBenchmarkSummary {
  agentId: 'alpha' | 'beta'
  engine: string
  matches: number
  /** 有效率：产出有效解（提案 + 全部约束满足）的场次占比 */
  validCount: number
  validRate: number
  /** 平均费用（仅统计有效解） */
  avgTotalCents: number | null
  /** 约束满足度：全部场次中满足的自检项 / 自检项总数 */
  constraintSatisfaction: { satisfied: number; total: number; rate: number }
  /** 运行时间（真实测量） */
  avgDurationMs: number
  maxDurationMs: number
  /** 工具调用 */
  avgToolCalls: number
  totalToolCalls: number
  /** 决策过程中评估的候选购物车 */
  avgCandidates: number
  recoveryCount: number
  wins: number
}

export interface BenchmarkReport {
  generatedAt: string
  seed: number
  datasetOrigin: ArenaDataset['dataOrigin']
  runs: ScenarioRunResult[]
  summary: [AgentBenchmarkSummary, AgentBenchmarkSummary]
}

function summarize(agentId: 'alpha' | 'beta', runs: ScenarioRunResult[]): AgentBenchmarkSummary {
  const mine = runs.map((run) => (agentId === 'alpha' ? run.alpha : run.beta))
  const valid = mine.filter((entry) => entry.valid)
  const satisfied = mine.reduce((sum, entry) => sum + entry.satisfiedChecks, 0)
  const total = mine.reduce((sum, entry) => sum + entry.totalChecks, 0)
  const durations = mine.map((entry) => entry.durationMs)
  return {
    agentId,
    engine: mine[0]?.engine ?? 'unknown',
    matches: mine.length,
    validCount: valid.length,
    validRate: mine.length === 0 ? 0 : valid.length / mine.length,
    avgTotalCents:
      valid.length === 0 ? null : Math.round(valid.reduce((s, e) => s + (e.totalCents ?? 0), 0) / valid.length),
    constraintSatisfaction: {
      satisfied,
      total,
      rate: total === 0 ? 0 : Math.round((satisfied / total) * 1000) / 1000,
    },
    avgDurationMs: Math.round((durations.reduce((s, d) => s + d, 0) / Math.max(1, mine.length)) * 100) / 100,
    maxDurationMs: durations.length === 0 ? 0 : Math.max(...durations),
    avgToolCalls: Math.round((mine.reduce((s, e) => s + e.toolCallCount, 0) / Math.max(1, mine.length)) * 100) / 100,
    totalToolCalls: mine.reduce((s, e) => s + e.toolCallCount, 0),
    avgCandidates: Math.round((mine.reduce((s, e) => s + e.candidateCount, 0) / Math.max(1, mine.length)) * 100) / 100,
    recoveryCount: mine.filter((entry) => entry.recoveryUsed).length,
    wins: runs.filter((run) => run.judge?.winner === agentId).length,
  }
}

/** 跑全部场景并产出汇总对比报告 */
export async function runBenchmark(input: {
  dataset?: ArenaDataset
  seed?: number
  scenarios?: BenchmarkScenario[]
  logger?: Logger
}): Promise<BenchmarkReport> {
  const dataset = input.dataset ?? buildScenarioDataset()
  const seed = input.seed ?? 1
  const scenarios = input.scenarios ?? BENCHMARK_SCENARIOS
  const logger = input.logger ?? createSilentLogger()
  // 预热：先跑一场不计入统计的对局，排除 JIT / 模块首次加载对耗时测量的影响
  const warmup = scenarios[0]
  if (warmup) {
    try {
      await benchmarkScenario({ scenario: warmup, dataset, seed, logger })
    } catch {
      // 预热失败不影响正式测量（预热本身不参与统计）
    }
  }
  const runs: ScenarioRunResult[] = []
  for (const scenario of scenarios) {
    runs.push(await benchmarkScenario({ scenario, dataset, seed, logger }))
  }
  return {
    generatedAt: new Date().toISOString(),
    seed,
    datasetOrigin: dataset.dataOrigin,
    runs,
    summary: [summarize('alpha', runs), summarize('beta', runs)],
  }
}

/** 人类可读的中文对比表（CLI 与文档复用） */
export function formatBenchmarkReport(report: BenchmarkReport): string {
  const [alpha, beta] = report.summary
  const lines: string[] = []
  lines.push('=== McArena 阶段03 双 Agent 基准对比 ===')
  lines.push(`数据集来源：${report.datasetOrigin}｜种子：${report.seed}｜生成时间：${report.generatedAt}`)
  lines.push('')
  lines.push('【逐场景】')
  for (const run of report.runs) {
    lines.push(
      `• ${run.scenarioName}（${run.scenarioId}）期望${run.expectFeasible ? '有解' : '无解'}：` +
        `α 有效=${run.alpha.valid ? '是' : '否'} ¥${((run.alpha.totalCents ?? 0) / 100).toFixed(2)}｜` +
        `β 有效=${run.beta.valid ? '是' : '否'} ¥${((run.beta.totalCents ?? 0) / 100).toFixed(2)}｜` +
        `裁判 ${run.judge ? `${run.judge.totalAlpha} : ${run.judge.totalBeta} → ${run.judge.winner}` : 'N/A'}`,
    )
    lines.push(
      `    α 耗时 ${run.alpha.durationMs}ms / 候选 ${run.alpha.candidateCount} / 工具调用 ${run.alpha.toolCallCount}；` +
        `β 耗时 ${run.beta.durationMs}ms / 候选 ${run.beta.candidateCount} / 工具调用 ${run.beta.toolCallCount}`,
    )
  }
  lines.push('')
  lines.push('【汇总】')
  const row = (label: string, a: string, b: string): void => {
    lines.push(`  ${label.padEnd(12, '　')} α: ${a.padStart(12)}   β: ${b.padStart(12)}`)
  }
  row('有效率', `${(alpha.validRate * 100).toFixed(0)}%（${alpha.validCount}/${alpha.matches}）`, `${(beta.validRate * 100).toFixed(0)}%（${beta.validCount}/${beta.matches}）`)
  row('平均费用', alpha.avgTotalCents === null ? '—' : `¥${(alpha.avgTotalCents / 100).toFixed(2)}`, beta.avgTotalCents === null ? '—' : `¥${(beta.avgTotalCents / 100).toFixed(2)}`)
  row(
    '约束满足度',
    `${((alpha.constraintSatisfaction.rate || 0) * 100).toFixed(1)}%（${alpha.constraintSatisfaction.satisfied}/${alpha.constraintSatisfaction.total}）`,
    `${((beta.constraintSatisfaction.rate || 0) * 100).toFixed(1)}%（${beta.constraintSatisfaction.satisfied}/${beta.constraintSatisfaction.total}）`,
  )
  row('平均耗时', `${alpha.avgDurationMs}ms`, `${beta.avgDurationMs}ms`)
  row('峰值耗时', `${alpha.maxDurationMs}ms`, `${beta.maxDurationMs}ms`)
  row('平均工具调用', `${alpha.avgToolCalls}`, `${beta.avgToolCalls}`)
  row('平均候选数', `${alpha.avgCandidates}`, `${beta.avgCandidates}`)
  row('胜场', `${alpha.wins}`, `${beta.wins}`)
  lines.push('')
  lines.push(`注：α = ${alpha.engine}，β = ${beta.engine}；耗时为真实测量值。`)
  return lines.join('\n')
}

export type { AgentEngine }
