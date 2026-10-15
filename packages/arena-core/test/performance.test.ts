import { afterAll, describe, expect, it } from 'vitest'
import { buildScenarioDataset, BENCHMARK_SCENARIOS, benchmarkScenario } from '../src/engine/scenarios.js'

const memorySamples: Array<{ heapUsed: number; rss: number }> = []
afterAll(() => {
  const summary = memorySamples.length === 0 ? null : {
    heapUsedDelta: memorySamples.at(-1)!.heapUsed - memorySamples[0]!.heapUsed,
    rssDelta: memorySamples.at(-1)!.rss - memorySamples[0]!.rss,
    samples: memorySamples.length,
  }
  process.stdout.write(`[PERF_MEMORY] ${JSON.stringify(summary)}\n`)
})

describe('候选规模与内存稳定性基准', () => {
  it('固定数据与种子下真实运行优化 Agent 并记录候选、耗时及堆内存', async () => {
    const scenario = BENCHMARK_SCENARIOS.find((entry) => entry.id === 'coupon-combo')
    if (!scenario) throw new Error('基准场景 coupon-combo 缺失')
    const before = process.memoryUsage()
    const started = performance.now()
    const run = await benchmarkScenario({ scenario, dataset: buildScenarioDataset(), seed: 20261014 })
    const elapsedMs = performance.now() - started
    const after = process.memoryUsage()
    memorySamples.push({ heapUsed: after.heapUsed, rss: after.rss })

    expect(run.beta.candidateCount).toBeGreaterThan(0)
    expect(run.beta.candidateCount).toBeLessThanOrEqual(1000)
    expect(run.beta.durationMs).toBeGreaterThanOrEqual(0)
    expect(elapsedMs).toBeLessThan(5000)
    expect(after.heapUsed - before.heapUsed).toBeLessThan(64 * 1024 * 1024)
    expect(after.rss).toBeGreaterThan(0)
    process.stdout.write(`[PERF_RUN] ${JSON.stringify({
      scenario: scenario.id,
      seed: 20261014,
      candidateCount: run.beta.candidateCount,
      betaDurationMs: run.beta.durationMs,
      wallMs: Number(elapsedMs.toFixed(2)),
      heapDeltaBytes: after.heapUsed - before.heapUsed,
      rssBytes: after.rss,
    })}\n`)
  })

  it('连续 20 局大量候选运算后堆内存可回收且计算上界受控', async () => {
    const scenario = BENCHMARK_SCENARIOS.find((entry) => entry.id === 'coupon-combo')
    if (!scenario) throw new Error('基准场景 coupon-combo 缺失')
    const dataset = buildScenarioDataset()
    const before = process.memoryUsage()
    let maxCandidates = 0
    for (let index = 0; index < 20; index += 1) {
      const run = await benchmarkScenario({ scenario, dataset, seed: 50_000 + index })
      maxCandidates = Math.max(maxCandidates, run.beta.candidateCount)
    }
    const after = process.memoryUsage()
    memorySamples.push({ heapUsed: after.heapUsed, rss: after.rss })
    expect(maxCandidates).toBeLessThanOrEqual(1000)
    expect(after.heapUsed - before.heapUsed).toBeLessThan(96 * 1024 * 1024)
    process.stdout.write(`[PERF_STRESS] ${JSON.stringify({
      matches: 20,
      maxCandidates,
      heapDeltaBytes: after.heapUsed - before.heapUsed,
      rssBytes: after.rss,
    })}\n`)
  }, 30_000)
})
