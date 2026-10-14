import type { AgentExecution, MenuItem } from '@mcarena/shared'
import type { AgentContext, AgentEngine } from '../../types.js'
import {
  DecisionRecorder,
  SCENE_DELIVERY_FEE_CENTS,
  cartSubtotal,
  cartTotalQty,
  finalizeProposal,
} from '../agent-utils.js'
import type { Cart } from '../agent-utils.js'

/**
 * Agent α「极速猎手」（Speed Agent）— 算法型 Agent，未使用大模型。
 *
 * 设计目标：低延迟、低计算成本，用一次单遍贪心构造出一个满足硬约束的有效方案。
 *
 * 算法（确定性，复杂度 O(n log n)）：
 *   1. 可用餐品按「单价升序、编码升序」排序一次；
 *   2. 依次安置必选编码 / 必选标签 / 必选类别（各取最便宜一件）；
 *   3. 用最便宜的已选餐品加量补足人数；
 *   4. 超出种类上限时把较贵种类并入最便宜种类；
 *   5. 超出预算时按单价从高到低移除非必选件；
 *   6. 走统一的券评估 + 官方计价收尾流程。
 *
 * 全过程只评估 1 个候选购物车（candidateCount = 1），工具调用通常只有 1 次计价查询。
 * 与 Agent β（束搜索 + 券组合枚举）相比，它牺牲最优性换取速度与可预测性。
 */

export class SpeedAgent implements AgentEngine {
  readonly id = 'alpha' as const
  readonly name = '极速猎手'
  readonly role = '极速策略：单遍贪心构造，最低计算成本，追求即时可用解'
  readonly engine = 'speed-greedy'
  readonly engineVersion = '1.0.0'

