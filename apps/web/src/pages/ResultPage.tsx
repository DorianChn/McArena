import { useApp } from '../state/match.js'
import { AgentCard } from '../components/AgentCard.js'
import { ChallengeCard } from '../components/ChallengeCard.js'
import { EvidenceList } from '../components/EvidenceList.js'
import { JudgePanel } from '../components/JudgePanel.js'
import { ShareCard } from '../components/ShareCard.js'
import { Badge } from '../components/ui/Badge.js'
import { Button } from '../components/ui/Button.js'
import { Card, CardBody, SectionTitle } from '../components/ui/Card.js'
import { Radar } from '../components/ui/Radar.js'
import { EmptyState } from '../components/ui/feedback.js'
import { nutritionRows } from '../lib/nutrition.js'
import { duration, shortHash, yuan } from '../lib/format.js'
import type { JudgeResult, MatchResult } from '@mcarena/shared'

const DIM_LABELS = ['需求满足', '预算控制', '营养均衡', '优惠利用', '可解释性']
const DIM_MAX = [30, 25, 20, 15, 10]
const DIM_KEYS: Array<keyof JudgeResult['agentScores'][number]['dimensions']> = [
  'requirement-fit',
  'budget-control',
  'nutrition-balance',
  'coupon-usage',
  'explainability',
]

