import { z } from 'zod'
import { DataOriginSchema } from '../data-origin.js'
import { ValidationError } from '../errors.js'

/**
 * McArena 核心数据契约（与 ARCHITECTURE.md §3.1 对齐）。
 * 所有跨模块/跨进程数据都必须经过本文件的 zod schema 校验后才可使用。
 */

// ---------------------------------------------------------------- 基础值对象

export const SceneSchema = z.enum(['dine-in', 'take-away', 'delivery'])
export type Scene = z.infer<typeof SceneSchema>

export const SCENE_LABELS: Record<Scene, string> = {
  'dine-in': '堂食',
  'take-away': '外带',
  delivery: '外送',
}

export const NutritionInfoSchema = z.object({
  kcal: z.number().nonnegative().optional(),
  proteinG: z.number().nonnegative().optional(),
  fatG: z.number().nonnegative().optional(),
  carbG: z.number().nonnegative().optional(),
  sodiumMg: z.number().nonnegative().optional(),
  calciumMg: z.number().nonnegative().optional(),
})
export type NutritionInfo = z.infer<typeof NutritionInfoSchema>

export const MenuItemSchema = z.object({
  /** 官方餐品编码（query-meals / query-meal-detail 返回） */
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  available: z.boolean().default(true),
  nutrition: NutritionInfoSchema.optional(),
  description: z.string().optional(),
})
export type MenuItem = z.infer<typeof MenuItemSchema>

export const CouponTypeSchema = z.enum([
  'threshold-discount',
  'percent-off',
  'item-discount',
  'delivery-fee-off',
])
export type CouponType = z.infer<typeof CouponTypeSchema>

export const CouponSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: CouponTypeSchema,
  /** 面值（分），threshold/item 类使用 */
  valueCents: z.number().int().nonnegative().optional(),
  /** 折扣百分比（percent-off 使用） */
  percent: z.number().min(0).max(100).optional(),
  /** 使用门槛（分） */
  thresholdCents: z.number().int().nonnegative().optional(),
  applicableTags: z.array(z.string()).default([]),
})
export type Coupon = z.infer<typeof CouponSchema>

export const StoreInfoSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().default(''),
  scene: z.array(SceneSchema).default([]),
})
export type StoreInfo = z.infer<typeof StoreInfoSchema>

export const PriceQuoteSchema = z.object({
  quoteId: z.string().min(1),
  itemCodes: z.array(z.string()).min(1),
  subtotalCents: z.number().int().nonnegative(),
  deliveryFeeCents: z.number().int().nonnegative().default(0),
  discountCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative(),
  couponCodesApplied: z.array(z.string()).default([]),
  /** 计价来源：价格一律来自官方 calculate-price（或其快照），禁止自估 */
  priceOrigin: DataOriginSchema,
})
export type PriceQuote = z.infer<typeof PriceQuoteSchema>

export const TimeInfoSchema = z.object({
  iso: z.string().datetime(),
  timezone: z.string().default('Asia/Shanghai'),
  daypart: z.string().optional(),
})
export type TimeInfo = z.infer<typeof TimeInfoSchema>

// ---------------------------------------------------------------- 挑战（Challenge）

export const ChallengeConstraintsSchema = z.object({
  people: z.number().int().min(1).max(12),
  budgetCents: z.number().int().nonnegative().optional(),
  scene: SceneSchema,
  maxDistinctItems: z.number().int().min(1).max(20).optional(),
  mustIncludeCodes: z.array(z.string()).default([]),
  excludedCodes: z.array(z.string()).default([]),
  requiredTags: z.array(z.string()).default([]),
  nutritionTarget: z
    .object({
      kcal: z.number().nonnegative().optional(),
      proteinG: z.number().nonnegative().optional(),
      sodiumMgMax: z.number().nonnegative().optional(),
    })
    .optional(),
  preferCoupons: z.boolean().default(true),
})
export type ChallengeConstraints = z.infer<typeof ChallengeConstraintsSchema>

export const ChallengeSchema = z.object({
  id: z.string().min(1),
  seed: z.number().int(),
  constraints: ChallengeConstraintsSchema,
  /** 中文标题，如「2 人堂食 · 预算 ¥60」 */
  title: z.string().min(1),
  /** 中文任务简述 */
  brief: z.string().min(1),
  generatedAt: z.string().datetime(),
})
export type Challenge = z.infer<typeof ChallengeSchema>

// ---------------------------------------------------------------- 餐单提案（MealProposal）

export const ProposalItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().int().min(1),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative(),
  nutrition: NutritionInfoSchema.optional(),
})
export type ProposalItem = z.infer<typeof ProposalItemSchema>

