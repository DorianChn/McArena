import {
  AgentExecutionSchema,
  EvidenceRecordSchema,
  ToolCallRecordSchema,
} from '@mcarena/shared'
import type {
  AgentExecution,
  AgentId,
  AgentPhaseName,
  Challenge,
  ConstraintCheck,
  EvidenceRecord,
  MealProposal,
  MenuItem,
  ProposalItem,
  ToolCallRecord,
} from '@mcarena/shared'
import type { AgentContext, AgentEngine } from '../types.js'
import { applyCoupons } from './coupons.js'

/**
 * 双 Agent 共享的决策基础设施。
 *
 * 设计原则：
 * - 所有产出（提案/证据/阶段/工具调用）都经由 zod 结构化校验；
 * - 工具调用（价格预言机、MCP）逐条记录，可溯源；
 * - 优惠券与计价收尾流程两个 Agent 完全一致，保证可比性；
 * - 失败/超时的降级恢复方案在这里构造，且必须显式标注。
 */

export const SCENE_DELIVERY_FEE_CENTS = 500

/** 取消信号：Agent 在安全检查点主动抛出，由 AgentRunner 转换执行状态 */
export class AgentCancelledError extends Error {
  constructor(agentId: AgentId) {
    super(`Agent ${agentId} 的执行已被取消`)
    this.name = 'AgentCancelledError'
  }
}

/** 购物车（编码 → 数量） */
export type Cart = Map<string, number>

export function cartKey(cart: Cart): string {
  return [...cart.entries()].map(([code, qty]) => `${code}x${qty}`).sort().join(',')
}

export function cartSubtotal(cart: Cart, menuByCode: Map<string, MenuItem>): number {
  let total = 0
  for (const [code, qty] of cart.entries()) {
    total += (menuByCode.get(code)?.priceCents ?? 0) * qty
  }
  return total
}

export function cartTotalQty(cart: Cart): number {
  let qty = 0
  for (const value of cart.values()) qty += value
  return qty
}

export function toProposalItems(cart: Cart, menuByCode: Map<string, MenuItem>): ProposalItem[] {
  const items: ProposalItem[] = []
  for (const [code, qty] of cart.entries()) {
    const item = menuByCode.get(code)
    if (!item || qty <= 0) continue
    items.push({
      code,
      name: item.name,
      qty,
      unitPriceCents: item.priceCents,
      lineTotalCents: item.priceCents * qty,
      nutrition: item.nutrition,
    })
  }
  return items.sort((a, b) => a.code.localeCompare(b.code))
}

/** 汇总购物车营养（kJ 无关，统一 kcal/蛋白/钠口径） */
export function sumNutrition(
  cart: Cart,
  menuByCode: Map<string, MenuItem>,
): { kcal: number; proteinG: number; fatG: number; carbG: number; sodiumMg: number } {
  const totals = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, sodiumMg: 0 }
  for (const [code, qty] of cart.entries()) {
    const nutrition = menuByCode.get(code)?.nutrition
    if (!nutrition) continue
    totals.kcal += (nutrition.kcal ?? 0) * qty
    totals.proteinG += (nutrition.proteinG ?? 0) * qty
    totals.fatG += (nutrition.fatG ?? 0) * qty
    totals.carbG += (nutrition.carbG ?? 0) * qty
    totals.sodiumMg += (nutrition.sodiumMg ?? 0) * qty
  }
  return totals
}

