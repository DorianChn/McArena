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

export const AgentExecutionSchema = z.object({
  agentId: AgentIdSchema,
  /** Agent 中文名，如「预算猎手」 */
  name: z.string().min(1),
  /** 角色定位（中文） */
  role: z.string().min(1),
  /** 引擎标识；mock 引擎固定为 mock-dev-scaffold */
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
      evidence: agent.evidence.map((ev) => ({
        id: ev.id,
        kind: ev.kind,
        message: ev.message,
        tool: ev.tool ?? null,
        resultSummary: ev.resultSummary ?? null,
      })),
    })),
    judge: result.judge,
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
