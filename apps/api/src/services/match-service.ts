import type { ArenaDataset, MatchResult, StartMatchRequest } from '@mcarena/shared'
import type { MatchStreamEvent } from '@mcarena/shared'
import { NotFoundError } from '@mcarena/shared'
import {
  MatchOrchestrator,
  OptimizerAgent,
  ReplayPriceOracle,
  RuleBasedJudge,
  RuleEngine,
  SpeedAgent,
} from '@mcarena/arena-core'
import type { MatchOrchestrator as Orchestrator } from '@mcarena/arena-core'
import type { ArenaDataSource } from './data-source.js'
import type { Logger } from '@mcarena/shared'

/** 比赛存储：内存环形缓冲（最多 200 局），附带 SSE 事件序列 */
export class MatchStore {
  private readonly results = new Map<string, MatchResult>()
  private readonly events = new Map<string, MatchStreamEvent[]>()
  private readonly order: string[] = []
  private readonly capacity: number

  constructor(capacity = 200) {
    this.capacity = capacity
  }

  save(result: MatchResult, events: MatchStreamEvent[]): void {
    this.results.set(result.matchId, result)
    this.events.set(result.matchId, events)
    this.order.push(result.matchId)
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift()
      if (oldest) {
        this.results.delete(oldest)
        this.events.delete(oldest)
      }
    }
  }

  get(matchId: string): MatchResult | undefined {
    return this.results.get(matchId)
  }

  getEvents(matchId: string): MatchStreamEvent[] {
    return this.events.get(matchId) ?? []
  }

  get size(): number {
    return this.results.size
  }
}

/** 阶段03：双 Agent 竞技编排器（真实算法引擎 + 规则裁判 + 降级恢复策略） */
export function createMatchOrchestrator(logger: Logger): Orchestrator {
  return new MatchOrchestrator({
    agentAlpha: new SpeedAgent(),
    agentBeta: new OptimizerAgent(),
    judge: new RuleBasedJudge(),
    logger,
  })
}

export class MatchService {
  constructor(
    private readonly deps: {
      dataSource: ArenaDataSource
      orchestrator: Orchestrator
      store: MatchStore
      logger: Logger
      defaultSeedSource?: () => number
      /** Agent 失败/超时策略：默认降级恢复，保证比赛可继续 */
      agentRecovery?: 'recover' | 'propagate'
    },
  ) {}

  async startMatch(request: StartMatchRequest): Promise<MatchResult> {
    const seed = request.seed ?? this.deps.defaultSeedSource?.() ?? Math.floor(Math.random() * 1_000_000)
    const logger = this.deps.logger.child({ seed })
    logger.info('开始比赛', { mode: this.deps.dataSource.mode })

    const dataset: ArenaDataset = await this.deps.dataSource.load()
    // 任务卡：固定随机种子可复现（RuleEngine.generateTaskCard(seed, dataset)）
    const challenge = RuleEngine.generateTaskCard(seed, dataset)
    const priceOracle = new ReplayPriceOracle(dataset)

    const run = await this.deps.orchestrator.run({
      challenge,
      dataset,
      seed,
      matchId: undefined,
      priceOracle,
      agentRecovery: this.deps.agentRecovery ?? 'recover',
    })
    const result = run.result
    if (!result) {
      throw new Error(`比赛未产生结果：${run.error?.message ?? '未知原因'}`)
    }
    this.deps.store.save(result, run.events)
    logger.info('比赛完成', {
      matchId: result.matchId,
      winner: result.judge.winner,
      durationMs: result.agents.map((agent) => agent.durationMs ?? 0),
      toolCalls: result.agents.map((agent) => agent.toolCallCount ?? 0),
    })
    return result
  }

  getMatch(matchId: string): MatchResult {
    const result = this.deps.store.get(matchId)
    if (!result) {
      throw new NotFoundError(`比赛 ${matchId} 不存在或已过期`)
    }
    return result
  }

  getEvents(matchId: string): MatchStreamEvent[] {
    return this.deps.store.getEvents(matchId)
  }
}
