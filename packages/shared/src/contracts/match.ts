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

export const JudgeResultSchema = z.object({
  dimensions: z.array(ScoreDimensionSchema).min(1),
  totalScore: z.number().nonnegative(),
  totalMax: z.number().positive(),
  winner: MatchWinnerSchema,
  /** 中文结论一句话 */
  headline: z.string().min(1),
  notes: z.array(z.string()).default([]),
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
      winner: result.judge.winner,
      headline: result.judge.headline,
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
