import { z } from 'zod'
import { DataOriginSchema } from '../data-origin.js'
import { ApiErrorBodySchema } from '../errors.js'
import {
  ChallengeConstraintsSchema,
  ChallengeSchema,
  EvidenceRecordSchema,
} from './core.js'
import { MatchResultSchema } from './match.js'

/**
 * API 层 DTO 契约（REST + SSE）。前后端共用；
 * 响应返回前必须经过对应 schema 校验。
 */

export const DataModeSchema = z.enum(['mock', 'replay', 'live'])
export type DataMode = z.infer<typeof DataModeSchema>

export const StartMatchRequestSchema = z.object({
  /** 不传则服务端生成 */
  seed: z.number().int().optional(),
  /** 不传则使用服务端默认模式 */
  mode: DataModeSchema.optional(),
  /** 阶段05：自定义挑战约束（不传则由 RuleEngine 按种子随机生成可复现任务卡）。
   *  传入即按用户约束构建任务卡；服务端会以 ChallengeSchema 全量校验，
   *  与随机生成走同一套结构与约束集合，保证裁判与 Agent 行为一致。 */
  constraints: ChallengeConstraintsSchema.optional(),
})
export type StartMatchRequest = z.infer<typeof StartMatchRequestSchema>

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
  dataMode: DataModeSchema,
  dataOrigin: DataOriginSchema,
  mcp: z.object({
    configured: z.boolean(),
    url: z.string().url(),
    allowWrite: z.boolean(),
  }),
  uptimeSec: z.number().nonnegative(),
  time: z.string().datetime(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const SnapshotInfoResponseSchema = z.object({
  dataOrigin: DataOriginSchema,
  sourceRef: z.string().min(1),
  snapshotId: z.string().optional(),
  capturedAt: z.string().datetime(),
  sha256: z.string().nullable(),
  notice: z.string().default(''),
  menuItemCount: z.number().int().nonnegative(),
  couponCount: z.number().int().nonnegative(),
  toolsInvoked: z.array(z.string()).default([]),
})
export type SnapshotInfoResponse = z.infer<typeof SnapshotInfoResponseSchema>

export const MatchPhaseSchema = z.enum([
  'data-source',
  'challenge',
  'agent-alpha',
  'agent-beta',
  'judging',
  'judge',
  'done',
])
export type MatchPhase = z.infer<typeof MatchPhaseSchema>

export const MatchStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('match.created'),
    matchId: z.string().min(1),
    seed: z.number().int(),
    dataOrigin: DataOriginSchema,
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('phase'),
    phase: MatchPhaseSchema,
    message: z.string().min(1),
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('agent.started'),
    agentId: z.enum(['alpha', 'beta']),
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('agent.phase'),
    agentId: z.enum(['alpha', 'beta']),
    phase: z.enum([
      'init',
      'load-data',
      'plan',
      'search',
      'evaluate',
      'finalize',
      'done',
    ]),
    message: z.string().min(1),
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('agent.step'),
    agentId: z.enum(['alpha', 'beta']),
    evidence: EvidenceRecordSchema,
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('agent.completed'),
    agentId: z.enum(['alpha', 'beta']),
    status: z.enum(['completed', 'failed']).default('completed'),
    durationMs: z.number().int().nonnegative().optional(),
    candidateCount: z.number().int().nonnegative().optional(),
    toolCallCount: z.number().int().nonnegative().optional(),
    recoveryUsed: z.boolean().default(false),
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('agent.failed'),
    agentId: z.enum(['alpha', 'beta']),
    code: z.string().min(1),
    message: z.string().min(1),
    recoveryUsed: z.boolean().default(false),
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('match.completed'),
    result: MatchResultSchema,
    at: z.string().datetime(),
  }),
  z.object({
    type: z.literal('match.failed'),
    error: ApiErrorBodySchema,
    at: z.string().datetime(),
  }),
])
export type MatchStreamEvent = z.infer<typeof MatchStreamEventSchema>

export const ChallengeRequestSchema = z.object({
  seed: z.number().int().optional(),
})
export type ChallengeRequest = z.infer<typeof ChallengeRequestSchema>

export const ChallengeResponseSchema = z.object({
  challenge: ChallengeSchema,
})
export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>
