import type { Challenge } from '@mcarena/shared'
import { Badge } from './ui/Badge.js'
import { Card, CardBody } from './ui/Card.js'
import { sceneLabel, yuan } from '../lib/format.js'

/** 任务卡摘要（结果页顶部） */
export function ChallengeCard({ challenge, seed }: { challenge: Challenge; seed: number }) {
  const constraints = challenge.constraints
  const target = constraints.nutritionTarget
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{challenge.title}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-3">{challenge.brief}</p>
          </div>
          <Badge tone="neutral">种子 {seed}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{constraints.people} 人</Badge>
          <Badge tone="neutral">{sceneLabel(constraints.scene)}</Badge>
          <Badge tone="gold">{constraints.budgetCents === undefined ? '不限预算' : `预算 ${yuan(constraints.budgetCents)}`}</Badge>
          {constraints.maxDistinctItems !== undefined && <Badge tone="neutral">最多 {constraints.maxDistinctItems} 种</Badge>}
          {constraints.mustIncludeCodes.map((code) => (
            <Badge key={code} tone="brand">必选 {code}</Badge>
          ))}
          {constraints.requiredTags.map((tag) => (
            <Badge key={tag} tone="brand">标签 {tag}</Badge>
          ))}
          {constraints.requiredCategories.map((category) => (
            <Badge key={category} tone="brand">类别 {category}</Badge>
          ))}
          {target && (
            <Badge tone="info">
              营养目标
              {target.kcal !== undefined && ` · ${target.kcal}kcal`}
              {target.proteinG !== undefined && ` · ${target.proteinG}g 蛋白`}
              {target.sodiumMgMax !== undefined && ` · 钠≤${target.sodiumMgMax}mg`}
              （人均）
            </Badge>
          )}
          {constraints.preferCoupons && <Badge tone="info">优先用券</Badge>}
        </div>
      </CardBody>
    </Card>
  )
}
