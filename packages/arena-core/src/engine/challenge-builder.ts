import { ChallengeConstraintsSchema, ChallengeSchema } from '@mcarena/shared'
import type { Challenge, ChallengeConstraints, Scene } from '@mcarena/shared'

/**
 * 任务卡构造器（共享单一实现）。
 *
 * 重要：本文件是「用户自定义约束 → 任务卡」的**唯一实现**。
 * 网页（apps/api MatchService）、CLI 与 WorkBuddy Skill 全部通过本模块构建任务卡，
 * 严禁在任一入口复制粘贴第二套逻辑，否则三端行为会漂移（见 STAGE_06_REPORT.md）。
 *
 * 确定性：任务卡的 title/brief 完全由约束派生，不含随机内容；
 * 同一 (约束, seed) 必得同一任务卡。
 */

const SCENE_LABELS: Record<Scene, string> = {
  'dine-in': '堂食',
  'take-away': '外带',
  delivery: '外送',
}

/** 由约束构建任务卡（确定性：标题/简述仅由约束派生，不含随机内容） */
export function buildCustomChallenge(
  constraints: ChallengeConstraints,
  seed: number,
  now: Date = new Date(),
): Challenge {
  const parsed = ChallengeConstraintsSchema.parse(constraints)
  const scene = SCENE_LABELS[parsed.scene] ?? parsed.scene
  const parts: string[] = []
  if (parsed.budgetCents !== undefined) parts.push(`预算 ¥${(parsed.budgetCents / 100).toFixed(0)}`)
  if (parsed.nutritionTarget?.kcal !== undefined) parts.push(`人均 ${parsed.nutritionTarget.kcal} kcal`)
  if (parsed.nutritionTarget?.proteinG !== undefined) parts.push(`人均蛋白 ${parsed.nutritionTarget.proteinG}g`)
  if (parsed.nutritionTarget?.sodiumMgMax !== undefined) parts.push(`人均钠 ≤ ${parsed.nutritionTarget.sodiumMgMax}mg`)
  if (parsed.requiredTags.length > 0) parts.push(`必含标签 ${parsed.requiredTags.join('/')}`)
  if (parsed.requiredCategories.length > 0) parts.push(`必含类别 ${parsed.requiredCategories.join('/')}`)
  const suffix = parts.length > 0 ? `｜${parts.join('、')}` : ''
  return ChallengeSchema.parse({
    id: `challenge-custom-${seed}`,
    seed,
    constraints: parsed,
    title: `自定义挑战 · ${parsed.people} 人${scene}${suffix}`,
    brief:
      `玩家自定义约束：${parsed.people} 人、${scene}` +
      (parsed.budgetCents !== undefined ? `、预算 ¥${(parsed.budgetCents / 100).toFixed(0)}` : '、不限预算') +
      (parsed.mustIncludeCodes.length > 0 ? `、必选餐品 ${parsed.mustIncludeCodes.join('、')}` : '') +
      (parsed.requiredTags.length > 0 ? `、必含标签 ${parsed.requiredTags.join('、')}` : '') +
      (parsed.requiredCategories.length > 0 ? `、必含类别 ${parsed.requiredCategories.join('、')}` : '') +
      (parsed.maxDistinctItems !== undefined ? `、最多 ${parsed.maxDistinctItems} 种餐品` : '') +
      (parsed.nutritionTarget ? '、有营养目标' : '') +
      (parsed.preferCoupons ? '、优先使用优惠券' : '、不要求用券'),
    generatedAt: now.toISOString(),
  })
}

// ---------------------------------------------------------------- 目标预设（Goal Preset）

export const GOAL_PRESET_KEYS = ['balanced', 'protein', 'low-sodium', 'low-cal', 'budget'] as const
export type GoalPresetKey = (typeof GOAL_PRESET_KEYS)[number]

export interface GoalPreset {
  key: GoalPresetKey
  /** 中文名（用于自然语言与界面展示） */
  label: string
  description: string
  /** 人均营养目标（与 ChallengeConstraints.nutritionTarget 语义一致：人均值） */
  nutritionTarget?: { kcal?: number; proteinG?: number; sodiumMgMax?: number }
  requiredTags?: string[]
  requiredCategories?: string[]
  preferCoupons?: boolean
}