/** 约束自检：人数 / 预算 / 种类上限 / 必选编码 / 必选标签 / 必选类别 */
export function buildConstraintChecks(input: {
  challenge: Challenge
  items: ProposalItem[]
  totalCents: number
  menuByCode: Map<string, MenuItem>
}): ConstraintCheck[] {
  const { challenge, items, totalCents, menuByCode } = input
  const constraints = challenge.constraints
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0)
  const budget = constraints.budgetCents
  const checks: ConstraintCheck[] = [
    {
      name: '餐品数量覆盖人数',
      satisfied: totalQty >= constraints.people,
      detail: `共 ${totalQty} 件 / 需求 ${constraints.people} 人`,
    },
    {
      name: '预算约束',
      satisfied: budget === undefined || totalCents <= budget,
      detail:
        budget === undefined
          ? '未设置预算'
          : `应付 ¥${(totalCents / 100).toFixed(2)} / 预算 ¥${(budget / 100).toFixed(2)}`,
    },
    {
      name: '种类上限',
      satisfied:
        constraints.maxDistinctItems === undefined || items.length <= constraints.maxDistinctItems,
      detail:
        constraints.maxDistinctItems === undefined
          ? '未设置上限'
          : `${items.length} 种 / 上限 ${constraints.maxDistinctItems} 种`,
    },
  ]
  for (const code of constraints.mustIncludeCodes) {
    checks.push({
      name: `必选餐品：${code}`,
      satisfied: items.some((item) => item.code === code),
      detail: code,
    })
  }
  for (const tag of constraints.requiredTags) {
    checks.push({
      name: `必选标签：${tag}`,
      satisfied: items.some((item) => menuByCode.get(item.code)?.tags.includes(tag)),
      detail: tag,
    })
  }
  for (const category of constraints.requiredCategories) {
    checks.push({
      name: `商品类别：${category}`,
      satisfied: items.some((item) => menuByCode.get(item.code)?.category === category),
      detail: category,
    })
  }
  return checks
}

export interface FinalizeResult {
  proposal: MealProposal
  couponCodes: string[]
  discountCents: number
  toolCalls: ToolCallRecord[]
}

/**
 * 提案收尾（两个 Agent 共用，保证可比）：
 * 优惠券评估 → 官方计价查询（priceOracle，逐条记录工具调用）→ 提案组装 → 结构化校验。
 */
export async function finalizeProposal(input: {
  context: AgentContext
  recorder: DecisionRecorder
  cart: Cart
  menuByCode: Map<string, MenuItem>
  /**
   * 多候选对比阶段已完成券评估与官方计价时，直接传入结果，
   * 避免对同一购物车重复发起工具调用（保证工具调用计数真实不虚增）。
   */
  precomputed?: {
    couponCodes: string[]
    discountCents: number
    totalCents: number
  }
}): Promise<FinalizeResult> {
  const { context, recorder, cart, menuByCode, precomputed } = input
  const { challenge, dataset } = context
  const items = toProposalItems(cart, menuByCode)
  const subtotalCents = cartSubtotal(cart, menuByCode)
  const deliveryFeeCents =
    challenge.constraints.scene === 'delivery' ? SCENE_DELIVERY_FEE_CENTS : 0

  let couponCodes: string[] = []
  let discountCents = 0
  if (precomputed) {
    couponCodes = precomputed.couponCodes
    discountCents = precomputed.discountCents
    recorder.note(
      'price',
      `优惠券评估（多候选对比阶段已完成）：${couponCodes.length > 0 ? `命中 ${couponCodes.join('、')}，优惠 ¥${(discountCents / 100).toFixed(2)}` : '无可用券'}`,
    )
  } else if (challenge.constraints.preferCoupons && dataset.coupons.length > 0) {
    const applied = applyCoupons(dataset.coupons, items, menuByCode, subtotalCents, deliveryFeeCents)
    couponCodes = applied.couponCodes
    discountCents = applied.discountCents
    recorder.note(
      'price',
      `优惠券评估：${couponCodes.length > 0 ? `命中 ${couponCodes.join('、')}，优惠 ¥${(discountCents / 100).toFixed(2)}` : '无可用券'}（数据集内 ${dataset.coupons.length} 张）`,
    )
  } else {
    recorder.note('price', '任务卡未要求使用优惠券，跳过券评估')
  }

  const toolCalls: ToolCallRecord[] = []
  let totalCents = precomputed
    ? precomputed.totalCents
    : subtotalCents + deliveryFeeCents - discountCents
  if (!precomputed && context.priceOracle) {
    const quote = await context.priceOracle.quote({
      items: items.map((item) => ({ code: item.code, qty: item.qty })),
      couponCodes,
    })
    const call: ToolCallRecord = {
      tool: 'calculate-price',
      args: {
        items: items.map((item) => ({ code: item.code, qty: item.qty })),
        couponCodes,
        scene: challenge.constraints.scene,
      },
      hit: quote !== null,
      resultSummary:
        quote !== null
          ? `应付 ¥${(quote.totalCents / 100).toFixed(2)}（小计 ¥${(quote.subtotalCents / 100).toFixed(2)}｜配送 ¥${(quote.deliveryFeeCents / 100).toFixed(2)}｜优惠 ¥${(quote.discountCents / 100).toFixed(2)}）`
          : '回放数据集中无该购物车的官方计价记录',
      at: new Date().toISOString(),
    }
    toolCalls.push(call)
    recorder.toolCall(call)
    if (quote) {
      totalCents = quote.totalCents
      recorder.note(
        'price',
        `命中官方 calculate-price 记录（${quote.quoteId}）：应付 ¥${(totalCents / 100).toFixed(2)}`,
        { resultSummary: call.resultSummary },
      )
    } else {
      recorder.note(
        'price',
        `未命中官方 calculate-price 记录，按官方餐品单价与官方券规则折算：应付 ¥${(totalCents / 100).toFixed(2)}`,
      )
    }
  } else if (precomputed) {
    recorder.note(
      'price',
      `采用多候选对比阶段的官方计价结果：应付 ¥${(totalCents / 100).toFixed(2)}（未重复发起计价调用）`,
    )
  } else {
    recorder.note(
      'price',
      '未配置价格预言机，按数据集内官方餐品单价与券规则折算计价（未调用官方 calculate-price）',
    )
  }

  const checks = buildConstraintChecks({ challenge, items, totalCents, menuByCode })
  for (const check of checks) {
    recorder.note(
      'constraint-check',
      `${check.name}：${check.satisfied ? '满足' : '未满足'}（${check.detail}）`,
    )
  }

  const proposal: MealProposal = {
    items,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents,
    couponCodes,
    constraintChecks: checks,
    priceOrigin: dataset.dataOrigin,
  }
  return { proposal, couponCodes, discountCents, toolCalls }
}

