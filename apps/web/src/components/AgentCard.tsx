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

      {/* 决策过程：性能指标 + 状态机阶段 + 工具调用 */}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
          <dt className="text-zinc-500">运行时间</dt>
          <dd className="mt-0.5 font-semibold text-zinc-200">{agent.durationMs ?? 0} ms</dd>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
          <dt className="text-zinc-500">候选方案</dt>
          <dd className="mt-0.5 font-semibold text-zinc-200">{agent.candidateCount ?? 0} 个</dd>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
          <dt className="text-zinc-500">工具调用</dt>
          <dd className="mt-0.5 font-semibold text-zinc-200">{agent.toolCallCount ?? 0} 次</dd>
        </div>
      </dl>

      {agent.recovery.used && (
        <p className="mt-3 rounded-md border border-amber-700/60 bg-amber-950/40 p-2 text-xs text-amber-300">
          ⚠ 本局为降级恢复结果（{agent.recovery.reason || '执行中断'}），不代表该 Agent 的常规策略水平。
        </p>
      )}

      {agent.status === 'failed' && (
        <p className="mt-3 rounded-md border border-red-700/60 bg-red-950/40 p-2 text-xs text-red-300">
          ✗ 执行失败（{agent.errorCode ?? 'INTERNAL'}），未产出提案。
        </p>
      )}

      {agent.phases.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-zinc-400">执行阶段（状态机轨迹）</h4>
          <ol className="mt-2 space-y-1">
            {agent.phases.map((phase, index) => (
              <li key={`${phase.name}-${index}`} className="flex items-baseline gap-2 text-xs text-zinc-400">
                <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {index + 1}
                </span>
                <span className="text-zinc-300">{phase.name}</span>
                <span className="text-zinc-500">{phase.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {agent.toolCalls.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-zinc-400">工具调用明细（{agent.toolCalls.length}）</h4>
          <ul className="mt-2 space-y-1">
            {agent.toolCalls.map((call, index) => (
              <li
                key={`${call.tool}-${index}`}
                className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-400"
              >
                <span className={call.hit ? 'text-emerald-300' : 'text-amber-300'}>
                  {call.hit ? '命中' : '未命中'}
                </span>{' '}
                <span className="text-zinc-300">{call.tool}</span>：{call.resultSummary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
