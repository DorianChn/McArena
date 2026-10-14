import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * 阶段06：Skill 脚本真实集成测试（真实子进程，非 mock）。
 *
 * 验证 WorkBuddy 侧实际会调用的三个脚本：
 *   - scripts/parse-request.mjs  自然语言 → 参数
 *   - scripts/run-match.mjs      调用共享引擎跑一局并产出产物
 *   - scripts/install.mjs        安装到 skills 目录（--dry-run 不落盘）
 *
 * 这些脚本必须能在「仓库根目录之外」被调用，因此测试统一从仓库根以 cwd 执行。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SKILL_SCRIPTS = path.join(REPO_ROOT, 'skill', 'mc-arena', 'scripts')
const tempDirs: string[] = []

/** 脚本 JSON 输出形状（测试用最小类型，避免 any 扩散） */
interface SkillJson {
  ok: boolean
  seed?: number
  args?: string[]
  fields?: {
    people?: number
    budgetYuan?: number
    goal?: string
    scene?: string
    preferCoupons?: boolean
  }
  artifacts?: { json?: string; html?: string }
}

const json = (text: string): SkillJson => JSON.parse(text) as SkillJson

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mcarena-skill-'))
  tempDirs.push(dir)
  return dir
}

function run(script: string, args: string[] = [], cwd = REPO_ROOT): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [path.join(SKILL_SCRIPTS, script), ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, MCARENA_ROOT: '' },
    })
    return { code: 0, stdout }
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe('parse-request.mjs（自然语言解析）', { timeout: 60_000 }, () => {
  it('解析「3个人 预算60 要低卡 外带」', () => {
    const { code, stdout } = run('parse-request.mjs', ['3个人 预算60 要低卡 外带', '--json'])
    expect(code).toBe(0)
    const payload = json(stdout)
    expect(payload.fields?.people).toBe(3)
    expect(payload.fields?.budgetYuan).toBe(60)
    expect(payload.fields?.goal).toBe('low-cal')
    expect(payload.fields?.scene).toBe('take-away')
    expect(payload.args).toEqual(['--people', '3', '--budget', '60', '--scene', 'take-away', '--goal', 'low-cal'])
  })

  it('解析「双人堂食 50元以内 高蛋白 用券」', () => {
    const { code, stdout } = run('parse-request.mjs', ['双人堂食 50元以内 高蛋白 用券', '--print-args'])
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('--people 2 --budget 50 --scene dine-in --goal protein --coupons')
  })

  it('无法识别时输出空参数（不编造）', () => {
    const { code, stdout } = run('parse-request.mjs', ['随便来点什么吧', '--print-args'])
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('')
  })

  it('缺少输入时以退出码 2 提示用法', () => {
    const { code, stdout } = run('parse-request.mjs', [])
    expect(code).toBe(2)
    expect(stdout).toContain('用法')
  })
})

describe('run-match.mjs（Skill 主入口）', { timeout: 180_000 }, () => {
  it('--help 返回 0 并列出参数', () => {
    const { code, stdout } = run('run-match.mjs', ['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('麦门 AI 竞技场 · Skill 运行脚本')
    expect(stdout).toContain('--goal')
  })

  it('真实跑一局并生成 JSON + HTML 产物（从仓库根调用）', () => {
    const dir = tempDir()
    const outPath = path.join(dir, 'match.json')
    const htmlPath = path.join(dir, 'match.html')
    const { code, stdout } = run('run-match.mjs', [
      '--people',
      '2',
      '--budget',
      '60',
      '--goal',
      'balanced',
      '--seed',
      '42',
      '--json',
      '--out',
      outPath,
      '--html',
      htmlPath,
    ])
    expect(code).toBe(0)
    const payload = json(stdout)
    expect(payload.ok).toBe(true)
    expect(payload.artifacts?.html).toBe(htmlPath)
    expect(existsSync(htmlPath)).toBe(true)
    expect(existsSync(outPath)).toBe(true)

    const html = readFileSync(htmlPath, 'utf8')
    expect(html).toContain('麦门 AI 竞技场')
    expect(html).toContain('裁判结论')
    expect(html).toContain('非麦当劳官方产品')
  }, 180_000)

  it('可从仓库外的任意工作目录调用（依赖脚本自身定位仓库）', () => {
    const cwd = tempDir()
    const { code, stdout } = run('run-match.mjs', ['--seed', '42', '--json'], cwd)
    expect(code).toBe(0)
    const payload = json(stdout)
    expect(payload.ok).toBe(true)
    expect(payload.seed).toBe(42)
  }, 180_000)

  it('replay 模式无快照 → 退出码 3（异常路径真实可复现）', () => {
    const { code, stdout } = run('run-match.mjs', ['--mode', 'replay'])
    expect(code).toBe(3)
    expect(stdout).toContain('快照')
  }, 180_000)
})

describe('install.mjs（安装脚本）', { timeout: 60_000 }, () => {
  it('--dry-run 只打印动作、不落盘', () => {
    const { code, stdout } = run('install.mjs', ['--dry-run'])
    expect(code).toBe(0)
    expect(stdout).toContain('--dry-run')
    expect(stdout).toContain('mc-arena')
  })
})

describe('Skill 元数据（官方规范）', () => {
  it('SKILL.md 具备 name / description / agent_created', () => {
    const content = readFileSync(path.join(REPO_ROOT, 'skill', 'mc-arena', 'SKILL.md'), 'utf8')
    expect(content.startsWith('---')).toBe(true)
    expect(content).toMatch(/^name:\s*mc-arena$/m)
    expect(content).toMatch(/^description:\s*.+$/m)
    expect(content).toMatch(/^agent_created:\s*true$/m)
    // 描述不得包含尖括号（官方校验脚本会拒绝）
    const description = /^description:\s*(.+)$/m.exec(content)?.[1] ?? ''
    expect(description).not.toContain('<')
    expect(description).not.toContain('>')
  })

  it('技能包含必需文件与脚本', () => {
    for (const file of [
      'SKILL.md',
      'INSTALL.md',
      'scripts/run-match.mjs',
      'scripts/parse-request.mjs',
      'scripts/install.mjs',
      'references/challenge-params.md',
      'references/scoring.md',
      'references/mcp-tools.md',
      'references/examples.md',
    ]) {
      expect(existsSync(path.join(REPO_ROOT, 'skill', 'mc-arena', file)), `缺少 ${file}`).toBe(true)
    }
  })
})
