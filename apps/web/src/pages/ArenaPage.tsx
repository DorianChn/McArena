import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/match.js'
import { AgentAvatar } from '../components/AgentAvatar.js'
import { Badge, StatusDot } from '../components/ui/Badge.js'
import { Button } from '../components/ui/Button.js'
import { Card, CardBody, CardHeader } from '../components/ui/Card.js'
import { EmptyState, ErrorState, Loading, Progress } from '../components/ui/feedback.js'
import { duration, shortHash, sceneLabel, yuan } from '../lib/format.js'
import type { AgentExecution } from '@mcarena/shared'

/** 单个 Agent 的回放步骤 */
interface PlayStep {
  kind: 'phase' | 'evidence' | 'final'
  title: string
  detail?: string
  tone?: 'ok' | 'warn' | 'info'
}

function buildSteps(agent: AgentExecution): PlayStep[] {
  const steps: PlayStep[] = []
  for (const phase of agent.phases) {
    steps.push({ kind: 'phase', title: phase.message })
  }
  for (const evidence of agent.evidence) {
    steps.push({
      kind: 'evidence',
      title: evidence.message,
      detail: evidence.resultSummary ?? undefined,
      tone: evidence.kind === 'constraint-check' ? 'ok' : 'info',
    })
  }
  steps.push({ kind: 'final', title: '提案就绪', tone: 'ok' })
  return steps
}

type Speed = 1 | 2 | 4

const BASE_STEP_MS = 420

