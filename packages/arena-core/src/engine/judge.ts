import { EvidenceRecordSchema, JudgeResultSchema, stableStringify } from '@mcarena/shared'
import type {
  AgentVerification,
  EvidenceRecord,
  JudgeResult,
  MatchWinner,
  ScoreDimension,
} from '@mcarena/shared'
import type { JudgeContext, JudgeEngine } from '../types.js'
import { verifyAgentProposal } from './verifier.js'

/**
 * 阶段04 独立智能裁判引擎（规则实现，确定性）。
 *
 * 核心原则（详见 JUDGE_SPEC.md）：
 *   1. 裁判不信任 Agent 自述的任何成绩——所有分数均由 verifyAgentProposal()
 *      基于当前数据集独立重算后得出；
 *   2. 约束满足是硬性条件：出现 fatal 违规即失去资格，不能获胜；
 *   3. 无效方案不能凭低价取胜（低成本只可能来自有效方案）；
 *   4. 优先比较经过官方 calculate-price 核验的真实成本；
 *   5. 同等成本比较营养/用户目标达成率；
 *   6. 响应速度是次级维度，仅在以上全部持平时作为最后依据。
 *
 * 五维评分（满分 100）：需求满足 30｜预算控制 25｜营养均衡 20｜优惠利用 15｜可解释性 10。
 */

const WEIGHTS: Record<ScoreDimension['key'], number> = {
  'requirement-fit': 0.3,
  'budget-control': 0.25,
  'nutrition-balance': 0.2,
  'coupon-usage': 0.15,
  explainability: 0.1,
}

const DIMENSION_META: Array<{ key: ScoreDimension['key']; label: string; max: number }> = [
  { key: 'requirement-fit', label: '需求满足度', max: 30 },
  { key: 'budget-control', label: '预算控制', max: 25 },
  { key: 'nutrition-balance', label: '营养均衡', max: 20 },
  { key: 'coupon-usage', label: '优惠利用', max: 15 },
  { key: 'explainability', label: '可解释性', max: 10 },
]

const REQUIRED_EVIDENCE_KINDS: Array<EvidenceRecord['kind']> = [
  'data-source',
  'selection',
  'price',
  'constraint-check',
]

type DimensionKey = ScoreDimension['key']

export type AgentScore = Record<DimensionKey, { score: number; formula: string; evidence: EvidenceRecord[] }>

/** 单 Agent 五维总分（基准测试与调试用；与裁判内部算法一致） */
export function totalAgentScore(score: AgentScore): number {
  return Object.values(score).reduce((sum, entry) => sum + entry.score, 0)
}

