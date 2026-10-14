/**
 * 阶段05 浏览器实测脚本（真实 Chromium 交互 + 截图 + 控制台错误收集）。
 *
 * 依赖：playwright-core（隔离安装在 WorkBuddy 托管 node workspace 中，不污染仓库）
 *   NODE_PATH=<...>/node/workspace/node_modules
 *
 * 用法：
 *   NODE_PATH="<workspace>/node_modules" node tools/e2e/visual-check.mjs
 *
 * 环境变量：
 *   MC_BASE_URL   默认 http://localhost:5173
 *   MC_SHOT_DIR   默认 docs/screenshots/stage05
 *   CHROME_PATH   默认 C:/Program Files/Google/Chrome/Application/chrome.exe
 *   MC_HEADFUL=1  显示浏览器窗口（调试用）
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

// playwright-core 通过 NODE_PATH 暴露（CJS 解析支持 NODE_PATH，ESM import 不支持），
// 因此这里用 createRequire 加载，避免污染仓库依赖。
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright-core'))
} catch {
  process.stderr.write(
    [
      '无法加载 playwright-core。请任选一种方式：',
      '  1) 安装到隔离工作区后通过 NODE_PATH 指向它：',
      '     npm install playwright-core --prefix <隔离目录>',
      '     NODE_PATH=<隔离目录>/node_modules node tools/e2e/visual-check.mjs',
      '  2) 在仓库内安装：npm install -D playwright-core（会写入 package.json，请自行评估）',
      '',
      '本脚本使用系统已安装的 Chrome（CHROME_PATH），不会下载浏览器。',
      '',
    ].join('\n'),
  )
  process.exit(2)
}

const BASE_URL = process.env.MC_BASE_URL ?? 'http://localhost:5173'
const SHOT_DIR = path.resolve(process.env.MC_SHOT_DIR ?? 'docs/screenshots/stage05')
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const HEADLESS = process.env.MC_HEADFUL !== '1'

mkdirSync(SHOT_DIR, { recursive: true })

const consoleErrors = []
const consoleWarnings = []
const steps = []
const log = (...args) => process.stdout.write(args.join(' ') + '\n')

function record(step, detail) {
  steps.push({ step, detail, at: new Date().toISOString() })
  log(`[step] ${step} — ${detail}`)
}

/** 收集控制台消息与页面异常 */
function attachDiagnostics(page, label) {
  page.on('console', (message) => {
    const type = message.type()
    const text = `[${label}] ${message.text()}`
    if (type === 'error') consoleErrors.push(text)
    else if (type === 'warning') consoleWarnings.push(text)
  })
  page.on('pageerror', (error) => consoleErrors.push(`[${label}] pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    consoleErrors.push(`[${label}] requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
  })
  // 404 / 5xx 响应（浏览器控制台只报 "Failed to load resource"，需自行记录 URL）
  page.on('response', (response) => {
    const status = response.status()
    if (status >= 400) {
      consoleErrors.push(`[${label}] http ${status}: ${response.url()}`)
    }
  })
}

async function dump(page, title) {
  const text = await page.locator('body').innerText().catch(() => '')
  const controls = await page
    .locator('button, a, [role="button"], input, select')
    .evaluateAll((nodes) =>
      nodes.slice(0, 40).map((node) => ({
        tag: node.tagName.toLowerCase(),
        text: (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().slice(0, 40),
        type: node.getAttribute('type') ?? '',
      })),
    )
    .catch(() => [])
  log(`\n===== ${title} =====`)
  log(text.slice(0, 1600))
  log('--- controls ---')
  log(JSON.stringify(controls, null, 0))
  return { text, controls }
}

async function shot(page, name, options = {}) {
  const file = path.join(SHOT_DIR, name)
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false })
  record(`screenshot:${name}`, `${page.viewportSize()?.width}x${page.viewportSize()?.height}`)
  return file
}

/** 按可见文本点击（多候选逐个尝试） */
async function clickByText(page, candidates) {
  for (const text of candidates) {
    const locator = page.getByText(text, { exact: false }).first()
    if (await locator.count().catch(() => 0)) {
      try {
        await locator.click({ timeout: 3000 })
        return text
      } catch {
        /* 尝试下一个 */
      }
    }
  }
  return null
}

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: HEADLESS,
})

const summary = {
  baseUrl: BASE_URL,
  chromePath: CHROME_PATH,
  consoleErrors,
  consoleWarnings,
  steps,
  pages: {},
}

