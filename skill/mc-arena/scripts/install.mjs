#!/usr/bin/env node
/**
 * McArena Skill 安装脚本（零依赖）。
 *
 * 把本技能目录复制到 WorkBuddy 的 skills 目录，并写入 `.mcarena-root` 标记文件，
 * 使 run-match.mjs 在任意工作目录下都能定位到 McArena 仓库。
 *
 * 用法：
 *   node scripts/install.mjs              # 安装到用户级 ~/.workbuddy-ai/skills/mc-arena
 *   node scripts/install.mjs --project    # 安装到 <仓库>/.workbuddy-ai/skills/mc-arena
 *   node scripts/install.mjs --dry-run    # 只打印将要执行的动作
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.dirname(SCRIPT_DIR)
const SKILL_NAME = path.basename(SKILL_DIR)
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..')

const argv = process.argv.slice(2)
const useProject = argv.includes('--project')
const dryRun = argv.includes('--dry-run')

if (SKILL_NAME !== 'mc-arena') {
  process.stderr.write(`[install] 技能目录名异常（期望 mc-arena，实际 ${SKILL_NAME}），已中止。\n`)
  process.exit(1)
}
if (!existsSync(path.join(REPO_ROOT, 'package.json'))) {
  process.stderr.write(`[install] 未在 ${REPO_ROOT} 找到 package.json，请确认技能位于 <仓库>/skill/mc-arena 下。\n`)
  process.exit(1)
}

const targetRoot = useProject
  ? path.join(REPO_ROOT, '.workbuddy-ai', 'skills')
  : path.join(os.homedir(), '.workbuddy-ai', 'skills')
const targetDir = path.join(targetRoot, SKILL_NAME)

process.stdout.write(`[install] 源目录：${SKILL_DIR}\n`)
process.stdout.write(`[install] 目标目录：${targetDir}\n`)
process.stdout.write(`[install] 仓库根：${REPO_ROOT}\n`)

if (dryRun) {
  process.stdout.write('[install] --dry-run：未做任何改动。\n')
  process.exit(0)
}

mkdirSync(targetRoot, { recursive: true })
if (existsSync(targetDir)) {
  process.stdout.write('[install] 目标已存在，先移除旧副本（仅限该技能目录）。\n')
  rmSync(targetDir, { recursive: true, force: true })
}
cpSync(SKILL_DIR, targetDir, { recursive: true })

// 写入仓库定位标记，供 run-match.mjs 使用
writeFileSync(path.join(targetDir, '.mcarena-root'), REPO_ROOT + '\n', 'utf8')

process.stdout.write('\n[install] 完成 ✅\n')
process.stdout.write('下一步：\n')
process.stdout.write('  1) 在 WorkBuddy 中启用该技能（技能列表 → 找到「麦门 AI 竞技场」→ 启用/信任）。\n')
process.stdout.write('  2) 确认仓库已安装依赖：cd "' + REPO_ROOT + '" && npm install\n')
process.stdout.write('  3) 试运行：\n')
process.stdout.write(
  `     node "${path.join(targetDir, 'scripts', 'run-match.mjs')}" --people 2 --budget 60 --goal balanced --seed 42\n`,
)
process.stdout.write('  4) 若技能列表未刷新，重启 WorkBuddy 后重试。\n')
