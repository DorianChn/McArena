#!/usr/bin/env node
/**
 * 演示 GIF 帧捕获：在真实 Chrome 中跑「首页 → 设置 → 竞技场回放 → 结果页」，
 * 按固定节奏输出编号 PNG 帧，供用户用任意工具（ScreenToGif / ezgif.com /
 * ffmpeg / ImageMagick）合成为 GIF。本脚本只产帧，不产视频（本环境不生成多媒体内容）。
 *
 * 依赖：playwright-core（隔离安装，经 NODE_PATH 加载）与系统 Chrome。
 *
 * 用法：
 *   NODE_PATH="<PLAYWRIGHT_NODE_MODULES>" \
 *   node tools/e2e/capture-demo-frames.mjs
 *
 * 环境变量：
 *   MC_BASE_URL      默认 http://127.0.0.1:5174（需先起 preview，见 mca-stage-verify 技能）
 *   MC_FRAME_DIR     默认 docs/screenshots/gif-frames（相对路径基于仓库根解析）
 *   CHROME_PATH      默认 C:/Program Files/Google/Chrome/Application/chrome.exe
 *   MC_FPS_MS        帧间隔毫秒，默认 400
 *   MC_MAX_FRAMES    竞技场段最大帧数，默认 24
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright-core'))
} catch {
  process.stderr.write('无法加载 playwright-core：请先用 NODE_PATH 指向隔离安装目录\n')
  process.exit(2)
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const BASE_URL = process.env.MC_BASE_URL ?? 'http://127.0.0.1:5174'
// 关键：默认值也基于仓库根解析，避免落进会话目录
const FRAME_DIR = path.resolve(repoRoot, process.env.MC_FRAME_DIR ?? 'docs/screenshots/gif-frames')
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const FRAME_MS = Number(process.env.MC_FPS_MS ?? '400')
const MAX_FRAMES = Number(process.env.MC_MAX_FRAMES ?? '24')

mkdirSync(FRAME_DIR, { recursive: true })
const log = (...args) => process.stdout.write(args.join(' ') + '\n')

let frameIndex = 0
async function snap(page, name) {
  frameIndex += 1
  const file = path.join(FRAME_DIR, `${String(frameIndex).padStart(3, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  log(`[frame] ${path.basename(file)}`)
  return file
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
const captured = []
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
    locale: 'zh-CN',
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => log(`[pageerror] ${error.message}`))

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  captured.push(await snap(page, 'home'))

  // 进入设置页（点击「自定义挑战」）
  const toSetup = page.getByRole('button', { name: /自定义挑战/ }).first()
  if (await toSetup.count()) {
    await toSetup.click({ timeout: 5000 }).catch(() => {})
  } else {
    await page.goto(`${BASE_URL}/#/setup`, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForTimeout(900)
  captured.push(await snap(page, 'setup'))

  // 开赛（4x 加速回放，便于短时间捕获完整过程）
  const start = page.getByRole('button', { name: /开始对决/ }).first()
  if (await start.count()) {
    await start.click({ timeout: 5000 }).catch(() => {})
  }
  await page.waitForTimeout(700)
  const speed4x = page.getByRole('button', { name: '4x' }).first()
  if (await speed4x.count()) {
    await speed4x.click({ timeout: 3000 }).catch(() => {})
  }

  // 竞技场段：按节奏持续捕获，直到出现结果页或达到上限
  for (let i = 0; i < MAX_FRAMES; i += 1) {
    if (page.url().includes('result')) break
    captured.push(await snap(page, 'arena'))
    await page.waitForTimeout(FRAME_MS)
  }

  // 等结果页并捕获
  await page
    .waitForFunction(() => window.location.hash.includes('result'), { timeout: 30_000 })
    .catch(() => {})
  await page.waitForTimeout(1200)
  captured.push(await snap(page, 'result'))
  await page.waitForTimeout(400)
  captured.push(await snap(page, 'result-bottom'))

  await context.close()
} catch (error) {
  log(`[FATAL] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await browser.close().catch(() => {})
}

writeFileSync(path.join(FRAME_DIR, 'capture-summary.json'), JSON.stringify({ frames: captured, at: new Date().toISOString() }, null, 2))
log(`\n共 ${captured.length} 帧 → ${FRAME_DIR}`)
log('合成 GIF（任选其一，在仓库根执行）：')
log('  ffmpeg -framerate 2.5 -i docs/screenshots/gif-frames/%03d-*.png -vf "scale=960:-1" docs/screenshots/demo.gif')
log('  magick -delay 40 docs/screenshots/gif-frames/*.png docs/screenshots/demo.gif')
log('  或上传 https://ezgif.com/maker 勾选 2.5 fps 后下载')
