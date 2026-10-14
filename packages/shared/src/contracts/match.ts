import { z } from 'zod'
import {
  ChallengeSchema,
  EvidenceRecordSchema,
  MealProposalSchema,
} from './core.js'
import { DataOriginSchema } from '../data-origin.js'
import { ErrorCodeSchema } from '../errors.js'

/**
 * 比赛与裁判契约（AgentExecution / JudgeResult / MatchResult）。
 */

export const AgentIdSchema = z.enum(['alpha', 'beta'])
export type AgentId = z.infer<typeof AgentIdSchema>

export const AgentStatusSchema = z.enum(['completed', 'failed'])
export type AgentStatus = z.infer<typeof AgentStatusSchema>

/** Agent 执行阶段（状态机的可观测轨迹，前端按序展示） */
export const AgentPhaseNameSchema = z.enum([
  'init',
  'load-data',
  'plan',
  'search',
  'evaluate',
  'finalize',
  'done',
])
export type AgentPhaseName = z.infer<typeof AgentPhaseNameSchema>

export const AgentPhaseRecordSchema = z.object({
  name: AgentPhaseNameSchema,
  /** 中文说明 */
  message: z.string().min(1),
  at: z.string().datetime(),
})
export type AgentPhaseRecord = z.infer<typeof AgentPhaseRecordSchema>

/** 单次工具调用记录（MCP 工具或价格预言机） */
export const ToolCallRecordSchema = z.object({
  /** 工具名，如 calculate-price / query-meals */
  tool: z.string().min(1),
  args: z.record(z.unknown()).default({}),
  /** 中文结果摘要（不含敏感信息） */
  resultSummary: z.string().default(''),
  /** 命中：true=取得结果，false=未命中（如回放价格预言机无该购物车记录） */
  hit: z.boolean().default(true),
  at: z.string().datetime(),
})
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>

export const AgentRecoverySchema = z.object({
  /** true 表示本次输出为降级恢复结果（非该 Agent 常规推理路径） */
  used: z.boolean(),
  /** 触发恢复的原因（中文，如「执行超时」/「未捕获异常」） */
  reason: z.string().default(''),
})
export type AgentRecovery = z.infer<typeof AgentRecoverySchema>

