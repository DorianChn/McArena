import { AgentVerificationSchema } from '@mcarena/shared'
import type {
  AgentExecution,
  AgentVerification,
  ArenaDataset,
  Challenge,
  Coupon,
  JudgeCheck,
  JudgeViolation,
  MenuItem,
  ProposalItem,
} from '@mcarena/shared'
import type { PriceOracle } from '../types.js'
import { applyCoupons } from './coupons.js'
import { SCENE_DELIVERY_FEE_CENTS } from './agent-utils.js'

/**
 * 阶段04 独立验证器（Independent Verifier）。
 *
 * 核心原则：**裁判不信任 Agent 自己报告的任何成绩**——餐品存在性、单价、
 * 数量、优惠、营养、应付价格全部由裁判基于当前数据集重新核算。
 *
 * 验证项（对应 JUDGE_SPEC.md §2）：
 *   1. 餐品真实存在且在售          5. 优惠券使用条件（存在/类型/门槛/适用标签）
 *   2. 预算限制（以裁决成本判定）    6. 官方 calculate-price 核价（优先）
 *   3. 人数与商品数量               7. 无官方记录 → NOT_VERIFIED（不是通过）
 *   4. 营养约束达成率               8. 有效性 / 成本 / 响应时间
 *
 * 输出经过 AgentVerificationSchema 结构化校验，违规带 severity 与数据证据引用。
 */

export interface VerifyInput {
  agent: AgentExecution
  challenge: Challenge
  dataset: ArenaDataset
  /** 官方价格预言机（命中数据集内官方 calculate-price 记录） */
  priceOracle?: PriceOracle
}

