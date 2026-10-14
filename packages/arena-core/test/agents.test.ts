import { describe, expect, it } from 'vitest'
import { AgentExecutionSchema, createSilentLogger } from '@mcarena/shared'
import type { AgentExecution, Challenge } from '@mcarena/shared'
import {
  BENCHMARK_SCENARIOS,
  OptimizerAgent,
  ReplayPriceOracle,
  SpeedAgent,
  buildScenarioDataset,
} from '../src/index.js'
import { runAgent } from '../src/engine/agent-runner.js'

/**
 * 阶段03 双 Agent 测试：8 个官方场景 + 算法差异 + 可复现性 + 结构化校验。
 */

const logger = createSilentLogger()

function scenarioOf(id: string): (typeof BENCHMARK_SCENARIOS)[number] {
  const scenario = BENCHMARK_SCENARIOS.find((entry) => entry.id === id)
  if (!scenario) throw new Error(`未找到测试场景 ${id}`)
  return scenario
}

async function runBoth(challenge: Challenge) {
  const dataset = buildScenarioDataset()
  const priceOracle = new ReplayPriceOracle(dataset)
  const [alpha, beta] = await Promise.all([
    runAgent({
      agent: new SpeedAgent(),
      context: { challenge, dataset, logger, priceOracle },
      logger,
    }),
    runAgent({
      agent: new OptimizerAgent(),
      context: { challenge, dataset, logger, priceOracle },
      logger,
    }),
  ])
  return { dataset, alpha, beta }
}

/** 提案有效 = 有提案且全部约束自检通过 */
function isValid(execution: AgentExecution): boolean {
  const checks = execution.proposal?.constraintChecks ?? []
  return execution.proposal !== null && checks.length > 0 && checks.every((check) => check.satisfied)
}

describe('阶段03：8 个官方测试场景', () => {
  it('预算 ¥20：两名 Agent 都产出有效解且不超预算', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-20').build(1))
    expect(isValid(alpha)).toBe(true)
    expect(isValid(beta)).toBe(true)
    const budget = 2000
    expect(alpha.proposal?.totalCents).toBeLessThanOrEqual(budget)
    expect(beta.proposal?.totalCents).toBeLessThanOrEqual(budget)
    // 必选餐品必须出现在两个提案中
    expect(alpha.proposal?.items.some((item) => item.code === 'burger-classic')).toBe(true)
    expect(beta.proposal?.items.some((item) => item.code === 'burger-classic')).toBe(true)
  })

  it('预算 ¥30：两名 Agent 都产出有效解', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-30').build(1))
    expect(isValid(alpha)).toBe(true)
    expect(isValid(beta)).toBe(true)
    expect(alpha.proposal?.totalCents).toBeLessThanOrEqual(3000)
    expect(beta.proposal?.totalCents).toBeLessThanOrEqual(3000)
  })

  it('预算 ¥50：两名 Agent 都产出有效解，且种类不超过上限', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-50').build(1))
    expect(isValid(alpha)).toBe(true)
    expect(isValid(beta)).toBe(true)
    expect(alpha.proposal?.items.length).toBeLessThanOrEqual(5)
    expect(beta.proposal?.items.length).toBeLessThanOrEqual(5)
  })

  it('双人套餐：两名 Agent 都同时覆盖汉堡 / 小食 / 饮品三类', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('two-person-set').build(1))
    expect(isValid(alpha)).toBe(true)
    expect(isValid(beta)).toBe(true)
    const codes = (execution: AgentExecution): string[] =>
      (execution.proposal?.items ?? []).map((item) => item.code)
    for (const execution of [alpha, beta]) {
      expect(codes(execution).some((code) => code.startsWith('burger'))).toBe(true)
      expect(codes(execution).some((code) => code === 'fries-medium' || code === 'nuggets-5')).toBe(true)
      expect(codes(execution).some((code) => code === 'cola-medium' || code === 'coffee-latte')).toBe(true)
    }
  })

  it('指定蛋白质目标：优化器的蛋白质达成率不低于极速版', async () => {
    const { dataset, alpha, beta } = await runBoth(scenarioOf('protein-target').build(1))
    const proteinOf = (execution: AgentExecution): number =>
      (execution.proposal?.items ?? []).reduce(
        (sum, item) => sum + (item.nutrition?.proteinG ?? 0) * item.qty,
        0,
      )
    expect(proteinOf(beta)).toBeGreaterThanOrEqual(proteinOf(alpha))
    // 该场景预算 ¥40，蛋白质目标 25g/人（合计 50g）
    expect(beta.proposal?.totalCents).toBeLessThanOrEqual(4000)
    expect(proteinOf(beta)).toBeGreaterThanOrEqual(50)
    expect(dataset.menuItems.length).toBeGreaterThan(0)
  })

  it('指定商品类别：两个提案都包含「汉堡」类别', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('category-constraint').build(1))
    expect(isValid(alpha)).toBe(true)
    expect(isValid(beta)).toBe(true)
    expect(
      alpha.proposal?.constraintChecks.some(
        (check) => check.name === '商品类别：汉堡' && check.satisfied,
      ),
    ).toBe(true)
    expect(
      beta.proposal?.constraintChecks.some(
        (check) => check.name === '商品类别：汉堡' && check.satisfied,
      ),
    ).toBe(true)
  })

  it('优惠券组合：优先用券时至少一方命中数据集内优惠券', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('coupon-combo').build(1))
    const couponsOf = (execution: AgentExecution): string[] => execution.proposal?.couponCodes ?? []
    expect(couponsOf(alpha).length + couponsOf(beta).length).toBeGreaterThan(0)
    expect(isValid(alpha)).toBe(true)
    expect(isValid(beta)).toBe(true)
  })

  it('没有有效解：双方都如实报告约束未满足，不伪造可行解', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('no-solution').build(1))
    expect(isValid(alpha)).toBe(false)
    expect(isValid(beta)).toBe(false)
    // 预算约束必须被报告为未满足
    for (const execution of [alpha, beta]) {
      const budgetCheck = execution.proposal?.constraintChecks.find(
        (check) => check.name === '预算约束',
      )
      expect(budgetCheck?.satisfied).toBe(false)
    }
  })
})

