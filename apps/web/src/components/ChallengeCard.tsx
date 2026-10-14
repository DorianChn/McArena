import { SCENE_LABELS } from '@mcarena/shared'
import type { Challenge } from '@mcarena/shared'

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const { constraints } = challenge
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-lg font-semibold">任务卡</h2>
      <p className="mt-1 text-amber-300">{challenge.title}</p>
      <p className="mt-1 text-sm text-zinc-400">{challenge.brief}</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <li className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
          <span className="block text-xs text-zinc-500">人数</span>
          {constraints.people} 人
        </li>
        <li className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
          <span className="block text-xs text-zinc-500">场景</span>
          {SCENE_LABELS[constraints.scene]}
        </li>
        <li className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
          <span className="block text-xs text-zinc-500">预算</span>
          {constraints.budgetCents === undefined ? '不限' : `¥${(constraints.budgetCents / 100).toFixed(2)}`}
        </li>
        <li className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
          <span className="block text-xs text-zinc-500">优惠偏好</span>
          {constraints.preferCoupons ? '优先用券' : '不要求'}
        </li>
      </ul>
      <p className="mt-3 text-xs text-zinc-500">种子 {challenge.seed} ｜ 生成于 {challenge.generatedAt}</p>
    </section>
  )
}