/** 单个 Agent 提案的独立验证（同步部分；核价为异步） */
export async function verifyAgentProposal(input: VerifyInput): Promise<AgentVerification> {
  const { agent, challenge, dataset } = input
  const checks: JudgeCheck[] = []
  const violations: JudgeViolation[] = []
  const addCheck = (name: string, passed: boolean, detail: string, evidenceRef = ''): void => {
    checks.push({ name, passed, detail, evidenceRef })
  }
  const addViolation = (
    code: JudgeViolation['code'],
    severity: JudgeViolation['severity'],
    message: string,
    evidenceRef = '',
  ): void => {
    violations.push({ code, severity, message, evidenceRef })
  }

  const proposal = agent.proposal
  const menuByCode = new Map<string, MenuItem>(dataset.menuItems.map((item) => [item.code, item]))
  const constraints = challenge.constraints

  // ---- 1) 空提案 ----
  if (!proposal || proposal.items.length === 0) {
    addCheck('提案存在性', false, 'Agent 未产出任何餐品', `${dataset.sourceRef}`)
    addViolation('empty-proposal', 'fatal', 'Agent 未产出提案或提案为空', dataset.sourceRef)
    return AgentVerificationSchema.parse({
      agentId: agent.agentId,
      engine: `${agent.engine}@${agent.engineVersion}`,
      eligible: false,
      priceStatus: 'not-verified',
      officialCostCents: null,
      claimedCostCents: proposal?.totalCents ?? null,
      recomputedCostCents: null,
      effectiveCostCents: null,
      targetAchievement: null,
      verifiedSubtotalCents: null,
      verifiedDeliveryCents: null,
      verifiedDiscountCents: null,
      validCouponCodes: [],
      responseMs: agent.durationMs ?? 0,
      checks,
      violations,
    })
  }
  addCheck('提案存在性', true, `${proposal.items.length} 项餐品`, dataset.sourceRef)

  // ---- 2) 餐品存在性 / 在售 / 数量合法性 / 重复 ----
  const seen = new Set<string>()
  let existenceOk = true
  let qtyOk = true
  let priceSane = true
  for (const item of proposal.items) {
    const menuItem = menuByCode.get(item.code)
    if (!menuItem) {
      existenceOk = false
      addViolation(
        'unknown-item',
        'fatal',
        `餐品 ${item.code} 不存在于当前数据集`,
        `${dataset.sourceRef}#menuItems`,
      )
      continue
    }
    if (!menuItem.available) {
      existenceOk = false
      addViolation(
        'unavailable-item',
        'fatal',
        `餐品 ${item.code}（${menuItem.name}）当前不在售`,
        `${dataset.sourceRef}#menuItems.${item.code}.available`,
      )
    }
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      qtyOk = false
      addViolation('invalid-qty', 'fatal', `餐品 ${item.code} 数量非法：${String(item.qty)}`)
    }
    // 数据集单价异常（裁判侧数据卫生）
    if (!Number.isInteger(menuItem.priceCents) || menuItem.priceCents < 0) {
      priceSane = false
      addViolation(
        'invalid-price',
        'fatal',
        `数据集餐品 ${item.code} 单价异常：${String(menuItem.priceCents)}`,
        `${dataset.sourceRef}#menuItems.${item.code}.priceCents`,
      )
    }
    // Agent 申报单价与数据集不一致 → 以数据集为准（warning）
    if (item.unitPriceCents !== menuItem.priceCents) {
      addViolation(
        'invalid-price',
        'warning',
        `餐品 ${item.code} 申报单价 ¥${(item.unitPriceCents / 100).toFixed(2)} 与数据集 ¥${(menuItem.priceCents / 100).toFixed(2)} 不一致，裁判以数据集为准`,
        `${dataset.sourceRef}#menuItems.${item.code}.priceCents`,
      )
    }
    if (seen.has(item.code)) {
      addViolation('duplicate-items', 'fatal', `餐品 ${item.code} 在提案中重复出现，数量口径不可信`, `${dataset.sourceRef}#menuItems`)
    }
    seen.add(item.code)
  }
  addCheck('餐品存在且在售', existenceOk, existenceOk ? '全部餐品均存在且在售' : '存在不存在/不在售餐品')
  addCheck('数量合法', qtyOk, qtyOk ? '数量均为正整数' : '存在非法数量')
  addCheck('无重复餐品', seen.size === proposal.items.length, `${proposal.items.length} 行 / ${seen.size} 种`)
  addCheck('数据集单价健康', priceSane, priceSane ? '单价均为非负整数' : '存在异常单价')

  // ---- 3) 裁判独立重算成本（不信 Agent 自述小计/优惠） ----
  const recomputedSubtotal = sumByDataset(proposal.items, menuByCode)
  const recomputedDelivery = constraints.scene === 'delivery' ? SCENE_DELIVERY_FEE_CENTS : 0

  // ---- 4) 优惠券验证 ----
  const couponResult = verifyCoupons({
    claimedCodes: proposal.couponCodes,
    claimedDiscountCents: proposal.discountCents,
    coupons: dataset.coupons,
    items: proposal.items,
    menuByCode,
    subtotalCents: recomputedSubtotal,
    deliveryFeeCents: recomputedDelivery,
  })
  for (const violation of couponResult.violations) violations.push(violation)
  const recomputedDiscount = couponResult.discountCents
  const validCouponCodes = couponResult.validCodes
  addCheck(
    '优惠券条件',
    couponResult.violations.every((entry) => entry.severity === 'warning'),
    couponResult.violations.length === 0
      ? `全部 ${validCouponCodes.length} 张券均满足使用条件`
      : couponResult.violations.map((entry) => entry.message).join('；'),
  )

  const recomputedCost = Math.max(0, recomputedSubtotal + recomputedDelivery - recomputedDiscount)
  if (proposal.subtotalCents !== recomputedSubtotal) {
    addViolation(
      'discount-mismatch',
      'warning',
      `申报小计 ¥${(proposal.subtotalCents / 100).toFixed(2)} 与裁判重算 ¥${(recomputedSubtotal / 100).toFixed(2)} 不一致，裁判以重算值为准`,
      `${dataset.sourceRef}#menuItems`,
    )
  }

  // ---- 5) 官方核价（优先） ----
  let priceStatus: AgentVerification['priceStatus'] = 'not-verified'
  let officialCost: number | null = null
  if (input.priceOracle) {
    const quote = await input.priceOracle.quote({
      items: proposal.items.map((item) => ({ code: item.code, qty: item.qty })),
      couponCodes: validCouponCodes,
    })
    if (quote) {
      officialCost = quote.totalCents
      const claimed = proposal.totalCents
      if (claimed === quote.totalCents) {
        priceStatus = 'verified'
        addCheck(
          '官方核价',
          true,
          `官方 calculate-price 记录 ${quote.quoteId}：应付 ¥${(quote.totalCents / 100).toFixed(2)}，与申报一致`,
          `${dataset.sourceRef}#priceQuotes.${quote.quoteId}`,
        )
      } else {
        priceStatus = 'mismatch'
        addViolation(
          'price-mismatch',
          'warning',
          `申报应付 ¥${((claimed ?? 0) / 100).toFixed(2)} 与官方 calculate-price（${quote.quoteId}）¥${(quote.totalCents / 100).toFixed(2)} 不一致，裁判以官方值为准`,
          `${dataset.sourceRef}#priceQuotes.${quote.quoteId}`,
        )
        addCheck(
          '官方核价',
          false,
          `官方口径 ¥${(quote.totalCents / 100).toFixed(2)} ≠ 申报 ¥${((claimed ?? 0) / 100).toFixed(2)}`,
          `${dataset.sourceRef}#priceQuotes.${quote.quoteId}`,
        )
      }
    } else {
      addCheck('官方核价', false, '数据集中无该购物车的官方 calculate-price 记录 → NOT_VERIFIED', `${dataset.sourceRef}#priceQuotes`)
    }
  } else {
    addCheck('官方核价', false, '未配置价格预言机 → NOT_VERIFIED')
  }
  if (priceStatus === 'not-verified') {
    addViolation(
      'price-not-verifiable',
      'warning',
      '无法通过官方 calculate-price 核对应付价格，本方案成本标记为 NOT_VERIFIED',
      `${dataset.sourceRef}#priceQuotes`,
    )
  }

  // 裁决采用成本：官方核价 > 裁判重算
  const effectiveCost = officialCost ?? recomputedCost

  // ---- 6) 硬约束 ----
  const totalQty = proposal.items.reduce((sum, item) => sum + item.qty, 0)
  const peopleOk = totalQty >= constraints.people
  addCheck('人数覆盖', peopleOk, `共 ${totalQty} 件 / 需求 ${constraints.people} 人`)
  if (!peopleOk) {
    addViolation('people-not-covered', 'fatal', `商品总数 ${totalQty} 件不足以覆盖 ${constraints.people} 人`)
  }

  const budgetOk = constraints.budgetCents === undefined || effectiveCost <= constraints.budgetCents
  addCheck(
    '预算限制',
    budgetOk,
    constraints.budgetCents === undefined
      ? '任务卡未设置预算'
      : `裁决成本 ¥${(effectiveCost / 100).toFixed(2)} / 预算 ¥${(constraints.budgetCents / 100).toFixed(2)}`,
  )
  if (!budgetOk) {
    addViolation(
      'budget-exceeded',
      'fatal',
      `裁决成本 ¥${(effectiveCost / 100).toFixed(2)} 超出预算 ¥${(constraints.budgetCents! / 100).toFixed(2)}`,
      `challenge:${challenge.id}#constraints.budgetCents`,
    )
  }

  const distinct = new Set(proposal.items.map((item) => item.code)).size
  const capOk = constraints.maxDistinctItems === undefined || distinct <= constraints.maxDistinctItems
  addCheck(
    '种类上限',
    capOk,
    constraints.maxDistinctItems === undefined ? '未设置上限' : `${distinct} 种 / 上限 ${constraints.maxDistinctItems} 种`,
  )
  if (!capOk) {
    addViolation('distinct-items-exceeded', 'fatal', `餐品种类 ${distinct} 超过上限 ${constraints.maxDistinctItems}`)
  }

  for (const code of constraints.mustIncludeCodes) {
    const ok = proposal.items.some((item) => item.code === code)
    addCheck(`必选餐品：${code}`, ok, ok ? '已包含' : '缺失')
    if (!ok) {
      addViolation('missing-required-code', 'fatal', `缺少必选餐品 ${code}`, `challenge:${challenge.id}#mustIncludeCodes`)
    }
  }
  for (const tag of constraints.requiredTags) {
    const ok = proposal.items.some((item) => menuByCode.get(item.code)?.tags.includes(tag))
    addCheck(`必选标签：${tag}`, ok, ok ? '已覆盖' : '缺失')
    if (!ok) {
      addViolation('missing-required-tag', 'fatal', `缺少必选标签「${tag}」对应的餐品`, `challenge:${challenge.id}#requiredTags`)
    }
  }
  for (const category of constraints.requiredCategories) {
    const ok = proposal.items.some((item) => menuByCode.get(item.code)?.category === category)
    addCheck(`商品类别：${category}`, ok, ok ? '已覆盖' : '缺失')
    if (!ok) {
      addViolation('missing-required-category', 'fatal', `缺少商品类别「${category}」对应的餐品`, `challenge:${challenge.id}#requiredCategories`)
    }
  }

  // ---- 7) 营养目标达成率（软约束 → 进入同成本比较层） ----
  const achievement = computeAchievement({ proposal, challenge, dataset, menuByCode })
  if (achievement.warning) {
    addViolation('nutrition-data-missing', 'warning', achievement.warning, `${dataset.sourceRef}#menuItems.nutrition`)
  }
  addCheck(
    '营养目标达成',
    achievement.rate === null ? true : achievement.rate >= 1,
    achievement.rate === null ? '任务卡未设营养目标' : `加权达成率 ${(achievement.rate * 100).toFixed(1)}%`,
  )

  const eligible = !violations.some((violation) => violation.severity === 'fatal')

  return AgentVerificationSchema.parse({
    agentId: agent.agentId,
    engine: `${agent.engine}@${agent.engineVersion}`,
    eligible,
    priceStatus,
    officialCostCents: officialCost,
    claimedCostCents: proposal.totalCents,
    recomputedCostCents: recomputedCost,
    effectiveCostCents: effectiveCost,
    targetAchievement: achievement.rate,
    verifiedSubtotalCents: recomputedSubtotal,
    verifiedDeliveryCents: recomputedDelivery,
    verifiedDiscountCents: recomputedDiscount,
    validCouponCodes,
    responseMs: agent.durationMs ?? 0,
    checks,
    violations,
  })
}

