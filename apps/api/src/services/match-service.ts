import type { ArenaDataset, MatchResult, StartMatchRequest } from '@mcarena/shared'
import type { MatchStreamEvent } from '@mcarena/shared'
import { NotFoundError } from '@mcarena/shared'
import { buildDevelopmentChallenge } from '@mcarena/arena-core'
import type { MatchOrchestrator } from '@mcarena/arena-core'
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

export class MatchService {
  constructor(
    private readonly deps: {
      dataSource: ArenaDataSource
      orchestrator: MatchOrchestrator
      store: MatchStore
      logger: Logger
      defaultSeedSource?: () => number
    },
  ) {}

  async startMatch(request: StartMatchRequest): Promise<MatchResult> {
    const seed = request.seed ?? this.deps.defaultSeedSource?.() ?? Math.floor(Math.random() * 1_000_000)
    const logger = this.deps.logger.child({ seed })
    logger.info('开始比赛', { mode: this.deps.dataSource.mode })

    const dataset: ArenaDataset = await this.deps.dataSource.load()
    // 任务卡：阶段01 使用开发脚手架构造器（随机 RuleEngine 属阶段02）
    const challenge = buildDevelopmentChallenge(seed)

    const run = await this.deps.orchestrator.run({
      challenge,
      dataset,
      seed,
      matchId: undefined,
    })
    const result = run.result
    if (!result) {
      throw new Error('比赛未产生结果')
    }
    this.deps.store.save(result, run.events)
    logger.info('比赛完成', { matchId: result.matchId, winner: result.judge.winner })
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
