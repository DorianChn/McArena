import type { AgentExecution, MatchResult, NutritionInfo } from '@mcarena/shared'

/** 从 Agent 提案的餐品营养数据汇总（提案 items 已携带数据集营养快照） */
export function nutritionOf(agent: AgentExecution | undefined): NutritionInfo {
  const total: NutritionInfo = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, sodiumMg: 0 }
  for (const item of agent?.proposal?.items ?? []) {
    const nutrition = item.nutrition
    if (!nutrition) continue
    total.kcal = (total.kcal ?? 0) + (nutrition.kcal ?? 0) * item.qty
    total.proteinG = (total.proteinG ?? 0) + (nutrition.proteinG ?? 0) * item.qty
    total.fatG = (total.fatG ?? 0) + (nutrition.fatG ?? 0) * item.qty
    total.carbG = (total.carbG ?? 0) + (nutrition.carbG ?? 0) * item.qty
    total.sodiumMg = (total.sodiumMg ?? 0) + (nutrition.sodiumMg ?? 0) * item.qty
  }
  return total
}

export interface SideBySideRow {
  label: string
  alpha: string
  beta: string
  /** 该行胜出一方（用于轻量高亮）；平手为 tie */
  better: 'alpha' | 'beta' | 'tie'
  hint?: string
}

/** 双方营养并排对比（同目标下越高越好；钠为上限约束，越低越好） */
export function nutritionRows(result: MatchResult): SideBySideRow[] {
  const alpha = nutritionOf(result.agents[0])
  const beta = nutritionOf(result.agents[1])
  const target = result.challenge.constraints.nutritionTarget
  const pick = (a: number, b: number, lowerIsBetter = false): 'alpha' | 'beta' | 'tie' => {
    if (a === b) return 'tie'
    if (lowerIsBetter) return a < b ? 'alpha' : 'beta'
    return a > b ? 'alpha' : 'beta'
  }
  return [
    {
      label: '热量',
      alpha: `${Math.round(alpha.kcal ?? 0)} kcal`,
      beta: `${Math.round(beta.kcal ?? 0)} kcal`,
      better: pick(alpha.kcal ?? 0, beta.kcal ?? 0),
      hint: target?.kcal !== undefined ? `目标人均 ${target.kcal} kcal` : undefined,
    },
    {
      label: '蛋白质',
      alpha: `${(alpha.proteinG ?? 0).toFixed(1)} g`,
      beta: `${(beta.proteinG ?? 0).toFixed(1)} g`,
      better: pick(alpha.proteinG ?? 0, beta.proteinG ?? 0),
      hint: target?.proteinG !== undefined ? `目标人均 ${target.proteinG} g` : undefined,
    },
    {
      label: '钠',
      alpha: `${Math.round(alpha.sodiumMg ?? 0)} mg`,
      beta: `${Math.round(beta.sodiumMg ?? 0)} mg`,
      better: pick(alpha.sodiumMg ?? 0, beta.sodiumMg ?? 0, true),
      hint: target?.sodiumMgMax !== undefined ? `上限人均 ${target.sodiumMgMax} mg` : undefined,
    },
  ]
}