export const AgentExecutionSchema = z.object({
  agentId: AgentIdSchema,
  /** Agent 中文名，如「极速猎手」 */
  name: z.string().min(1),
  /** 角色定位（中文） */
  role: z.string().min(1),
  /** 引擎标识；算法型 Agent 为 speed-greedy / optimizer-search */
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  status: AgentStatusSchema,
  /** 本 Agent 所用数据来源（与数据集一致，前端据此标注） */
  dataOrigin: DataOriginSchema,
  proposal: MealProposalSchema.nullable(),
  evidence: z.array(EvidenceRecordSchema).default([]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  errorCode: ErrorCodeSchema.optional(),
  /** 真实运行耗时（毫秒，含提案构造全过程） */
  durationMs: z.number().int().nonnegative().optional(),
  /** 决策过程中评估过的候选购物车数量（1 = 单遍贪心，不经组合搜索） */
  candidateCount: z.number().int().nonnegative().optional(),
  /** 实际发生的工具调用次数 */
  toolCallCount: z.number().int().nonnegative().optional(),
  /** 工具调用明细（逐条可溯源） */
  toolCalls: z.array(ToolCallRecordSchema).default([]),
  /** 执行阶段轨迹（状态机可观测性） */
  phases: z.array(AgentPhaseRecordSchema).default([]),
  /** 降级恢复标注；常规完成时为 { used:false } */
  recovery: AgentRecoverySchema.default({ used: false }),
})
export type AgentExecution = z.infer<typeof AgentExecutionSchema>

export const ScoreDimensionKeySchema = z.enum([
  'requirement-fit',
  'budget-control',
  'nutrition-balance',
  'coupon-usage',
  'explainability',
])
export type ScoreDimensionKey = z.infer<typeof ScoreDimensionKeySchema>

export const ScoreDimensionSchema = z.object({
  key: ScoreDimensionKeySchema,
  /** 中文维度名 */
  label: z.string().min(1),
  score: z.number().nonnegative(),
  max: z.number().positive(),
  weight: z.number().min(0).max(1),
  /** 打分公式（纯文本，前端原样展示） */
  formula: z.string().min(1),
  evidence: z.array(EvidenceRecordSchema).default([]),
})
export type ScoreDimension = z.infer<typeof ScoreDimensionSchema>

export const MatchWinnerSchema = z.enum(['alpha', 'beta', 'tie'])
export type MatchWinner = z.infer<typeof MatchWinnerSchema>

// ---------------------------------------------------------------- 裁判验证（阶段04）

/** 违规严重级别：fatal = 失去资格；warning = 记录但不剥夺资格 */
export const ViolationSeveritySchema = z.enum(['fatal', 'warning'])
export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>

/** 违规码（固定枚举，前端与测试共用） */
export const JudgeViolationCodeSchema = z.enum([
  'empty-proposal',
  'unknown-item',
  'unavailable-item',
  'invalid-qty',
  'invalid-price',
  'duplicate-items',
  'budget-exceeded',
  'people-not-covered',
  'distinct-items-exceeded',
  'missing-required-code',
  'missing-required-tag',
  'missing-required-category',
  'coupon-not-found',
  'coupon-not-applicable',
  'coupon-threshold-not-met',
  'coupon-unsupported-type',
  'discount-mismatch',
  'price-mismatch',
  'price-not-verifiable',
  'nutrition-data-missing',
  'internal-error',
])
export type JudgeViolationCode = z.infer<typeof JudgeViolationCodeSchema>

export const JudgeViolationSchema = z.object({
  code: JudgeViolationCodeSchema,
  severity: ViolationSeveritySchema,
  /** 中文原因说明 */
  message: z.string().min(1),
  /** 数据证据引用（如 `dataset.menuItems[burger-classic].priceCents`、`snapshot:<id>`） */
  evidenceRef: z.string().default(''),
})
export type JudgeViolation = z.infer<typeof JudgeViolationSchema>

/** 单项校验结果（供可解释报告逐条展示） */
export const JudgeCheckSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().default(''),
  /** 该检查引用的数据证据 */
  evidenceRef: z.string().default(''),
})
export type JudgeCheck = z.infer<typeof JudgeCheckSchema>

/** 价格核验状态：verified=官方口径一致；mismatch=与官方不符（以官方为准）；not-verified=无官方记录 */
export const PriceVerificationStatusSchema = z.enum(['verified', 'mismatch', 'not-verified'])
export type PriceVerificationStatus = z.infer<typeof PriceVerificationStatusSchema>

/** 单个 Agent 的独立验证报告（裁判不信任 Agent 自述成绩） */
export const AgentVerificationSchema = z.object({
  agentId: AgentIdSchema,
  engine: z.string().min(1),
  /** 硬性资格：无 fatal 违规 */
  eligible: z.boolean(),
  priceStatus: PriceVerificationStatusSchema,
  /** 官方核算应付成本（分）；核价失败时为 null */
  officialCostCents: z.number().int().nonnegative().nullable(),
  /** Agent 自述应付成本（分） */
  claimedCostCents: z.number().int().nonnegative().nullable(),
  /** 裁判用数据集单价与券规则独立重算的成本（分） */
  recomputedCostCents: z.number().int().nonnegative().nullable(),
  /** 裁决采用的有效成本：官方核价 > 裁判重算 > 自述 */
  effectiveCostCents: z.number().int().nonnegative().nullable(),
  /** 营养/用户目标达成率（0–1）；无目标或数据缺失时为 null */
  targetAchievement: z.number().min(0).max(1).nullable(),
  /** 裁判用数据集单价独立重算的餐品小计（分） */
  verifiedSubtotalCents: z.number().int().nonnegative().nullable(),
  /** 裁判重算的配送费（分） */
  verifiedDeliveryCents: z.number().int().nonnegative().nullable(),
  /** 裁判重算的优惠金额（分，仅计入通过验证的券） */
  verifiedDiscountCents: z.number().int().nonnegative().nullable(),
  /** 通过裁判验证、实际计入优惠的券编码 */
  validCouponCodes: z.array(z.string()).default([]),
  /** 实际响应时间（毫秒，取自 AgentExecution.durationMs） */
  responseMs: z.number().int().nonnegative(),
  checks: z.array(JudgeCheckSchema).default([]),
  violations: z.array(JudgeViolationSchema).default([]),
})
export type AgentVerification = z.infer<typeof AgentVerificationSchema>

