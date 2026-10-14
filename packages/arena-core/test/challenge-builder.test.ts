import { describe, expect, it } from 'vitest'
import { ChallengeConstraintsSchema, stableStringify } from '@mcarena/shared'
import {
  GOAL_PRESETS,
  GOAL_PRESET_KEYS,
  buildChallengeFromParams,
  buildConstraintsFromParams,
  buildCustomChallenge,
  isGoalPresetKey,
} from '../src/index.js'

/**
 * 阶段06：共享任务卡构造器测试。
 *
 * 该模块是 Web / API / CLI / Skill 的唯一任务卡实现，因此重点验证：
 *   1) 缺省值稳定（三端行为一致）；
 *   2) 目标预设展开正确；
 *   3) 显式参数覆盖预设；
 *   4) 确定性（同输入必得同任务卡）。
 */

const NOW = new Date('2026-10-14T05:00:00.000Z')

describe('buildCustomChallenge（共享任务卡构造）', () => {
  it('标题与简述由约束派生，包含人数/场景/预算', () => {
    const challenge = buildCustomChallenge(
      ChallengeConstraintsSchema.parse({
        people: 3,
        budgetCents: 6000,
        scene: 'take-away',
        preferCoupons: true,
      }),
      42,
      NOW,
    )
    expect(challenge.title).toContain('自定义挑战')
    expect(challenge.title).toContain('3 人')
    expect(challenge.title).toContain('外带')
    expect(challenge.title).toContain('预算 ¥60')
    expect(challenge.brief).toContain('3 人')
    expect(challenge.brief).toContain('预算 ¥60')
    expect(challenge.brief).toContain('优先使用优惠券')
    expect(challenge.id).toBe('challenge-custom-42')
    expect(challenge.seed).toBe(42)
    expect(challenge.generatedAt).toBe(NOW.toISOString())
  })

  it('确定性：同 (约束, 种子) → 完全一致的任务卡', () => {
    const constraints = ChallengeConstraintsSchema.parse({
      people: 2,
      budgetCents: 5000,
      scene: 'dine-in',
      requiredTags: ['burger'],
      preferCoupons: false,
    })
    const a = buildCustomChallenge(constraints, 7, NOW)
    const b = buildCustomChallenge(constraints, 7, NOW)
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('不同种子 → 任务卡 id 不同', () => {
    const constraints = ChallengeConstraintsSchema.parse({ people: 2, scene: 'dine-in' })
    expect(buildCustomChallenge(constraints, 1, NOW).id).not.toBe(buildCustomChallenge(constraints, 2, NOW).id)
  })

  it('营养目标与必含类别写入标题', () => {
    const challenge = buildCustomChallenge(
      ChallengeConstraintsSchema.parse({
        people: 4,
        scene: 'dine-in',
        requiredCategories: ['汉堡'],
        nutritionTarget: { kcal: 450, proteinG: 30, sodiumMgMax: 900 },
      }),
      3,
      NOW,
    )
    expect(challenge.title).toContain('人均 450 kcal')
    expect(challenge.title).toContain('人均蛋白 30g')
    expect(challenge.title).toContain('人均钠 ≤ 900mg')
    expect(challenge.title).toContain('必含类别 汉堡')
  })

  it('非法约束被契约拒绝（people=0）', () => {
    expect(() => buildCustomChallenge(ChallengeConstraintsSchema.parse({ people: 0, scene: 'dine-in' }), 1)).toThrow()
  })
})

describe('目标预设（GOAL_PRESETS）', () => {
  it('预设键集合固定且覆盖完整', () => {
    expect(GOAL_PRESET_KEYS).toEqual(['balanced', 'protein', 'low-sodium', 'low-cal', 'budget'])
    for (const key of GOAL_PRESET_KEYS) {
      expect(GOAL_PRESETS[key].key).toBe(key)
      expect(GOAL_PRESETS[key].label.length).toBeGreaterThan(0)
    }
  })

  it('isGoalPresetKey 正确判定', () => {
    expect(isGoalPresetKey('protein')).toBe(true)
    expect(isGoalPresetKey('none')).toBe(false)
    expect(isGoalPresetKey('')).toBe(false)
  })

  it('balanced 预设展开为汉堡+小食+饮品与人均营养目标', () => {
    const constraints = buildConstraintsFromParams({ goal: 'balanced' })
    expect(constraints.requiredTags).toEqual(['burger', 'side', 'drink'])
    expect(constraints.nutritionTarget).toEqual({ kcal: 500, proteinG: 20 })
  })

  it('low-sodium / low-cal / protein 预设各自的营养目标', () => {
    expect(buildConstraintsFromParams({ goal: 'low-sodium' }).nutritionTarget).toEqual({ sodiumMgMax: 900 })
    expect(buildConstraintsFromParams({ goal: 'low-cal' }).nutritionTarget).toEqual({ kcal: 450 })
    expect(buildConstraintsFromParams({ goal: 'protein' }).nutritionTarget).toEqual({ proteinG: 30 })
  })

  it('budget 预设不设营养目标但优先用券', () => {
    const constraints = buildConstraintsFromParams({ goal: 'budget' })
    expect(constraints.nutritionTarget).toBeUndefined()
    expect(constraints.preferCoupons).toBe(true)
  })
})

describe('buildConstraintsFromParams（参数 → 约束）', () => {
  it('缺省：2 人堂食、优先用券、无预算', () => {
    const constraints = buildConstraintsFromParams({})
    expect(constraints.people).toBe(2)
    expect(constraints.scene).toBe('dine-in')
    expect(constraints.preferCoupons).toBe(true)
    expect(constraints.budgetCents).toBeUndefined()
    expect(constraints.requiredTags).toEqual([])
    expect(constraints.requiredCategories).toEqual([])
  })

  it('显式营养参数覆盖预设同名字段，未覆盖字段保留', () => {
    const constraints = buildConstraintsFromParams({
      goal: 'balanced',
      nutritionTarget: { proteinG: 35 },
    })
    expect(constraints.nutritionTarget).toEqual({ kcal: 500, proteinG: 35 })
  })

  it('预设标签与显式标签合并去重', () => {
    const constraints = buildConstraintsFromParams({
      goal: 'balanced',
      requiredTags: ['burger', 'spicy'],
    })
    expect(constraints.requiredTags).toEqual(['burger', 'side', 'drink', 'spicy'])
  })

  it('显式 preferCoupons=false 覆盖预设的 true', () => {
    expect(buildConstraintsFromParams({ goal: 'budget', preferCoupons: false }).preferCoupons).toBe(false)
  })

  it('预算以「分」为单位透传', () => {
    expect(buildConstraintsFromParams({ budgetCents: 6000 }).budgetCents).toBe(6000)
  })

  it('非法人数被契约拒绝', () => {
    expect(() => buildConstraintsFromParams({ people: 99 })).toThrow()
  })
})

describe('buildChallengeFromParams（参数 → 任务卡）', () => {
  it('与 buildConstraintsFromParams 展开结果一致', () => {
    const params = { people: 3, budgetCents: 4500, goal: 'protein' as const, seed: 11 }
    const challenge = buildChallengeFromParams(params, 11, NOW)
    expect(stableStringify(challenge.constraints)).toBe(
      stableStringify(buildConstraintsFromParams(params)),
    )
    expect(challenge.title).toContain('3 人')
    expect(challenge.constraints.nutritionTarget).toEqual({ proteinG: 30 })
  })

  it('确定性：同参数两次构建结果一致', () => {
    const params = { people: 2, budgetCents: 3000, goal: 'low-cal' as const }
    expect(stableStringify(buildChallengeFromParams(params, 5, NOW))).toBe(
      stableStringify(buildChallengeFromParams(params, 5, NOW)),
    )
  })
})
