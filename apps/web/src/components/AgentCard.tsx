import type { AgentExecution } from '@mcarena/shared'
import { Badge } from './ui/Badge.js'
import { Card, CardBody } from './ui/Card.js'
import { AgentAvatar } from './AgentAvatar.js'
import { duration, yuan } from '../lib/format.js'

/** Agent 摘要卡（结果页使用） */
export function AgentCard({
  agent,
  winner = false,
}: {
  agent: AgentExecution
  winner?: boolean
}) {
  const side = agent.agentId
  const proposal = agent.proposal
  return (
    <Card className={winner ? 'ring-1 ring-gold/60' : ''}>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <AgentAvatar side={side} size={44} active={winner} />
          <div className="min-w-0">
            <h3 className={`truncate text-base font-bold ${side === 'alpha' ? 'text-alpha' : 'text-beta'}`}>
              Agent {side === 'alpha' ? 'α' : 'β'} · {agent.name}
            </h3>
            <p className="truncate text-[11px] text-ink-3">
              {agent.engine}@{agent.engineVersion}
            </p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1">
            {winner && <Badge tone="gold">🏆 本局胜出</Badge>}
            {agent.recovery.used && <Badge tone="warn">降级恢复方案</Badge>}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <Metric label="实测耗时" value={duration(agent.durationMs)} />
          <Metric label="候选方案" value={String(agent.candidateCount ?? 0)} />
          <Metric label="工具调用" value={String(agent.toolCallCount ?? 0)} />
        </dl>

        {proposal ? (
          <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
            <ul className="space-y-1 text-xs text-ink-2">
              {proposal.items.map((item) => (
                <li key={item.code} className="flex justify-between gap-2">
                  <span className="truncate">
                    {item.name} × {item.qty}
                  </span>
                  <span className="shrink-0 font-mono text-ink-3">{yuan(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-xs">
              <span className="text-ink-3">
                小计 {yuan(proposal.subtotalCents)}
                {proposal.deliveryFeeCents > 0 && `｜配送 ${yuan(proposal.deliveryFeeCents)}`}
                {proposal.discountCents > 0 && `｜优惠 −${yuan(proposal.discountCents)}`}
              </span>
              <span className="text-sm font-bold text-gold">应付 {yuan(proposal.totalCents)}</span>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            未产出提案（{agent.errorCode ?? '执行失败'}）
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 px-2 py-2 text-center">
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-xs font-bold text-ink">{value}</dd>
    </div>
  )
}
