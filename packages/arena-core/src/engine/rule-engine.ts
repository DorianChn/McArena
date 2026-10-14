import { ChallengeSchema } from '@mcarena/shared'
import type { ArenaDataset, Challenge, Scene } from '@mcarena/shared'
import { mulberry32, sampleDeterministic, weightedPick } from './prng.js'

/**
 * 规则引擎：seed → 随机但可复现的任务卡（ARCHITECTURE.md §3.3）。
 *
 * 可复现性约定：给定相同 (seed, dataset)，输出完全一致。
 * dataset 仅用于把约束变体对齐到「当前数据集确实存在」的标签/餐品上
 * （避免生成不可能完成的任务）；不传 dataset 时使用通用目录。
 */

const BUDGET_TIERS = [3000, 4000, 5000, 6000, 8000, 10000]
const PEOPLE_CHOICES = [1, 2, 2, 3, 4]
const SCENE_CHOICES: Scene[] = ['dine-in', 'take-away', 'delivery']
const SCENE_WEIGHTS = [0.5, 0.3, 0.2]
const FALLBACK_TAGS = ['burger', 'side', 'drink', 'dessert']

export class RuleEngine {
  static generateTaskCard(seed: number, dataset?: ArenaDataset, now: Date = new Date()): Challenge {
    const rng = mulberry32(seed)

    const people = weightedPick(rng, PEOPLE_CHOICES, PEOPLE_CHOICES.map(() => 1))
    const budgetCents = weightedPick(rng, BUDGET_TIERS, BUDGET_TIERS.map((_, i) => 6 - i))
    const scene = weightedPick(rng, SCENE_CHOICES, SCENE_WEIGHTS)

    // 约束变体：与数据集对齐（确定性：候选项排序后按 rng 选取）
    const availableTags = dataset
      ? [...new Set(dataset.menuItems.flatMap((item) => item.tags))].sort()
      : FALLBACK_TAGS
    const availableCodes = dataset
      ? dataset.menuItems.filter((item) => item.available).map((item) => item.code).sort()
      : []

    const wantTags = rng() < 0.5
    const requiredTags = wantTags ? sampleDeterministic(rng, availableTags, 1).slice(0, 1) : []
    const wantMustInclude = availableCodes.length > 0 && rng() < 0.35
    const mustIncludeCodes = wantMustInclude ? sampleDeterministic(rng, availableCodes, 1) : []
    const maxDistinctItems = 3 + Math.floor(rng() * 4) // 3..6

    const withNutritionTarget = rng() < 0.6
    const nutritionTarget = withNutritionTarget
      ? {
          kcal: (450 + Math.floor(rng() * 4) * 50) * people, // 450..600 kcal/人
          proteinG: (15 + Math.floor(rng() * 3) * 5) * people, // 15..25 g/人
          sodiumMgMax: (1000 + Math.floor(rng() * 3) * 250) * people, // 1000..1500 mg/人
        }
      : undefined

    return ChallengeSchema.parse({
      id: `challenge-${seed}`,
      seed,
      constraints: {
        people,
        budgetCents,
        scene,
        maxDistinctItems,
        mustIncludeCodes,
        excludedCodes: [],
        requiredTags,
        nutritionTarget,
        preferCoupons: rng() < 0.7,
      },
      title: `${people} 人${sceneLabel(scene)} · 预算 ¥${(budgetCents / 100).toFixed(0)}`,
      brief: buildBrief({ people, scene, budgetCents, requiredTags, mustIncludeCodes, maxDistinctItems, nutritionTarget }),
      generatedAt: now.toISOString(),
    })
  }
}

function sceneLabel(scene: Scene): string {
  if (scene === 'dine-in') return '堂食'
  if (scene === 'take-away') return '外带'
  return '外送'
}

function buildBrief(input: {
  people: number
  scene: Scene
  budgetCents: number
  requiredTags: string[]
  mustIncludeCodes: string[]
  maxDistinctItems: number
  nutritionTarget?: { kcal: number; proteinG: number; sodiumMgMax: number }
}): string {
  const parts: string[] = [
    `在 ¥${(input.budgetCents / 100).toFixed(0)} 预算内为 ${input.people} 人搭配${sceneLabel(input.scene)}餐品`,
    `餐品编码不超过 ${input.maxDistinctItems} 种`,
  ]
  if (input.requiredTags.length > 0) {
    parts.push(`须包含标签：${input.requiredTags.join('、')}`)
  }
  if (input.mustIncludeCodes.length > 0) {
    parts.push(`须包含餐品编码：${input.mustIncludeCodes.join('、')}`)
  }
  if (input.nutritionTarget) {
    parts.push(
      `营养目标：约 ${input.nutritionTarget.kcal} kcal / 蛋白质 ${input.nutritionTarget.proteinG}g / 钠不超过 ${input.nutritionTarget.sodiumMgMax}mg`,
    )
  }
  return `${parts.join('；')}。`
}
