import type { AgentVerification, JudgeResult } from '@mcarena/shared'
import { Badge } from './ui/Badge.js'
import { Card, CardBody, CardHeader } from './ui/Card.js'
import { AgentAvatar } from './AgentAvatar.js'
import { duration, percent, yuan } from '../lib/format.js'

const WINNER_LABELS: Record<JudgeResult['winner'], string> = {
  alpha: 'Agent α 胜出',
  beta: 'Agent β 胜出',
  tie: '双方战平',
}

const PRICE_STATUS_LABELS: Record<AgentVerification['priceStatus'], { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  verified: { label: '官方核价一致', tone: 'ok' },
  mismatch: { label: '与官方记录不一致 · 以官方值为准', tone: 'warn' },
  'not-verified': { label: 'NOT_VERIFIED · 无官方核价记录', tone: 'danger' },
}

export function JudgePanel({ judge }: { judge: JudgeResult }) {
  return (
    <Card>
      <CardHeader
        title="裁判裁决 · 独立智能裁判"
        subtitle="五维评分与验证报告全部来自裁判独立重算，不采信 Agent 自述成绩"
        actions={
          <Badge tone={judge.winner === 'tie' ? 'neutral' : 'brand'}>{WINNER_LABELS[judge.winner]}</Badge>
        }
      />
      <CardBody className="space-y-5">
        <p className="text-sm font-semibold leading-relaxed text-ink">{judge.headline}</p>

        {/* 五维得分（并列展示双方，避免「得分」列被误读为某一方或双方最高分） */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-3">
                <th className="pb-2">维度</th>
                <th className="pb-2 text-right">α</th>
                <th className="pb-2 text-right">β</th>
                <th className="pb-2 text-right">满分</th>
                <th className="pb-2">公式</th>
              </tr>
            </thead>
            <tbody>
              {judge.dimensions.map((dimension) => (
                <tr key={dimension.key} className="border-t border-line align-top">
                  <td className="py-2 font-medium text-ink-2">{dimension.label}</td>
                  <td className="py-2 text-right font-bold text-gold">
                    {(judge.agentScores[0].dimensions[dimension.key] ?? 0).toFixed(1)}
                  </td>
                  <td className="py-2 text-right font-bold text-gold">
                    {(judge.agentScores[1].dimensions[dimension.key] ?? 0).toFixed(1)}
                  </td>
                  <td className="py-2 text-right text-ink-3">{dimension.max}</td>
                  <td className="py-2 font-mono text-[11px] leading-relaxed text-ink-3">{dimension.formula}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-semibold">
                <td className="pt-2 text-ink">五维总分</td>
                <td className="pt-2 text-right text-gold">{judge.agentScores[0].total.toFixed(1)}</td>
                <td className="pt-2 text-right text-gold">{judge.agentScores[1].total.toFixed(1)}</td>
                <td className="pt-2 text-right text-ink-3">{judge.totalMax}</td>
                <td className="pt-2 text-[11px] text-ink-3">胜负由字典序判定，与五维总分不必然同向</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 逐 Agent 验证报告 */}
        <div>
          <h4 className="text-sm font-semibold text-ink-2">独立验证报告</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {judge.verification.map((entry) => (
              <VerificationCard
                key={entry.agentId}
                entry={entry}
                name={entry.agentId === 'alpha' ? 'Agent α · 极速猎手' : 'Agent β · 深度优化师'}
              />
            ))}
          </div>
        </div>

        {judge.allViolations.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-ink-2">
              违规明细（{judge.allViolations.length} 条）
            </h4>
            <ul className="mt-2 space-y-1.5">
              {judge.allViolations.map((violation, index) => (
                <li
                  key={`${violation.agentId}-${violation.code}-${index}`}
                  className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                    violation.severity === 'fatal'
                      ? 'border-danger/40 bg-danger/10 text-danger'
                      : 'border-warn/40 bg-warn/10 text-warn'
                  }`}
                >
                  <span className="font-semibold">
                    [{violation.severity === 'fatal' ? '致命违规' : '警告'}]{' '}
                    {violation.agentId === 'alpha' ? 'α' : 'β'} · {violation.code}
                  </span>
                  ：{violation.message}
                  {violation.evidenceRef && (
                    <span className="ml-1 font-mono text-ink-3">（证据：{violation.evidenceRef}）</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-1 text-xs leading-relaxed text-ink-3">
          {judge.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

function VerificationCard({ entry, name }: { entry: AgentVerification; name: string }) {
  const priceStatus = PRICE_STATUS_LABELS[entry.priceStatus]
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AgentAvatar side={entry.agentId} size={28} />
          <span className="text-sm font-semibold text-ink">{name}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={entry.eligible ? 'ok' : 'danger'}>
            {entry.eligible ? '通过硬性校验' : '失去获胜资格'}
          </Badge>
          <Badge tone={priceStatus.tone}>{priceStatus.label}</Badge>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <MiniStat label="官方核算成本" value={yuan(entry.officialCostCents)} highlight />
        <MiniStat label="Agent 自述成本" value={yuan(entry.claimedCostCents)} />
        <MiniStat label="裁判重算成本" value={yuan(entry.recomputedCostCents)} />
        <MiniStat label="裁决采用成本" value={yuan(entry.effectiveCostCents)} highlight />
        <MiniStat label="目标达成率" value={percent(entry.targetAchievement)} />
        <MiniStat label="实测响应" value={duration(entry.responseMs)} />
        <MiniStat label="校验通过" value={`${entry.checks.filter((check) => check.passed).length}/${entry.checks.length}`} />
        <MiniStat
          label="计入优惠的券"
          value={entry.validCouponCodes.length > 0 ? entry.validCouponCodes.join('、') : '无'}
        />
      </dl>

      {entry.violations.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {entry.violations.map((violation, index) => (
            <li
              key={`${violation.code}-${index}`}
              className={violation.severity === 'fatal' ? 'text-danger' : 'text-warn'}
            >
              [{violation.severity === 'fatal' ? '致命违规' : '警告'}] {violation.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MiniStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface/60 px-2.5 py-2">
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className={`mt-0.5 truncate text-xs font-bold ${highlight ? 'text-gold' : 'text-ink'}`} title={value}>
        {value}
      </dd>
    </div>
  )
}
