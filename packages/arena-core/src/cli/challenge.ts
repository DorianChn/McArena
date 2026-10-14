import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MCPDataSnapshotSchema, datasetFromSnapshot } from '@mcarena/shared'
import type { ArenaDataset, ChallengeConstraints, DataMode, MatchResult, Scene } from '@mcarena/shared'
import { buildConstraintsFromParams, GOAL_PRESETS, isGoalPresetKey } from '../engine/challenge-builder.js'
import type { GoalPresetKey } from '../engine/challenge-builder.js'
import { runArenaMatch } from '../engine/arena-runner.js'
import { buildScenarioDataset } from '../engine/scenarios.js'
import { renderMatchHtml } from '../render/match-html.js'

/**
 * McArena CLI：`challenge` 子命令。
 *
 * 设计目标：让 WorkBuddy Skill / 脚本 / 人类都能用**同一套共享引擎**跑一局比赛。
 * 本文件只负责「参数解析 → 数据集加载 → 调用 runArenaMatch → 渲染输出」，
 * 不含任何 Agent / 裁判 / 任务卡业务逻辑（全部来自 @mcarena/arena-core 共享模块）。
 *
 * 用法示例：
 *   node --import tsx packages/arena-core/src/cli/challenge.ts --people 2 --budget 60 --goal balanced --seed 42
 *   node --import tsx packages/arena-core/src/cli/challenge.ts --people 3 --goal protein --json --out ./out/match.json --html ./out/match.html
 */

export type CliMode = DataMode | 'auto'

export interface ParsedChallengeArgs {
  people: number
  budgetCents?: number
  scene: Scene
  goal?: GoalPresetKey
  requiredTags: string[]
  requiredCategories: string[]
  mustIncludeCodes: string[]
  excludedCodes: string[]
  maxDistinctItems?: number
  preferCoupons?: boolean
  kcal?: number
  proteinG?: number
  sodiumMgMax?: number
  seed?: number
  mode: CliMode
  json: boolean
  quiet: boolean
  out?: string
  html?: string
  help: boolean
}

const SCENES: Scene[] = ['dine-in', 'take-away', 'delivery']

export function parseChallengeArgs(argv: string[]): ParsedChallengeArgs {
  const args: ParsedChallengeArgs = {
    people: 2,
    scene: 'dine-in',
    requiredTags: [],
    requiredCategories: [],
    mustIncludeCodes: [],
    excludedCodes: [],
    mode: 'auto',
    json: false,
    quiet: false,
    help: false,
  }
  const list = (value: string): string[] =>
    value
      .split(/[,，、]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = (): string => {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new CliUsageError(`参数 ${token} 缺少取值`)
      }
      i += 1
      return value
    }
    switch (token) {
      case '--people':
      case '-n':
        args.people = intOf(next(), token, 1, 12)
        break
      case '--budget': {
        const yuanValue = Number(next())
        if (!Number.isFinite(yuanValue) || yuanValue < 0) throw new CliUsageError('--budget 必须是非负数字（单位：元）')
        args.budgetCents = Math.round(yuanValue * 100)
        break
      }
      case '--scene':
        args.scene = sceneOf(next())
        break
      case '--goal': {
        const goal = next()
        if (goal !== 'none' && !isGoalPresetKey(goal)) {
          throw new CliUsageError(
            `--goal 取值无效：${goal}（可选 ${Object.keys(GOAL_PRESETS).join('|')}|none）`,
          )
        }
        args.goal = goal === 'none' ? undefined : goal
        break
      }
      case '--tags':
        args.requiredTags = list(next())
        break
      case '--categories':
        args.requiredCategories = list(next())
        break
      case '--must':
        args.mustIncludeCodes = list(next())
        break
      case '--exclude':
        args.excludedCodes = list(next())
        break
      case '--max-items':
        args.maxDistinctItems = intOf(next(), token, 1, 20)
        break
      case '--kcal':
        args.kcal = intOf(next(), token, 0, 10_000)
        break
      case '--protein':
        args.proteinG = intOf(next(), token, 0, 500)
        break
      case '--sodium-max':
        args.sodiumMgMax = intOf(next(), token, 0, 20_000)
        break
      case '--seed':
        args.seed = intOf(next(), token, 0, 2_147_483_647)
        break
      case '--mode': {
        const mode = next()
        if (mode !== 'auto' && mode !== 'mock' && mode !== 'replay' && mode !== 'live') {
          throw new CliUsageError(`--mode 取值无效：${mode}（可选 auto|mock|replay|live）`)
        }
        args.mode = mode
        break
      }
      case '--coupons':
        args.preferCoupons = true
        break
      case '--no-coupons':
        args.preferCoupons = false
        break
      case '--json':
        args.json = true
        break
      case '--quiet':
        args.quiet = true
        break
      case '--out':
        args.out = next()
        break
      case '--html':
        args.html = next()
        break
      case '--help':
      case '-h':
        args.help = true
        break
      default:
        throw new CliUsageError(`未知参数：${token}`)
    }
  }
  return args
}