  async decide(context: AgentContext): Promise<AgentExecution> {
    const recorder = new DecisionRecorder({
      context,
      agentId: 'alpha',
      name: this.name,
      role: this.role,
      engine: this.engine,
      engineVersion: this.engineVersion,
    })

    recorder.phase('init', '极速猎手启动：单遍贪心策略（算法型 Agent，未调用大模型）')
    recorder.note(
      'data-source',
      `使用数据集 ${context.dataset.sourceRef}（${context.dataset.dataOrigin === 'mock' ? '模拟数据' : '官方数据'}，共 ${context.dataset.menuItems.length} 项餐品）`,
      { resultSummary: context.dataset.notice },
    )
    recorder.checkpoint()

    const { challenge, dataset } = context
    const menuByCode = new Map<string, MenuItem>(dataset.menuItems.map((item) => [item.code, item]))
    const excluded = new Set(challenge.constraints.excludedCodes)
    const pool = dataset.menuItems
      .filter((item) => item.available && !excluded.has(item.code))
      .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))

    recorder.phase('load-data', `候选池就绪：${pool.length} 项在售餐品（已排除 ${excluded.size} 项）`)
    recorder.phase('plan', '策略：硬约束满足 + 应付总价最小化的单遍贪心构造')

    const cart: Cart = new Map()
    const add = (code: string): void => {
      cart.set(code, (cart.get(code) ?? 0) + 1)
    }

    // ---- 1) 必选编码 ----
    for (const code of challenge.constraints.mustIncludeCodes) {
      recorder.checkpoint()
      if (menuByCode.has(code)) {
        add(code)
        recorder.note('selection', `安置必选餐品 ${code}（${menuByCode.get(code)?.name ?? code}）`)
      } else {
        recorder.note('constraint-check', `必选餐品 ${code} 不在数据集中，该硬约束无法满足`)
      }
    }
    // ---- 2) 必选标签 / 必选类别：各取最便宜一件 ----
    const cheapestBy = (predicate: (item: MenuItem) => boolean): MenuItem | undefined =>
      pool.filter(predicate).sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]
    for (const tag of challenge.constraints.requiredTags) {
      recorder.checkpoint()
      const item = cheapestBy((entry) => entry.tags.includes(tag))
      if (item) {
        add(item.code)
        recorder.note('selection', `满足必选标签「${tag}」：取最便宜的 ${item.name}（¥${(item.priceCents / 100).toFixed(2)}）`)
      } else {
        recorder.note('constraint-check', `必选标签「${tag}」在候选池中无可用餐品，该硬约束无法满足`)
      }
    }
    for (const category of challenge.constraints.requiredCategories) {
      recorder.checkpoint()
      const item = cheapestBy((entry) => entry.category === category)
      if (item) {
        add(item.code)
        recorder.note('selection', `满足商品类别「${category}」：取最便宜的 ${item.name}（¥${(item.priceCents / 100).toFixed(2)}）`)
      } else {
        recorder.note('constraint-check', `商品类别「${category}」在候选池中无可用餐品，该硬约束无法满足`)
      }
    }
    // ---- 3) 人数覆盖：优先给已选餐品加量，避免引入新种类 ----
    while (cartTotalQty(cart) < challenge.constraints.people) {
      recorder.checkpoint()
      const candidates = [...cart.keys()].length > 0 ? [...cart.keys()] : pool.map((item) => item.code)
      const cheapest = candidates
        .map((code) => menuByCode.get(code))
        .filter((item): item is MenuItem => Boolean(item))
        .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code))[0]
      if (!cheapest) break
      add(cheapest.code)
    }
    if (cartTotalQty(cart) < challenge.constraints.people) {
      recorder.note('constraint-check', `候选池无法覆盖 ${challenge.constraints.people} 人（在售餐品不足）`)
    } else {
      recorder.note('selection', `人数覆盖完成：${cartTotalQty(cart)} 件覆盖 ${challenge.constraints.people} 人`)
    }

    // ---- 4) 种类上限 ----
    const cap = challenge.constraints.maxDistinctItems
    if (cap !== undefined) {
      while (cart.size > cap) {
        const ordered = [...cart.keys()].sort(
          (a, b) =>
            (menuByCode.get(a)?.priceCents ?? 0) - (menuByCode.get(b)?.priceCents ?? 0) ||
            a.localeCompare(b),
        )
        const donor = ordered[ordered.length - 1]
        const target = ordered[0]
        if (!donor || !target || donor === target) break
        const qty = cart.get(donor) ?? 0
        for (let i = 0; i < qty; i += 1) add(target)
        cart.delete(donor)
      }
      recorder.note('selection', `种类上限 ${cap}：当前 ${cart.size} 种`)
    }

    // ---- 5) 预算约束：超预算时移除非必选的高单价件 ----
    const budget = challenge.constraints.budgetCents
    if (budget !== undefined) {
      while (cartSubtotal(cart, menuByCode) > budget) {
        recorder.checkpoint()
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
      if (cartSubtotal(cart, menuByCode) > budget) {
        recorder.note(
          'constraint-check',
          `硬约束冲突：即使只保留必选餐品，小计 ¥${(cartSubtotal(cart, menuByCode) / 100).toFixed(2)} 仍超预算 ¥${(budget / 100).toFixed(2)}`,
        )
      }
    }

    recorder.phase('search', `单遍贪心完成：评估 1 个候选购物车（${cart.size} 种 / ${cartTotalQty(cart)} 件）`)
    recorder.addCandidates(1)

    recorder.phase('evaluate', '进入统一收尾：优惠券评估 + 官方计价查询')
    const { proposal, toolCalls } = await finalizeProposal({ context, recorder, cart, menuByCode })

    recorder.phase('finalize', `提案就绪：应付 ¥${(proposal.totalCents / 100).toFixed(2)}｜工具调用 ${toolCalls.length} 次`)
    recorder.note(
      'system',
      `极速策略完成：候选 ${recorder.candidateCountOf()} 个、工具调用 ${toolCalls.length} 次（精确耗时见 AgentExecution.durationMs）`,
    )
    recorder.phase('done', '执行完成')
    return recorder.finish({ proposal, status: 'completed' })
  }
}

export { SCENE_DELIVERY_FEE_CENTS }
