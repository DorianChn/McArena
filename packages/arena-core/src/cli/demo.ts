import { createSilentLogger } from '@mcarena/shared'
import type { AgentEngine } from '../types.js'
import {
  MatchOrchestrator,
  OptimizerAgent,
  ReplayPriceOracle,
  RuleBasedJudge,
  RuleEngine,
  SpeedAgent,
  buildScenarioDataset,
  formatBenchmarkReport,
  runBenchmark,
} from '../index.js'

/**
 * McArena 阶段03 CLI：本地无需付费 API 即可体验完整竞技流程。
 *
 * 用法：
 *   npx tsx src/cli/demo.ts match [seed]   跑一场完整比赛并打印中文战报
 *   npx tsx src/cli/demo.ts bench [seed]   跑 8 个官方测试场景并输出双 Agent 对比
 *   npx tsx src/cli/demo.ts timeout        演示「超时 → 降级恢复」行为
 *   npx tsx src/cli/demo.ts cancel         演示「取消执行」行为
 */

type Command = 'match' | 'bench' | 'timeout' | 'cancel'

function parseArgs(argv: string[]): { command: Command; seed: number } {
  const raw = argv[0] ?? 'match'
  const seed = Number(argv[1] ?? '1')
  const command: Command =
    raw === 'bench' || raw === 'timeout' || raw === 'cancel' ? raw : 'match'
  return { command, seed: Number.isInteger(seed) && seed > 0 ? seed : 1 }
}

function printMatchReport(input: {
  seed: number
  matchId: string
  challengeTitle: string
  challengeBrief: string
  dataOrigin: string
  agents: Array<{
    name: string
    engine: string
    totalCents: number | null
    valid: boolean
    durationMs: number
    candidateCount: number
    toolCallCount: number
    recoveryUsed: boolean
  }>
  winner: string
  headline: string
}): void {
  const line = '─'.repeat(64)
  console.log(line)
  console.log(`麦门 AI 竞技场 · 单局战报（种子 ${input.seed}）`)
  console.log(line)
  console.log(`任务卡：${input.challengeTitle}`)
  console.log(`${input.challengeBrief}`)
  console.log(`数据来源：${input.dataOrigin}（比赛 ID ${input.matchId}）`)
  console.log('')
  for (const agent of input.agents) {
    console.log(
      `【${agent.name}】${agent.engine}` +
        `｜应付 ${agent.totalCents === null ? '—' : `¥${(agent.totalCents / 100).toFixed(2)}`}` +
        `｜有效解：${agent.valid ? '是' : '否'}` +
        `｜耗时 ${agent.durationMs}ms` +
        `｜候选 ${agent.candidateCount}｜工具调用 ${agent.toolCallCount}` +
        `${agent.recoveryUsed ? '｜⚠ 降级恢复' : ''}`,
    )
  }
  console.log('')
  console.log(`裁判结论：${input.headline}`)
  console.log(line)
}

async function runMatch(seed: number): Promise<void> {
  const logger = createSilentLogger()
  const dataset = buildScenarioDataset()
  const challenge = RuleEngine.generateTaskCard(seed, dataset)
  const orchestrator = new MatchOrchestrator({
    agentAlpha: new SpeedAgent(),
    agentBeta: new OptimizerAgent(),
    judge: new RuleBasedJudge(),
    logger,
  })
  const run = await orchestrator.run({
    challenge,
    dataset,
    seed,
    priceOracle: new ReplayPriceOracle(dataset),
    agentRecovery: 'recover',
  })
  const result = run.result
  if (!result) {
    console.log(`比赛未完成：${JSON.stringify(run.error ?? {})}`)
    return
  }
  printMatchReport({
    seed,
    matchId: result.matchId,
    challengeTitle: result.challenge.title,
    challengeBrief: result.challenge.brief,
    dataOrigin: result.dataOrigin,
    agents: result.agents.map((agent) => ({
      name: agent.name,
      engine: `${agent.engine}@${agent.engineVersion}`,
      totalCents: agent.proposal?.totalCents ?? null,
      valid:
        agent.proposal !== null &&
        agent.proposal.constraintChecks.every((check) => check.satisfied),
      durationMs: agent.durationMs ?? 0,
      candidateCount: agent.candidateCount ?? 0,
      toolCallCount: agent.toolCallCount ?? 0,
      recoveryUsed: agent.recovery.used,
    })),
    winner: result.judge.winner,
    headline: result.judge.headline,
  })
}