// ---------------------------------------------------------------- 内部实现

function sumByDataset(items: ProposalItem[], menuByCode: Map<string, MenuItem>): number {
  let total = 0
  for (const item of items) {
    total += (menuByCode.get(item.code)?.priceCents ?? 0) * item.qty
  }
  return total
}

/** 优惠券逐张验证：存在 / 类型支持 / 门槛 / 适用标签；失效券剔除并重算优惠 */
function verifyCoupons(input: {
  claimedCodes: string[]
  claimedDiscountCents: number
  coupons: Coupon[]
  items: ProposalItem[]
  menuByCode: Map<string, MenuItem>
  subtotalCents: number
  deliveryFeeCents: number
}): { validCodes: string[]; discountCents: number; violations: JudgeViolation[] } {
  const violations: JudgeViolation[] = []
  const validCodes: string[] = []
  const couponByCode = new Map(input.coupons.map((coupon) => [coupon.code, coupon]))
  const itemTags = new Set(
    input.items.flatMap((item) => input.menuByCode.get(item.code)?.tags ?? []),
  )

  for (const code of input.claimedCodes) {
    if (validCodes.includes(code)) {
      violations.push({
        code: 'coupon-not-found',
        severity: 'warning',
        message: `优惠券 ${code} 被重复申报，仅计入一次`,
        evidenceRef: 'dataset#coupons.' + code,
      })
      continue
    }
    const coupon = couponByCode.get(code)
    if (!coupon) {
      violations.push({
        code: 'coupon-not-found',
        severity: 'fatal',
        message: `优惠券 ${code} 不存在于当前门店数据集`,
        evidenceRef: 'dataset#coupons',
      })
      continue
    }
    if (coupon.type === 'threshold-discount') {
      const threshold = coupon.thresholdCents ?? 0
      if (input.subtotalCents < threshold) {
        violations.push({
          code: 'coupon-threshold-not-met',
          severity: 'fatal',
          message: `优惠券 ${code} 门槛 ¥${(threshold / 100).toFixed(2)} 未达成（小计 ¥${(input.subtotalCents / 100).toFixed(2)}）`,
          evidenceRef: 'dataset#coupons.' + code,
        })
        continue
      }
    } else if (coupon.type === 'item-discount') {
      const matches = (coupon.applicableTags ?? []).filter((tag) => itemTags.has(tag))
      if (matches.length === 0) {
        violations.push({
          code: 'coupon-not-applicable',
          severity: 'fatal',
          message: `优惠券 ${code} 的适用标签与购物车餐品不匹配`,
          evidenceRef: 'dataset#coupons.' + code,
        })
        continue
      }
    } else {
      violations.push({
        code: 'coupon-unsupported-type',
        severity: 'warning',
        message: `优惠券 ${code} 类型 ${coupon.type} 暂不支持自动核验，未计入优惠`,
        evidenceRef: 'dataset#coupons.' + code,
      })
      continue
    }
    validCodes.push(code)
  }

  // 用有效券按共享引擎重算优惠金额（与 Agent 侧使用同一确定性引擎）
  const cartItems = input.items.map((item) => ({
    code: item.code,
    qty: item.qty,
    lineTotalCents: (input.menuByCode.get(item.code)?.priceCents ?? 0) * item.qty,
  }))
  const recomputed = applyCoupons(
    input.coupons.filter((coupon) => validCodes.includes(coupon.code)),
    cartItems,
    input.menuByCode,
    input.subtotalCents,
    input.deliveryFeeCents,
  )
  if (recomputed.discountCents !== input.claimedDiscountCents) {
    violations.push({
      code: 'discount-mismatch',
      severity: 'warning',
      message: `申报优惠 ¥${(input.claimedDiscountCents / 100).toFixed(2)} 与裁判重算 ¥${(recomputed.discountCents / 100).toFixed(2)} 不一致，裁判以重算值为准`,
      evidenceRef: 'dataset#coupons',
    })
  }
  return { validCodes, discountCents: recomputed.discountCents, violations }
}

