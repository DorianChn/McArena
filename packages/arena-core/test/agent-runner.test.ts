import { describe, expect, it } from 'vitest'
import { createSilentLogger } from '@mcarena/shared'
import { RuleEngine } from '../src/engine/rule-engine.js'
import { OptimizerAgent } from '../src/engine/agents/optimizer-agent.js'
import { SpeedAgent } from '../src/engine/agents/speed-agent.js'
import { AgentTimeoutError, runAgent } from '../src/engine/agent-runner.js'
import { ReplayPriceOracle } from '../src/engine/price-oracle.js'
import { buildScenarioDataset } from '../src/engine/scenarios.js'
import type { AgentContext, AgentEngine } from '../src/types.js'

/**
 * 阶段03 Agent 执行状态机测试：超时 / 取消 / 失败恢复 / propagate 模式。
 */

const logger = createSilentLogger()

function makeContext(): AgentContext {
  const dataset = buildScenarioDataset()
  const challenge = RuleEngine.generateTaskCard(5, dataset)
  return { challenge, dataset, logger, priceOracle: new ReplayPriceOracle(dataset) }
}

/** 包装真实 Agent，注入可控延迟 */
function withDelay(agent: AgentEngine, delayMs: number): AgentEngine {
  return {
    ...agent,
    async decide(context) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return agent.decide(context)
    },
  }
}

/** 必定抛错的 Agent（模拟引擎故障） */
function failingAgent(): AgentEngine {
  return {
    id: 'alpha',
    name: '故障 Agent',
    role: '测试用',
    engine: 'failing-engine',
    engineVersion: '0.0.1',
    decide: () => Promise.reject(new Error('模拟引擎故障')),
  }
}

describe('AgentRunner：超时', () => {
  it('超时后按降级恢复策略产出明确标注的提案', async () => {
    const execution = await runAgent({
      agent: withDelay(new OptimizerAgent(), 80),
      context: makeContext(),
      timeoutMs: 20,
      recovery: 'recover',
      logger,
    })
    expect(execution.status).toBe('completed')
    expect(execution.recovery.used).toBe(true)
    expect(execution.recovery.reason).toContain('超时')
    // 恢复提案必须是结构完整的真实提案，并带有错误证据
    expect(execution.proposal).not.toBeNull()
    expect(execution.proposal?.items.length).toBeGreaterThan(0)
    expect(execution.evidence.some((item) => item.kind === 'error')).toBe(true)
    expect(execution.evidence.some((item) => item.message.includes('降级恢复'))).toBe(true)
  })

  it('propagate 模式下超时抛出 AgentTimeoutError', async () => {
    await expect(
      runAgent({
        agent: withDelay(new OptimizerAgent(), 80),
        context: makeContext(),
        timeoutMs: 20,
        recovery: 'propagate',
        logger,
      }),
    ).rejects.toBeInstanceOf(AgentTimeoutError)
  })

  it('在截止时间内完成的 Agent 不受超时影响', async () => {
    const execution = await runAgent({
      agent: new SpeedAgent(),
      context: makeContext(),
      timeoutMs: 5000,
      recovery: 'recover',
      logger,
    })
    expect(execution.status).toBe('completed')
    expect(execution.recovery.used).toBe(false)
    expect(execution.proposal).not.toBeNull()
  })
})

describe('AgentRunner：取消', () => {
  it('已中止的信号立即返回 CANCELLED，不产出提案', async () => {
    const controller = new AbortController()
    controller.abort()
    const execution = await runAgent({
      agent: new SpeedAgent(),
      context: makeContext(),
      signal: controller.signal,
      recovery: 'recover',
      logger,
    })
    expect(execution.status).toBe('failed')
    expect(execution.errorCode).toBe('CANCELLED')
    expect(execution.proposal).toBeNull()
    expect(execution.evidence.some((item) => item.message.includes('取消'))).toBe(true)
  })

  it('执行中取消：Agent 在安全检查点中断', async () => {
    const controller = new AbortController()
    const context = makeContext()
    // 在 Agent 完成前触发取消（真实事件驱动）
    const promise = runAgent({
      agent: new OptimizerAgent(),
      context,
      signal: controller.signal,
      recovery: 'recover',
      logger,
    })
    controller.abort()
    const execution = await promise
    expect(execution.errorCode).toBe('CANCELLED')
    expect(execution.status).toBe('failed')
  })
})

describe('AgentRunner：失败恢复', () => {
  it('Agent 抛异常 → recover 模式产出降级恢复结果并保留错误证据', async () => {
    const execution = await runAgent({
      agent: failingAgent(),
      context: makeContext(),
      recovery: 'recover',
      logger,
    })
    expect(execution.status).toBe('completed')
    expect(execution.recovery.used).toBe(true)
    expect(execution.recovery.reason).toContain('模拟引擎故障')
    expect(execution.proposal).not.toBeNull()
    expect(execution.evidence.some((item) => item.kind === 'error')).toBe(true)
  })

  it('Agent 抛异常 → propagate 模式原样抛出', async () => {
    await expect(
      runAgent({
        agent: failingAgent(),
        context: makeContext(),
        recovery: 'propagate',
        logger,
      }),
    ).rejects.toThrow('模拟引擎故障')
  })

  it('恢复结果携带完整指标字段（可被前端与基准测试消费）', async () => {
    const execution = await runAgent({
      agent: withDelay(new OptimizerAgent(), 80),
      context: makeContext(),
      timeoutMs: 20,
      recovery: 'recover',
      logger,
    })
    expect(typeof execution.durationMs).toBe('number')
    expect(execution.durationMs).toBeGreaterThanOrEqual(0)
    expect(execution.toolCallCount).toBe(execution.toolCalls.length)
    expect(execution.phases.length).toBeGreaterThan(0)
    expect(execution.phases.at(-1)?.name).toBe('done')
  })
})

describe('AgentRunner：过程事件', () => {
  it('执行过程通过 onEvent 回调实时上报 started 与 phase', async () => {
    const events: Array<{ type: string }> = []
    await runAgent({
      agent: new SpeedAgent(),
      context: makeContext(),
      recovery: 'recover',
      logger,
      onEvent: (event) => events.push(event),
    })
    const types = events.map((event) => event.type)
    expect(types).toContain('started')
    expect(types).toContain('phase')
    expect(types.filter((type) => type === 'phase').length).toBeGreaterThan(3)
  })
})