export function ResultPage({ navigate }: { navigate: (route: 'home' | 'setup' | 'arena' | 'result') => void }) {
  const { match, startMatch, resetMatch } = useApp()
  const result = match.result

  if (!result) {
    return (
      <EmptyState
        icon="📊"
        title="还没有比赛结果"
        message="先发起一场对决，结果页会展示胜者、得分、价格与营养对比、决策解释与分享成绩卡。"
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

  const alpha = result.agents[0]
  const beta = result.agents[1]
  const rows = nutritionRows(result)
  const lastInput = match.lastInput

  const retrySame = async (): Promise<void> => {
    const next = await startMatch(lastInput ?? { seed: result.seed })
    if (next) navigate('arena')
  }

  return (
    <div className="space-y-8">
      {/* ---------- 胜者横幅 ---------- */}
      <section
        className="mca-anim-in overflow-hidden rounded-3xl border border-line bg-surface/80 px-6 py-8 text-center"
        aria-live="polite"
      >
        <p className="text-xs tracking-widest text-ink-3">MATCH RESULT</p>
        <p className="mt-2 text-3xl font-black sm:text-4xl">
          {result.judge.winner === 'tie' ? (
            '双方战平'
          ) : (
            <>
              <span className="text-brand">🏆 {result.judge.winner === 'alpha' ? alpha.name : beta.name}</span> 胜出
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-ink-2">{result.judge.headline}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {/* 注意：胜负由字典序（资格→已验证成本→目标达成→速度）决定，与五维总分不必然同向，
              因此这里必须并列展示双方得分，不能用 judge.totalScore（那是双方较高分，可能属于败方）。 */}
          <Badge tone="gold">
            五维总分 α {result.judge.agentScores[0].total.toFixed(1)} : β {result.judge.agentScores[1].total.toFixed(1)} /{' '}
            {result.judge.totalMax}
          </Badge>
          <Badge tone="neutral">裁判实验 {result.judge.experimentId}</Badge>
          <Badge tone="neutral">规则 {result.judge.rulesVersion}</Badge>
          <Badge tone={result.judge.costBasis === 'official-verified' ? 'ok' : 'warn'}>
            {result.judge.costBasis === 'official-verified' ? '官方核验成本' : '裁判重算成本（NOT_VERIFIED）'}
          </Badge>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => void retrySame()}>🔁 重新挑战（同约束）</Button>
          <Button variant="outline" onClick={() => navigate('setup')}>
            🎛️ 换一张挑战卡
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              resetMatch()
              navigate('home')
            }}
          >
            回到首页
          </Button>
        </div>
      </section>

      <ChallengeCard challenge={result.challenge} seed={result.seed} />

      {/* ---------- 评分与雷达 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="五维满分 100｜权重：需求30 预算25 营养20 优惠15 可解释10">双方得分</SectionTitle>
        <Card>
          <CardBody className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-center">
            <div className="mx-auto">
              <Radar
                dimensions={DIM_LABELS}
                maxes={DIM_MAX}
                size={280}
                series={[
                  {
                    name: alpha.name,
                    values: DIM_KEYS.map((key) => result.judge.agentScores[0].dimensions[key] ?? 0),
                    color: 'var(--alpha-accent)',
                  },
                  {
                    name: beta.name,
                    values: DIM_KEYS.map((key) => result.judge.agentScores[1].dimensions[key] ?? 0),
                    color: 'var(--beta-accent)',
                  },
                ]}
              />
              <div className="mt-2 flex justify-center gap-4 text-xs text-ink-3">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-full" style={{ background: 'var(--alpha-accent)' }} />α {alpha.name}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-4 rounded-full" style={{ background: 'var(--beta-accent)' }} />β {beta.name}
                </span>
              </div>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-3">
                雷达图各轴按该维度满分归一化；两条曲线分别是 α / β 的裁判独立重算得分（不取较高值）
              </p>
            </div>
            <DimensionBars result={result} />
          </CardBody>
        </Card>
      </section>

      {/* ---------- 双方方案 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="实测耗时 / 候选数 / 工具调用均为真实测量值">方案对比</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <AgentCard agent={alpha} winner={result.judge.winner === 'alpha'} />
          <AgentCard agent={beta} winner={result.judge.winner === 'beta'} />
        </div>
      </section>

      {/* ---------- 价格对比 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="裁决采用：官方 calculate-price ＞ 裁判重算 ＞ Agent 自述">价格对比</SectionTitle>
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="pb-2">口径</th>
                  <th className="pb-2 text-right">Agent α</th>
                  <th className="pb-2 text-right">Agent β</th>
                  <th className="pb-2">说明</th>
                </tr>
              </thead>
              <tbody>
                <PriceRow
                  label="Agent 自述应付"
                  alpha={alpha.proposal?.totalCents ?? null}
                  beta={beta.proposal?.totalCents ?? null}
                  hint="Agent 自己报告的数字（裁判不采信）"
                />
                <PriceRow
                  label="裁判重算应付"
                  alpha={result.judge.verification[0]!.recomputedCostCents}
                  beta={result.judge.verification[1]!.recomputedCostCents}
                  hint="按数据集单价与券规则独立重算"
                />
                <PriceRow
                  label="官方 calculate-price"
                  alpha={result.judge.verification[0]!.officialCostCents}
                  beta={result.judge.verification[1]!.officialCostCents}
                  hint="命中数据集内官方计价记录；无记录为 NOT_VERIFIED"
                />
                <PriceRow
                  label="裁决采用成本"
                  alpha={result.judge.verification[0]!.effectiveCostCents}
                  beta={result.judge.verification[1]!.effectiveCostCents}
                  hint="参与胜负计算的成本"
                  highlight
                />
              </tbody>
            </table>
          </CardBody>
        </Card>
      </section>

      {/* ---------- 营养对比 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint={result.challenge.constraints.nutritionTarget ? '按任务卡营养目标对比' : '本局无营养目标，仅展示构成'}>
          营养对比
        </SectionTitle>
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-3">
                  <th className="pb-2">指标</th>
                  <th className="pb-2 text-right">Agent α</th>
                  <th className="pb-2 text-right">Agent β</th>
                  <th className="pb-2">目标</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <td className="py-2 font-medium text-ink-2">{row.label}</td>
                    <td className={`py-2 text-right font-mono ${row.better === 'alpha' ? 'text-gold' : 'text-ink-2'}`}>
                      {row.alpha}
                    </td>
                    <td className={`py-2 text-right font-mono ${row.better === 'beta' ? 'text-gold' : 'text-ink-2'}`}>
                      {row.beta}
                    </td>
                    <td className="py-2 text-xs text-ink-3">{row.hint ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </section>

      {/* ---------- 裁判报告 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="规则 judge-rules/1.1.0">裁判记分与验证报告</SectionTitle>
        <JudgePanel judge={result.judge} />
      </section>

      {/* ---------- 决策解释 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="展开查看完整决策链路">决策解释</SectionTitle>
        <div className="space-y-2">
          <EvidenceList title={`Agent α「${alpha.name}」决策链路`} items={alpha.evidence} />
          <EvidenceList title={`Agent β「${beta.name}」决策链路`} items={beta.evidence} />
        </div>
        <p className="text-xs text-ink-3">
          引擎版本：编排 {result.engineVersions.orchestrator}｜α {result.engineVersions.agentAlpha}｜β{' '}
          {result.engineVersions.agentBeta}｜裁判 {result.engineVersions.judge}
          ｜数据集 sha256 {shortHash(result.dataset.sha256)}｜实测墙上耗时 {duration(match.wallMs)}
        </p>
      </section>

      {/* ---------- 分享 ---------- */}
      <section className="space-y-4">
        <SectionTitle hint="所有内容均来自本局真实结果">分享成绩</SectionTitle>
        <ShareCard result={result} />
      </section>

      {/* ---------- MCP 证据状态 ---------- */}
      <section className="space-y-4">
        <SectionTitle>数据来源与证据状态</SectionTitle>
        <Card>
          <CardBody className="space-y-3 text-xs leading-relaxed text-ink-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone={result.dataOrigin === 'mock' ? 'warn' : 'ok'}>
                {result.dataOrigin === 'mock' ? '模拟数据（非麦当劳官方数据）' : '官方数据'}
              </Badge>
              <Badge tone="neutral">来源 {result.dataset.sourceRef}</Badge>
              <Badge tone="neutral">sha256 {shortHash(result.dataset.sha256)}</Badge>
              <Badge tone="neutral">采集于 {result.dataset.capturedAt}</Badge>
              <Badge tone={result.judge.verification.every((entry) => entry.priceStatus === 'verified') ? 'ok' : 'warn'}>
                {result.judge.verification.every((entry) => entry.priceStatus === 'verified')
                  ? '双方均通过官方核价'
                  : '存在 NOT_VERIFIED 方案（已明确标注，不视为通过）'}
              </Badge>
            </div>
            {result.warnings.map((warning) => (
              <p key={warning} className="rounded-lg bg-warn/10 px-3 py-2 text-warn">
                {warning}
              </p>
            ))}
            <p>
              规则：餐品、价格与优惠券数据来自官方菜单 / 优惠券工具的输出或其快照；价格一律以官方 calculate-price
              为口径，无官方记录时标注 NOT_VERIFIED；裁判对每一方独立重算后才进入比较。
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  )
}

