import { AgentExecutionSchema } from '@mcarena/shared'
import type {
  AgentExecution,
  AgentId,
  AgentPhaseName,
  EvidenceRecord,
  Logger,
  MenuItem,
} from '@mcarena/shared'
import type { AgentContext, AgentEngine } from '../types.js'
import { DecisionRecorder, buildRecoveredProposal } from './agent-utils.js'

/**
 * Agent 执行状态机（阶段03 核心）。
 *
 * 单个 Agent 的独立执行生命周期：
 *   idle → running → succeeded
 *                  → failed（异常，按策略决定是否恢复）
 *                  → timeout（超时，按策略决定是否恢复）
 *                  → cancelled（外部取消，不恢复）
 *
 * 能力：
 * - 取消执行：外部 AbortSignal，Agent 在安全检查点配合中断；
 * - 超时：deadline 到点后主动 abort 并触发超时分支；
 * - 失败恢复：recovery: 'recover' 时切换为确定性降级方案并显式标注；
 *   recovery: 'propagate'（默认）时原样抛出错误，便于测试与严格模式；
 * - 结构化校验：任何路径产出的 AgentExecution 都过一次 AgentExecutionSchema.parse；
 * - 真实指标：durationMs / candidateCount / toolCallCount 由实际执行统计，
 *   不做任何估算或伪造。
 */

export const DEFAULT_AGENT_TIMEOUT_MS = 10_000

export type AgentRecoveryPolicy = 'recover' | 'propagate'

/** 超时错误（propagate 模式下抛出，供上层映射为 TIMEOUT 错误码） */
export class AgentTimeoutError extends Error {
  readonly agentId: AgentId
  readonly timeoutMs: number
  constructor(agentId: AgentId, timeoutMs: number) {
    super(`Agent ${agentId} 执行超时（> ${timeoutMs}ms）`)
    this.name = 'AgentTimeoutError'
    this.agentId = agentId
    this.timeoutMs = timeoutMs
  }
}

export interface AgentRunnerOptions {
  agent: AgentEngine
  /** 不含 signal / 回调的上下文；runner 自行注入 */
  context: Omit<AgentContext, 'signal' | 'onPhase' | 'onEvidence'>
  timeoutMs?: number
  /** 外部取消信号（例如用户取消整场比赛） */
  signal?: AbortSignal
  /** 失败/超时后的行为，默认 propagate */
  recovery?: AgentRecoveryPolicy
  logger?: Logger
  /** 执行过程回调（SSE 推送用） */
  onEvent?: (event: AgentRunnerEvent) => void
}

export type AgentRunnerEvent =
  | { type: 'started'; agentId: AgentId }
  | { type: 'phase'; agentId: AgentId; phase: AgentPhaseName; message: string }
  | { type: 'evidence'; agentId: AgentId; evidence: EvidenceRecord }

/** 执行单个 Agent，返回经过结构化校验的执行记录 */
export async function runAgent(options: AgentRunnerOptions): Promise<AgentExecution> {
  const { agent, context } = options
  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS
  const policy = options.recovery ?? 'propagate'
  const controller = new AbortController()
  let cancelled = false
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('agent-timeout'))
  }, timeoutMs)
  const onExternalAbort = (): void => {
    cancelled = true
    controller.abort(new Error('agent-cancelled'))
  }
  // 信号可能已处于中止状态：此时不会再触发 abort 事件，必须立即处理
  if (options.signal?.aborted) {
    clearTimeout(timer)
    return buildCancelledExecution({ options, context, logger: options.logger })
  }
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })
  options.onEvent?.({ type: 'started', agentId: agent.id })

  try {
    const execution = await agent.decide({
      ...context,
      signal: controller.signal,
      onPhase: (phase, message) =>
        options.onEvent?.({ type: 'phase', agentId: agent.id, phase, message }),
      onEvidence: (evidence) =>
        options.onEvent?.({ type: 'evidence', agentId: agent.id, evidence }),
    })
    // 截止时间已过：即便 Agent 自行跑完，也按超时处理（deadline 是硬契约）
    if (timedOut) {
      if (policy === 'propagate') {
        throw new AgentTimeoutError(agent.id, timeoutMs)
      }
      return recoverExecution({
        options,
        context,
        reason: `执行超时（> ${timeoutMs}ms，结果未在截止时间内返回）`,
      })
    }
    if (cancelled) {
      return buildCancelledExecution({ options, context, logger: options.logger })
    }
    return AgentExecutionSchema.parse(execution)
  } catch (error) {
    if (cancelled) {
      return buildCancelledExecution({ options, context, logger: options.logger })
    }
    const reason = timedOut
      ? `执行超时（> ${timeoutMs}ms）`
      : error instanceof Error
        ? error.message
        : String(error)
    if (policy === 'propagate') {
      throw timedOut ? new AgentTimeoutError(agent.id, timeoutMs) : error
    }
    options.logger?.warn('Agent 执行中断，切换降级恢复', {
      agentId: agent.id,
      reason,
      engine: agent.engine,
    })
    return recoverExecution({ options, context, reason })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

/** 取消：不恢复，产出明确的失败记录 */
function buildCancelledExecution(input: {
  options: AgentRunnerOptions
  context: Omit<AgentContext, 'signal' | 'onPhase' | 'onEvidence'>
  logger?: Logger
}): AgentExecution {
  const { agent, context } = input.options
  const recorder = new DecisionRecorder({
    context,
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    engine: agent.engine,
    engineVersion: agent.engineVersion,
  })
  recorder.note('error', '执行已被取消（外部 AbortSignal 触发），本 Agent 未产出提案。')
  recorder.phase('done', '执行取消')
  return recorder.finish({
    proposal: null,
    status: 'failed',
    errorCode: 'CANCELLED',
    recovery: { used: false },
  })
}

/** 失败/超时恢复：确定性降级方案 + 显式标注 */
async function recoverExecution(input: {
  options: AgentRunnerOptions
  context: Omit<AgentContext, 'signal' | 'onPhase' | 'onEvidence'>
  reason: string
}): Promise<AgentExecution> {
  const { agent, context } = input.options
  const recorder = new DecisionRecorder({
    context,
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    engine: agent.engine,
    engineVersion: agent.engineVersion,
  })
  recorder.phase('init', `${agent.name} 启动`)
  const menuByCode = new Map<string, MenuItem>(
    context.dataset.menuItems.map((item) => [item.code, item]),
  )
  const { proposal } = await buildRecoveredProposal({
    recorder,
    context,
    reason: input.reason,
    menuByCode,
  })
  recorder.phase('done', '降级恢复完成')
  return recorder.finish({
    proposal,
    status: 'completed',
    recovery: { used: true, reason: input.reason },
  })
}
