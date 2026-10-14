import { McArenaError, MatchResultSchema } from '@mcarena/shared'
import type {
  AgentExecution,
  AgentId,
  AgentPhaseName,
  ArenaDataset,
  Challenge,
  EvidenceRecord,
  JudgeResult,
  Logger,
  MatchResult,
  MatchStreamEvent,
  PriceQuote,
} from '@mcarena/shared'
import { runAgent } from './engine/agent-runner.js'

/** 引擎接口层：定义了「Agent 如何决策」与「裁判如何打分」的契约。
 *  真实算法（规则引擎/双 Agent 策略/五维打分）在阶段02实现；
 *  本阶段仅固定接口形状与状态机，并提供明确标注的 mock 实现用于联调。 */

export interface AgentContext {
  challenge: Challenge
  dataset: ArenaDataset
  logger: Logger
  /** 整单计价预言机：优先取官方 calculate-price 记录；无记录时返回 null，Agent 按官方单价折算并显式标注 */
  priceOracle?: PriceOracle
  /** 取消信号：Agent 在安全检查点检测到 abort 时抛出 AgentCancelledError */
  signal?: AbortSignal
  /** 阶段变更回调（用于 SSE 实时推送决策过程） */
  onPhase?: (phase: AgentPhaseName, message: string) => void
  /** 证据产出回调（用于 SSE 实时推送） */
  onEvidence?: (evidence: EvidenceRecord) => void
}

/** 购物车签名（用于在数据集中查找已录制的官方计价记录） */
export interface CartSignature {
  items: Array<{ code: string; qty: number }>
  couponCodes: string[]
}

export interface PriceOracle {
  /** 命中已录制的官方计价记录则返回 PriceQuote，否则 null */
  quote(cart: CartSignature): Promise<PriceQuote | null>
}

export interface AgentEngine {
  readonly id: AgentId
  /** 中文名，如「极速猎手」 */
  readonly name: string
  /** 角色定位（中文） */
  readonly role: string
  /** 引擎标识；mock 引擎固定 'mock-dev-scaffold' */
  readonly engine: string
  readonly engineVersion: string
  decide(context: AgentContext): Promise<AgentExecution>
}

export interface JudgeContext {
  challenge: Challenge
  dataset: ArenaDataset
  agents: [AgentExecution, AgentExecution]
  logger: Logger
  /** 官方价格预言机：裁判优先用它独立核价（不信任 Agent 自述价格） */
  priceOracle?: PriceOracle
  /** 比赛种子：参与可复现实验 ID 的派生 */
  seed?: number
}

export interface JudgeEngine {
  readonly engine: string
  readonly engineVersion: string
  evaluate(context: JudgeContext): Promise<JudgeResult>
}

export const ORCHESTRATOR_VERSION = '0.1.0'

/** 编排器内部阶段（比 SSE 事件多一个 judging 中间态） */
export type MatchPhase =
  | 'data-source'
  | 'challenge'
  | 'agent-alpha'
  | 'agent-beta'
  | 'judging'
  | 'judge'
  | 'done'

export type MatchRunState = 'idle' | 'preparing' | 'running' | 'completed' | 'failed'

/** 比赛运行记录（用于 SSE 回放与审计） */
export interface MatchRun {
  matchId: string
  seed: number
  state: MatchRunState
  phase: MatchPhase
  events: MatchStreamEvent[]
  result?: MatchResult
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------- 比赛编排
export interface RunMatchInput {
  challenge: Challenge
  dataset: ArenaDataset
  seed: number
  sink?: (event: MatchStreamEvent) => void
  now?: () => Date
  matchId?: string
  priceOracle?: PriceOracle
  /** 取消整场比赛（传播到两个 Agent） */
  signal?: AbortSignal
  /** 单个 Agent 的超时时间（毫秒），默认 10s */
  agentTimeoutMs?: number
  /** Agent 失败/超时后的策略：propagate（默认，严格模式）或 recover（降级恢复） */
  agentRecovery?: 'recover' | 'propagate'
}

export interface OrchestratorDeps {
  agentAlpha: AgentEngine
  agentBeta: AgentEngine
  judge: JudgeEngine
  logger: Logger
}

/**
 * 比赛编排器：驱动 data-source → challenge → agent α → agent β → judge 的
 * 确定性流水线，并记录全部事件供 SSE 回放。
 */
export class MatchOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async run(input: RunMatchInput): Promise<MatchRun> {
    const now = input.now ?? (() => new Date())
    const iso = () => now().toISOString()
    const matchId = input.matchId ?? `match_${now().getTime().toString(36)}_${input.seed}`

    const run: MatchRun = {
      matchId,
      seed: input.seed,
      state: 'preparing',
      phase: 'data-source',
      events: [],
    }
    const record = (event: MatchStreamEvent): void => {
      run.events.push(event)
      input.sink?.(event)
    }