export const CostBasisSchema = z.enum([
  /** 双方（或至少胜方）成本经官方 calculate-price 核验 */
  'official-verified',
  /** 成本仅来自 Agent 自述，未经官方核验 */
  'claimed-unverified',
])
export type CostBasis = z.infer<typeof CostBasisSchema>

/** 单个 Agent 的五维得分摘要（前端雷达图/得分条直接使用，无需二次计算） */
export const AgentScoreSummarySchema = z.object({
  agentId: AgentIdSchema,
  /** 五维总分（满分 100） */
  total: z.number().nonnegative(),
  /** 各维度原始得分 */
  dimensions: z.record(ScoreDimensionKeySchema, z.number().nonnegative()),
})
export type AgentScoreSummary = z.infer<typeof AgentScoreSummarySchema>

export const JudgeResultSchema = z.object({
  dimensions: z.array(ScoreDimensionSchema).min(1),
  totalScore: z.number().nonnegative(),
  totalMax: z.number().positive(),
  winner: MatchWinnerSchema,
  /** 中文结论一句话 */
  headline: z.string().min(1),
  notes: z.array(z.string()).default([]),
  // ---- 阶段04：独立裁判 ----
  /** 评分规则版本（变更即视为新规则实验） */
  rulesVersion: z.string().min(1).default('judge-rules/1.0.0'),
  /** 可复现实验 ID：同 (规则, 种子, 数据集指纹, 引擎版本, 验证结果) → 同 ID */
  experimentId: z.string().min(1),
  /** 成本比较依据 */
  costBasis: CostBasisSchema.default('claimed-unverified'),
  /** 两个 Agent 的独立验证报告（含违规与证据引用） */
  verification: z.array(AgentVerificationSchema).length(2),
  /** 两个 Agent 各自的五维原始得分（与 dimensions 中的取最大值相对应） */
  agentScores: z.tuple([AgentScoreSummarySchema, AgentScoreSummarySchema]),
  /** 全部违规（含 warning）的扁平汇总，便于前端集中展示 */
  allViolations: z
    .array(JudgeViolationSchema.extend({ agentId: AgentIdSchema }))
    .default([]),
})
export type JudgeResult = z.infer<typeof JudgeResultSchema>

export const EngineVersionsSchema = z.object({
  orchestrator: z.string().min(1),
  agentAlpha: z.string().min(1),
  agentBeta: z.string().min(1),
  judge: z.string().min(1),
})
export type EngineVersions = z.infer<typeof EngineVersionsSchema>

export const MatchResultSchema = z.object({
  matchId: z.string().min(1),
  seed: z.number().int(),
  challenge: ChallengeSchema,
  /** 比赛数据来源（严格区分 mock / 官方快照 / 官方实时） */
  dataOrigin: DataOriginSchema,
  dataset: z.object({
    sourceRef: z.string().min(1),
    snapshotId: z.string().optional(),
    sha256: z.string().nullable(),
    notice: z.string().default(''),
    capturedAt: z.string().datetime(),
  }),
  agents: z.tuple([AgentExecutionSchema, AgentExecutionSchema]),
  judge: JudgeResultSchema,
  engineVersions: EngineVersionsSchema,
  createdAt: z.string().datetime(),
  /** 模拟数据等场景的显著警示 */
  warnings: z.array(z.string()).default([]),
})
export type MatchResult = z.infer<typeof MatchResultSchema>