export function ArenaPage({ navigate }: { navigate: (route: 'home' | 'setup' | 'arena' | 'result') => void }) {
  const { match, startMatch } = useApp()
  const { phase, result, error, wallMs, lastInput } = match

  const stepsAlpha = useMemo(() => (result ? buildSteps(result.agents[0]) : []), [result])
  const stepsBeta = useMemo(() => (result ? buildSteps(result.agents[1]) : []), [result])

  const [revealedAlpha, setRevealedAlpha] = useState(0)
  const [revealedBeta, setRevealedBeta] = useState(0)
  const [judgeRevealed, setJudgeRevealed] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<Speed>(1)

  const alphaDone = revealedAlpha >= stepsAlpha.length && stepsAlpha.length > 0
  const betaDone = revealedBeta >= stepsBeta.length && stepsBeta.length > 0
  const agentsDone = alphaDone && betaDone

  const restart = useCallback(() => {
    setRevealedAlpha(0)
    setRevealedBeta(0)
    setJudgeRevealed(false)
    setPlaying(true)
  }, [])

  const skip = useCallback(() => {
    setRevealedAlpha(stepsAlpha.length)
    setRevealedBeta(stepsBeta.length)
    setJudgeRevealed(true)
    setPlaying(false)
  }, [stepsAlpha.length, stepsBeta.length])

  // ---- 回放引擎：交替推进两侧步骤（事件内容为服务端真实记录） ----
  useEffect(() => {
    if (!result || !playing) return
    if (agentsDone) return
    const interval = window.setInterval(() => {
      const alphaRemaining = revealedAlpha < stepsAlpha.length
      const betaRemaining = revealedBeta < stepsBeta.length
      if (!alphaRemaining && !betaRemaining) return
      if (alphaRemaining && (!betaRemaining || revealedAlpha <= revealedBeta)) {
        setRevealedAlpha((value) => value + 1)
      } else if (betaRemaining) {
        setRevealedBeta((value) => value + 1)
      }
    }, BASE_STEP_MS / speed)
    return () => window.clearInterval(interval)
  }, [playing, speed, revealedAlpha, revealedBeta, stepsAlpha.length, stepsBeta.length, agentsDone, result])

  // ---- 双方完成 → 进入裁判验证揭示 ----
  useEffect(() => {
    if (!agentsDone || judgeRevealed) return
    const timeout = window.setTimeout(() => {
      setJudgeRevealed(true)
      setPlaying(false)
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [agentsDone, judgeRevealed])

  // ---- 裁判揭示后自动前往结果页 ----
  useEffect(() => {
    if (!judgeRevealed) return
    const timeout = window.setTimeout(() => navigate('result'), 2400)
    return () => window.clearTimeout(timeout)
  }, [judgeRevealed, navigate])

  // ---- 状态：启动中 ----
  if (phase === 'starting') {
    return (
      <Card>
        <CardBody className="py-16">
          <div className="mx-auto max-w-md text-center">
            <div
              className="mca-spin mx-auto h-10 w-10 rounded-full border-[3px] border-gold border-t-transparent"
              aria-hidden="true"
            />
            <p className="mt-4 text-sm font-semibold text-ink">正在生成挑战并发起对决…</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
              双 Agent 正在读取同一份数据快照并独立决策，随后由独立裁判核验。通常一两秒内完成。
            </p>
          </div>
        </CardBody>
      </Card>
    )
  }

  // ---- 状态：失败 ----
  if (phase === 'error' && error) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="对决未能开始"
          message={`${error.body.message}（错误码 ${error.body.code}）`}
          onRetry={() => {
            void startMatch(lastInput ?? {})
              .then((next) => {
                if (next) {
                  restart()
                }
              })
          }}
          retryLabel="重新发起"
        />
        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate('setup')}>
            去调整挑战设置
          </Button>
        </div>
      </div>
    )
  }

  // ---- 状态：空 ----
  if (!result) {
    return (
      <EmptyState
        icon="🎮"
        title="还没有进行中的对决"
        message="回到首页一键开始，或先自定义一张挑战任务卡。"
        action={
          <div className="flex gap-3">
            <Button onClick={() => navigate('home')}>回到首页</Button>
            <Button variant="outline" onClick={() => navigate('setup')}>
              自定义挑战
            </Button>
          </div>
        }
      />
    )
  }

  const agentAlpha = result.agents[0]
  const agentBeta = result.agents[1]

  return (
    <div className="space-y-5">
      {/* 顶部：任务卡与已验证数据 */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">{result.challenge.title}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-3">{result.challenge.brief}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">种子 {result.seed}</Badge>
              <Badge tone="neutral">{sceneLabel(result.challenge.constraints.scene)}</Badge>
              {result.challenge.constraints.budgetCents !== undefined && (
                <Badge tone="gold">预算 {yuan(result.challenge.constraints.budgetCents)}</Badge>
              )}
              <Badge tone={result.dataOrigin === 'mock' ? 'warn' : 'ok'}>
                {result.dataOrigin === 'mock' ? '模拟数据' : '官方数据'}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface-2/50 px-4 py-2.5 text-[11px] text-ink-3">
            <span className="font-semibold text-ink-2">已验证的数据</span>
            <span className="font-mono">{result.dataset.sourceRef}</span>
            <span>sha256 {shortHash(result.dataset.sha256)}</span>
            <span>餐品来自官方菜单工具，价格为官方 calculate-price 口径</span>
          </div>
        </CardBody>
      </Card>

      {/* 回放控制条 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/60 px-4 py-2.5">
        <span className="text-xs text-ink-3">
          {playing ? '决策回放中（事件为服务端真实记录）' : agentsDone ? '回放完成' : '回放已暂停'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="回放速度">
            {([1, 2, 4] as Speed[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                aria-pressed={speed === value}
                className={[
                  'h-8 rounded-lg px-2.5 text-xs font-medium transition',
                  speed === value ? 'bg-gold-soft text-gold' : 'text-ink-3 hover:text-ink',
                ].join(' ')}
              >
                {value}x
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={restart}>
            重新播放
          </Button>
          <Button size="sm" variant="outline" onClick={skip} disabled={judgeRevealed}>
            跳过动画
          </Button>
        </div>
      </div>

      {/* 对决双栏 */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AgentColumn
          side="alpha"
          agent={agentAlpha}
          steps={stepsAlpha}
          revealed={revealedAlpha}
          active={playing && !alphaDone}
          done={alphaDone}
        />
        <AgentColumn
          side="beta"
          agent={agentBeta}
          steps={stepsBeta}
          revealed={revealedBeta}
          active={playing && !betaDone}
          done={betaDone}
        />
      </div>

      {/* 裁判验证阶段 */}
      <Card className={judgeRevealed ? 'mca-anim-in' : 'opacity-60'}>
        <CardHeader
          title="裁判独立验证"
          subtitle="不信任 Agent 自述成绩：逐项重算餐品、价格、优惠与营养"
          actions={
            judgeRevealed ? (
              <Button size="sm" onClick={() => navigate('result')}>
                查看完整结果 →
              </Button>
            ) : (
              <Loading label={agentsDone ? '核验中…' : '等待双方完成'} />
            )
          }
        />
        {judgeRevealed && (
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {result.judge.verification.map((entry) => (
                <div
                  key={entry.agentId}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface-2/50 px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <AgentAvatar side={entry.agentId} size={28} />
                    <span className="font-medium text-ink">
                      {entry.agentId === 'alpha' ? agentAlpha.name : agentBeta.name}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone={entry.eligible ? 'ok' : 'danger'}>
                      {entry.eligible ? '通过硬性校验' : '失去获胜资格'}
                    </Badge>
                    <Badge tone={entry.priceStatus === 'verified' ? 'ok' : entry.priceStatus === 'mismatch' ? 'warn' : 'danger'}>
                      {entry.priceStatus === 'verified'
                        ? '官方核价一致'
                        : entry.priceStatus === 'mismatch'
                          ? '以官方价为准'
                          : 'NOT_VERIFIED'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-ink">{result.judge.headline}</p>
          </CardBody>
        )}
      </Card>

      <p className="text-center text-[11px] text-ink-3">
        实际墙上耗时 {duration(wallMs)}｜各 Agent 实测耗时 α {duration(agentAlpha.durationMs)} / β {duration(agentBeta.durationMs)}
        ｜回放节奏仅为演示编排，步骤内容、顺序与指标均为真实运行结果
      </p>
    </div>
  )
}

/** 单个 Agent 的对决栏 */
function AgentColumn({
  side,
  agent,
  steps,
  revealed,
  active,
  done,
}: {
  side: 'alpha' | 'beta'
  agent: AgentExecution
  steps: PlayStep[]
  revealed: number
  active: boolean
  done: boolean
}) {
  const accent = side === 'alpha' ? 'text-alpha' : 'text-beta'
  const status = done
    ? agent.recovery.used
      ? { label: '降级恢复完成', tone: 'warn' as const, live: false }
      : { label: '决策完成', tone: 'ok' as const, live: false }
    : active
      ? { label: '决策中', tone: 'gold' as const, live: true }
      : { label: '等待中', tone: 'neutral' as const, live: false }

  const proposal = agent.proposal

  return (
    <Card className={active ? 'ring-1 ring-gold/40' : ''}>
      <div className={`border-b border-line px-5 py-4 ${active ? 'bg-gold-soft/30' : ''}`}>
        <div className="flex items-center gap-3">
          <AgentAvatar side={side} size={44} active={active} />
          <div className="min-w-0">
            <h3 className={`truncate text-base font-bold ${accent}`}>
              Agent {side === 'alpha' ? 'α' : 'β'} · {agent.name}
            </h3>
            <p className="truncate text-[11px] text-ink-3">
              {agent.engine}@{agent.engineVersion}｜{agent.role}
            </p>
          </div>
          <div className="ml-auto">
            <Badge tone={status.tone}>
              <StatusDot tone={status.tone} live={status.live} />
              {status.label}
            </Badge>
          </div>
        </div>
        <div className="mt-3">
          <Progress value={steps.length === 0 ? 0 : revealed / steps.length} label={`${agent.name} 决策进度`} />
        </div>
      </div>

      <CardBody className="space-y-4">
        {/* 步骤流 */}
        <ol className="space-y-2" aria-label={`${agent.name} 决策过程`}>
          {steps.slice(0, revealed).map((step, index) => (
            <li
              key={`${step.kind}-${index}`}
              className="mca-anim-in flex gap-2.5 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2 text-xs leading-relaxed"
            >
              <span
                aria-hidden="true"
                className={[
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  step.tone === 'ok' ? 'bg-ok' : step.tone === 'warn' ? 'bg-warn' : 'bg-ink-3',
                ].join(' ')}
              />
              <span className="text-ink-2">
                {step.title}
                {step.detail && <span className="mt-0.5 block text-ink-3">{step.detail}</span>}
              </span>
            </li>
          ))}
          {revealed === 0 && (
            <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-3">
              等待决策开始…
            </li>
          )}
        </ol>

        {/* 完成后的指标与提案 */}
        {done && (
          <div className="mca-anim-in space-y-3">
            <dl className="grid grid-cols-3 gap-2">
              <Metric label="实测耗时" value={duration(agent.durationMs)} />
              <Metric label="候选方案" value={String(agent.candidateCount ?? 0)} />
              <Metric label="工具调用" value={String(agent.toolCallCount ?? 0)} />
            </dl>
            {proposal ? (
              <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
                <p className="text-xs font-semibold text-ink-2">当前有效方案</p>
                <ul className="mt-2 space-y-1 text-xs text-ink-2">
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
                    {proposal.couponCodes.length > 0 && `｜用券 ${proposal.couponCodes.join('、')}`}
                  </span>
                  <span className="text-sm font-bold text-gold">应付 {yuan(proposal.totalCents)}</span>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                该 Agent 未产出提案（{agent.errorCode ?? '未知原因'}）
              </p>
            )}
          </div>
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
