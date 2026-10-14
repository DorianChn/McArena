import { Fragment } from 'react'
import { useApp } from '../state/match.js'
import { Badge } from '../components/ui/Badge.js'
import { Button } from '../components/ui/Button.js'
import { Card, CardBody, CardHeader, SectionTitle } from '../components/ui/Card.js'
import { ErrorState, Loading } from '../components/ui/feedback.js'
import { AgentAvatar } from '../components/AgentAvatar.js'
import { shortHash } from '../lib/format.js'
import type { HealthResponse, SnapshotInfoResponse } from '@mcarena/shared'

const AGENTS = [
  {
    side: 'alpha' as const,
    name: '极速猎手',
    engine: 'speed-greedy@1.0.0',
    role: '速度型 · 单遍贪心',
    description:
      '单遍贪心构造：遍历在售餐品一次，按「硬约束满足 + 应付总价最小」逐项决策，只评估 1 个候选方案。计算成本最低，追求即时可用的便宜解。',
    facts: [
      ['候选方案', '1 个'],
      ['工具调用', '1 次'],
      ['策略原理', '贪心单遍'],
    ],
  },
  {
    side: 'beta' as const,
    name: '深度优化师',
    engine: 'optimizer-search@1.0.0',
    role: '质量型 · 束搜索',
    description:
      '束搜索枚举购物车组合（宽度 8，最多 3 轮），逐轮幸存方案全部进入候选池，修复硬约束后前 6 名逐一真实计价，按「满足率 → 营养偏差 → 价格」择优。',
    facts: [
      ['候选方案', '46–288 个'],
      ['工具调用', '≤ 6 次'],
      ['策略原理', '束搜索 + 组合比较'],
    ],
  },
]

const STEPS = [
  {
    icon: '🎯',
    title: '① 选择挑战',
    text: '一键随机生成任务卡，或在挑战设置中自定义预算、人数、营养目标、优惠偏好与必选约束。相同种子 + 相同约束 = 完全相同的挑战。',
  },
  {
    icon: '⚔️',
    title: '② 双 Agent 对决',
    text: '两名算法实质不同的 Agent 读取同一份数据快照、面对同一张任务卡，独立做出点餐决策，全过程记录阶段、证据与工具调用。',
  },
  {
    icon: '🔍',
    title: '③ 独立裁判验证',
    text: '裁判不信任 Agent 自述成绩：餐品存在性、单价、优惠、营养、应付价格全部独立重算；优先通过官方 calculate-price 核价，无法核价明确标注 NOT_VERIFIED。',
  },
  {
    icon: '🏆',
    title: '④ 成绩与分享',
    text: '五维评分 + 胜负判定 + 可解释报告全部透明展示；生成成绩卡导出 PNG、复制分享文案或一键复现同一局。',
  },
]

