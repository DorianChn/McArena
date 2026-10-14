import { ChallengeSchema } from '@mcarena/shared'
import type { Challenge, ChallengeConstraints } from '@mcarena/shared'

/**
 * 开发用任务卡构造器（脚手架）。
 *
 * ⚠️ 正式版 RuleEngine（seed → 随机但可复现的任务卡，含约束变体）在阶段02 实现。
 * 本构造器仅使用固定约束模板 + 显式 seed，保证阶段01 全链路可跑、可复现。
 */

export const DEV_CONSTRAINT_TEMPLATE: ChallengeConstraints = ChallengeSchema.shape.constraints.parse({
  people: 2,
  budgetCents: 6000,
  scene: 'dine-in',
  preferCoupons: true,
})

export function buildDevelopmentChallenge(seed: number, now: Date = new Date()): Challenge {
  return ChallengeSchema.parse({
    id: `challenge-${seed}`,
    seed,
    constraints: DEV_CONSTRAINT_TEMPLATE,
    title: `2 人堂食 · 预算 ¥${((DEV_CONSTRAINT_TEMPLATE.budgetCents ?? 0) / 100).toFixed(0)}（开发任务卡）`,
    brief: '在预算内为 2 位顾客搭配堂食餐品；正式随机任务卡（预算/人数/场景变体）将在阶段02 上线。',
    generatedAt: now.toISOString(),
  })
}
