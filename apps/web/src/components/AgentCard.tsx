import { DATA_ORIGIN_LABELS } from '@mcarena/shared'
import type { AgentExecution } from '@mcarena/shared'

export function AgentCard({ agent }: { agent: AgentExecution }) {
  const isAlpha = agent.agentId === 'alpha'
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">
          <span className={isAlpha ? 'text-amber-300' : 'text-sky-300'}>
            {isAlpha ? 'Agent α' : 'Agent β'} · {agent.name}
          </span>
        </h3>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
          {DATA_ORIGIN_LABELS[agent.dataOrigin].label}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        {agent.role} ｜ {agent.engine}@{agent.engineVersion}
      </p>

      {agent.proposal ? (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="pb-2">餐品</th>
              <th className="pb-2 text-right">数量</th>
              <th className="pb-2 text-right">小计</th>
            </tr>
          </thead>
          <tbody>
            {agent.proposal.items.map((item) => (
              <tr key={item.code} className="border-t border-zinc-800">
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-right">×{item.qty}</td>
                <td className="py-2 text-right">¥{(item.lineTotalCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-700 font-semibold">
              <td className="pt-2">应付总价</td>
              <td />
              <td className="pt-2 text-right text-amber-300">¥{(agent.proposal.totalCents / 100).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">该 Agent 未产出提案。</p>
      )}

      {agent.proposal && agent.proposal.constraintChecks.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs">
          {agent.proposal.constraintChecks.map((check) => (
            <li key={check.name} className={check.satisfied ? 'text-emerald-300' : 'text-red-300'}>
              {check.satisfied ? '✓' : '✗'} {check.name}：{check.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
