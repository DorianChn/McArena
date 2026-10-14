import { McArenaError, MatchResultSchema } from '@mcarena/shared'
import type {
  AgentExecution,
  AgentId,
  ArenaDataset,
  Challenge,
  JudgeResult,
  Logger,
  MatchResult,
  MatchStreamEvent,
} from '@mcarena/shared'

/** 引擎接口层：定义了「Agent 如何决策」与「裁判如何打分」的契约。
 *  真实算法（规则引擎/双 Agent 策略/五维打分）在阶段02实现；
 *  本阶段仅固定接口形状与状态机，并提供明确标注的 mock 实现用于联调。 */

export interface AgentContext {
  challenge: Challenge
  dataset: ArenaDataset
  logger: Logger
}

export interface AgentEngine {
  readonly id: AgentId
  /** 中文名，如「预算猎手」 */
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
      run.phase = 'agent-alpha'
      record({
        type: 'phase',
        phase: 'agent-alpha',
        message: `${this.deps.agentAlpha.name} 决策中…`,
        at: iso(),
      })
      const alpha = await this.deps.agentAlpha.decide({
        challenge: input.challenge,
        dataset: input.dataset,
        logger: this.deps.logger,
      })
      for (const evidence of alpha.evidence) {
        record({ type: 'agent.step', agentId: 'alpha', evidence, at: iso() })
      }
      record({ type: 'agent.completed', agentId: 'alpha', at: iso() })

      // ---- Agent β ----
      run.phase = 'agent-beta'
      record({
        type: 'phase',
        phase: 'agent-beta',
        message: `${this.deps.agentBeta.name} 决策中…`,
        at: iso(),
      })
      const beta = await this.deps.agentBeta.decide({
        challenge: input.challenge,
        dataset: input.dataset,
        logger: this.deps.logger,
      })
      for (const evidence of beta.evidence) {
        record({ type: 'agent.step', agentId: 'beta', evidence, at: iso() })
      }
      record({ type: 'agent.completed', agentId: 'beta', at: iso() })

      // ---- Judge ----
      run.phase = 'judging'
      record({ type: 'phase', phase: 'judge', message: '裁判打分中…', at: iso() })
      const judge = await this.deps.judge.evaluate({
        challenge: input.challenge,
        dataset: input.dataset,
        agents: [alpha, beta],
        logger: this.deps.logger,
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
