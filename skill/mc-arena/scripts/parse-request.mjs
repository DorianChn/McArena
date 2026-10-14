#!/usr/bin/env node
/**
 * 自然语言 → challenge CLI 参数的确定性解析器（零依赖）。
 *
 * 定位：为 WorkBuddy Skill 提供一个**可测试、可复现**的解析兜底。
 * 语言模型可以自行解析用户输入，但当输入包含明确数字/关键词时，
 * 用本脚本解析可避免歧义（例如「3人60元」），并把解析结果显式展示给用户核对。
 *
 * 本脚本只做文本 → 参数的映射，不含任何点餐/评分业务逻辑。
 *
 * 用法（CLI）：
 *   node scripts/parse-request.mjs "3个人 预算60 要低卡"
 *   node scripts/parse-request.mjs "双人堂食 50元以内 高蛋白 用券" --json
 *   node scripts/parse-request.mjs "2人 预算30" --print-args
 *
 * 用法（模块）：
 *   import { parseRequest } from './parse-request.mjs'
 *   const { args, fields, notes } = parseRequest('3人 60元 低钠')
 */

const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 双: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 中文数字（支持 一~十二 的常见写法）→ 阿拉伯数字 */
function cnNumber(text) {
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '十') return 10
  const tenMatch = /^十([一二三四五六七八九])$/.exec(text)
  if (tenMatch) return 10 + CN_DIGITS[tenMatch[1]]
  const headMatch = /^([一二三四五六七八九])十$/.exec(text)
  if (headMatch) return CN_DIGITS[headMatch[1]] * 10
  const bothMatch = /^([一二三四五六七八九])十([一二三四五六七八九])$/.exec(text)
  if (bothMatch) return CN_DIGITS[bothMatch[1]] * 10 + CN_DIGITS[bothMatch[2]]
  if (text.length === 1 && text in CN_DIGITS) return CN_DIGITS[text]
  return null
}

const GOAL_RULES = [
  { goal: 'protein', label: '高蛋白', pattern: /(高蛋白|蛋白|增肌|健身|长肌肉)/ },
  { goal: 'low-sodium', label: '低钠', pattern: /(低钠|少盐|控盐|低盐|减盐)/ },
  { goal: 'low-cal', label: '低热量', pattern: /(低卡|低热量|减肥|减脂|轻食|清爽|低脂)/ },
  { goal: 'balanced', label: '均衡搭配', pattern: /(均衡|营养搭配|搭配|全套|完整套餐|一整套)/ },
  { goal: 'budget', label: '省钱优先', pattern: /(省钱|便宜|划算|最省|经济|实惠)/ },
]

const SCENE_RULES = [
  { scene: 'take-away', label: '外带', pattern: /(外带|带走|打包|外取)/ },
  { scene: 'delivery', label: '外送', pattern: /(外送|外卖|送到|配送|送餐)/ },
  { scene: 'dine-in', label: '堂食', pattern: /(堂食|店里|店内|现场吃|坐着吃)/ },
]

const NUMBER_TOKEN = '([0-9]+|[零一二两双三四五六七八九十]{1,3})'