async function runTimeoutDemo(): Promise<void> {
  const logger = createSilentLogger()
  const dataset = buildScenarioDataset()
  const challenge = RuleEngine.generateTaskCard(2, dataset)
  console.log('演示：Agent β 外层包裹 80ms 延迟、超时阈值设为 20ms → 触发超时 → 降级恢复方案（明确标注）')

  // 用真实延迟构造一个「慢 Agent」来触发超时分支（而非伪造超时）
  const inner = new OptimizerAgent()
  const slow: typeof inner = {
    ...inner,
    async decide(context) {
      await new Promise((resolve) => setTimeout(resolve, 80))
      return inner.decide(context)
    },
  }

  const alpha = await runAgentDemo(new SpeedAgent(), challenge, dataset, logger)
  const beta = await runAgentDemo(slow, challenge, dataset, logger, 20)
  for (const execution of [alpha, beta]) {
    console.log(
      `  ${execution.name}：status=${execution.status} recovery=${execution.recovery.used}` +
        ` durationMs=${execution.durationMs} proposal=${execution.proposal ? `¥${(execution.proposal.totalCents / 100).toFixed(2)}` : '无'}`,
    )
    const recoveryNote = execution.evidence.find((item) => item.kind === 'error')
    if (recoveryNote) console.log(`    证据：${recoveryNote.message}`)
  }
}

async function runCancelDemo(): Promise<void> {
  const logger = createSilentLogger()
  const dataset = buildScenarioDataset()
  const challenge = RuleEngine.generateTaskCard(3, dataset)
  console.log('演示：比赛开始后立即取消 → Agent 收到 CANCELLED，不产出提案')
  const controller = new AbortController()
  const orchestrator = new MatchOrchestrator({
    agentAlpha: new SpeedAgent(),
    agentBeta: new OptimizerAgent(),
    judge: new RuleBasedJudge(),
    logger,
  })
  controller.abort()
  const run = await orchestrator.run({
    challenge,
    dataset,
    seed: 3,
    signal: controller.signal,
    priceOracle: new ReplayPriceOracle(dataset),
  })
  console.log(`  比赛状态：${run.state}｜错误：${JSON.stringify(run.error ?? {})}`)
  const failedEvent = run.events.find((event) => event.type === 'match.failed')
  if (failedEvent && failedEvent.type === 'match.failed') {
    console.log(`  事件：${failedEvent.error.code} ${failedEvent.error.message}`)
  }
}

async function runAgentDemo(
  agent: AgentEngine,
  challenge: ReturnType<typeof RuleEngine.generateTaskCard>,
  dataset: ReturnType<typeof buildScenarioDataset>,
  logger: ReturnType<typeof createSilentLogger>,
  timeoutMs?: number,
) {
  const { runAgent } = await import('../engine/agent-runner.js')
  return runAgent({
    agent,
    context: { challenge, dataset, logger, priceOracle: new ReplayPriceOracle(dataset) },
    recovery: 'recover',
    timeoutMs,
    logger,
  })
}

async function main(): Promise<void> {
  const { command, seed } = parseArgs(process.argv.slice(2))
  if (command === 'bench') {
    const report = await runBenchmark({ dataset: buildScenarioDataset(), seed })
    console.log(formatBenchmarkReport(report))
    return
  }
  if (command === 'timeout') {
    await runTimeoutDemo()
    return
  }
  if (command === 'cancel') {
    await runCancelDemo()
    return
  }
  await runMatch(seed)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