/** 纯函数确定性哈希（FNV-1a 变体，输出 32 位十六进制），避免依赖 Node crypto 以便跨端复用 */
function stableHash(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ ((code << 3) | (i & 7)), 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** 中文金额 */
function yuan(cents: number | null): string {
  return cents === null ? '—' : `¥${(cents / 100).toFixed(2)}`
}

/** 比较用的目标达成率：null（无目标/无数据）按 0 计 */
function achievementOf(entry: AgentVerification): number {
  return entry.targetAchievement ?? 0
}

export class RuleBasedJudge implements JudgeEngine {
  readonly engine = 'rule-based'
  readonly engineVersion = '1.0.0'
  /** 评分规则版本：规则变化视为新实验，必须同步提升 */
  readonly rulesVersion = 'judge-rules/1.1.0'

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { challenge, dataset } = context
    const [alpha, beta] = context.agents

    // ---- 1) 独立验证：裁判自己重算一切，不信任 Agent 自述 ----
    const verification: [AgentVerification, AgentVerification] = [
      await verifyAgentProposal({ agent: alpha, challenge, dataset, priceOracle: context.priceOracle }),
      await verifyAgentProposal({ agent: beta, challenge, dataset, priceOracle: context.priceOracle }),
    ]

    const scored: [AgentScore, AgentScore] = [
      this.scoreAgent(context, verification[0]),
      this.scoreAgent(context, verification[1]),
    ]

    const verdict = decideWinner(verification)
    const costBasis =
      verification[0].officialCostCents !== null && verification[1].officialCostCents !== null
        ? ('official-verified' as const)
        : ('claimed-unverified' as const)

    const evCounter = { value: 0 }
    const ev = (message: string, resultSummary?: string): EvidenceRecord =>
      EvidenceRecordSchema.parse({
        id: `judge-${(evCounter.value += 1)}`,
        kind: 'judge',
        message,
        resultSummary,
        at: new Date().toISOString(),
      })

    const dims: ScoreDimension[] = DIMENSION_META.map(({ key, label, max }) => ({
      key,
      label,
      score: Math.max(scored[0][key].score, scored[1][key].score),
      max,
      weight: WEIGHTS[key],
      formula: scored[0][key].formula,
      evidence: [
        ev(
          `${alpha.name} ${scored[0][key].score.toFixed(1)} 分：${scored[0][key].formula}`,
          joinEvidence(scored[0][key].evidence),
        ),
        ev(
          `${beta.name} ${scored[1][key].score.toFixed(1)} 分：${scored[1][key].formula}`,
          joinEvidence(scored[1][key].evidence),
        ),
      ],
    }))

    const totalAlpha = sumScores(scored[0])
    const totalBeta = sumScores(scored[1])
    const winnerName: string = verdict.winner === 'alpha' ? alpha.name : verdict.winner === 'beta' ? beta.name : '双方'

    return JudgeResultSchema.parse({
      dimensions: dims,
      totalScore: Math.max(totalAlpha, totalBeta),
      totalMax: 100,
      winner: verdict.winner,
      headline: headlineOf({ verification, verdict, winnerName, totalAlpha, totalBeta, costBasis }),
      notes: buildNotes({
        context,
        verification,
        costBasis,
        verdict,
        totalAlpha,
        totalBeta,
        rulesVersion: this.rulesVersion,
      }),
      rulesVersion: this.rulesVersion,
      experimentId: this.experimentIdOf(context, verification),
      costBasis,
      verification,
      agentScores: [
        { agentId: alpha.agentId, total: totalAlpha, dimensions: dimRecordOf(scored[0]) },
        { agentId: beta.agentId, total: totalBeta, dimensions: dimRecordOf(scored[1]) },
      ],
      allViolations: verification.flatMap((entry) =>
        entry.violations.map((violation) => ({ ...violation, agentId: entry.agentId })),
      ),
    })
  }

  /** 逐 Agent 五维原始得分（供基准测试对比；同样基于独立验证，不采信 Agent 自述） */
  async scoreAgents(context: JudgeContext): Promise<[AgentScore, AgentScore]> {
    const verification: [AgentVerification, AgentVerification] = [
      await verifyAgentProposal({
        agent: context.agents[0],
        challenge: context.challenge,
        dataset: context.dataset,
        priceOracle: context.priceOracle,
      }),
      await verifyAgentProposal({
        agent: context.agents[1],
        challenge: context.challenge,
        dataset: context.dataset,
        priceOracle: context.priceOracle,
      }),
    ]
    return [this.scoreAgent(context, verification[0]), this.scoreAgent(context, verification[1])]
  }

  /** 可复现实验 ID：同 (规则版本, 种子, 数据集指纹, 引擎, 验证结果) → 同 ID */
  private experimentIdOf(context: JudgeContext, verification: [AgentVerification, AgentVerification]): string {
    const fingerprint = stableStringify({
      rulesVersion: this.rulesVersion,
      seed: context.seed ?? null,
      dataset: {
        sourceRef: context.dataset.sourceRef,
        snapshotId: context.dataset.snapshotId ?? null,
        sha256: context.dataset.sha256,
        capturedAt: context.dataset.capturedAt,
      },
      judgeEngine: `${this.engine}@${this.engineVersion}`,
      verification: verification.map((entry) => ({
        agentId: entry.agentId,
        engine: entry.engine,
        eligible: entry.eligible,
        priceStatus: entry.priceStatus,
        officialCostCents: entry.officialCostCents,
        claimedCostCents: entry.claimedCostCents,
        recomputedCostCents: entry.recomputedCostCents,
        effectiveCostCents: entry.effectiveCostCents,
        targetAchievement: entry.targetAchievement,
        checks: entry.checks.map((check) => ({ name: check.name, passed: check.passed })),
        violations: entry.violations.map((violation) => ({
          code: violation.code,
          severity: violation.severity,
        })),
      })),
      // responseMs 为真实测量值（非确定性），不参与实验 ID
    })
    return `exp_${stableHash(fingerprint)}`
  }

  /** 五维评分：全部输入来自裁判独立验证结果 */
  private scoreAgent(context: JudgeContext, verification: AgentVerification): AgentScore {
    const agent = context.agents.find((entry) => entry.agentId === verification.agentId)
    const agentName = agent?.name ?? verification.agentId
    const makeEv = (message: string, resultSummary?: string): EvidenceRecord[] => [
      EvidenceRecordSchema.parse({
        id: `judge-${verification.agentId}-${message.slice(0, 12)}`,
        kind: 'judge',
        message,
        resultSummary,
        at: new Date().toISOString(),
      }),
    ]

    // 1) 需求满足度：裁判 checks 通过率 × 30
    const checks = verification.checks
    const passed = checks.filter((check) => check.passed).length
    const fitScore = checks.length === 0 ? 0 : (passed / checks.length) * 30

    // 2) 预算控制：以裁决成本（官方核价 > 裁判重算）判定
    const budget = context.challenge.constraints.budgetCents
    const cost = verification.effectiveCostCents
    let budgetScore: number
    let budgetFormula: string
    if (cost === null) {
      budgetScore = 0
      budgetFormula = '无有效成本（提案为空），得 0 分'
    } else if (budget === undefined) {
      budgetScore = 15
      budgetFormula = `未设置预算，按 15 分基础分计（裁决成本 ${yuan(cost)}）`
    } else if (cost <= budget) {
      const remaining = Math.max(0, Math.min(1, 1 - cost / budget))
      budgetScore = 15 + 10 * remaining
      budgetFormula = `裁决成本 ${yuan(cost)} ≤ 预算 ${yuan(budget)}，剩余比例 ${(remaining * 100).toFixed(1)}% → 15 + 10×${remaining.toFixed(3)}`
    } else {
      budgetScore = 0
      budgetFormula = `裁决成本 ${yuan(cost)} 超预算 ${yuan(budget)}，得 0 分`
    }

    // 3) 营养均衡：裁判重算的目标达成率 × 20（无目标中性 10 分）
    let nutritionScore = 10
    let nutritionFormula = '任务卡未设营养目标，按中性 10 分计'
    if (verification.targetAchievement !== null) {
      nutritionScore = verification.targetAchievement * 20
      nutritionFormula = `加权达成率 ${(verification.targetAchievement * 100).toFixed(1)}% × 20（权重 热量0.4/蛋白质0.4/钠0.2，裁判按数据集营养数据重算）`
    }

    // 4) 优惠利用：裁判重算优惠 / 券前应付 × 15（封顶）
    const discount = verification.verifiedDiscountCents ?? 0
    const gross = (verification.effectiveCostCents ?? 0) + discount
    const couponScore = gross > 0 ? Math.max(0, Math.min(15, (discount / gross) * 15)) : 0

    // 5) 可解释性：证据完整度 40% + 裁判检查说明覆盖率 60%
    const agentEvidence = agent?.evidence ?? []
    const kinds = new Set(agentEvidence.map((entry) => entry.kind))
    const completeness =
      REQUIRED_EVIDENCE_KINDS.filter((kind) => kinds.has(kind)).length / REQUIRED_EVIDENCE_KINDS.length
    const detailRate = checks.length === 0 ? 0 : checks.filter((check) => check.detail.length > 0).length / checks.length
    const explainScore = (completeness * 0.4 + detailRate * 0.6) * 10

    return {
      'requirement-fit': {
        score: fitScore,
        formula: `裁判校验通过 ${passed}/${checks.length} × 30`,
        evidence: makeEv(
          `${agentName}：独立校验 ${passed}/${checks.length} 项通过` +
            (checks.length > passed ? `（未通过：${checks.filter((c) => !c.passed).map((c) => c.name).join('、')}）` : ''),
        ),
      },
      'budget-control': {
        score: budgetScore,
        formula: budgetFormula,
        evidence: makeEv(`${agentName}：${budgetFormula}`),
      },
      'nutrition-balance': {
        score: nutritionScore,
        formula: nutritionFormula,
        evidence: makeEv(`${agentName}：${nutritionFormula}`),
      },
      'coupon-usage': {
        score: couponScore,
        formula: '裁判重算优惠 / 券前应付 × 15（封顶）',
        evidence: makeEv(
          `${agentName}：计入优惠 ${yuan(discount)}，券前应付 ${yuan(gross)}` +
            (verification.validCouponCodes.length > 0 ? `（有效券：${verification.validCouponCodes.join('、')}）` : '（无有效券）'),
        ),
      },
      explainability: {
        score: explainScore,
        formula: '证据完整度 40% + 独立校验说明覆盖率 60%',
        evidence: makeEv(
          `${agentName}：证据 ${agentEvidence.length} 条（完整度 ${(completeness * 100).toFixed(0)}%），校验说明覆盖 ${(detailRate * 100).toFixed(0)}%`,
        ),
      },
    }
  }
}