export function parseRequest(text) {
  const input = String(text ?? '')
  const fields = {}
  const notes = []

  // ---- 人数 ----
  const peopleMatch = new RegExp(`(${NUMBER_TOKEN})\\s*(?:个)?\\s*(?:人|位|人份|个人)`).exec(input)
  if (peopleMatch) {
    const value = cnNumber(peopleMatch[1])
    if (value !== null && value >= 1 && value <= 12) {
      fields.people = value
      notes.push(`人数：${value}（来自「${peopleMatch[0].trim()}」）`)
    } else if (value !== null) {
      notes.push(`人数 ${value} 超出 1–12 范围，已忽略`)
    }
  }

  // ---- 预算 ----
  const budgetMatch =
    /预算\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/.exec(input) ??
    /[¥￥]\s*([0-9]+(?:\.[0-9]+)?)/.exec(input) ??
    /([0-9]+(?:\.[0-9]+)?)\s*(?:元|块钱|块|圆)/.exec(input) ??
    /(?:不超过|最多|控制在|以内|之内|以下)\s*([0-9]+(?:\.[0-9]+)?)/.exec(input)
  if (budgetMatch) {
    const value = Number(budgetMatch[1])
    if (Number.isFinite(value) && value > 0) {
      fields.budgetYuan = value
      notes.push(`预算：¥${value}（来自「${budgetMatch[0].trim()}」）`)
    }
  }

  // ---- 目标 ----
  for (const rule of GOAL_RULES) {
    const match = rule.pattern.exec(input)
    if (match) {
      fields.goal = rule.goal
      notes.push(`目标：${rule.label}（来自「${match[0]}」）`)
      break
    }
  }

  // ---- 场景 ----
  for (const rule of SCENE_RULES) {
    const match = rule.pattern.exec(input)
    if (match) {
      fields.scene = rule.scene
      notes.push(`场景：${rule.label}（来自「${match[0]}」）`)
      break
    }
  }

  // ---- 优惠券 ----
  if (/(不用券|别用券|不要券|不用优惠|不领券)/.test(input)) {
    fields.preferCoupons = false
    notes.push('优惠券：不使用（用户明确表示不用券）')
  } else if (/(用券|优惠券|领券|优惠|薅羊毛)/.test(input)) {
    fields.preferCoupons = true
    notes.push('优惠券：优先使用')
  }

  // ---- 种子 ----
  const seedMatch = /(?:seed|种子)\s*[:=]?\s*([0-9]+)/i.exec(input)
  if (seedMatch) {
    fields.seed = Number(seedMatch[1])
    notes.push(`种子：${fields.seed}（用于复现）`)
  }

  // ---- 餐品种类上限 ----
  const maxMatch = /最多\s*([0-9]+)\s*种/.exec(input)
  if (maxMatch) {
    fields.maxDistinctItems = Number(maxMatch[1])
    notes.push(`最多餐品种类：${fields.maxDistinctItems} 种`)
  }

  return { args: toArgs(fields), fields, notes }
}

/** fields → challenge CLI 参数数组（顺序稳定，便于测试与展示） */
export function toArgs(fields) {
  const args = []
  if (fields.people !== undefined) args.push('--people', String(fields.people))
  if (fields.budgetYuan !== undefined) args.push('--budget', String(fields.budgetYuan))
  if (fields.scene !== undefined) args.push('--scene', fields.scene)
  if (fields.goal !== undefined) args.push('--goal', fields.goal)
  if (fields.maxDistinctItems !== undefined) args.push('--max-items', String(fields.maxDistinctItems))
  if (fields.preferCoupons === true) args.push('--coupons')
  if (fields.preferCoupons === false) args.push('--no-coupons')
  if (fields.seed !== undefined) args.push('--seed', String(fields.seed))
  return args
}

function main() {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  const printArgs = argv.includes('--print-args')
  const text = argv.filter((token) => !token.startsWith('--')).join(' ')
  if (!text) {
    process.stderr.write('用法：node scripts/parse-request.mjs "3个人 预算60 要低卡" [--json|--print-args]\n')
    process.exit(2)
  }
  const result = parseRequest(text)
  if (printArgs) {
    process.stdout.write(result.args.join(' ') + '\n')
    return
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }
  process.stdout.write(`输入：${text}\n`)
  process.stdout.write(`解析结果：${result.args.join(' ') || '（未识别到任何参数，将使用默认值）'}\n`)
  for (const note of result.notes) process.stdout.write(`  · ${note}\n`)
}

const invokedDirectly = process.argv[1] ? /parse-request\.(mjs|js)$/.test(process.argv[1]) : false
if (invokedDirectly) main()
