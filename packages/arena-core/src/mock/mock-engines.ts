import {
  EvidenceRecordSchema,
  MOCK_DATA_WARNING,
} from '@mcarena/shared'
import type { AgentContext, AgentEngine, JudgeContext } from '../types.js'
import type {
  AgentExecution,
  EvidenceRecord,
  JudgeResult,
  MealProposal,
  MenuItem,
  ProposalItem,
} from '@mcarena/shared'

/**
 * 开发脚手架引擎（mock-dev-scaffold）。
 *
 * ⚠️ 这不是正式 Agent 策略：阶段03 的「极速猎手 / 深度优化师」（engine: speed-greedy / optimizer-search）为正式实现。
 * 本引擎仅用于在无真实算法前打通 编排→数据→Agent→裁判→界面 全链路，
 * 其输出与后端引擎标识 mock-dev-scaffold 在 MatchResult 中原样标注。
 */

function evidence(
  id: string,
  kind: EvidenceRecord['kind'],
  message: string,
  extra: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return EvidenceRecordSchema.parse({
    id,
    kind,
    message,
    at: new Date().toISOString(),
    ...extra,
  })
}

/** 按菜单顺序挑选可用餐品的确定性 mock 策略 */
function pickItems(context: AgentContext, targetCount: number): ProposalItem[] {
  const { challenge, dataset } = context
  const chosen: ProposalItem[] = []
  for (const item of dataset.menuItems) {
    if (!item.available) continue
    if (challenge.constraints.excludedCodes.includes(item.code)) continue
    chosen.push({
      code: item.code,
      name: item.name,
      qty: 1,
      unitPriceCents: item.priceCents,
      lineTotalCents: item.priceCents,
      nutrition: item.nutrition,
    })
    if (chosen.length >= targetCount) break
  }
  return chosen
}

function buildProposal(context: AgentContext, items: ProposalItem[]): MealProposal {
  const { challenge, dataset } = context
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0)
  const budget = challenge.constraints.budgetCents
  const menuByCode = new Map<string, MenuItem>(dataset.menuItems.map((item) => [item.code, item]))
  const checks = [
    {
      name: '餐品数量覆盖人数',
      satisfied: items.length >= challenge.constraints.people,
      detail: `已选 ${items.length} 件 / 需求 ${challenge.constraints.people} 人`,
    },
    {
      name: '预算约束',
      satisfied: budget === undefined || subtotalCents <= budget,
      detail:
        budget === undefined
          ? '未设置预算'
          : `小计 ¥${(subtotalCents / 100).toFixed(2)} / 预算 ¥${(budget / 100).toFixed(2)}`,
    },
    ...(challenge.constraints.requiredTags.length > 0
      ? [
          {
            name: '必选标签',
            satisfied: challenge.constraints.requiredTags.every((tag) =>
              items.some((item) => menuByCode.get(item.code)?.tags.includes(tag)),
            ),
            detail: challenge.constraints.requiredTags.join('、'),
          },
        ]
      : []),
  ]
  const deliveryFeeCents = challenge.constraints.scene === 'delivery' ? 500 : 0
  return {
    items,
    subtotalCents,
    deliveryFeeCents,
    discountCents: 0,
    totalCents: subtotalCents + deliveryFeeCents,
    couponCodes: [],
    constraintChecks: checks,
    priceOrigin: dataset.dataOrigin,
  }
}

abstract class MockAgentEngineBase implements AgentEngine {
  abstract readonly id: 'alpha' | 'beta'
  abstract readonly name: string
  abstract readonly role: string
  readonly engine = 'mock-dev-scaffold'
  readonly engineVersion = '0.1.0'

  protected abstract itemCount(context: AgentContext): number

  decide(context: AgentContext): Promise<AgentExecution> {
    const startedAt = new Date().toISOString()
    const steps: EvidenceRecord[] = [
      evidence(
        'step-1',
        'data-source',
        `使用数据集 ${context.dataset.sourceRef}（${context.dataset.dataOrigin === 'mock' ? '模拟数据' : '官方数据'}）`,
        { resultSummary: context.dataset.notice },
      ),
      evidence(
        'step-2',
        'selection',
        `mock 策略：按菜单顺序选择 ${this.itemCount(context)} 件可用餐品（正式策略在阶段02实现）`,
      ),
    ]
    const items = pickItems(context, this.itemCount(context))
    const proposal = buildProposal(context, items)
    for (const check of proposal.constraintChecks) {
      steps.push(
        evidence(
          `check-${check.name}`,
          'constraint-check',
          `${check.name}：${check.satisfied ? '满足' : '未满足'}（${check.detail}）`,
        ),
      )
    }
    steps.push(
      evidence(
        'step-3',
        'price',
        `mock 自算总价 ¥${(proposal.totalCents / 100).toFixed(2)}（演示用；正式版必须引用官方 calculate-price 快照）`,
      ),
    )
    return Promise.resolve({
      agentId: this.id,
      name: this.name,
      role: this.role,
      engine: this.engine,
      engineVersion: this.engineVersion,
      status: 'completed',
      dataOrigin: context.dataset.dataOrigin,
      proposal,
      evidence: steps,
      startedAt,
      finishedAt: new Date().toISOString(),
      toolCalls: [],
      phases: [],
      recovery: { used: false, reason: '' },
    })
  }
}

/** mock Agent α：选（人数+1）件 */
export class MockAgentAlpha extends MockAgentEngineBase {
  readonly id = 'alpha' as const
  readonly name = '预算猎手'
  readonly role = '预算优先（mock 脚手架）'
  protected itemCount(context: AgentContext): number {
    return Math.min(context.dataset.menuItems.length, context.challenge.constraints.people + 1)
  }
}

