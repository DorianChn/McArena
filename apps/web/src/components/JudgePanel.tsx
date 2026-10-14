import type { AgentVerification, JudgeResult } from '@mcarena/shared'

const WINNER_LABELS: Record<JudgeResult['winner'], string> = {
  alpha: 'Agent α 胜出',
  beta: 'Agent β 胜出',
  tie: '双方战平',
}

const PRICE_STATUS_LABELS: Record<AgentVerification['priceStatus'], { label: string; className: string }> = {
  verified: { label: '官方核价一致', className: 'border-emerald-600 bg-emerald-950/50 text-emerald-300' },
  mismatch: { label: '与官方记录不一致（以官方为准）', className: 'border-amber-600 bg-amber-950/50 text-amber-300' },
  'not-verified': { label: 'NOT_VERIFIED（无官方核价记录）', className: 'border-rose-700 bg-rose-950/50 text-rose-300' },
}

const COST_BASIS_LABELS: Record<JudgeResult['costBasis'], string> = {
  'official-verified': '成本比较依据：官方 calculate-price 核验',
  'claimed-unverified': '成本比较依据：裁判重算（未经官方核验）',
}

function fmtYuan(cents: number | null): string {
  return cents === null ? '—' : `¥${(cents / 100).toFixed(2)}`
}

function VerificationCard({ entry, name }: { entry: AgentVerification; name: string }) {
  const priceStatus = PRICE_STATUS_LABELS[entry.priceStatus]
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">
          {name}｜{entry.engine}
        </h3>
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              entry.eligible
                ? 'border-emerald-600 bg-emerald-950/50 text-emerald-300'
                : 'border-rose-700 bg-rose-950/50 text-rose-300'
            }`}
          >
            {entry.eligible ? '通过硬性校验' : '失去获胜资格'}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${priceStatus.className}`}>
            {priceStatus.label}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-4">
        <div>
          <dt>官方核算成本</dt>
          <dd className="text-zinc-200">{fmtYuan(entry.officialCostCents)}</dd>
        </div>
        <div>
          <dt>Agent 自述成本</dt>
          <dd className="text-zinc-200">{fmtYuan(entry.claimedCostCents)}</dd>
        </div>
        <div>
          <dt>裁判重算成本</dt>
          <dd className="text-zinc-200">{fmtYuan(entry.recomputedCostCents)}</dd>
        </div>
        <div>
          <dt>裁决采用成本</dt>
          <dd className="text-amber-300">{fmtYuan(entry.effectiveCostCents)}</dd>
        </div>
        <div>
          <dt>目标达成率</dt>
          <dd className="text-zinc-200">
            {entry.targetAchievement === null ? '—' : `${(entry.targetAchievement * 100).toFixed(1)}%`}
          </dd>
        </div>
        <div>
          <dt>实测响应</dt>
          <dd className="text-zinc-200">{entry.responseMs}ms</dd>
        </div>
        <div>
          <dt>校验通过</dt>
          <dd className="text-zinc-200">
            {entry.checks.filter((check) => check.passed).length}/{entry.checks.length}
          </dd>
        </div>
        <div>
          <dt>计入优惠的券</dt>
          <dd className="text-zinc-200">{entry.validCouponCodes.length > 0 ? entry.validCouponCodes.join('、') : '无'}</dd>
        </div>
      </dl>

      {entry.violations.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {entry.violations.map((violation, index) => (
            <li
              key={`${violation.code}-${index}`}
              className={violation.severity === 'fatal' ? 'text-rose-300' : 'text-amber-300/90'}
            >
              [{violation.severity === 'fatal' ? '致命违规' : '警告'}] {violation.code}：{violation.message}
              {violation.evidenceRef && <span className="ml-1 font-mono text-zinc-500">（证据：{violation.evidenceRef}）</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function JudgePanel({ judge }: { judge: JudgeResult }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">裁判裁决（独立智能裁判）</h2>
        <span className="rounded-full border border-amber-600 bg-amber-950/50 px-3 py-1 text-xs text-amber-300">
          {WINNER_LABELS[judge.winner]}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{judge.headline}</p>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 font-mono">规则 {judge.rulesVersion}</span>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 font-mono">实验 {judge.experimentId}</span>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5">{COST_BASIS_LABELS[judge.costBasis]}</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="pb-2">维度</th>
              <th className="pb-2 text-right">得分</th>
              <th className="pb-2 text-right">满分</th>
              <th className="pb-2">公式</th>
            </tr>
          </thead>
          <tbody>
            {judge.dimensions.map((dimension) => (
              <tr key={dimension.key} className="border-t border-zinc-800 align-top">
                <td className="py-2">{dimension.label}</td>
                <td className="py-2 text-right text-amber-300">{dimension.score.toFixed(1)}</td>
                <td className="py-2 text-right text-zinc-400">{dimension.max}</td>
                <td className="py-2 font-mono text-xs text-zinc-400">{dimension.formula}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-700 font-semibold">
              <td className="pt-2">加权总分</td>
              <td className="pt-2 text-right text-amber-300">{judge.totalScore.toFixed(1)}</td>
              <td className="pt-2 text-right text-zinc-400">{judge.totalMax}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-zinc-300">独立验证报告（裁判不采信 Agent 自述成绩）</h3>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        {judge.verification.map((entry) => (
          <VerificationCard
            key={entry.agentId}
            entry={entry}
            name={entry.agentId === 'alpha' ? 'Agent α' : 'Agent β'}
          />
        ))}
      </div>

      {judge.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-zinc-400">
          {judge.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
