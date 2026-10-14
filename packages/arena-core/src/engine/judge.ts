import { EvidenceRecordSchema } from '@mcarena/shared'
import type {
  AgentExecution,
  ArenaDataset,
  Challenge,
  EvidenceRecord,
  JudgeResult,
  ScoreDimension,
} from '@mcarena/shared'
import type { JudgeContext, JudgeEngine } from '../types.js'
import { sumNutrition } from './agent-utils.js'

/**
 * 独立裁判引擎（规则实现，确定性）。
 *
 * 五维打分（与 ARCHITECTURE.md §3.3 / skill/references/scoring.md 一致）：
 *   需求满足度 30｜预算控制 25｜营养均衡 20｜优惠利用 15｜可解释性 10
 * 每个维度携带公式与证据；破平顺序：预算控制 → 需求满足度 → 营养均衡 → 平局。
 */

const WEIGHTS: Record<ScoreDimension['key'], number> = {
  'requirement-fit': 0.3,
  'budget-control': 0.25,
  'nutrition-balance': 0.2,
  'coupon-usage': 0.15,
  explainability: 0.1,
}

type DimensionKey = ScoreDimension['key']
export type AgentScore = Record<DimensionKey, { score: number; formula: string; evidence: EvidenceRecord[] }>

/** 单 Agent 五维总分（基准测试与调试用；与裁判内部算法一致） */
export function totalAgentScore(score: AgentScore): number {
  return Object.values(score).reduce((sum, entry) => sum + entry.score, 0)
}

export class RuleBasedJudge implements JudgeEngine {
  readonly engine = 'rule-based'
  readonly engineVersion = '1.0.0'

  evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { challenge, dataset, agents } = context
    const [alpha, beta] = agents
    let evCounter = 0
    const ev = (message: string, resultSummary?: string): EvidenceRecord =>
      EvidenceRecordSchema.parse({
        id: `judge-${(evCounter += 1)}`,
        kind: 'judge',
        message,
        resultSummary,
        at: new Date().toISOString(),
      })

    const scored: [AgentScore, AgentScore] = [
      this.scoreAgent(challenge, dataset, alpha, ev),
      this.scoreAgent(challenge, dataset, beta, ev),
    ]

    const dims: ScoreDimension[] = (
      [
        ['requirement-fit', '需求满足度', 30],
        ['budget-control', '预算控制', 25],
        ['nutrition-balance', '营养均衡', 20],
        ['coupon-usage', '优惠利用', 15],
        ['explainability', '可解释性', 10],
      ] as const
    ).map(([key, label, max]) => ({
      key,
      label,
      score: Math.max(scored[0][key].score, scored[1][key].score),
      max,
      weight: WEIGHTS[key],
      formula: scored[0][key].formula,
      evidence: [
        ev(`Agent α ${scored[0][key].score.toFixed(1)} 分：${scored[0][key].formula}`, joinEvidence(scored[0][key].evidence)),
        ev(`Agent β ${scored[1][key].score.toFixed(1)} 分：${scored[1][key].formula}`, joinEvidence(scored[1][key].evidence)),
      ],
    }))

    const totalAlpha = sumScores(scored[0])
    const totalBeta = sumScores(scored[1])
    const winner = decideWinner({ alpha: scored[0], beta: scored[1], totalAlpha, totalBeta })
    const winnerName = winner === 'alpha' ? alpha.name : winner === 'beta' ? beta.name : '双方'