/**
 * 复现性指纹：剔除易变字段（ID、时间戳）后按稳定键序序列化。
 * 同一 (seed, 数据集, 引擎版本) 的比赛，其 fingerprint 必须一致。
 */
export function canonicalizeMatch(result: MatchResult): string {
  const stripped = {
    seed: result.seed,
    challenge: {
      id: result.challenge.id,
      seed: result.challenge.seed,
      constraints: result.challenge.constraints,
      title: result.challenge.title,
      brief: result.challenge.brief,
    },
    dataOrigin: result.dataOrigin,
    dataset: {
      sourceRef: result.dataset.sourceRef,
      snapshotId: result.dataset.snapshotId ?? null,
      sha256: result.dataset.sha256,
      notice: result.dataset.notice,
    },
    agents: result.agents.map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role,
      engine: agent.engine,
      engineVersion: agent.engineVersion,
      status: agent.status,
      dataOrigin: agent.dataOrigin,
      proposal: agent.proposal,
      // 注意：durationMs 为真实耗时（非确定性），不进入指纹；
      // candidateCount / toolCallCount / toolCalls / phases 由算法决定，进入指纹。
      candidateCount: agent.candidateCount ?? 0,
      toolCallCount: agent.toolCallCount ?? 0,
      toolCalls: agent.toolCalls.map((call) => ({
        tool: call.tool,
        args: call.args,
        hit: call.hit,
      })),
      phases: agent.phases.map((phase) => ({ name: phase.name, message: phase.message })),
      recovery: agent.recovery,
      evidence: agent.evidence.map((ev) => ({
        id: ev.id,
        kind: ev.kind,
        message: ev.message,
        tool: ev.tool ?? null,
        resultSummary: ev.resultSummary ?? null,
      })),
    })),
    judge: {
      rulesVersion: result.judge.rulesVersion,
      experimentId: result.judge.experimentId,
      costBasis: result.judge.costBasis,
      winner: result.judge.winner,
      headline: result.judge.headline,
      agentScores: result.judge.agentScores,
      // 验证与违规是确定性计算结果，进入复现指纹
      verification: result.judge.verification.map((entry) => ({
        agentId: entry.agentId,
        engine: entry.engine,
        eligible: entry.eligible,
        priceStatus: entry.priceStatus,
        officialCostCents: entry.officialCostCents,
        claimedCostCents: entry.claimedCostCents,
        recomputedCostCents: entry.recomputedCostCents,
        effectiveCostCents: entry.effectiveCostCents,
        targetAchievement: entry.targetAchievement,
        verifiedSubtotalCents: entry.verifiedSubtotalCents,
        verifiedDeliveryCents: entry.verifiedDeliveryCents,
        verifiedDiscountCents: entry.verifiedDiscountCents,
        validCouponCodes: entry.validCouponCodes,
        checks: entry.checks,
        violations: entry.violations,
      })),
      allViolations: result.judge.allViolations,
      dimensions: result.judge.dimensions.map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
        score: dimension.score,
        max: dimension.max,
        weight: dimension.weight,
        formula: dimension.formula,
        // 剔除时间戳，仅保留确定性内容
        evidence: dimension.evidence.map((ev) => ({
          id: ev.id,
          kind: ev.kind,
          message: ev.message,
          tool: ev.tool ?? null,
          resultSummary: ev.resultSummary ?? null,
        })),
      })),
      totalScore: result.judge.totalScore,
      totalMax: result.judge.totalMax,
      notes: result.judge.notes,
    },
    engineVersions: result.engineVersions,
    warnings: result.warnings,
  }
  return stableStringify(stripped)
}

/** 稳定键序 JSON 序列化 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}