/** 五维得分条：α/β 各自原始得分（来自裁判 agentScores，前端不二次计算） */
function DimensionBars({ result }: { result: MatchResult }) {
  const alphaDim = result.judge.agentScores[0].dimensions
  const betaDim = result.judge.agentScores[1].dimensions
  const alphaName = result.agents[0]?.name ?? 'α'
  const betaName = result.agents[1]?.name ?? 'β'
  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full" style={{ background: 'var(--alpha-accent)' }} />α {alphaName}（
          {result.judge.agentScores[0].total.toFixed(1)}）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full" style={{ background: 'var(--beta-accent)' }} />β {betaName}（
          {result.judge.agentScores[1].total.toFixed(1)}）
        </span>
      </div>
      {result.judge.dimensions.map((dimension, index) => {
        const key = DIM_KEYS[index]!
        const alphaScore = alphaDim[key] ?? 0
        const betaScore = betaDim[key] ?? 0
        return (
          <div key={dimension.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-ink-2">
                {dimension.label}
                <span className="ml-2 text-ink-3">（满分 {dimension.max}）</span>
              </span>
              <span className="font-mono text-ink-3">
                α {alphaScore.toFixed(1)}｜β {betaScore.toFixed(1)}
              </span>
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" title={`α ${alphaScore.toFixed(1)}`}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (alphaScore / dimension.max) * 100)}%`,
                    background: 'var(--alpha-accent)',
                  }}
                />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" title={`β ${betaScore.toFixed(1)}`}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (betaScore / dimension.max) * 100)}%`,
                    background: 'var(--beta-accent)',
                  }}
                />
              </div>
            </div>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-3">{dimension.formula}</p>
          </div>
        )
      })}
    </div>
  )
}

function PriceRow({
  label,
  alpha,
  beta,
  hint,
  highlight = false,
}: {
  label: string
  alpha: number | null
  beta: number | null
  hint: string
  highlight?: boolean
}) {
  const better =
    alpha === null || beta === null ? null : alpha === beta ? 'tie' : alpha < beta ? 'alpha' : 'beta'
  return (
    <tr className={highlight ? 'bg-gold-soft/20' : ''}>
      <td className={`py-2 font-medium ${highlight ? 'text-gold' : 'text-ink-2'}`}>{label}</td>
      <td className={`py-2 text-right font-mono ${better === 'alpha' ? 'font-bold text-gold' : 'text-ink-2'}`}>
        {yuan(alpha)}
      </td>
      <td className={`py-2 text-right font-mono ${better === 'beta' ? 'font-bold text-gold' : 'text-ink-2'}`}>
        {yuan(beta)}
      </td>
      <td className="py-2 text-xs text-ink-3">{hint}</td>
    </tr>
  )
}