export class CliUsageError extends Error {
  readonly code = 'CLI_USAGE_ERROR'
}

function intOf(raw: string, flag: string, min: number, max: number): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CliUsageError(`${flag} 必须是 ${min}–${max} 之间的整数（收到 ${raw}）`)
  }
  return value
}

function sceneOf(raw: string): Scene {
  if (!SCENES.includes(raw as Scene)) {
    throw new CliUsageError(`--scene 取值无效：${raw}（可选 ${SCENES.join('|')}）`)
  }
  return raw as Scene
}

/** 数据集加载：auto 优先官方快照，缺失时退回场景数据集（并明确标注） */
export async function loadDataset(mode: CliMode, repoRoot: string): Promise<{ dataset: ArenaDataset; mode: DataMode }> {
  if (mode === 'live') {
    if (!process.env.MCD_MCP_TOKEN) {
      throw new CliUsageError(
        'live 模式需要环境变量 MCD_MCP_TOKEN（在 https://open.mcd.cn/mcp 申请）。' +
          '当前未配置，请改用 --mode auto / --mode mock，或先申请 Token。',
      )
    }
    throw new CliUsageError('live（官方 MCP 实时采集）在当前版本尚未开放，请使用 --mode auto（官方快照优先）或 --mode mock。')
  }

  if (mode === 'replay' || mode === 'auto') {
    const snapshot = await loadLatestSnapshot(repoRoot)
    if (snapshot) return { dataset: snapshot, mode: 'replay' }
    if (mode === 'replay') {
      throw new CliUsageError(
        'replay 模式需要仓内官方快照，但 snapshots/ 目录暂无快照文件。请放入快照，或改用 --mode mock。',
      )
    }
  }
  return { dataset: buildScenarioDataset(), mode: 'mock' }
}

async function loadLatestSnapshot(repoRoot: string): Promise<ArenaDataset | null> {
  const dir = path.join(repoRoot, 'snapshots')
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((file) => file.endsWith('.json') && file !== 'manifest.json')
    .sort()
  const latest = files[files.length - 1]
  if (!latest) return null
  const raw = JSON.parse(await readFile(path.join(dir, latest), 'utf8'))
  return datasetFromSnapshot(MCPDataSnapshotSchema.parse(raw))
}

export interface ChallengeCliOutcome {
  exitCode: number
  stdout: string
}