export function HomePage({
  navigate,
  onQuickStart,
  quickStarting,
}: {
  navigate: (route: 'home' | 'setup' | 'arena' | 'result') => void
  onQuickStart: () => void
  quickStarting: boolean
}) {
  const { health, snapshot, snapshotError, reload } = useApp()

  return (
    <div className="space-y-10">
      {/* ---------- Hero ---------- */}
      <section className="mca-anim-in relative overflow-hidden rounded-3xl border border-line bg-surface/70 px-6 py-10 text-center sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--brand), transparent 65%)' }}
        />
        <Badge tone="brand" className="relative">
          2026 麦当劳程序员创意开发大赛 · 参赛作品
        </Badge>
        <h1 className="relative mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
          让两个 AI 点餐策略
          <br className="sm:hidden" />
          <span className="text-brand"> 同台竞技</span>
          <span className="text-gold">，让裁判只认规则</span>
        </h1>
        <p className="relative mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
          McArena 基于麦当劳中国官方 MCP Server 构建：两名算法实质不同的 Agent
          在真实菜单数据上竞速与择优，一位独立规则裁判透明打分——
          每一局都可解释、可复现、可分享。
        </p>
        <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onQuickStart} loading={quickStarting}>
            🚀 一键开始挑战
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate('setup')}>
            🎛️ 自定义挑战
          </Button>
        </div>
        <p className="relative mt-3 text-xs text-ink-3">无需账户、无需 Token，打开即玩</p>
      </section>

      {/* ---------- 对决双方 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="算法实质不同 · 同一数据集同一任务卡">对决双方</SectionTitle>
        {/* 注意：DOM 顺序必须是 α → VS → β，才能与三轨模板 [1fr auto 1fr] 对齐；
            若把 VS 放在最后，中间的 auto 轨道会套住 β 卡片并被其内容撑到最大。
            minmax(0,1fr) 允许轨道收缩到内容宽度以下，避免长英文标识（optimizer-search@1.0.0）挤压对侧。 */}
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {AGENTS.map((agent, index) => (
            <Fragment key={agent.side}>
              {index === 1 && (
                <div className="flex items-center justify-center lg:px-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand bg-brand-soft text-lg font-black text-brand">
                    VS
                  </span>
                </div>
              )}
              <Card className="mca-anim-in flex flex-col">
                <CardBody className="flex flex-1 flex-col">
                  <div className="flex items-center gap-3">
                    <AgentAvatar side={agent.side} size={52} />
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold">
                        Agent {agent.side === 'alpha' ? 'α' : 'β'} · {agent.name}
                      </h3>
                      <p className="break-words text-xs text-ink-3">
                        {agent.engine}｜{agent.role}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-2">{agent.description}</p>
                  <dl className="mt-4 grid grid-cols-3 gap-2">
                    {agent.facts.map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-line bg-surface-2/60 px-2 py-2 text-center">
                        <dt className="text-[11px] text-ink-3">{label}</dt>
                        <dd className="mt-0.5 text-sm font-bold text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardBody>
              </Card>
            </Fragment>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          注：两名 Agent 均为<strong className="text-ink-2">算法型 Agent</strong>（未调用大模型，已明确标注），
          任何固定输出都不会被冒充为 AI 推理。
        </p>
      </section>

      {/* ---------- 玩法说明 ---------- */}
      <section className="space-y-4">
        <SectionTitle>玩法说明</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <Card key={step.title} className="mca-anim-in">
              <CardBody>
                <p className="text-2xl" aria-hidden="true">
                  {step.icon}
                </p>
                <h3 className="mt-2 text-sm font-bold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{step.text}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- 数据状态 ---------- */}
      <section className="space-y-4">
        <SectionTitle
          hint={
            health
              ? `API v${health.version}｜已运行 ${health.uptimeSec}s`
              : undefined
          }
        >
          当前数据状态
        </SectionTitle>
        <DataStatusCard
          health={health}
          snapshot={snapshot}
          snapshotError={snapshotError}
          onRetry={() => void reload()}
        />
      </section>
    </div>
  )
}

export function DataStatusCard({
  health,
  snapshot,
  snapshotError,
  onRetry,
}: {
  health: HealthResponse | null
  snapshot: SnapshotInfoResponse | null
  snapshotError: { body: { message: string } } | null
  onRetry?: () => void
}) {
  if (!health) {
    return (
      <Card>
        <CardBody>
          <Loading label="正在读取服务状态…" />
        </CardBody>
      </Card>
    )
  }

  const modeLabel =
    health.dataMode === 'live' ? '实时（官方 MCP）' : health.dataMode === 'replay' ? '快照回放' : '模拟数据'
  const originTone = health.dataOrigin === 'mock' ? 'warn' : health.dataOrigin === 'official-live' ? 'ok' : 'info'

  return (
    <Card>
      <CardHeader
        title="MCP 数据链路"
        subtitle="公开演示模式不要求任何账户或 Token"
        actions={
          <Badge tone={originTone}>
            {health.dataOrigin === 'mock' ? '模拟数据（已标注）' : health.dataOrigin === 'official-live' ? '官方实时' : '官方快照'}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="数据模式" value={modeLabel} />
          <Stat label="官方 Token" value={health.mcp.configured ? '已配置' : '未配置（演示无需）'} />
          <Stat label="MCP 端点" value={health.mcp.url} mono />
          <Stat label="写操作" value={health.mcp.allowWrite ? '允许（异常）' : '禁止'} />
        </dl>
        {snapshot ? (
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-xs leading-relaxed text-ink-2">
            <p>
              数据源：<span className="font-mono text-ink">{snapshot.sourceRef}</span>｜餐品 {snapshot.menuItemCount} 项｜
              优惠券 {snapshot.couponCount} 张｜采集于 {snapshot.capturedAt}
            </p>
            <p className="mt-1">
              sha256：<span className="font-mono text-ink">{shortHash(snapshot.sha256)}</span>｜ 调用工具：
              {snapshot.toolsInvoked.join('、') || '—'}
            </p>
            <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-warn">{snapshot.notice}</p>
          </div>
        ) : snapshotError ? (
          <ErrorState
            title="数据集信息读取失败"
            message={snapshotError.body.message}
            onRetry={onRetry}
            retryLabel="重新读取"
          />
        ) : (
          <Loading label="正在读取数据集元信息…" />
        )}
      </CardBody>
    </Card>
  )
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className={`mt-1 truncate text-sm font-semibold text-ink ${mono ? 'font-mono text-xs' : ''}`} title={value}>
        {value}
      </dd>
    </div>
  )
}
