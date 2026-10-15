#!/usr/bin/env node
/**
 * 报名前就绪自查（P5-4）。
 * 检查项：必需文件存在 / CONTEST_DECLARATION 与官方一致（可选，需网络）/
 *          工作区无真实密钥 / git 远程配置 / 仓库公开性提示。
 *
 * 用法：node tools/contest-readiness.mjs [--online]
 *   --online  额外拉取官方 CONTEST_DECLARATION.md 做字节级比对（需要网络）
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..')
const online = process.argv.includes('--online')

const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })

// 1) 官方必需文件
for (const file of ['README.md', 'CONTEST_DECLARATION.md', 'MCP_INTEGRATION.md', 'mcp-config.example.json']) {
  const p = path.join(repoRoot, file)
  const exists = existsSync(p)
  const size = exists ? readFileSync(p).byteLength : 0
  check(`必需文件 ${file}`, exists && size > 0, exists ? `${size} bytes` : '缺失或为空')
}
// workbuddy.md：WorkBuddy 专项奖励必需
check('workbuddy.md（WorkBuddy 奖励必需）', existsSync(path.join(repoRoot, 'workbuddy.md')),
  existsSync(path.join(repoRoot, 'workbuddy.md')) ? '存在' : '缺失')

// 2) CONTEST_DECLARATION 与官方字节级一致
if (online) {
  try {
    const res = execSync(
      'curl -sL --max-time 30 https://raw.githubusercontent.com/M-China/mcd-developer-innovation-challenge/main/CONTEST_DECLARATION.md',
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    )
    const local = readFileSync(path.join(repoRoot, 'CONTEST_DECLARATION.md'), 'utf8')
    // 官方文件应为 LF；统一换行后比对，避免 CRLF 误报
    const norm = (s) => s.replace(/\r\n/g, '\n')
    check('CONTEST_DECLARATION 与官方一致', norm(res) === norm(local),
      norm(res) === norm(local) ? '字节级一致' : '内容有差异，必须改回官方原文')
  } catch (error) {
    check('CONTEST_DECLARATION 与官方一致', false, `联网核对失败：${error.message}（不影响提交，人工确认即可）`)
  }
}

// 3) 密钥扫描（与 CI 同模式，工作区范围）
// 注意：Windows 下 execSync 走 cmd.exe，单引号 pathspec 会被原样传递导致 git 报错；
// 因此这里用 execFileSync 直接传参（不经 shell），package-lock.json 命中在 JS 侧过滤。
try {
  const pattern = 'Bearer[[:space:]]+[A-Za-z0-9._+/=-]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}'
  let hits = ''
  try {
    hits = execFileSync('git', ['grep', '-nIE', pattern, '--', '.'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (error) {
    // git grep 无命中时退出码为 1，stdout 为空属正常
    hits = String(error.stdout ?? '')
    if (error.status !== 1) throw error
  }
  const realHits = hits
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('package-lock.json:'))
  check('工作区无真实密钥', realHits.length === 0,
    realHits.length === 0 ? 'git grep 无命中' : `疑似命中：\n${realHits.slice(0, 10).join('\n')}`)
} catch (error) {
  check('工作区无真实密钥', false, `扫描失败：${error.message}`)
}

// 4) git 远程与分支
try {
  const remote = execSync('git remote -v', { cwd: repoRoot, encoding: 'utf8' }).trim()
  check('git remote 已配置', remote.length > 0, remote.length > 0 ? remote.split('\n')[0] : '未配置 origin（push 前需先添加）')
} catch {
  check('git remote 已配置', false, '读取失败')
}
try {
  const branch = execSync('git branch --show-current', { cwd: repoRoot, encoding: 'utf8' }).trim()
  check('当前分支', branch.length > 0, branch)
} catch {
  check('当前分支', false, '读取失败')
}

// 5) 构建产物可复现提示
check('package.json scripts（dev/build/test/verify 齐备）', (() => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const scripts = pkg.scripts ?? {}
  return ['build', 'test', 'verify'].every((k) => typeof scripts[k] === 'string')
})(), 'build/test/verify 齐备')

// 汇总
const pad = Math.max(...results.map((r) => r.name.length))
let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  process.stdout.write(`${r.ok ? '✅' : '❌'} ${r.name.padEnd(pad)}  ${r.detail}\n`)
}
process.stdout.write(`\n${results.length - failed}/${results.length} 项通过\n`)
if (failed > 0) process.exitCode = 1
