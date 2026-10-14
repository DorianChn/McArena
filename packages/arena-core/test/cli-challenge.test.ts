import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { CliUsageError, parseChallengeArgs, runChallengeCli } from '../src/cli/challenge.js'

/**
 * 阶段06：challenge CLI 测试（Skill 与人类共用的入口）。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const tempDirs: string[] = []

/** CLI 成功输出形状（测试用最小类型，避免 any 扩散） */
interface CliSuccess {
  ok: true
  matchId: string
  seed: number
  mode: string
  dataOrigin: string
  agents: unknown[]
  judge: { winner: string; experimentId: string }
  reproducibleConfig: { constraints: { people: number; budgetCents?: number; requiredTags: string[] } }
  artifacts: { json?: string; html?: string }
}

interface CliFailure {
  ok: false
  code: string
  message: string
}

const json = <T>(text: string): T => JSON.parse(text) as T

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mcarena-cli-'))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe('parseChallengeArgs（参数解析）', () => {
  it('缺省值：2 人堂食、auto 模式、无预算', () => {
    const args = parseChallengeArgs([])
    expect(args.people).toBe(2)
    expect(args.scene).toBe('dine-in')
    expect(args.mode).toBe('auto')
    expect(args.budgetCents).toBeUndefined()
    expect(args.json).toBe(false)
  })

  it('--budget 以「元」输入、以「分」存储', () => {
    expect(parseChallengeArgs(['--budget', '60']).budgetCents).toBe(6000)
    expect(parseChallengeArgs(['--budget', '19.9']).budgetCents).toBe(1990)
  })

  it('列表参数支持逗号/顿号/中文逗号混用', () => {
    const args = parseChallengeArgs(['--tags', 'burger,side、drink，spicy'])
    expect(args.requiredTags).toEqual(['burger', 'side', 'drink', 'spicy'])
  })

  it('--goal none 等价于不设目标', () => {
    expect(parseChallengeArgs(['--goal', 'none']).goal).toBeUndefined()
    expect(parseChallengeArgs(['--goal', 'protein']).goal).toBe('protein')
  })

  it('--no-coupons / --coupons 开关', () => {
    expect(parseChallengeArgs(['--no-coupons']).preferCoupons).toBe(false)
    expect(parseChallengeArgs(['--coupons']).preferCoupons).toBe(true)
  })

  it('非法人数抛 CliUsageError', () => {
    expect(() => parseChallengeArgs(['--people', '99'])).toThrow(CliUsageError)
    expect(() => parseChallengeArgs(['--people', 'abc'])).toThrow(CliUsageError)
  })

  it('非法目标/场景/模式抛 CliUsageError', () => {
    expect(() => parseChallengeArgs(['--goal', 'unknown'])).toThrow(CliUsageError)
    expect(() => parseChallengeArgs(['--scene', 'space'])).toThrow(CliUsageError)
    expect(() => parseChallengeArgs(['--mode', 'warp'])).toThrow(CliUsageError)
  })

  it('未知参数抛 CliUsageError', () => {
    expect(() => parseChallengeArgs(['--nope'])).toThrow(CliUsageError)
  })

  it('缺少取值抛 CliUsageError', () => {
    expect(() => parseChallengeArgs(['--people'])).toThrow(CliUsageError)
  })
})

describe('runChallengeCli（端到端）', () => {
  it('--help 输出用法并返回 0', async () => {
    const outcome = await runChallengeCli(['--help'], REPO_ROOT)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.stdout).toContain('用法')
    expect(outcome.stdout).toContain('--goal')
  })

  it('参数非法返回退出码 2', async () => {
    const outcome = await runChallengeCli(['--people', '99'], REPO_ROOT)
    expect(outcome.exitCode).toBe(2)
    expect(outcome.stdout).toContain('参数错误')
  })

  it('--json 输出可解析的比赛结果（ok=true）', async () => {
    const outcome = await runChallengeCli(
      ['--people', '2', '--budget', '60', '--goal', 'balanced', '--seed', '42', '--json'],
      REPO_ROOT,
    )
    expect(outcome.exitCode).toBe(0)
    const payload = json<CliSuccess>(outcome.stdout)
    expect(payload.ok).toBe(true)
    expect(payload.seed).toBe(42)
    expect(payload.mode).toBe('mock')
    expect(payload.dataOrigin).toBe('mock')
    expect(payload.agents).toHaveLength(2)
    expect(payload.judge.winner).toBeTruthy()
    expect(payload.judge.experimentId.startsWith('exp_')).toBe(true)
    expect(payload.reproducibleConfig.constraints.people).toBe(2)
    expect(payload.reproducibleConfig.constraints.budgetCents).toBe(6000)
    expect(payload.reproducibleConfig.constraints.requiredTags).toEqual(['burger', 'side', 'drink'])
  })

  it('默认（无 --json）输出中文战报', async () => {
    const outcome = await runChallengeCli(['--people', '2', '--seed', '5'], REPO_ROOT)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.stdout).toContain('麦门 AI 竞技场')
    expect(outcome.stdout).toContain('裁判结论')
    expect(outcome.stdout).toContain('可复现配置')
    expect(outcome.stdout).toContain('模拟数据，非麦当劳官方数据')
  })

  it('--out / --html 落盘产物', async () => {
    const dir = tempDir()
    const outPath = path.join(dir, 'match.json')
    const htmlPath = path.join(dir, 'match.html')
    const outcome = await runChallengeCli(
      ['--seed', '42', '--json', '--out', outPath, '--html', htmlPath],
      REPO_ROOT,
    )
    expect(outcome.exitCode).toBe(0)
    const payload = json<CliSuccess>(outcome.stdout)
    expect(payload.artifacts.json).toBe(outPath)
    expect(payload.artifacts.html).toBe(htmlPath)

    const saved = JSON.parse(readFileSync(outPath, 'utf8')) as { ok: boolean; result: { matchId: string } }
    expect(saved.ok).toBe(true)
    expect(saved.result.matchId).toBe(payload.matchId)

    const html = readFileSync(htmlPath, 'utf8')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('麦门 AI 竞技场')
  })

  it('replay 模式无快照 → 退出码 3 且提示快照缺失', async () => {
    const outcome = await runChallengeCli(['--mode', 'replay'], REPO_ROOT)
    expect(outcome.exitCode).toBe(3)
    expect(outcome.stdout).toContain('快照')
  })

  it('live 模式无 Token → 退出码 3 且提示申请路径', async () => {
    const saved = process.env.MCD_MCP_TOKEN
    delete process.env.MCD_MCP_TOKEN
    try {
      const outcome = await runChallengeCli(['--mode', 'live'], REPO_ROOT)
      expect(outcome.exitCode).toBe(3)
      expect(outcome.stdout).toContain('MCD_MCP_TOKEN')
    } finally {
      if (saved !== undefined) process.env.MCD_MCP_TOKEN = saved
    }
  })

  it('replay 模式缺数据源时 JSON 输出结构化错误', async () => {
    const outcome = await runChallengeCli(['--mode', 'replay', '--json'], REPO_ROOT)
    expect(outcome.exitCode).toBe(3)
    const payload = json<CliFailure>(outcome.stdout)
    expect(payload.ok).toBe(false)
    expect(payload.code).toBe('CLI_USAGE_ERROR')
    expect(payload.message).toContain('快照')
  })

  it('--quiet 不输出战报正文', async () => {
    const outcome = await runChallengeCli(['--seed', '42', '--quiet'], REPO_ROOT)
    expect(outcome.exitCode).toBe(0)
    expect(outcome.stdout).toBe('')
  })
})
