import type { AgentExecution, MenuItem, ProposalItem, ToolCallRecord } from '@mcarena/shared'
import type { AgentContext, AgentEngine } from '../../types.js'
import {
  DecisionRecorder,
  SCENE_DELIVERY_FEE_CENTS,
  buildConstraintChecks,
  cartKey,
  cartSubtotal,
  cartTotalQty,
  finalizeProposal,
  toProposalItems,
} from '../agent-utils.js'
import type { Cart } from '../agent-utils.js'
import { applyCoupons } from '../coupons.js'

/**
 * Agent β「深度优化师」（Optimizer Agent）— 算法型 Agent，未使用大模型。
 *
 * 设计目标：多方案搜索、约束优化、组合比较，优先寻找更优结果。
 * 与 Agent α（单遍贪心、仅 1 个候选）是**实质不同的决策算法**。
 *
 * 算法（确定性）：
 *   1. 渐进式可行性剪枝：只剪「只会更差」的约束（预算超支、种类超限），
 *      必选编码 / 必选标签 / 必选类别在构造后再修复，避免过早剪空；
 *   2. 束搜索（Beam Search，宽度 BEAM_WIDTH）：每轮把当前最优的若干部分购物车
 *      各扩展一件餐品，按营养目标偏差排序保留前 BEAM_WIDTH 个；**每一轮的
 *      幸存者都进入候选池**（而非只取最后一轮），因此浅层（便宜）与深层
 *      （丰盛）方案都有机会进入最终对比；
 *   3. 候选修复：对候选池中每个候选补齐必选项 / 标签 / 类别 / 人数；
 *   4. 组合比较：按「约束满足率 → 营养偏差 → 算术总价」预筛前 PRICE_TOP_K 个，
 *      对这 K 个发起**真实计价工具调用**后按字典序定胜负；
 *   5. 统一收尾：胜出候选走与 α 完全一致的提案组装与结构化校验
 *      （计价结果复用，不重复发起工具调用）。
 *
 * 可观测差异（供前端与基准测试对比，均为真实统计）：
 *   - candidateCount：α 恒为 1；β 为束搜索实际评估的候选数量；
 *   - toolCallCount：β 对多个候选逐一计价，真实多于 α；
 *   - durationMs：β 通常更高（以真实测量为准，小数据集上可能接近）。
 */

const BEAM_WIDTH = 8
/** 搜索加深轮数 = 人数 + 2，防止组合规模失控 */
const MAX_EXTRA_ROUNDS = 2
/** 进入真实计价对比的候选数量（其余候选用算术总价预筛） */
const PRICE_TOP_K = 6

export class OptimizerAgent implements AgentEngine {
  readonly id = 'beta' as const
  readonly name = '深度优化师'
  readonly role = '优化策略：束搜索多候选 + 组合比较，追求约束满足与营养均衡'
  readonly engine = 'optimizer-search'
  readonly engineVersion = '1.0.0'