/**
 * 营养/口味目标预设。Skill 把自然语言（如「高蛋白」「低钠」「管饱」）映射到这里的键，
 * 再由 buildConstraintsFromParams 统一展开为 ChallengeConstraints。
 * 数值口径为「人均」，与 verifier 的达成率计算（按人数缩放）保持一致。
 */
export const GOAL_PRESETS: Record<GoalPresetKey, GoalPreset> = {
  balanced: {
    key: 'balanced',
    label: '均衡搭配',
    description: '汉堡 + 小食 + 饮品各至少一件，人均 500kcal、20g 蛋白质',
    nutritionTarget: { kcal: 500, proteinG: 20 },
    requiredTags: ['burger', 'side', 'drink'],
  },
  protein: {
    key: 'protein',
    label: '高蛋白',
    description: '人均蛋白质不低于 30g',
    nutritionTarget: { proteinG: 30 },
  },
  'low-sodium': {
    key: 'low-sodium',
    label: '低钠',
    description: '人均钠摄入不超过 900mg',
    nutritionTarget: { sodiumMgMax: 900 },
  },
  'low-cal': {
    key: 'low-cal',
    label: '低热量',
    description: '人均热量不超过 450kcal',
    nutritionTarget: { kcal: 450 },
  },
  budget: {
    key: 'budget',
    label: '省钱优先',
    description: '不设营养目标，优先使用优惠券把总价压到最低',
    preferCoupons: true,
  },
}

export function isGoalPresetKey(value: string): value is GoalPresetKey {
  return (GOAL_PRESET_KEYS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------- 参数 → 约束

/** 结构化挑战参数（CLI 与 Skill 解析后的统一中间表示） */
export interface ChallengeParams {
  people?: number
  /** 预算（分）。CLI 传入「元」时需先 ×100 */
  budgetCents?: number
  scene?: Scene
  goal?: GoalPresetKey
  requiredTags?: string[]
  requiredCategories?: string[]
  mustIncludeCodes?: string[]
  excludedCodes?: string[]
  maxDistinctItems?: number
  preferCoupons?: boolean
  nutritionTarget?: { kcal?: number; proteinG?: number; sodiumMgMax?: number }
}

/** 合并「目标预设 + 显式参数」→ 规范化约束（缺省：2 人堂食、优先用券） */
export function buildConstraintsFromParams(params: ChallengeParams): ChallengeConstraints {
  const preset = params.goal ? GOAL_PRESETS[params.goal] : undefined
  const mergedTags = dedupe([...(preset?.requiredTags ?? []), ...(params.requiredTags ?? [])])
  const mergedCategories = dedupe([...(preset?.requiredCategories ?? []), ...(params.requiredCategories ?? [])])
  const nutrition = mergeNutrition(preset?.nutritionTarget, params.nutritionTarget)

  return ChallengeConstraintsSchema.parse({
    people: params.people ?? 2,
    budgetCents: params.budgetCents,
    scene: params.scene ?? 'dine-in',
    maxDistinctItems: params.maxDistinctItems,
    mustIncludeCodes: params.mustIncludeCodes ?? [],
    excludedCodes: params.excludedCodes ?? [],
    requiredTags: mergedTags,
    requiredCategories: mergedCategories,
    nutritionTarget: nutrition,
    preferCoupons: params.preferCoupons ?? preset?.preferCoupons ?? true,
  })
}

/** 参数 → 任务卡（唯一入口：约束展开后仍走 buildCustomChallenge） */
export function buildChallengeFromParams(
  params: ChallengeParams,
  seed: number,
  now: Date = new Date(),
): Challenge {
  return buildCustomChallenge(buildConstraintsFromParams(params), seed, now)
}

function mergeNutrition(
  base: { kcal?: number; proteinG?: number; sodiumMgMax?: number } | undefined,
  override: { kcal?: number; proteinG?: number; sodiumMgMax?: number } | undefined,
): { kcal?: number; proteinG?: number; sodiumMgMax?: number } | undefined {
  if (!base && !override) return undefined
  const merged: { kcal?: number; proteinG?: number; sodiumMgMax?: number } = { ...base, ...override }
  const cleaned = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as { kcal?: number; proteinG?: number; sodiumMgMax?: number }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}
