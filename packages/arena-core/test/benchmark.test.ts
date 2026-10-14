import { describe, expect, it } from 'vitest'
import { createSilentLogger } from '@mcarena/shared'
import {
  BENCHMARK_SCENARIOS,
  benchmarkScenario,
  buildScenarioDataset,
  runBenchmark,
} from '../src/engine/scenarios.js'

/**
 * 阶段03 基准对比测试：指标完整性、对比口径、汇总统计。
 */

const logger = createSilentLogger()

describe('基准对比', () => {
  it('8 个官方场景全部定义且覆盖验收清单', () => {
    expect(BENCHMARK_SCENARIOS).toHaveLength(8)
    const ids = BENCHMARK_SCENARIOS.map((scenario) => scenario.id)
    expect(ids).toEqual([
      'budget-20',
      'budget-30',
      'budget-50',
      'two-person-set',
      'protein-target',
      'category-constraint',
      'coupon-combo',
      'no-solution',
    ])
    // 唯一一个「没有有效解」场景
    expect(BENCHMARK_SCENARIOS.filter((scenario) => !scenario.expectFeasible)).toHaveLength(1)
  })

  it('单场景返回双 Agent 的五类对比指标（真实测量）', async () => {
    const scenario = BENCHMARK_SCENARIOS.find((entry) => entry.id === 'budget-30')!
    const run = await benchmarkScenario({ scenario, dataset: buildScenarioDataset(), seed: 1, logger })
    for (const metrics of [run.alpha, run.beta]) {
      expect(typeof metrics.durationMs).toBe('number')
      expect(typeof metrics.toolCallCount).toBe('number')
      expect(typeof metrics.candidateCount).toBe('number')
      expect(metrics.totalChecks).toBeGreaterThan(0)
      expect(metrics.satisfiedChecks).toBeLessThanOrEqual(metrics.totalChecks)
    }
    // 裁判给出双 Agent 总分与胜者
    expect(run.judge).not.toBeNull()
    expect(['alpha', 'beta', 'tie']).toContain(run.judge?.winner)
  })

  it('汇总报告包含两个 Agent 的有效率/费用/约束满足度/耗时/工具调用', async () => {
    const report = await runBenchmark({ dataset: buildScenarioDataset(), seed: 1, logger })
    expect(report.runs).toHaveLength(8)
    expect(report.summary).toHaveLength(2)
    const [alpha, beta] = report.summary
    for (const summary of [alpha, beta]) {
      expect(summary.matches).toBe(8)
      expect(summary.validRate).toBeGreaterThanOrEqual(0)
      expect(summary.validRate).toBeLessThanOrEqual(1)
      expect(summary.constraintSatisfaction.rate).toBeGreaterThan(0)
      expect(summary.avgDurationMs).toBeGreaterThanOrEqual(0)
      expect(summary.maxDurationMs).toBeGreaterThanOrEqual(summary.avgDurationMs)
      expect(summary.avgToolCalls).toBeGreaterThan(0)
      expect(summary.avgCandidates).toBeGreaterThan(0)
    }
    // 两个 Agent 的引擎标识不同（策略实质不同）
    expect(alpha.engine).not.toBe(beta.engine)
    // 极速版平均候选数必须为 1
    expect(alpha.avgCandidates).toBe(1)
    expect(beta.avgCandidates).toBeGreaterThan(1)
    // 除「没有有效解」场景外，其余 7 个场景两个 Agent 都应有效
    const feasible = report.runs.filter((run) => run.expectFeasible)
    expect(feasible.every((run) => run.alpha.valid && run.beta.valid)).toBe(true)
    // 「没有有效解」场景双方都不得有效
    const infeasible = report.runs.find((run) => !run.expectFeasible)
    expect(infeasible?.alpha.valid).toBe(false)
    expect(infeasible?.beta.valid).toBe(false)
  })

  it('汇总报告可格式化为中文可读文本', async () => {
    const report = await runBenchmark({
      dataset: buildScenarioDataset(),
      seed: 2,
      logger,
    })
    const { formatBenchmarkReport } = await import('../src/engine/scenarios.js')
    const text = formatBenchmarkReport(report)
    expect(text).toContain('双 Agent 基准对比')
    expect(text).toContain('有效率')
    expect(text).toContain('约束满足度')
    expect(text).toContain('speed-greedy')
    expect(text).toContain('optimizer-search')
  })
})