/**
 * 决策记录器：把一次 Agent 执行的所有可观测信息结构化，
 * 产出经过 AgentExecutionSchema 校验的执行记录。
 */
export class DecisionRecorder {
  private readonly evidence: EvidenceRecord[] = []
  private readonly phases: Array<{ name: AgentPhaseName; message: string; at: string }> = []
  private readonly toolCalls: ToolCallRecord[] = []
  private readonly startedAtMs: number
  private readonly startedAtIso: string
  private candidateCount = 0
  private seq = 0

  constructor(
    private readonly meta: {
      context: AgentContext
      agentId: AgentId
      name: string
      role: string
      engine: string
      engineVersion: string
    },
  ) {
    this.startedAtMs = Date.now()
    this.startedAtIso = new Date().toISOString()
  }

  /** 安全检查点：外部取消时立即中断 */
  checkpoint(): void {
    if (this.meta.context.signal?.aborted) {
      throw new AgentCancelledError(this.meta.agentId)
    }
  }

  phase(name: AgentPhaseName, message: string): void {
    this.phases.push({ name, message, at: new Date().toISOString() })
    this.meta.context.onPhase?.(name, message)
  }

  note(kind: EvidenceRecord['kind'], message: string, extra: Partial<EvidenceRecord> = {}): void {
    const record = EvidenceRecordSchema.parse({
      id: `${this.meta.agentId}-${(this.seq += 1)}`,
      kind,
      message,
      at: new Date().toISOString(),
      ...extra,
    })
    this.evidence.push(record)
    this.meta.context.onEvidence?.(record)
  }

  toolCall(call: ToolCallRecord): void {
    this.toolCalls.push(ToolCallRecordSchema.parse(call))
  }

  /** 当前已发生的工具调用次数（供证据文案引用） */
  toolCallCountOf(): number {
    return this.toolCalls.length
  }

  addCandidates(count: number): void {
    this.candidateCount += Math.max(0, Math.floor(count))
  }

  /** 当前已评估的候选购物车数量（供证据文案引用） */
  candidateCountOf(): number {
    return this.candidateCount
  }