    return Promise.resolve({
      dimensions: dims,
      totalScore: Math.max(totalAlpha, totalBeta),
      totalMax: 100,
      winner,
      headline:
        winner === 'tie'
          ? `双方战平（各 ${totalAlpha.toFixed(1)} / 100）`
          : `${winnerName}以 ${Math.max(totalAlpha, totalBeta).toFixed(1)} : ${Math.min(totalAlpha, totalBeta).toFixed(1)} 胜出（满分 100）`,
      notes: [
        dataset.dataOrigin === 'mock' ? '本局运行于模拟数据集，裁判算法为真实规则实现。' : '',
        agents.some((agent) => agent.recovery.used)
          ? `注意：${agents
              .filter((agent) => agent.recovery.used)
              .map((agent) => `${agent.name}（${agent.recovery.reason || '执行中断'}）`)
              .join('、')} 的输出为降级恢复方案，不代表其常规策略水平。`
          : '',
        `算法表现：${agents
          .map(
            (agent) =>
              `${agent.name} 候选 ${agent.candidateCount ?? 0} 个 / 工具调用 ${agent.toolCallCount ?? 0} 次`,
          )
          .join('；')}（运行耗时见各 AgentExecution.durationMs，为真实测量值，不参与复现指纹）。`,
        '评分公式与证据可在上方逐项展开；相同 (种子, 数据集, 引擎版本) 可完整复现本局。',
      ].filter((note) => note.length > 0),
    })
  }

  /** 逐 Agent 五维原始得分（供基准测试对比，不改变裁判行为） */
  scoreAgents(context: JudgeContext): [AgentScore, AgentScore] {
    const [alpha, beta] = context.agents
    let evCounter = 0
    const ev = (message: string, resultSummary?: string): EvidenceRecord =>
      EvidenceRecordSchema.parse({
        id: `judge-${(evCounter += 1)}`,
        kind: 'judge',
        message,
        resultSummary,
        at: new Date().toISOString(),
      })
    return [
      this.scoreAgent(context.challenge, context.dataset, alpha, ev),
      this.scoreAgent(context.challenge, context.dataset, beta, ev),
    ]
  }

  private scoreAgent(
    challenge: Challenge,
    dataset: ArenaDataset,
    agent: AgentExecution,
    ev: (message: string, resultSummary?: string) => EvidenceRecord,
  ): AgentScore {
    const proposal = agent.proposal
    if (!proposal) {
      const empty = { score: 0, formula: '无提案，得 0 分', evidence: [] }
      return {
        'requirement-fit': empty,
        'budget-control': empty,
        'nutrition-balance': empty,
        'coupon-usage': empty,
        explainability: empty,
      }
    }

    // 1) 需求满足度：约束满足率 × 30
    const checks = proposal.constraintChecks
    const satisfied = checks.filter((check) => check.satisfied).length
    const fitScore = checks.length === 0 ? 0 : (satisfied / checks.length) * 30

    // 2) 预算控制：不超支 15 分 + 剩余预算比例 × 10；超支 0 分
    const budget = challenge.constraints.budgetCents
    let budgetScore: number
    let budgetFormula: string
    if (budget === undefined) {
      budgetScore = 15
      budgetFormula = '未设置预算，按 15 分基础分计'
    } else if (proposal.totalCents <= budget) {
      const remaining = 1 - proposal.totalCents / budget
      budgetScore = 15 + 10 * Math.max(0, Math.min(1, remaining))
      budgetFormula = `应付 ¥${(proposal.totalCents / 100).toFixed(2)} ≤ 预算 ¥${(budget / 100).toFixed(2)}，剩余比例 ${(remaining * 100).toFixed(1)}% → 15 + 10×${(Math.max(0, Math.min(1, remaining))).toFixed(3)}`
    } else {
      budgetScore = 0
      budgetFormula = `应付 ¥${(proposal.totalCents / 100).toFixed(2)} 超预算 ¥${(budget / 100).toFixed(2)}，得 0 分`
    }

    // 3) 营养均衡：目标加权达成率 × 20（无目标中性 10 分）
    const target = challenge.constraints.nutritionTarget
    let nutritionScore = 10
    let nutritionFormula = '任务卡未设营养目标，按中性 10 分计'
    let nutritionDetail = '任务卡未设营养目标'
    if (target && proposal.items.length > 0) {
      const qtyByCode = new Map(proposal.items.map((item) => [item.code, item.qty]))
      const menuByCode = new Map(dataset.menuItems.map((item) => [item.code, item]))
      const totals = sumNutrition(qtyByCode, menuByCode)
      const parts: string[] = []
      let weighted = 0
      let divisor = 0
      if (target.kcal !== undefined && target.kcal > 0) {
        const rate = Math.min(1, totals.kcal / target.kcal)
        weighted += 0.4 * rate
        divisor += 0.4
        parts.push(`热量 ${totals.kcal}/${target.kcal} kcal（达成 ${(rate * 100).toFixed(0)}%）`)
      }
      if (target.proteinG !== undefined && target.proteinG > 0) {
        const rate = Math.min(1, totals.proteinG / target.proteinG)
        weighted += 0.4 * rate
        divisor += 0.4
        parts.push(`蛋白质 ${totals.proteinG.toFixed(1)}/${target.proteinG}g（达成 ${(rate * 100).toFixed(0)}%）`)
      }
      if (target.sodiumMgMax !== undefined && target.sodiumMgMax > 0) {
        const rate = totals.sodiumMg <= target.sodiumMgMax ? 1 : target.sodiumMgMax / totals.sodiumMg
        weighted += 0.2 * rate
        divisor += 0.2
        parts.push(`钠 ${totals.sodiumMg.toFixed(0)}/${target.sodiumMgMax}mg（达标系数 ${(rate * 100).toFixed(0)}%）`)
      }
      const effective = divisor > 0 ? divisor : 1
      nutritionScore = Math.max(0, Math.min(20, (weighted / effective) * 20))
      nutritionFormula = `加权达成率 ${((weighted / effective) * 100).toFixed(0)}% × 20（权重 热量0.4/蛋白质0.4/钠0.2）`
      nutritionDetail = parts.join('；') || '餐品无营养数据'
    }

    // 4) 优惠利用：优惠金额 / 券前应付 × 15（封顶）
    const gross = proposal.totalCents + proposal.discountCents
    const couponScoreValue = gross > 0 ? Math.max(0, Math.min(15, (proposal.discountCents / gross) * 15)) : 0

    // 5) 可解释性：证据完整度 40% + 约束说明覆盖率 60%
    const kinds = new Set(agent.evidence.map((entry) => entry.kind))
    const completeness =
      REQUIRED_EVIDENCE_KINDS.filter((kind) => kinds.has(kind)).length / REQUIRED_EVIDENCE_KINDS.length
    const detailRate =
      checks.length === 0 ? 0 : checks.filter((check) => check.detail.length > 0).length / checks.length
    const explainScore = (completeness * 0.4 + detailRate * 0.6) * 10

    return {
      'requirement-fit': {
        score: fitScore,
        formula: `满足约束数 / 总约束数 × 30（${satisfied}/${checks.length}）`,
        evidence: [ev(`满足约束 ${satisfied}/${checks.length} 项`, checks.map((c) => `${c.satisfied ? '✓' : '✗'} ${c.name}`).join('；'))],
      },
      'budget-control': {
        score: budgetScore,
        formula: budgetFormula,
        evidence: [ev(budgetFormula)],
      },
      'nutrition-balance': {
        score: nutritionScore,
        formula: nutritionFormula,
        evidence: [ev(nutritionFormula, nutritionDetail)],
      },
      'coupon-usage': {
        score: couponScoreValue,
        formula: '优惠金额 / 券前应付 × 15（封顶）',
        evidence: [ev(`优惠 ¥${(proposal.discountCents / 100).toFixed(2)}，券前应付 ¥${(gross / 100).toFixed(2)}`, proposal.couponCodes.join('、') || '未用券')],
      },
      explainability: {
        score: explainScore,
        formula: '证据完整度 40% + 约束说明覆盖率 60%',
        evidence: [ev(`证据 ${agent.evidence.length} 条（完整度 ${(completeness * 100).toFixed(0)}%），约束说明覆盖 ${(detailRate * 100).toFixed(0)}%`, agent.evidence.map((e) => e.kind).join('、'))],
      },
    }
  }
}

const REQUIRED_EVIDENCE_KINDS: Array<EvidenceRecord['kind']> = ['data-source', 'selection', 'price', 'constraint-check']

function joinEvidence(evidence: EvidenceRecord[]): string {
  return evidence.map((entry) => entry.message).join('；')
}

function sumScores(scored: AgentScore): number {
  return Object.values(scored).reduce((sum, entry) => sum + entry.score, 0)
}

function decideWinner(input: {
  alpha: AgentScore
  beta: AgentScore
  totalAlpha: number
  totalBeta: number
}): 'alpha' | 'beta' | 'tie' {
  if (input.totalAlpha !== input.totalBeta) {
    return input.totalAlpha > input.totalBeta ? 'alpha' : 'beta'
  }
  for (const key of ['budget-control', 'requirement-fit', 'nutrition-balance'] as const) {
    const diff = input.alpha[key].score - input.beta[key].score
    if (diff !== 0) return diff > 0 ? 'alpha' : 'beta'
  }
  return 'tie'
}