  async decide(context: AgentContext): Promise<AgentExecution> {
    const recorder = new DecisionRecorder({
      context,
      agentId: 'beta',
      name: this.name,
      role: this.role,
      engine: this.engine,
      engineVersion: this.engineVersion,
    })

    recorder.phase('init', '深度优化师启动：束搜索 + 多候选组合比较（算法型 Agent，未调用大模型）')
    recorder.note(
      'data-source',
      `使用数据集 ${context.dataset.sourceRef}（${context.dataset.dataOrigin === 'mock' ? '模拟数据' : '官方数据'}，共 ${context.dataset.menuItems.length} 项餐品）`,
      { resultSummary: context.dataset.notice },
    )
    recorder.note(
      'selection',
      '策略：束搜索枚举候选购物车 → 修复硬约束 → 逐个券评估与官方计价 → 按约束满足率/营养偏差/价格择优',
    )
    recorder.checkpoint()

    const { challenge, dataset } = context
    const menuByCode = new Map<string, MenuItem>(dataset.menuItems.map((item) => [item.code, item]))
    const excluded = new Set(challenge.constraints.excludedCodes)
    const pool = dataset.menuItems
      .filter((item) => item.available && !excluded.has(item.code))
      .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))
    const budget = challenge.constraints.budgetCents
    const cap = challenge.constraints.maxDistinctItems

    recorder.phase('load-data', `候选池就绪：${pool.length} 项在售餐品（已排除 ${excluded.size} 项）`)
    recorder.phase('plan', `初始化：渐进式剪枝 + 束宽 ${BEAM_WIDTH} + 计价对比名额 ${PRICE_TOP_K}`)

    const cheapestWith = (predicate: (item: MenuItem) => boolean): MenuItem | undefined =>
      pool
        .filter(predicate)
        .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]

    /** 渐进式可行性：只校验「只会随构造变差」的约束 */
    const progressivelyFeasible = (cart: Cart): boolean => {
      if (cap !== undefined && cart.size > cap) return false
      if (budget !== undefined && cartSubtotal(cart, menuByCode) > budget) return false
      return true
    }

    /** 营养目标偏差（无目标时为 0） */
    const nutritionDeviation = (cart: Cart): number => {
      const target = challenge.constraints.nutritionTarget
      if (!target) return 0
      let kcal = 0
      let proteinG = 0
      let sodiumMg = 0
      for (const [code, qty] of cart.entries()) {
        const n = menuByCode.get(code)?.nutrition
        if (!n) continue
        kcal += (n.kcal ?? 0) * qty
        proteinG += (n.proteinG ?? 0) * qty
        sodiumMg += (n.sodiumMg ?? 0) * qty
      }
      const people = Math.max(1, challenge.constraints.people)
      const devKcal =
        target.kcal === undefined ? 0 : Math.abs(kcal - target.kcal * people) / (target.kcal * people)
      const devProtein =
        target.proteinG === undefined
          ? 0
          : Math.abs(proteinG - target.proteinG * people) / (target.proteinG * people)
      const devSodium =
        target.sodiumMgMax === undefined
          ? 0
          : Math.max(0, sodiumMg - target.sodiumMgMax * people) / (target.sodiumMgMax * people)
      return devKcal + devProtein + devSodium
    }

    /** 候选修复：补必选项 / 标签 / 类别 / 人数；仍超预算则丢弃最贵的非必选件 */
    const repair = (input: Cart): Cart => {
      const cart: Cart = new Map(input)
      const add = (code: string): void => {
        if (cap !== undefined && !cart.has(code) && cart.size >= cap) {
          const droppable = [...cart.keys()]
            .filter((entry) => !challenge.constraints.mustIncludeCodes.includes(entry))
            .sort(
              (a, b) =>
                (menuByCode.get(b)?.priceCents ?? 0) - (menuByCode.get(a)?.priceCents ?? 0) ||
                a.localeCompare(b),
            )
          const victim = droppable[0]
          if (!victim) return
          cart.delete(victim)
        }
        cart.set(code, (cart.get(code) ?? 0) + 1)
      }
      for (const code of challenge.constraints.mustIncludeCodes) {
        if (menuByCode.has(code) && !cart.has(code)) add(code)
      }
      for (const tag of challenge.constraints.requiredTags) {
        if ([...cart.keys()].some((code) => menuByCode.get(code)?.tags.includes(tag))) continue
        const item = cheapestWith((entry) => entry.tags.includes(tag))
        if (item) add(item.code)
      }
      for (const category of challenge.constraints.requiredCategories) {
        if ([...cart.keys()].some((code) => menuByCode.get(code)?.category === category)) continue
        const item = cheapestWith((entry) => entry.category === category)
        if (item) add(item.code)
      }
      while (cartTotalQty(cart) < challenge.constraints.people) {
        const inCart = [...cart.keys()]
          .map((code) => menuByCode.get(code))
          .filter((item): item is MenuItem => Boolean(item))
          .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]
        const next = inCart ?? cheapestWith(() => true)
        if (!next) break
        add(next.code)
      }
      if (budget !== undefined) {
        while (cartSubtotal(cart, menuByCode) > budget) {
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

    // ---------------- 束搜索（每轮幸存者都进候选池） ----------------
    const rounds = challenge.constraints.people + MAX_EXTRA_ROUNDS
    const candidatePool = new Map<string, Cart>()
    let beam: Cart[] = [new Map()]
    let searchedRounds = 0
    for (let round = 0; round < rounds; round += 1) {
      recorder.checkpoint()
      const next: Array<{ cart: Cart; deviation: number }> = []
      for (const current of beam) {
        for (const item of pool) {
          const candidate: Cart = new Map(current)
          candidate.set(item.code, (candidate.get(item.code) ?? 0) + 1)
          if (!progressivelyFeasible(candidate)) continue
          recorder.addCandidates(1)
          next.push({ cart: candidate, deviation: nutritionDeviation(candidate) })
        }
      }
      if (next.length === 0) break
      searchedRounds = round + 1
      next.sort(
        (a, b) =>
          a.deviation - b.deviation ||
          cartKey(a.cart).localeCompare(cartKey(b.cart)) ||
          cartTotalQty(a.cart) - cartTotalQty(b.cart),
      )
      beam = next.slice(0, BEAM_WIDTH).map((entry) => entry.cart)
      for (const state of beam) {
        candidatePool.set(cartKey(state), state)
      }
    }
    recorder.phase(
      'search',
      `束搜索完成：${searchedRounds} 轮，累计评估 ${recorder.candidateCountOf()} 个候选，候选池 ${candidatePool.size} 个`,
    )
    recorder.note(
      'search',
      `束搜索（宽度 ${BEAM_WIDTH}，轮数上限 ${rounds}）：实际 ${searchedRounds} 轮，累计评估候选 ${recorder.candidateCountOf()} 个，候选池 ${candidatePool.size} 个（每轮幸存者均保留，浅层与深层方案都可进入对比）`,
    )

    // ---------------- 修复 + 预筛 ----------------
    const repaired: Cart[] = []
    const seen = new Set<string>()
    for (const cart of [...candidatePool.values()].sort((a, b) =>
      cartKey(a).localeCompare(cartKey(b)),
    )) {
      const fixed = repair(cart)
      const key = cartKey(fixed)
      if (seen.has(key)) continue
      seen.add(key)
      repaired.push(fixed)
    }
    const prescored = repaired
      .map((cart) => {
        const items = toProposalItems(cart, menuByCode)
        const subtotalCents = cartSubtotal(cart, menuByCode)
        const deliveryFeeCents =
          challenge.constraints.scene === 'delivery' ? SCENE_DELIVERY_FEE_CENTS : 0
        const checks = buildConstraintChecks({ challenge, items, totalCents: subtotalCents + deliveryFeeCents, menuByCode })
        const fitRate =
          checks.length === 0 ? 0 : checks.filter((check) => check.satisfied).length / checks.length
        return { cart, fitRate, deviation: nutritionDeviation(cart), totalCents: subtotalCents + deliveryFeeCents }
      })
      .sort(
        (a, b) =>
          b.fitRate - a.fitRate ||
          a.deviation - b.deviation ||
          a.totalCents - b.totalCents ||
          cartKey(a.cart).localeCompare(cartKey(b.cart)),
      )
    const finalists = prescored.slice(0, PRICE_TOP_K)
    if (finalists.length === 0) {
      // 约束冲突（如预算低于任何餐品单价）：输出尽力而为方案，
      // 由约束自检如实报告「未满足」，绝不虚构可行解。
      const forced = repair(new Map())
      finalists.push({
        cart: forced,
        fitRate: 0,
        deviation: nutritionDeviation(forced),
        totalCents:
          cartSubtotal(forced, menuByCode) +
          (challenge.constraints.scene === 'delivery' ? SCENE_DELIVERY_FEE_CENTS : 0),
      })
      recorder.note(
        'evaluate',
        '束搜索未产生通过预算剪枝的候选，输出尽力而为方案（硬约束将由自检如实报告为未满足）',
      )
    }
    recorder.phase(
      'evaluate',
      `预筛：${repaired.length} 个修复后候选中取前 ${finalists.length} 个进入真实计价对比`,
    )
    recorder.note(
      'evaluate',
      `预筛排序依据：约束满足率 → 营养偏差 → 算术总价（不调用工具），前 ${finalists.length} 名进入计价`,
    )

    // ---------------- 真实计价对比 ----------------
    interface Candidate {
      cart: Cart
      items: ProposalItem[]
      subtotalCents: number
      deliveryFeeCents: number
      couponCodes: string[]
      discountCents: number
      totalCents: number
      deviation: number
      fitRate: number
    }
    const candidates: Candidate[] = []
    for (const finalist of finalists) {
      recorder.checkpoint()
      const items = toProposalItems(finalist.cart, menuByCode)
      const subtotalCents = cartSubtotal(finalist.cart, menuByCode)
      const deliveryFeeCents =
        challenge.constraints.scene === 'delivery' ? SCENE_DELIVERY_FEE_CENTS : 0
      let couponCodes: string[] = []
      let discountCents = 0
      if (challenge.constraints.preferCoupons && dataset.coupons.length > 0) {
        const applied = applyCoupons(dataset.coupons, items, menuByCode, subtotalCents, deliveryFeeCents)
        couponCodes = applied.couponCodes
        discountCents = applied.discountCents
      }
      let totalCents = subtotalCents + deliveryFeeCents - discountCents
      if (context.priceOracle) {
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
            quote !== null ? `应付 ¥${(quote.totalCents / 100).toFixed(2)}` : '无该购物车的官方计价记录',
          at: new Date().toISOString(),
        }
        recorder.toolCall(call)
        if (quote) totalCents = quote.totalCents
      }
      const checks = buildConstraintChecks({ challenge, items, totalCents, menuByCode })
      candidates.push({
        cart: finalist.cart,
        items,
        subtotalCents,
        deliveryFeeCents,
        couponCodes,
        discountCents,
        totalCents,
        deviation: finalist.deviation,
        fitRate:
          checks.length === 0 ? 0 : checks.filter((check) => check.satisfied).length / checks.length,
      })
    }

    candidates.sort(
      (a, b) =>
        b.fitRate - a.fitRate ||
        a.deviation - b.deviation ||
        a.totalCents - b.totalCents ||
        cartKey(a.cart).localeCompare(cartKey(b.cart)),
    )
    const winner = candidates[0]
    recorder.note(
      'evaluate',
      winner
        ? `组合比较：${candidates.length} 个候选逐一计价后，最优者约束满足率 ${(winner.fitRate * 100).toFixed(0)}%、营养偏差 ${winner.deviation.toFixed(3)}、应付 ¥${(winner.totalCents / 100).toFixed(2)}（${winner.cart.size} 种 / ${cartTotalQty(winner.cart)} 件）`
        : '组合比较：无候选可评',
    )
    for (const candidate of candidates.slice(1)) {
      recorder.note(
        'evaluate',
        `落选候选：${cartKey(candidate.cart) || '空车'}｜满足率 ${(candidate.fitRate * 100).toFixed(0)}%｜偏差 ${candidate.deviation.toFixed(3)}｜应付 ¥${(candidate.totalCents / 100).toFixed(2)}`,
      )
    }

    if (!winner) {
      throw new Error('深度优化师内部错误：修复后仍无候选可评')
    }

    // ---------------- 统一收尾 ----------------
    recorder.phase('finalize', '统一收尾：券结果复用 + 提案组装 + 结构化校验（不重复发起工具调用）')
    const { proposal } = await finalizeProposal({
      context,
      recorder,
      cart: winner.cart,
      menuByCode,
      precomputed: {
        couponCodes: winner.couponCodes,
        discountCents: winner.discountCents,
        totalCents: winner.totalCents,
      },
    })

    recorder.note(
      'system',
      `优化策略完成：候选 ${recorder.candidateCountOf()} 个、工具调用 ${recorder.toolCallCountOf()} 次（精确耗时见 AgentExecution.durationMs）`,
    )
    recorder.phase('done', '执行完成')
    return recorder.finish({ proposal, status: 'completed' })
  }
}