  /** 组装并结构化校验 AgentExecution */
  finish(input: {
    proposal: MealProposal | null
    status: 'completed' | 'failed'
    recovery?: { used: boolean; reason?: string }
    errorCode?: AgentExecution['errorCode']
  }): AgentExecution {
    return AgentExecutionSchema.parse({
      agentId: this.meta.agentId,
      name: this.meta.name,
      role: this.meta.role,
      engine: this.meta.engine,
      engineVersion: this.meta.engineVersion,
      status: input.status,
      dataOrigin: this.meta.context.dataset.dataOrigin,
      proposal: input.proposal,
      evidence: this.evidence,
      startedAt: this.startedAtIso,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - this.startedAtMs,
      candidateCount: this.candidateCount,
      toolCallCount: this.toolCalls.length,
      toolCalls: this.toolCalls,
      phases: this.phases,
      recovery: { used: input.recovery?.used ?? false, reason: input.recovery?.reason ?? '' },
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    })
  }
}

/** 确定性降级恢复方案：超时/异常后的兜底，保证比赛可继续且来源清晰 */
export async function buildRecoveredProposal(input: {
  recorder: DecisionRecorder
  context: AgentContext
  reason: string
  menuByCode: Map<string, MenuItem>
}): Promise<FinalizeResult> {
  const { recorder, context, reason, menuByCode } = input
  recorder.checkpoint()
  recorder.note(
    'error',
    `执行中断（${reason}），切换为确定性降级恢复方案：仅满足硬约束的最便宜组合，不代表该 Agent 的常规策略。`,
  )
  recorder.phase('finalize', '降级恢复：确定性兜底构造')
  const cart = buildFallbackCart(context.challenge, menuByCode)
  recorder.addCandidates(1)
  const result = await finalizeProposal({ context, recorder, cart, menuByCode })
  recorder.note(
    'system',
    `降级恢复方案：${result.proposal.items.length} 种餐品 / 应付 ¥${(result.proposal.totalCents / 100).toFixed(2)}（已明确标注为恢复结果）`,
  )
  return result
}

/** 兜底购物车：必选 → 必选标签/类别 → 补足人数 → 预算内最便宜 */
export function buildFallbackCart(
  challenge: Challenge,
  menuByCode: Map<string, MenuItem>,
): Cart {
  const cart: Cart = new Map()
  const add = (code: string): void => {
    cart.set(code, (cart.get(code) ?? 0) + 1)
  }
  for (const code of challenge.constraints.mustIncludeCodes) {
    if (menuByCode.has(code)) add(code)
  }
  for (const tag of challenge.constraints.requiredTags) {
    const cheapest = [...menuByCode.values()]
      .filter((item) => item.available && item.tags.includes(tag))
      .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]
    if (cheapest) add(cheapest.code)
  }
  for (const category of challenge.constraints.requiredCategories) {
    const cheapest = [...menuByCode.values()]
      .filter((item) => item.available && item.category === category)
      .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]
    if (cheapest) add(cheapest.code)
  }
  const cheapestInCart = (): string | undefined =>
    [...cart.keys()]
      .map((code) => menuByCode.get(code))
      .filter((item): item is MenuItem => Boolean(item))
      .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]?.code
  const cheapestInMenu = (): string | undefined =>
    [...menuByCode.values()]
      .filter((item) => item.available)
      .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]?.code
  while (cartTotalQty(cart) < challenge.constraints.people) {
    const code = cheapestInCart() ?? cheapestInMenu()
    if (!code) break
    add(code)
  }
  const budget = challenge.constraints.budgetCents
  if (budget !== undefined) {
    while (cartSubtotal(cart, menuByCode) > budget && cart.size > 0) {
      const droppable = [...cart.keys()]
        .filter((code) => !challenge.constraints.mustIncludeCodes.includes(code))
        .sort(
          (a, b) =>
            (menuByCode.get(b)?.priceCents ?? 0) - (menuByCode.get(a)?.priceCents ?? 0) ||
            a.localeCompare(b),
        )
      const victim = droppable[0]
      if (!victim) break
      cart.delete(victim)
    }
  }
  return cart
}

/** 引擎接口便捷判空 */
export function isAgentEngine(value: unknown): value is AgentEngine {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { decide?: unknown }).decide === 'function'
  )
}
