import { createSilentLogger } from '@mcarena/shared'
import type { ArenaDataset, Challenge, ChallengeConstraints, Logger, MatchResult } from '@mcarena/shared'
import type { MatchRun } from '../types.js'
import { MatchOrchestrator } from '../types.js'
import { OptimizerAgent } from './agents/optimizer-agent.js'
import { SpeedAgent } from './agents/speed-agent.js'
import { buildCustomChallenge } from './challenge-builder.js'
import { RuleBasedJudge } from './judge.js'
import { ReplayPriceOracle } from './price-oracle.js'
import { RuleEngine } from './rule-engine.js'

/**
 * 单局比赛运行器（共享单一实现）。
 *
 * 网页 API、CLI 与 WorkBuddy Skill 都调用本函数跑一局，保证：
 *   - 同一套 Agent（speed-greedy / optimizer-search）；
 *   - 同一套裁判（RuleBasedJudge，独立验证不采信自述）；
 *   - 同一套任务卡构造（buildCustomChallenge / RuleEngine）。
 * 任何入口都不得另行拼装引擎，避免出现「第二套不一致的业务逻辑」。
 */

export interface RunArenaMatchInput {
  dataset: ArenaDataset
  seed: number
  /** 传入即按用户约束构建任务卡；不传则由 RuleEngine 按种子生成可复现随机任务卡 */
  constraints?: ChallengeConstraints
  logger?: Logger
  matchId?: string
  /** Agent 失败/超时策略：默认 recover（降级恢复，保证比赛可完成） */
  agentRecovery?: 'recover' | 'propagate'
  now?: () => Date
  /** 事件回调（CLI 静默运行时可省略） */
  sink?: (event: MatchRun['events'][number]) => void
}

export interface ArenaMatchOutcome {
  /** 完整比赛记录（失败时为 null） */
  result: MatchResult | null
  /** 本次实际使用的任务卡（便于复现展示） */
  challenge: Challenge
  /** 事件序列（SSE 回放同源） */
  events: MatchRun['events']
  error?: { code: string; message: string }
}

/** 跑一局完整比赛：任务卡 → α → β → 独立裁判。返回结果与事件，不抛业务异常。 */
export async function runArenaMatch(input: RunArenaMatchInput): Promise<ArenaMatchOutcome> {
  const logger = input.logger ?? createSilentLogger()
  const now = input.now ?? (() => new Date())
  const challenge = input.constraints
    ? buildCustomChallenge(input.constraints, input.seed, now())
    : RuleEngine.generateTaskCard(input.seed, input.dataset)

  const orchestrator = new MatchOrchestrator({
    agentAlpha: new SpeedAgent(),
    agentBeta: new OptimizerAgent(),
    judge: new RuleBasedJudge(),
    logger,
  })

  const run = await orchestrator.run({
    challenge,
    dataset: input.dataset,
    seed: input.seed,
    matchId: input.matchId,
    priceOracle: new ReplayPriceOracle(input.dataset),
    agentRecovery: input.agentRecovery ?? 'recover',
    sink: input.sink,
    now,
  })

  return {
    result: run.result ?? null,
    challenge,
    events: run.events,
    error: run.error,
  }
}