// ---------------------------------------------------------------- 胜负判定

interface Verdict {
  winner: MatchWinner
  /** 判定依据（中文，进入 headline/notes） */
  reason: string
  /** 成本比较是否双方都经官方核验 */
  costComparedOn: 'official' | 'recomputed' | 'none'
}

/**
 * 字典序判定（严格顺序，先命中先返回）：
 *   ① 资格（fatal 违规即取消资格；无效方案不能凭低价赢）
 *   ② 成本：优先比较官方核验成本；单方核验 → 核验方胜；否则比较裁判重算成本
 *   ③ 营养/用户目标达成率（同成本时）
 *   ④ 响应速度（真实测量值，最后手段）
 */
function decideWinner(verification: [AgentVerification, AgentVerification]): Verdict {
  const [alpha, beta] = verification
  const alphaEligible = alpha.eligible
  const betaEligible = beta.eligible

  // ① 资格
  if (!alphaEligible && !betaEligible) {
    return {
      winner: 'tie',
      reason: `双方均存在致命违规（α：${fatalSummary(alpha) || '—'}；β：${fatalSummary(beta) || '—'}），本局无人取得获胜资格`,
      costComparedOn: 'none',
    }
  }
  if (alphaEligible !== betaEligible) {
    const winnerSide = alphaEligible ? 'alpha' : 'beta'
    const loser = alphaEligible ? beta : alpha
    return {
      winner: winnerSide,
      reason: `${alphaEligible ? 'α' : 'β'}通过全部硬性校验，${alphaEligible ? 'β' : 'α'}因致命违规失去资格（${fatalSummary(loser) || '未知原因'}）——无效方案不能凭低价取胜`,
      costComparedOn: 'none',
    }
  }

  // ② 成本（双方均有资格）：只要取得官方 calculate-price 记录（verified 或 mismatch），
  //    一律以官方口径参与比较；官方口径优先于裁判重算值。
  const alphaOfficial = alpha.officialCostCents
  const betaOfficial = beta.officialCostCents
  const bothOfficial = alphaOfficial !== null && betaOfficial !== null
  if (bothOfficial) {
    const diff = alphaOfficial - betaOfficial
    const basisNote =
      alpha.priceStatus === 'verified' && beta.priceStatus === 'verified'
        ? '双方均通过官方 calculate-price 核价'
        : '按官方 calculate-price 口径（申报价与官方记录不一致的一方以官方值为准）'
    if (diff !== 0) {
      return {
        winner: diff < 0 ? 'alpha' : 'beta',
        reason: `${basisNote}，${diff < 0 ? 'α' : 'β'}的已验证应付成本更低（${yuan(alphaOfficial)} : ${yuan(betaOfficial)}）`,
        costComparedOn: 'official',
      }
    }
  } else if (alphaOfficial !== null || betaOfficial !== null) {
    const verifiedIsAlpha = alphaOfficial !== null
    return {
      winner: verifiedIsAlpha ? 'alpha' : 'beta',
      reason: `仅${verifiedIsAlpha ? 'α' : 'β'}取得官方 calculate-price 记录（另一方 NOT_VERIFIED），优先采信官方口径成本`,
      costComparedOn: 'official',
    }
  } else {
    const diff = (alpha.effectiveCostCents ?? 0) - (beta.effectiveCostCents ?? 0)
    if (diff !== 0) {
      return {
        winner: diff < 0 ? 'alpha' : 'beta',
        reason: `双方均无官方核价记录（NOT_VERIFIED），按裁判重算成本比较，${diff < 0 ? 'α' : 'β'}更低（${yuan(alpha.effectiveCostCents)} : ${yuan(beta.effectiveCostCents)}）`,
        costComparedOn: 'recomputed',
      }
    }
  }

  // 成本相等 → ③ 营养/目标
  const achievementDiff = achievementOf(alpha) - achievementOf(beta)
  if (achievementDiff !== 0) {
    return {
      winner: achievementDiff > 0 ? 'alpha' : 'beta',
      reason: `裁决成本相同，比较营养/用户目标达成率：${(achievementOf(alpha) * 100).toFixed(1)}% : ${(achievementOf(beta) * 100).toFixed(1)}%`,
      costComparedOn:
        alpha.officialCostCents !== null && beta.officialCostCents !== null ? 'official' : 'recomputed',
    }
  }

  // 仍相等 → ④ 速度（真实测量值）
  const speedDiff = alpha.responseMs - beta.responseMs
  if (speedDiff !== 0) {
    return {
      winner: speedDiff < 0 ? 'alpha' : 'beta',
      // 注意：不写入具体毫秒数，保证复现指纹不受实测耗时影响
      reason: `成本与目标达成完全一致，按实际响应时间判定（${speedDiff < 0 ? 'α' : 'β'}更快，真实测量值，见各 AgentExecution.durationMs）`,
      costComparedOn:
        alpha.officialCostCents !== null && beta.officialCostCents !== null ? 'official' : 'recomputed',
    }
  }

  return {
    winner: 'tie',
    reason: '资格、已验证成本、目标达成率与响应时间全部一致，判定平局',
    costComparedOn: alpha.officialCostCents !== null && beta.officialCostCents !== null ? 'official' : 'recomputed',
  }
}