/** mock Agent β：选（人数×2）件 */
export class MockAgentBeta extends MockAgentEngineBase {
  readonly id = 'beta' as const
  readonly name = '营养均衡派'
  readonly role = '营养优先（mock 脚手架）'
  protected itemCount(context: AgentContext): number {
    return Math.min(context.dataset.menuItems.length, context.challenge.constraints.people * 2)
  }
}

/** mock 裁判：基于 mock 提案计算结构正确的五维结果（公式先行，权重与 ARCHITECTURE.md 一致） */
export class MockJudgeEngine {
  readonly engine = 'mock-dev-scaffold'
  readonly engineVersion = '0.1.0'

  evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { challenge, dataset, agents } = context
    const budget = challenge.constraints.budgetCents ?? 0

    const scored = agents.map((agent) => {
      const proposal = agent.proposal
      const fit = proposal
        ? (proposal.constraintChecks.filter((check) => check.satisfied).length /
            Math.max(1, proposal.constraintChecks.length)) *
          30
        : 0
      const budgetControl =
        proposal && budget > 0
          ? proposal.totalCents <= budget
            ? 15 + 10 * Math.max(0, 1 - proposal.totalCents / budget)
            : 0
          : 0
      const nutrition = proposal ? 12 : 0
      const coupon = proposal && proposal.couponCodes.length > 0 ? 8 : 0
      const explain = proposal ? (proposal.constraintChecks.every((check) => check.detail) ? 10 : 5) : 0
      const total = fit + budgetControl + nutrition + coupon + explain
      return { agentId: agent.agentId, fit, budgetControl, nutrition, coupon, explain, total }
    })

    const [alpha, beta] = scored as [typeof scored[number] | undefined, typeof scored[number] | undefined]
    const totalAlpha = alpha?.total ?? 0
    const totalBeta = beta?.total ?? 0
    const winner: 'alpha' | 'beta' | 'tie' = totalAlpha === totalBeta ? 'tie' : totalAlpha > totalBeta ? 'alpha' : 'beta'

    // mock 裁判不做真实独立验证（正式裁判为 arena-core 的 RuleBasedJudge）；
    // 这里仅填充结构合法的验证报告，priceStatus 固定 not-verified，绝不冒充实测。
    const verification = agents.map((agent) => ({
      agentId: agent.agentId,
      engine: `${agent.engine}@${agent.engineVersion}`,
      eligible: agent.proposal !== null,
      priceStatus: 'not-verified' as const,
      officialCostCents: null,
      claimedCostCents: agent.proposal?.totalCents ?? null,
      recomputedCostCents: null,
      effectiveCostCents: agent.proposal?.totalCents ?? null,
      targetAchievement: null,
      verifiedSubtotalCents: agent.proposal?.subtotalCents ?? null,
      verifiedDeliveryCents: agent.proposal?.deliveryFeeCents ?? null,
      verifiedDiscountCents: agent.proposal?.discountCents ?? null,
      validCouponCodes: [],
      responseMs: agent.durationMs ?? 0,
      checks: [],
      violations: agent.proposal
        ? []
        : [
            {
              code: 'empty-proposal' as const,
              severity: 'fatal' as const,
              message: 'mock 裁判：Agent 未产出提案',
              evidenceRef: '',
            },
          ],
    }))

    return Promise.resolve({
      dimensions: [
        dimension('requirement-fit', '需求满足度', 30, 0.3, 'score = 满足约束数 / 总约束数 × 30', alpha?.fit ?? 0, beta?.fit ?? 0),
        dimension('budget-control', '预算控制', 25, 0.25, '不超支得 15 分，剩余预算比例 × 10；超支得 0', alpha?.budgetControl ?? 0, beta?.budgetControl ?? 0),
        dimension('nutrition-balance', '营养均衡', 20, 0.2, 'mock：固定 12 分（正式算法阶段02实现）', alpha?.nutrition ?? 0, beta?.nutrition ?? 0),
        dimension('coupon-usage', '优惠利用', 15, 0.15, '命中有效优惠券得 8 分（mock 简化）', alpha?.coupon ?? 0, beta?.coupon ?? 0),
        dimension('explainability', '可解释性', 10, 0.1, '约束说明完整得 10 分，否则 5 分', alpha?.explain ?? 0, beta?.explain ?? 0),
      ],
      totalScore: Math.max(totalAlpha, totalBeta),
      totalMax: 100,
      winner,
      headline: `mock 裁判：${winner === 'tie' ? '双方战平' : winner === 'alpha' ? '预算猎手领先' : '营养均衡派领先'}（${Math.max(totalAlpha, totalBeta).toFixed(1)} / 100）`,
      notes: [
        '本局裁判为 mock-dev-scaffold 脚手架，打分逻辑为演示用途；正式裁判为 arena-core 的 RuleBasedJudge（独立验证）。',
        dataset.dataOrigin === 'mock' ? MOCK_DATA_WARNING : '',
      ].filter((note) => note.length > 0),
      rulesVersion: 'mock-dev-scaffold/0.1.0',
      experimentId: `exp_mock_${context.seed ?? 0}_${dataset.sourceRef}`,
      costBasis: 'claimed-unverified',
      verification,
      allViolations: verification.flatMap((entry) =>
        entry.violations.map((violation) => ({ ...violation, agentId: entry.agentId })),
      ),
    })
  }
}

function dimension(
  key: 'requirement-fit' | 'budget-control' | 'nutrition-balance' | 'coupon-usage' | 'explainability',
  label: string,
  max: number,
  weight: number,
  formula: string,
  alphaScore: number,
  betaScore: number,
) {
  return {
    key,
    label,
    score: Math.max(alphaScore, betaScore),
    max,
    weight,
    formula,
    evidence: [],
  }
}