    /** 单个 Agent 的完整执行（状态机 + 超时 + 取消 + SSE 事件流） */
    const runAgentPhase = async (
      phase: MatchPhase,
      agent: AgentEngine,
      input2: RunMatchInput,
      iso2: () => string,
    ): Promise<AgentExecution> => {
      run.phase = phase
      record({
        type: 'phase',
        phase,
        message: `${agent.name} 决策中…`,
        at: iso2(),
      })
      const execution = await runAgent({
        agent,
        context: {
          challenge: input2.challenge,
          dataset: input2.dataset,
          logger: this.deps.logger,
          priceOracle: input2.priceOracle,
        },
        timeoutMs: input2.agentTimeoutMs,
        signal: input2.signal,
        recovery: input2.agentRecovery ?? 'propagate',
        logger: this.deps.logger,
        onEvent: (event) => {
          if (event.type === 'started') {
            record({ type: 'agent.started', agentId: event.agentId, at: iso2() })
          } else if (event.type === 'phase') {
            record({
              type: 'agent.phase',
              agentId: event.agentId,
              phase: event.phase,
              message: event.message,
              at: iso2(),
            })
          }
        },
      })
      for (const evidence of execution.evidence) {
        record({ type: 'agent.step', agentId: execution.agentId, evidence, at: iso2() })
      }
      record({
        type: 'agent.completed',
        agentId: execution.agentId,
        status: execution.status,
        durationMs: execution.durationMs,
        candidateCount: execution.candidateCount,
        toolCallCount: execution.toolCallCount,
        recoveryUsed: execution.recovery.used,
        at: iso2(),
      })
      if (execution.status === 'failed') {
        record({
          type: 'agent.failed',
          agentId: execution.agentId,
          code: execution.errorCode ?? 'INTERNAL',
          message: `${agent.name} 执行失败（${execution.errorCode ?? 'INTERNAL'}）`,
          recoveryUsed: execution.recovery.used,
          at: iso2(),
        })
      }
      return execution
    }

    record({
      type: 'match.created',
      matchId,
      seed: input.seed,
      dataOrigin: input.dataset.dataOrigin,
      at: iso(),
    })
    record({
      type: 'phase',
      phase: 'data-source',
      message:
        input.dataset.dataOrigin === 'mock'
          ? `数据来源：${input.dataset.sourceRef}（模拟数据，非官方）`
          : `数据来源：${input.dataset.sourceRef}`,
      at: iso(),
    })
    record({
      type: 'phase',
      phase: 'challenge',
      message: `任务卡：${input.challenge.title}`,
      at: iso(),
    })

    run.state = 'running'
    try {
      // ---- Agent α ----
      const alpha = await runAgentPhase('agent-alpha', this.deps.agentAlpha, input, iso)
      if (alpha.errorCode === 'CANCELLED') {
        run.state = 'failed'
        run.error = { code: 'CANCELLED', message: '比赛已被取消' }
        record({ type: 'match.failed', error: { code: 'CANCELLED', message: '比赛已被取消' }, at: iso() })
        return run
      }

      // ---- Agent β ----
      const beta = await runAgentPhase('agent-beta', this.deps.agentBeta, input, iso)
      if (beta.errorCode === 'CANCELLED') {
        run.state = 'failed'
        run.error = { code: 'CANCELLED', message: '比赛已被取消' }
        record({ type: 'match.failed', error: { code: 'CANCELLED', message: '比赛已被取消' }, at: iso() })
        return run
      }

      // ---- Judge ----
      run.phase = 'judging'
      record({ type: 'phase', phase: 'judging', message: '裁判打分中…', at: iso() })
      const judge = await this.deps.judge.evaluate({
        challenge: input.challenge,
        dataset: input.dataset,
        agents: [alpha, beta],
        logger: this.deps.logger,
        priceOracle: input.priceOracle,
        seed: input.seed,
      })

      const result: MatchResult = MatchResultSchema.parse({
        matchId,
        seed: input.seed,
        challenge: input.challenge,
        dataOrigin: input.dataset.dataOrigin,
        dataset: {
          sourceRef: input.dataset.sourceRef,
          snapshotId: input.dataset.snapshotId,
          sha256: input.dataset.sha256,
          notice: input.dataset.notice,
          capturedAt: input.dataset.capturedAt,
        },
        agents: [alpha, beta],
        judge,
        engineVersions: {
          orchestrator: ORCHESTRATOR_VERSION,
          agentAlpha: `${alpha.engine}@${alpha.engineVersion}`,
          agentBeta: `${beta.engine}@${beta.engineVersion}`,
          judge: `${this.deps.judge.engine}@${this.deps.judge.engineVersion}`,
        },
        createdAt: iso(),
        warnings: input.dataset.dataOrigin === 'mock' ? [input.dataset.notice] : [],
      })

      run.state = 'completed'
      run.phase = 'done'
      run.result = result
      record({ type: 'phase', phase: 'done', message: '比赛结束', at: iso() })
      record({ type: 'match.completed', result, at: iso() })
      return run
    } catch (error) {
      const body =
        error instanceof McArenaError
          ? error.toJSON()
          : { code: 'INTERNAL' as const, message: error instanceof Error ? error.message : String(error) }
      run.state = 'failed'
      run.error = body
      record({ type: 'match.failed', error: body, at: iso() })
      throw error
    }
  }
}
