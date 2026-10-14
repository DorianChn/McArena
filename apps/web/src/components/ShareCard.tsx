import { useRef, useState } from 'react'
import type { MatchResult } from '@mcarena/shared'
import { Button } from './ui/Button.js'
import { Badge } from './ui/Badge.js'
import { LogoMark } from './AppHeader.js'
import { copyText, downloadJson, exportCardPng, GITHUB_REPO_URL, reproducibleConfig, shareText } from '../lib/share.js'
import { shortHash, yuan } from '../lib/format.js'

/** 精美挑战成绩卡：页面展示 + PNG 导出 + 文案/配置复制 + GitHub 入口 */
export function ShareCard({ result }: { result: MatchResult }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const flash = (message: string): void => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2400)
  }

  const onExportPng = async (): Promise<void> => {
    if (!cardRef.current) return
    setExporting(true)
    try {
      await exportCardPng(cardRef.current, `mcarena-${result.judge.experimentId}.png`)
      flash('成绩卡 PNG 已开始下载')
    } catch (error) {
      flash(`导出失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setExporting(false)
    }
  }

  const alpha = result.agents[0]
  const beta = result.agents[1]
  const winnerName =
    result.judge.winner === 'alpha' ? `Agent α「${alpha?.name ?? '极速猎手'}」` : result.judge.winner === 'beta' ? `Agent β「${beta?.name ?? '深度优化师'}」` : '双方战平'

  return (
    <div className="space-y-4">
      {/* 成绩卡本体（PNG 导出的就是这块） */}
      <div
        ref={cardRef}
        data-testid="share-card"
        className="overflow-hidden rounded-3xl border border-line-strong bg-surface shadow-[var(--shadow-card)]"
      >
        <div
          className="relative px-6 py-6 sm:px-8"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--brand) 16%, var(--surface)), color-mix(in srgb, var(--gold) 12%, var(--surface)) 60%, var(--surface))',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <LogoMark size={36} />
              <div>
                <p className="text-sm font-extrabold tracking-tight text-ink">McArena · 麦门 AI 竞技场</p>
                <p className="text-[10px] text-ink-3">双 Agent 点餐决策竞技 · 挑战成绩</p>
              </div>
            </div>
            <Badge tone="brand">非官方项目</Badge>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-ink">{result.challenge.title}</p>
              <p className="mt-1 text-xs text-ink-3">
                种子 {result.seed}｜{result.dataOrigin === 'mock' ? '模拟数据（非官方数据）' : result.dataset.sourceRef}｜
                {new Date(result.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[11px] text-ink-3">本局胜者</p>
              <p className="text-xl font-black text-brand">{winnerName}</p>
              <p className="text-xs text-ink-2">
                五维总分 α {result.judge.agentScores[0].total.toFixed(1)} : β{' '}
                {result.judge.agentScores[1].total.toFixed(1)}
              </p>
              <p className="text-xs text-ink-3">实验 {result.judge.experimentId}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          <ScoreCell label="Agent α 应付" value={yuan(alpha?.proposal?.totalCents ?? null)} accent="var(--alpha-accent)" />
          <ScoreCell label="Agent β 应付" value={yuan(beta?.proposal?.totalCents ?? null)} accent="var(--beta-accent)" />
          <ScoreCell
            label="裁判实验 ID"
            value={result.judge.experimentId.replace('exp_', '')}
            mono
          />
          <ScoreCell label="数据校验 sha256" value={shortHash(result.dataset.sha256)} mono />
        </div>

        <div className="border-t border-line px-6 py-3 text-[10px] leading-relaxed text-ink-3 sm:px-8">
          裁判独立验证后裁定；成本比较依据：
          {result.judge.costBasis === 'official-verified' ? '官方 calculate-price 核验' : '裁判重算（未经官方核价）'}。
          成绩由真实运行产生。本项目非麦当劳官方项目，与麦当劳无关联。
        </div>
      </div>

      {/* 操作区（不进入 PNG） */}
      <div className="png-export-hide flex flex-wrap items-center gap-3">
        <Button onClick={() => void onExportPng()} loading={exporting}>
          🖼️ 导出成绩卡 PNG
        </Button>
        <Button variant="outline" onClick={() => void copyText(shareText(result)).then(() => flash('分享文案已复制'))}>
          📋 复制分享文案
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            downloadJson(`mcarena-challenge-${result.judge.experimentId}.json`, reproducibleConfig(result))
            flash('可复现挑战配置已下载（JSON）')
          }}
        >
          ⚙️ 导出复现配置
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void copyText(reproducibleConfig(result)).then(() => flash('可复现配置 JSON 已复制到剪贴板'))
          }
        >
          📄 复制配置 JSON
        </Button>
        {!GITHUB_REPO_URL && (
          <span className="text-xs text-ink-3">GitHub 仓库将在报名审核期间公开</span>
        )}
      </div>

      <div aria-live="polite" className="png-export-hide min-h-5 text-xs text-ok">
        {toast}
      </div>
    </div>
  )
}

function ScoreCell({
  label,
  value,
  accent,
  mono = false,
}: {
  label: string
  value: string
  accent?: string
  mono?: boolean
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] text-ink-3">{label}</p>
      <p
        className={`mt-1 truncate text-base font-bold ${mono ? 'font-mono text-sm' : ''}`}
        style={accent ? { color: accent } : { color: 'var(--ink)' }}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}