try {
  // ---------------------------------------------------------------- 桌面 · 深色
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
    locale: 'zh-CN',
    deviceScaleFactor: 1,
  })
  const page = await desktop.newPage()
  attachDiagnostics(page, 'desktop')

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  summary.pages.home = await dump(page, '首页（深色 · 桌面 1440×960）')
  await shot(page, '01-home-dark.png', { fullPage: true })

  // 主题切换：按钮以 aria-label 标注（图标按钮无可读文本）
  const themeButton = page.getByRole('button', { name: /浅色模式|深色模式/ }).first()
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme ?? '(unset)')
  if (await themeButton.count().catch(() => 0)) {
    await themeButton.click({ timeout: 5000 })
    await page.waitForTimeout(700)
    const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme ?? '(unset)')
    record('theme-toggle', `data-theme: ${themeBefore} → ${themeAfter}`)
    summary.themeToggle = { before: themeBefore, after: themeAfter }
  } else {
    record('theme-toggle', '未找到主题切换按钮（跳过）')
  }
  await shot(page, '02-home-light.png', { fullPage: true })

  // 切回深色便于后续对比
  const themeBack = page.getByRole('button', { name: /浅色模式|深色模式/ }).first()
  if (await themeBack.count().catch(() => 0)) {
    await themeBack.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
    summary.themeToggleRestored = await page.evaluate(() => document.documentElement.dataset.theme ?? '(unset)')
    record('theme-restore', `data-theme: ${summary.themeToggleRestored}`)
  }

  // ---------------------------------------------------------------- 挑战设置
  const toSetup = await clickByText(page, ['开始挑战', '一键开始', '开始比赛', '进入竞技场', '设置'])
  record('nav-setup', toSetup ? `点击「${toSetup}」` : '未找到入口（尝试直接改 hash）')
  await page.waitForTimeout(800)
  if (!page.url().includes('setup')) {
    await page.goto(`${BASE_URL}/#/setup`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
  }
  summary.pages.setup = await dump(page, '挑战设置')
  await shot(page, '03-setup-dark.png', { fullPage: true })

  // ---------------------------------------------------------------- 竞技场
  const startClicked = await clickByText(page, ['开始对决', '开始比赛', '开始挑战', '开赛', '立即开始'])
  record('start-match', startClicked ? `点击「${startClicked}」` : '未找到开赛按钮')
  await page.waitForTimeout(700)
  await shot(page, '04-arena-dark.png', { fullPage: true })
  summary.pages.arena = await dump(page, '竞技场（回放中）')

  // ---------------------------------------------------------------- 结果页
  const reachedResult = await page
    .waitForFunction(() => window.location.hash.includes('result'), { timeout: 60_000 })
    .then(() => true)
    .catch(() => false)
  record('wait-result', reachedResult ? '已自动跳转结果页' : '超时未跳转，尝试手动跳转')
  if (!reachedResult) {
    await page.goto(`${BASE_URL}/#/result`, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForTimeout(1200)
  summary.pages.result = await dump(page, '比赛结果')
  await shot(page, '05-result-dark.png', { fullPage: true })

  // 结果页浅色模式
  const resultTheme = page.getByRole('button', { name: /浅色模式|深色模式/ }).first()
  if (await resultTheme.count().catch(() => 0)) {
    await resultTheme.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(700)
    summary.resultTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? '(unset)')
    record('result-theme', `结果页 data-theme: ${summary.resultTheme}`)
  }
  await shot(page, '05b-result-light.png', { fullPage: true })

  await desktop.close()

  // ---------------------------------------------------------------- 移动端
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    colorScheme: 'light',
  })
  const mpage = await mobile.newPage()
  attachDiagnostics(mpage, 'mobile')
  await mpage.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await mpage.waitForTimeout(1200)
  summary.pages.mobileHome = await dump(mpage, '首页（浅色 · 移动端 390×844）')
  await shot(mpage, '06-mobile-home-light.png', { fullPage: true })

  // 移动端横向溢出检测
  const overflow = await mpage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  summary.mobileOverflow = overflow
  record('mobile-overflow', `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`)

  await mpage.goto(`${BASE_URL}/#/setup`, { waitUntil: 'domcontentloaded' })
  await mpage.waitForTimeout(800)
  await shot(mpage, '07-mobile-setup-light.png', { fullPage: true })

  // 空状态：直接访问结果页（本上下文无比赛状态）→ 应展示 Empty 状态而非崩溃
  await mpage.goto(`${BASE_URL}/#/result`, { waitUntil: 'domcontentloaded' })
  await mpage.waitForTimeout(900)
  summary.pages.mobileEmptyResult = await dump(mpage, '结果页空状态（移动端）')
  await shot(mpage, '08-mobile-result-empty.png', { fullPage: true })

  await mobile.close()
} catch (error) {
  record('FATAL', error instanceof Error ? error.message : String(error))
  summary.fatal = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
} finally {
  await browser.close().catch(() => {})
}

writeFileSync(path.join(SHOT_DIR, 'visual-check-report.json'), JSON.stringify(summary, null, 2), 'utf8')
log('\n================ 汇总 ================')
log(`控制台错误：${consoleErrors.length}`)
for (const error of consoleErrors.slice(0, 20)) log(`  ✖ ${error}`)
log(`控制台警告：${consoleWarnings.length}`)
for (const warning of consoleWarnings.slice(0, 10)) log(`  ⚠ ${warning}`)
log(`截图目录：${SHOT_DIR}`)
process.exitCode = consoleErrors.length > 0 || summary.fatal ? 1 : 0
