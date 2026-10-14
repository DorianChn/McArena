#!/usr/bin/env node
/**
 * McArena Skill 入口脚本（零依赖，Node 内置模块）。
 *
 * 职责：定位仓库根 → 调用共享引擎 CLI（packages/arena-core/src/cli/challenge.ts）→ 透传退出码。
 * 本脚本**不含任何点餐/评分业务逻辑**，全部逻辑来自 @mcarena/arena-core 共享模块，
 * 与网页端、REST API 同源，避免出现第二套不一致的实现。
 *
 * 用法：
 *   node scripts/run-match.mjs --people 2 --budget 60 --goal balanced --seed 42
 *   node scripts/run-match.mjs --people 3 --goal protein --json --out ./artifacts/m.json --html ./artifacts/m.html
 *
 * 附加选项（本脚本独有）：
 *   --repo <path>     显式指定 McArena 仓库根目录
 *   --no-artifacts    不自动生成 JSON / HTML 结果文件
 *   -h, --help        显示帮助
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.dirname(SCRIPT_DIR)

const HELP = `麦门 AI 竞技场 · Skill 运行脚本

用法：node scripts/run-match.mjs [挑战参数]

挑战参数（透传给共享引擎 CLI，完整列表见 references/examples.md）：
  --people <1-12>     就餐人数（默认 2）
  --budget <元>       预算（元）
  --scene <场景>      dine-in | take-away | delivery
  --goal <目标>       balanced | protein | low-sodium | low-cal | budget | none
  --tags a,b          必含标签      --categories a,b  必含类别
  --must a,b          必选餐品编码  --exclude a,b     排除餐品编码
  --max-items <n>     最多餐品种类数
  --kcal/--protein/--sodium-max   人均营养目标
  --coupons/--no-coupons          是否优先用券
  --seed <n>          随机种子（便于复现）
  --mode <模式>       auto | mock | replay | live（默认 auto）
  --json              输出机器可读 JSON（stdout 仅含 JSON）
  --out <文件>        写入 JSON 结果
  --html <文件>       写入可打开的 HTML 战报
  --quiet             仅输出结果文件路径

本脚本附加选项：
  --repo <path>       显式指定 McArena 仓库根目录
  --no-artifacts      不自动生成 JSON / HTML 结果文件
  -h, --help          显示本帮助
`

function fail(message, code = 1) {
  process.stderr.write(`[mc-arena] ${message}\n`)
  process.exit(code)
}

/** 定位仓库根：MCARENA_ROOT → 技能目录内的 .mcarena-root → 从脚本目录向上查找 package.json */
function resolveRepoRoot(explicit) {
  const candidates = []
  if (explicit) candidates.push(explicit)
  if (process.env.MCARENA_ROOT) candidates.push(process.env.MCARENA_ROOT)
  const marker = path.join(SKILL_DIR, '.mcarena-root')
  if (existsSync(marker)) {
    const value = readFileSync(marker, 'utf8').trim()
    if (value) candidates.push(value)
  }
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (isRepoRoot(resolved)) return resolved
  }
  // 从脚本目录与 cwd 逐级向上查找
  for (const start of [SCRIPT_DIR, process.cwd()]) {
    let dir = path.resolve(start)
    for (let i = 0; i < 8; i += 1) {
      if (isRepoRoot(dir)) return dir
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

function isRepoRoot(dir) {
  const pkgPath = path.join(dir, 'package.json')
  if (!existsSync(pkgPath)) return false
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    return pkg.name === 'mcarena'
  } catch {
    return false
  }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  let repoArg = null
  let autoArtifacts = true
  const forwarded = []
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--repo') {
      repoArg = argv[i + 1] ?? null
      i += 1
      continue
    }
    if (token === '--no-artifacts') {
      autoArtifacts = false
      continue
    }
    forwarded.push(token)
  }

  const repoRoot = resolveRepoRoot(repoArg)
  if (!repoRoot) {
    fail(
      '未找到 McArena 仓库根目录。请设置环境变量 MCARENA_ROOT 指向仓库，或使用 --repo <path> 指定。',
      3,
    )
  }

  const cliPath = path.join(repoRoot, 'packages', 'arena-core', 'src', 'cli', 'challenge.ts')
  if (!existsSync(cliPath)) {
    fail(`未找到共享引擎 CLI：${cliPath}`, 3)
  }
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (!existsSync(tsxCli)) {
    fail(`未找到 tsx（${tsxCli}）。请先在仓库根目录执行 npm install。`, 3)
  }

  // 未指定任何输出方式时，默认生成 JSON + HTML 结果文件（保证总有一个可打开/可复现的产物）
  const hasOutputFlag = forwarded.some((t) =>
    ['--out', '--html', '--json', '--quiet'].includes(t),
  )
  const args = [...forwarded]
  let pendingNotice = null
  if (autoArtifacts && !hasOutputFlag) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outDir = path.join(repoRoot, 'artifacts')
    mkdirSync(outDir, { recursive: true })
    args.push('--out', path.join(outDir, `mc-arena-${stamp}.json`))
    args.push('--html', path.join(outDir, `mc-arena-${stamp}.html`))
    pendingNotice = `[mc-arena] 已启用默认产物输出：${outDir}\n`
  }

  const child = spawn(process.execPath, [tsxCli, cliPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, MCARENA_ROOT: repoRoot },
  })
  child.on('error', (error) => fail(`启动共享引擎失败：${error.message}`, 1))
  child.on('exit', (code, signal) => {
    if (signal) fail(`共享引擎被信号 ${signal} 终止`, 1)
    // 仅在成功时提示产物目录，避免失败时产生误导
    if (pendingNotice && code === 0) process.stderr.write(pendingNotice)
    process.exit(code ?? 0)
  })
}

main()
