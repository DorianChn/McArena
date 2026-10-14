import type { MatchResult } from '@mcarena/shared'

/**
 * 自包含 HTML 战报（零依赖、可直接用浏览器打开）。
 *
 * 用途：WorkBuddy Skill 与 CLI 在无法启动前端开发服务器时，
 * 仍能产出一份「可以打开的竞技场结果」。
 * 内容全部来自真实 MatchResult，不做任何美化性编造。
 */

function esc(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
            ? String(value)
            : ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function yuan(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '—' : `¥${(cents / 100).toFixed(2)}`
}

const AGENT_LABEL: Record<string, string> = { alpha: 'α', beta: 'β' }

export interface RenderMatchHtmlOptions {
  /** 可复现配置（JSON），会在页面底部原样展示 */
  reproducibleConfig?: unknown
  /** 页面标题 */
  title?: string
}

export function renderMatchHtml(result: MatchResult, options: RenderMatchHtmlOptions = {}): string {
  const { challenge, judge, agents } = result
  const winnerText =
    judge.winner === 'tie' ? '双方战平' : `${AGENT_LABEL[judge.winner]} ${agents.find((a) => a.agentId === judge.winner)?.name ?? ''} 获胜`

  const agentCards = agents
    .map((agent, index) => {
      const score = judge.agentScores[index]
      const verification = judge.verification.find((v) => v.agentId === agent.agentId)
      const items = (agent.proposal?.items ?? [])
        .map(
          (item) =>
            `<tr><td>${esc(item.name)}</td><td class="num">×${item.qty}</td><td class="num">${yuan(item.lineTotalCents)}</td></tr>`,
        )
        .join('')
      const violations = (verification?.violations ?? [])
        .map(
          (violation) =>
            `<li class="${violation.severity === 'fatal' ? 'fatal' : 'warn'}">[${violation.severity}] ${esc(violation.message)}</li>`,
        )
        .join('')
      const dims = judge.dimensions
        .map((dimension) => {
          const raw = score?.dimensions[dimension.key] ?? 0
          const pct = Math.max(0, Math.min(100, (raw / dimension.max) * 100))
          return `<div class="dim"><span class="dim-label">${esc(dimension.label)}</span>
            <span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span>
            <span class="dim-score">${raw.toFixed(1)} / ${dimension.max}</span></div>`
        })
        .join('')

      return `<section class="agent agent-${esc(agent.agentId)}">
        <header>
          <h3>${esc(AGENT_LABEL[agent.agentId] ?? agent.agentId)} ${esc(agent.name)}</h3>
          <p class="engine">${esc(agent.engine)}@${esc(agent.engineVersion)} · ${esc(agent.role)}</p>
          ${score ? `<p class="total">总分 <strong>${score.total.toFixed(1)}</strong> / 100</p>` : ''}
        </header>
        <ul class="meta">
          <li>状态：${esc(agent.status === 'completed' ? '完成' : '失败')}</li>
          <li>自述应付：${yuan(agent.proposal?.totalCents ?? null)}</li>
          <li>裁决成本：${yuan(verification?.effectiveCostCents ?? null)}</li>
          <li>价格核验：${esc(verification?.priceStatus ?? '—')}</li>
          <li>资格：${verification?.eligible ? '通过' : '未通过'}</li>
          <li>实测耗时：${agent.durationMs ?? 0} ms</li>
          <li>候选数：${agent.candidateCount ?? 0}</li>
          <li>工具调用：${agent.toolCallCount ?? 0}</li>
        </ul>
        <table class="cart"><thead><tr><th>餐品</th><th>数量</th><th>小计</th></tr></thead><tbody>${
          items || '<tr><td colspan="3" class="empty">无有效提案</td></tr>'
        }</tbody></table>
        <div class="dims">${dims}</div>
        ${violations ? `<ul class="violations">${violations}</ul>` : ''}
      </section>`
    })
    .join('')

  const notes = judge.notes.map((note) => `<li>${esc(note)}</li>`).join('')
  const warnings = result.warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')
  const config = options.reproducibleConfig
    ? `<pre class="config">${esc(JSON.stringify(options.reproducibleConfig, null, 2))}</pre>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(options.title ?? '麦门 AI 竞技场 · 比赛结果')}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: #f6f6f4; color: #1c1c1c; line-height: 1.6; }
  .wrap { max-width: 1040px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 10px; padding-left: 10px; border-left: 4px solid #da291c; }
  h3 { font-size: 16px; margin: 0; }
  .sub { color: #666; font-size: 13px; margin: 0 0 18px; }
  .card { background: #fff; border: 1px solid #e6e4e0; border-radius: 12px; padding: 16px 18px; }
  .banner { background: #fff3cd; border: 1px solid #f0d98a; color: #6b4c00; border-radius: 10px;
    padding: 10px 14px; font-size: 13px; margin: 14px 0; }
  .winner { font-size: 18px; font-weight: 700; color: #a3120b; }
  .headline { margin: 6px 0 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .agent header { border-bottom: 1px dashed #e6e4e0; padding-bottom: 8px; margin-bottom: 10px; }
  .agent-alpha header { border-top: 3px solid #da291c; }
  .agent-beta header { border-top: 3px solid #ffc72c; }
  .engine, .total { margin: 2px 0 0; font-size: 12px; color: #666; }
  ul.meta { list-style: none; padding: 0; margin: 0 0 10px; font-size: 12px; color: #444;
    display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
  table.cart { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; }
  table.cart th, table.cart td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #f0efec; }
  table.cart td.num, table.cart th:nth-child(2), table.cart th:nth-child(3) { text-align: right; }
  .dim { display: grid; grid-template-columns: 78px 1fr 76px; align-items: center; gap: 8px; font-size: 12px; margin: 4px 0; }
  .bar { background: #f0efec; border-radius: 6px; height: 8px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg,#da291c,#ffc72c); }
  .dim-score { text-align: right; color: #555; font-variant-numeric: tabular-nums; }
  ul.violations { margin: 8px 0 0; padding-left: 18px; font-size: 12px; }
  ul.violations li.fatal { color: #a3120b; }
  ul.violations li.warn { color: #8a6d00; }
  table.cmp { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.cmp th, table.cmp td { padding: 7px 10px; border-bottom: 1px solid #f0efec; text-align: left; }
  table.cmp th { background: #faf9f7; }
  pre.config { background: #1c1c1c; color: #e8e8e8; padding: 12px 14px; border-radius: 10px;
    font-size: 12px; overflow-x: auto; }
  ol.notes { font-size: 13px; padding-left: 20px; }
  .empty { color: #999; text-align: center; }
  footer { margin-top: 26px; font-size: 12px; color: #888; border-top: 1px solid #e6e4e0; padding-top: 10px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>麦门 AI 竞技场 · 比赛结果</h1>
  <p class="sub">比赛 ID ${esc(result.matchId)}｜种子 ${result.seed}｜规则 ${esc(judge.rulesVersion)}｜实验 ${esc(judge.experimentId)}</p>

  <div class="card">
    <h2>任务卡</h2>
    <p><strong>${esc(challenge.title)}</strong></p>
    <p class="sub">${esc(challenge.brief)}</p>
    <p class="sub">数据来源 ${esc(result.dataOrigin)}｜${esc(result.dataset.sourceRef)}｜成本依据 ${esc(judge.costBasis)}</p>
    ${warnings ? `<div class="banner">⚠ 数据提示：<ul style="margin:6px 0 0;padding-left:18px">${warnings}</ul></div>` : ''}
  </div>

  <div class="card" style="margin-top:16px">
    <h2>裁判结论</h2>
    <p class="winner">${esc(winnerText)}</p>
    <p class="headline">${esc(judge.headline)}</p>
  </div>

  <h2>双方对决</h2>
  <div class="grid">${agentCards}</div>

  <h2>价格对比（多口径）</h2>
  <div class="card">
    <table class="cmp">
      <thead><tr><th>口径</th>${agents.map((a) => `<th>${esc(AGENT_LABEL[a.agentId])} ${esc(a.name)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>自述应付</td>${agents.map((a) => `<td>${yuan(a.proposal?.totalCents ?? null)}</td>`).join('')}</tr>
        <tr><td>官方核价</td>${judge.verification.map((v) => `<td>${yuan(v.officialCostCents)}</td>`).join('')}</tr>
        <tr><td>裁判重算</td>${judge.verification.map((v) => `<td>${yuan(v.recomputedCostCents)}</td>`).join('')}</tr>
        <tr><td>裁决采用</td>${judge.verification.map((v) => `<td><strong>${yuan(v.effectiveCostCents)}</strong></td>`).join('')}</tr>
        <tr><td>目标达成率</td>${judge.verification.map((v) => `<td>${v.targetAchievement === null ? '—' : `${(v.targetAchievement * 100).toFixed(1)}%`}</td>`).join('')}</tr>
        <tr><td>价格核验状态</td>${judge.verification.map((v) => `<td>${esc(v.priceStatus)}</td>`).join('')}</tr>
      </tbody>
    </table>
  </div>

  <h2>裁判说明</h2>
  <div class="card"><ol class="notes">${notes}</ol></div>

  ${config ? `<h2>可复现配置</h2><div class="card"><p class="sub">把下列配置粘贴到竞技场网页的「挑战设置」，或使用相同种子重跑，即可得到一致结果（实测耗时除外）。</p>${config}</div>` : ''}

  <footer>
    本页由 McArena 引擎自动生成，全部数值来自真实执行结果。麦门 AI 竞技场为参赛作品，
    非麦当劳官方产品，未获得麦当劳官方认证或背书。
  </footer>
</div>
</body>
</html>`
}