describe('阶段03：双 Agent 算法差异', () => {
  it('两名 Agent 使用不同引擎标识与策略说明', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-50').build(2))
    expect(alpha.engine).toBe('speed-greedy')
    expect(beta.engine).toBe('optimizer-search')
    expect(alpha.engine).not.toBe(beta.engine)
    expect(alpha.role).not.toBe(beta.role)
  })

  it('极速版只评估 1 个候选；优化版评估多个候选（真实统计）', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-50').build(2))
    expect(alpha.candidateCount).toBe(1)
    expect(beta.candidateCount).toBeGreaterThan(1)
  })

  it('优化版的工具调用次数多于极速版（逐个候选计价）', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-50').build(2))
    expect(alpha.toolCallCount).toBe(1)
    expect(beta.toolCallCount).toBeGreaterThan(alpha.toolCallCount ?? 0)
  })

  it('相同输入下两个 Agent 的输出均可复现（确定性）', async () => {
    const first = await runBoth(scenarioOf('budget-30').build(9))
    const second = await runBoth(scenarioOf('budget-30').build(9))
    const fingerprint = (execution: AgentExecution): string =>
      JSON.stringify({
        proposal: execution.proposal,
        candidateCount: execution.candidateCount,
        toolCallCount: execution.toolCallCount,
        evidence: execution.evidence.map((item) => item.message),
      })
    expect(fingerprint(first.alpha)).toBe(fingerprint(second.alpha))
    expect(fingerprint(first.beta)).toBe(fingerprint(second.beta))
  })

  it('Agent 输出通过 AgentExecutionSchema 结构化校验（含阶段与工具调用）', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-30').build(3))
    for (const execution of [alpha, beta]) {
      const parsed = AgentExecutionSchema.parse(execution)
      expect(parsed.phases.length).toBeGreaterThan(0)
      expect(parsed.toolCalls.length).toBe(parsed.toolCallCount)
      expect(parsed.durationMs).toBeGreaterThanOrEqual(0)
      expect(parsed.evidence.length).toBeGreaterThan(0)
      // 证据类型覆盖数据来源 / 选择 / 价格 / 约束校验
      const kinds = new Set(parsed.evidence.map((item) => item.kind))
      expect(kinds.has('data-source')).toBe(true)
      expect(kinds.has('selection') || kinds.has('search')).toBe(true)
      expect(kinds.has('price')).toBe(true)
      expect(kinds.has('constraint-check')).toBe(true)
    }
  })

  it('引擎标识明确标注为算法型 Agent（未使用大模型）', async () => {
    const { alpha, beta } = await runBoth(scenarioOf('budget-20').build(4))
    // 算法型声明出现在阶段轨迹中（启动阶段即声明），且引擎标识不含任何模型名
    const phaseText = [alpha, beta]
      .flatMap((execution) => execution.phases.map((phase) => phase.message))
      .join(' ')
    expect(phaseText).toContain('算法型 Agent')
    expect(phaseText).toContain('未调用大模型')
    // 引擎标识为自描述的算法名，而非模型名
    for (const execution of [alpha, beta]) {
      expect(execution.engine).toMatch(/^(speed-greedy|optimizer-search)$/)
      expect(execution.evidence.some((item) => item.kind === 'judge')).toBe(false)
    }
  })
})