/** 主入口（可测试：不直接依赖 process.exit） */
export async function runChallengeCli(argv: string[], repoRoot: string): Promise<ChallengeCliOutcome> {
  let args: ParsedChallengeArgs
  try {
    args = parseChallengeArgs(argv)
  } catch (error) {
    return { exitCode: 2, stdout: usageMessage(error instanceof Error ? error.message : String(error)) }
  }
  if (args.help) return { exitCode: 0, stdout: usageMessage() }

  const seed = args.seed ?? Math.floor(Math.random() * 1_000_000)

  let dataset: ArenaDataset
  let mode: DataMode
  try {
    const loaded = await loadDataset(args.mode, repoRoot)
    dataset = loaded.dataset
    mode = loaded.mode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      exitCode: 3,
      stdout: args.json
        ? JSON.stringify({ ok: false, code: error instanceof CliUsageError ? error.code : 'DATA_SOURCE_ERROR', message }, null, 2)
        : `数据源不可用：${message}`,
    }
  }

  const hasCustom = Boolean(
    args.budgetCents !== undefined ||
      args.goal ||
      args.requiredTags.length > 0 ||
      args.requiredCategories.length > 0 ||
      args.mustIncludeCodes.length > 0 ||
      args.excludedCodes.length > 0 ||
      args.maxDistinctItems !== undefined ||
      args.kcal !== undefined ||
      args.proteinG !== undefined ||
      args.sodiumMgMax !== undefined ||
      args.people !== 2 ||
      args.scene !== 'dine-in' ||
      args.preferCoupons !== undefined,
  )

  const constraints: ChallengeConstraints | undefined = hasCustom
    ? buildConstraintsFromParams({
        people: args.people,
        budgetCents: args.budgetCents,
        scene: args.scene,
        goal: args.goal,
        requiredTags: args.requiredTags,
        requiredCategories: args.requiredCategories,
        mustIncludeCodes: args.mustIncludeCodes,
        excludedCodes: args.excludedCodes,
        maxDistinctItems: args.maxDistinctItems,
        preferCoupons: args.preferCoupons,
        nutritionTarget:
          args.kcal !== undefined || args.proteinG !== undefined || args.sodiumMgMax !== undefined
            ? { kcal: args.kcal, proteinG: args.proteinG, sodiumMgMax: args.sodiumMgMax }
            : undefined,
      })
    : undefined

  const outcome = await runArenaMatch({ dataset, seed, constraints })
  if (!outcome.result) {
    const message = outcome.error?.message ?? '未知原因'
    return {
      exitCode: 4,
      stdout: args.json
        ? JSON.stringify({ ok: false, code: outcome.error?.code ?? 'MATCH_FAILED', message, seed }, null, 2)
        : `比赛未完成：${message}`,
    }
  }

  const result = outcome.result
  const reproducibleConfig = {
    seed,
    mode,
    constraints: result.challenge.constraints,
    dataset: { sourceRef: result.dataset.sourceRef, dataOrigin: result.dataOrigin, sha256: result.dataset.sha256 },
    experimentId: result.judge.experimentId,
  }

  const artifacts: { json?: string; html?: string } = {}
  if (args.out) {
    await mkdir(path.dirname(path.resolve(args.out)), { recursive: true })
    await writeFile(path.resolve(args.out), JSON.stringify({ ok: true, result, reproducibleConfig }, null, 2), 'utf8')
    artifacts.json = path.resolve(args.out)
  }
  if (args.html) {
    await mkdir(path.dirname(path.resolve(args.html)), { recursive: true })
    await writeFile(
      path.resolve(args.html),
      renderMatchHtml(result, { reproducibleConfig, title: `麦门 AI 竞技场 · 种子 ${seed}` }),
      'utf8',
    )
    artifacts.html = path.resolve(args.html)
  }

  if (args.json) {
    const payload = {
      ok: true,
      matchId: result.matchId,
      seed,
      mode,
      dataOrigin: result.dataOrigin,
      dataset: result.dataset,
      challenge: result.challenge,
      agents: result.agents.map((agent, index) => {
        const verification = result.judge.verification.find((v) => v.agentId === agent.agentId)
        return {
          agentId: agent.agentId,
          name: agent.name,
          role: agent.role,
          engine: `${agent.engine}@${agent.engineVersion}`,
          status: agent.status,
          valid: verification?.eligible ?? false,
          claimedTotalCents: agent.proposal?.totalCents ?? null,
          effectiveCostCents: verification?.effectiveCostCents ?? null,
          officialCostCents: verification?.officialCostCents ?? null,
          priceStatus: verification?.priceStatus ?? null,
          targetAchievement: verification?.targetAchievement ?? null,
          durationMs: agent.durationMs ?? 0,
          candidateCount: agent.candidateCount ?? 0,
          toolCallCount: agent.toolCallCount ?? 0,
          items: (agent.proposal?.items ?? []).map((item) => ({
            code: item.code,
            name: item.name,
            qty: item.qty,
            lineTotalCents: item.lineTotalCents,
          })),
          scoreTotal: result.judge.agentScores[index]?.total ?? null,
        }
      }),
      judge: {
        rulesVersion: result.judge.rulesVersion,
        experimentId: result.judge.experimentId,
        costBasis: result.judge.costBasis,
        winner: result.judge.winner,
        headline: result.judge.headline,
        totalScore: result.judge.totalScore,
        totalMax: result.judge.totalMax,
        agentScores: result.judge.agentScores,
        dimensions: result.judge.dimensions.map((dimension) => ({
          key: dimension.key,
          label: dimension.label,
          score: dimension.score,
          max: dimension.max,
          weight: dimension.weight,
          formula: dimension.formula,
        })),
        notes: result.judge.notes,
        allViolations: result.judge.allViolations,
      },
      reproducibleConfig,
      warnings: result.warnings,
      artifacts,
    }
    return { exitCode: 0, stdout: JSON.stringify(payload, null, 2) }
  }

  return { exitCode: 0, stdout: args.quiet ? '' : humanReport(result, seed, mode, artifacts, reproducibleConfig) }
}