/** 营养/用户目标加权达成率（热量 0.4 / 蛋白质 0.4 / 钠 0.2） */
function computeAchievement(input: {
  proposal: { items: ProposalItem[] }
  challenge: Challenge
  dataset: ArenaDataset
  menuByCode: Map<string, MenuItem>
}): { rate: number | null; warning?: string } {
  const target = input.challenge.constraints.nutritionTarget
  if (!target) return { rate: null }

  let kcal = 0
  let proteinG = 0
  let sodiumMg = 0
  let missingKcal = false
  let missingProtein = false
  for (const item of input.proposal.items) {
    const nutrition = input.menuByCode.get(item.code)?.nutrition
    if (!nutrition) {
      missingKcal = true
      missingProtein = true
      continue
    }
    kcal += (nutrition.kcal ?? 0) * item.qty
    proteinG += (nutrition.proteinG ?? 0) * item.qty
    sodiumMg += (nutrition.sodiumMg ?? 0) * item.qty
  }

  const parts: Array<{ weight: number; rate: number }> = []
  if (target.kcal !== undefined && target.kcal > 0) {
    parts.push({ weight: 0.4, rate: Math.min(1, kcal / (target.kcal * input.challenge.constraints.people)) })
  }
  if (target.proteinG !== undefined && target.proteinG > 0) {
    parts.push({
      weight: 0.4,
      rate: Math.min(1, proteinG / (target.proteinG * input.challenge.constraints.people)),
    })
  }
  if (target.sodiumMgMax !== undefined && target.sodiumMgMax > 0) {
    const cap = target.sodiumMgMax * input.challenge.constraints.people
    parts.push({ weight: 0.2, rate: sodiumMg <= cap ? 1 : cap / sodiumMg })
  }
  if (parts.length === 0) return { rate: null }

  const divisor = parts.reduce((sum, part) => sum + part.weight, 0)
  const weighted = parts.reduce((sum, part) => sum + part.weight * part.rate, 0)
  const rate = divisor > 0 ? weighted / divisor : 0
  const warning =
    missingKcal || missingProtein
      ? '部分餐品缺少营养数据，达成率按已获得数据计算（数据缺失已标注）'
      : undefined
  return { rate, warning }
}