export const ConstraintCheckSchema = z.object({
  name: z.string().min(1),
  satisfied: z.boolean(),
  detail: z.string().default(''),
})
export type ConstraintCheck = z.infer<typeof ConstraintCheckSchema>

export const MealProposalSchema = z.object({
  items: z.array(ProposalItemSchema),
  subtotalCents: z.number().int().nonnegative(),
  deliveryFeeCents: z.number().int().nonnegative().default(0),
  discountCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative(),
  couponCodes: z.array(z.string()).default([]),
  constraintChecks: z.array(ConstraintCheckSchema).default([]),
  /** 价格来源标识（与数据集来源一致；mock 数据集下为 mock） */
  priceOrigin: DataOriginSchema,
})
export type MealProposal = z.infer<typeof MealProposalSchema>

// ---------------------------------------------------------------- 证据（EvidenceRecord）

export const EvidenceKindSchema = z.enum([
  'data-source',
  'selection',
  'constraint-check',
  'price',
  'nutrition',
  'judge',
  'error',
  'system',
])
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>

export const EvidenceRecordSchema = z.object({
  /** 同一 Agent/裁判内唯一（确定性生成，便于复现比对） */
  id: z.string().min(1),
  kind: EvidenceKindSchema,
  message: z.string().min(1),
  tool: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  resultSummary: z.string().optional(),
  at: z.string().datetime(),
})
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>

// ---------------------------------------------------------------- MCP 数据快照 / 数据集

export const MCPDataSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  /** 快照只能是官方来源（录制的真实响应） */
  dataOrigin: z.literal('official-snapshot'),
  capturedAt: z.string().datetime(),
  mcpServer: z.object({
    url: z.string().url(),
    name: z.string().min(1),
  }),
  toolsInvoked: z.array(z.string()).min(1),
  store: StoreInfoSchema.nullable(),
  menuItems: z.array(MenuItemSchema),
  priceQuotes: z.array(PriceQuoteSchema).default([]),
  coupons: z.array(CouponSchema).default([]),
  timeInfo: TimeInfoSchema.nullable(),
  /** 对规范化内容计算的 sha256（由采集工具写入） */
  sha256: z.string().min(64),
  note: z.string().default(''),
})
export type MCPDataSnapshot = z.infer<typeof MCPDataSnapshotSchema>

/**
 * 引擎消费的数据集（比赛唯一输入）。
 * 同一形状承载三种来源：official-live / official-snapshot / mock，
 * 由 dataOrigin 与 notice 严格区分，杜绝「模拟数据冒充官方数据」。
 */
export const ArenaDatasetSchema = z.object({
  dataOrigin: DataOriginSchema,
  /** 来源引用：mock://dev-fixtures 或 mcp.mcd.cn@<capturedAt> 或 snapshot:<id> */
  sourceRef: z.string().min(1),
  snapshotId: z.string().optional(),
  capturedAt: z.string().datetime(),
  mcpServer: z
    .object({
      url: z.string().url(),
      name: z.string().min(1),
    })
    .optional(),
  toolsInvoked: z.array(z.string()).default([]),
  store: StoreInfoSchema.nullable().default(null),
  menuItems: z.array(MenuItemSchema),
  priceQuotes: z.array(PriceQuoteSchema).default([]),
  coupons: z.array(CouponSchema).default([]),
  timeInfo: TimeInfoSchema.nullable().default(null),
  sha256: z.string().nullable().default(null),
  /** 中文说明；mock 数据集必须写明「非官方数据」 */
  notice: z.string().default(''),
})
export type ArenaDataset = z.infer<typeof ArenaDatasetSchema>

/** 将官方快照转换为引擎数据集 */
export function datasetFromSnapshot(snapshot: MCPDataSnapshot): ArenaDataset {
  return ArenaDatasetSchema.parse({
    dataOrigin: 'official-snapshot',
    sourceRef: `snapshot:${snapshot.snapshotId}`,
    snapshotId: snapshot.snapshotId,
    capturedAt: snapshot.capturedAt,
    mcpServer: snapshot.mcpServer,
    toolsInvoked: snapshot.toolsInvoked,
    store: snapshot.store,
    menuItems: snapshot.menuItems,
    priceQuotes: snapshot.priceQuotes,
    coupons: snapshot.coupons,
    timeInfo: snapshot.timeInfo,
    sha256: snapshot.sha256,
    notice: snapshot.note || `官方快照回放（${snapshot.snapshotId}），非实时数据。`,
  })
}

/** 通用校验助手：解析失败时抛出带详细信息的 ValidationError */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new ValidationError(`${label} 数据校验失败：${issues.join('; ')}`, {
      issues: result.error.issues,
    })
  }
  return result.data
}