function humanReport(
  result: MatchResult,
  seed: number,
  mode: DataMode,
  artifacts: { json?: string; html?: string },
  reproducibleConfig: unknown,
): string {
  const line = '─'.repeat(66)
  const out: string[] = []
  const money = (cents: number | null): string => (cents === null ? '—' : `¥${(cents / 100).toFixed(2)}`)
  out.push(line)
  out.push(`麦门 AI 竞技场 · 单局战报（种子 ${seed}｜模式 ${mode}）`)
  out.push(line)
  out.push(`任务卡：${result.challenge.title}`)
  out.push(result.challenge.brief)
  out.push(`数据来源：${result.dataOrigin}（${result.dataset.sourceRef}）｜比赛 ID ${result.matchId}`)
  if (result.warnings.length > 0) out.push(`⚠ ${result.warnings.join('；')}`)
  out.push('')
  for (const [index, agent] of result.agents.entries()) {
    const verification = result.judge.verification.find((v) => v.agentId === agent.agentId)
    const tag = agent.agentId === 'alpha' ? 'α' : 'β'
    out.push(
      `【${tag} ${agent.name}】${agent.engine}@${agent.engineVersion}｜总分 ${(result.judge.agentScores[index]?.total ?? 0).toFixed(1)}/100`,
    )
    out.push(
      `    自述应付 ${money(agent.proposal?.totalCents ?? null)}｜裁决成本 ${money(verification?.effectiveCostCents ?? null)}` +
        `｜核价 ${verification?.priceStatus ?? '—'}｜资格 ${verification?.eligible ? '通过' : '未通过'}`,
    )
    out.push(
      `    实测 ${agent.durationMs ?? 0}ms｜候选 ${agent.candidateCount ?? 0}｜工具调用 ${agent.toolCallCount ?? 0}`,
    )
    for (const item of agent.proposal?.items ?? []) {
      out.push(`      · ${item.name} ×${item.qty} = ${money(item.lineTotalCents)}`)
    }
  }
  out.push('')
  out.push(`裁判结论：${result.judge.headline}`)
  out.push(`规则 ${result.judge.rulesVersion}｜实验 ${result.judge.experimentId}｜成本依据 ${result.judge.costBasis}`)
  out.push('五维得分（双方）：')
  for (const dimension of result.judge.dimensions) {
    const a = result.judge.agentScores[0]?.dimensions[dimension.key] ?? 0
    const b = result.judge.agentScores[1]?.dimensions[dimension.key] ?? 0
    out.push(`  ${dimension.label.padEnd(6, '　')} α ${a.toFixed(1).padStart(5)}｜β ${b.toFixed(1).padStart(5)}｜满分 ${dimension.max}`)
  }
  if (result.judge.allViolations.length > 0) {
    out.push('违规记录：')
    for (const violation of result.judge.allViolations) {
      out.push(`  [${violation.severity}] ${violation.agentId === 'alpha' ? 'α' : 'β'} ${violation.message}`)
    }
  }
  out.push('')
  out.push('可复现配置（粘贴到竞技场「挑战设置」或同种子重跑即可复现）：')
  out.push(JSON.stringify(reproducibleConfig, null, 2))
  if (artifacts.html) out.push(`\n已生成可打开的竞技场结果：${artifacts.html}`)
  if (artifacts.json) out.push(`已生成 JSON 结果：${artifacts.json}`)
  out.push(line)
  return out.join('\n')
}

export function usageMessage(error?: string): string {
  return [
    error ? `参数错误：${error}` : '麦门 AI 竞技场 · challenge 命令',
    '',
    '用法：challenge [选项]',
    '  --people <1-12>        就餐人数（默认 2）',
    '  --budget <元>          预算（元，如 60）',
    '  --scene <场景>         dine-in | take-away | delivery（默认 dine-in）',
    `  --goal <目标>          ${Object.keys(GOAL_PRESETS).join(' | ')} | none`,
    '  --tags a,b             必含标签（burger/side/drink…）',
    '  --categories a,b       必含类别（汉堡/小食/饮品…）',
    '  --must a,b             必选餐品编码',
    '  --exclude a,b          排除餐品编码',
    '  --max-items <1-20>     最多餐品种类数',
    '  --kcal <n>             人均热量上限',
    '  --protein <n>          人均蛋白质下限',
    '  --sodium-max <n>       人均钠上限（mg）',
    '  --coupons / --no-coupons  是否优先用券',
    '  --seed <n>             随机种子（缺省随机，便于复现）',
    '  --mode <模式>          auto | mock | replay | live（默认 auto：官方快照优先，缺失则回退 mock）',
    '  --json                 输出机器可读 JSON',
    '  --out <文件>           写入 JSON 结果',
    '  --html <文件>          写入可打开的 HTML 战报',
    '  --quiet                仅输出结果文件路径',
    '  -h, --help             显示帮助',
    '',
    '示例：',
    '  challenge --people 2 --budget 60 --goal balanced --seed 42',
    '  challenge --people 3 --goal protein --json --out ./artifacts/match.json --html ./artifacts/match.html',
  ].join('\n')
}

async function main(): Promise<void> {
  const repoRoot = process.env.MCARENA_ROOT ?? process.cwd()
  const { exitCode, stdout } = await runChallengeCli(process.argv.slice(2), repoRoot)
  if (stdout) console.log(stdout)
  process.exitCode = exitCode
}

// 仅在作为脚本直接执行时运行（被测试 import 时不执行）
const invokedDirectly = process.argv[1] ? /cli[\\/]challenge\.(ts|js|mjs)$/.test(process.argv[1]) : false
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