/** 致命违规摘要（中文，取前 2 条） */
function fatalSummary(entry: AgentVerification): string {
  return entry.violations
    .filter((violation) => violation.severity === 'fatal')
    .slice(0, 2)
    .map((violation) => violation.message)
    .join('；')
}

function headlineOf(input: {
  verification: [AgentVerification, AgentVerification]
  verdict: Verdict
  winnerName: string
  totalAlpha: number
  totalBeta: number
  costBasis: 'official-verified' | 'claimed-unverified'
}): string {
  const [alpha, beta] = input.verification
  const { verdict, winnerName } = input
  if (verdict.winner === 'tie') {
    if (!alpha.eligible && !beta.eligible) {
      return `双方均未通过独立验证，本局无人胜出（${input.totalAlpha.toFixed(1)} : ${input.totalBeta.toFixed(1)} / 100）`
    }
    return `双方战平（各 ${input.totalAlpha.toFixed(1)} / 100）：${verdict.reason}`
  }
  const score = verdict.winner === 'alpha' ? input.totalAlpha : input.totalBeta
  const other = verdict.winner === 'alpha' ? input.totalBeta : input.totalAlpha
  // 注意：胜负由字典序判定（资格 → 已验证成本 → 目标达成 → 速度）决定，
  // 与五维总分不必然同向（例如成本更低但营养分略低）。因此这里明确标注
  // 「五维总分」并附判定依据，避免读者误读为「总分更低者获胜」。
  return `${winnerName}胜出（五维总分 ${score.toFixed(1)} : ${other.toFixed(1)} / 100）——${verdict.reason}`
}

interface NotesInput {
  context: JudgeContext
  verification: [AgentVerification, AgentVerification]
  costBasis: 'official-verified' | 'claimed-unverified'
  verdict: Verdict
  totalAlpha: number
  totalBeta: number
  rulesVersion: string
}

function buildNotes(input: NotesInput): string[] {
  const { context, verification, costBasis, verdict } = input
  const notes: string[] = []

  notes.push(`评分规则版本 ${input.rulesVersion}；五维得分全部来自裁判独立重算（不采信 Agent 自述成绩）。`)

  if (context.dataset.dataOrigin === 'mock') {
    notes.push('本局运行于模拟数据集（非麦当劳官方数据），裁判算法为真实规则实现。')
  }

  notes.push(
    costBasis === 'official-verified'
      ? '成本比较依据：双方均通过官方 calculate-price 核价（official-verified）。'
      : '成本比较依据：未能对双方完成官方核价，成本以裁判按数据集单价与券规则重算值为准（claimed-unverified，已在验证报告中标注 NOT_VERIFIED）。',
  )

  const notVerified = verification.filter((entry) => entry.priceStatus !== 'verified')
  for (const entry of notVerified) {
    notes.push(
      `${entry.agentId === 'alpha' ? 'α' : 'β'}（${entry.engine}）价格核验状态：${entry.priceStatus === 'mismatch' ? '与官方记录不一致，以官方值为准' : 'NOT_VERIFIED（无官方 calculate-price 记录，已明确标注，不视为通过）'}。`,
    )
  }

  const ineligible = verification.filter((entry) => !entry.eligible)
  for (const entry of ineligible) {
    notes.push(`${entry.agentId === 'alpha' ? 'α' : 'β'} 失去获胜资格：${fatalSummary(entry) || '存在致命违规'}`)
  }

  notes.push(`判定顺序：资格 → 已验证成本 → 营养/目标达成率 → 响应速度。本局依据：${verdict.reason}`)

  const recovery = context.agents.filter((agent) => agent.recovery.used)
  if (recovery.length > 0) {
    notes.push(
      `注意：${recovery.map((agent) => `${agent.name}（${agent.recovery.reason || '执行中断'}）`).join('、')} 的输出为降级恢复方案，不代表其常规策略水平。`,
    )
  }

  notes.push(
    `算法表现：${context.agents
      .map((agent) => `${agent.name} 候选 ${agent.candidateCount ?? 0} 个 / 工具调用 ${agent.toolCallCount ?? 0} 次`)
      .join('；')}（实测响应时间为真实测量值，见各 AgentExecution.durationMs，不参与复现指纹；仅作次级评价维度）。`,
  )

  notes.push(
    `可复现实验：相同 (规则版本, 种子, 数据集指纹, 引擎版本, 验证结果) 将得到完全相同的 experimentId 与全部确定性判定（实测耗时除外）。`,
  )

  return notes
}

function joinEvidence(evidence: EvidenceRecord[]): string {
  return evidence.map((entry) => entry.message).join('；')
}

/** AgentScore → 各维度数字记录（供前端雷达图使用，不做四舍五入以保持确定性） */
function dimRecordOf(score: AgentScore): Record<DimensionKey, number> {
  return {
    'requirement-fit': score['requirement-fit'].score,
    'budget-control': score['budget-control'].score,
    'nutrition-balance': score['nutrition-balance'].score,
    'coupon-usage': score['coupon-usage'].score,
    explainability: score.explainability.score,
  }
}

function sumScores(scored: AgentScore): number {
  return Object.values(scored).reduce((sum, entry) => sum + entry.score, 0)
}

