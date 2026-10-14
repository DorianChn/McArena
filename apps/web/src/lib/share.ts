import type { MatchResult } from '@mcarena/shared'
import { shortHash, yuan } from './format.js'

/**
 * 分享与导出（阶段05）。
 * 原则：所有文案与导出内容必须来自真实比赛结果，
 * 不得包含任何编造的战绩、用户数或排行榜数据。
 */

/** 可复现挑战配置（同 seed + 同约束 + 同数据集 → 同一局） */
export function reproducibleConfig(result: MatchResult): string {
  return JSON.stringify(
    {
      generator: 'McArena',
      seed: result.seed,
      challengeId: result.challenge.id,
      constraints: result.challenge.constraints,
      dataset: {
        sourceRef: result.dataset.sourceRef,
        snapshotId: result.dataset.snapshotId ?? null,
        sha256: result.dataset.sha256,
        capturedAt: result.dataset.capturedAt,
      },
      engines: result.engineVersions,
      judge: {
        rulesVersion: result.judge.rulesVersion,
        experimentId: result.judge.experimentId,
      },
    },
    null,
    2,
  )
}

/** 公开分享文案（纯文本，免登录可传播） */
export function shareText(result: MatchResult): string {
  const [alpha, beta] = result.agents
  const winnerLabel =
    result.judge.winner === 'tie'
      ? '双方战平'
      : result.judge.winner === 'alpha'
        ? `Agent α「${alpha?.name ?? '极速猎手'}」`
        : `Agent β「${beta?.name ?? '深度优化师'}」`
  const lines = [
    '🍔【麦门 AI 竞技场 · 挑战成绩】',
    `任务卡：${result.challenge.title}（种子 ${result.seed}）`,
    `胜者：${winnerLabel}｜五维总分 α ${result.judge.agentScores[0].total.toFixed(1)} : β ${result.judge.agentScores[1].total.toFixed(1)} / ${result.judge.totalMax}`,
    `应付价格：α ${yuan(alpha?.proposal?.totalCents ?? null)}｜β ${yuan(beta?.proposal?.totalCents ?? null)}`,
    `裁判实验 ID：${result.judge.experimentId}`,
    `数据来源：${result.dataOrigin === 'mock' ? '模拟数据（非麦当劳官方数据）' : result.dataset.sourceRef}｜sha256 ${shortHash(result.dataset.sha256)}`,
    '— McArena · 双 Agent 点餐决策竞技场（非官方项目，与麦当劳无关联）',
  ]
  return lines.join('\n')
}

/** 复制到剪贴板（带降级方案：http 环境或权限拒绝时用 textarea 复制） */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // 落到降级方案
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

/** 导出成绩卡为 PNG（按需加载 html-to-image，避免进入主包） */
export async function exportCardPng(node: HTMLElement, filename: string): Promise<void> {
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#0b0b10',
    style: { borderRadius: '16px' },
    filter: (element) => !element.classList?.contains('png-export-hide'),
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

/** 触发文件下载（用于导出 JSON 配置） */
export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * GitHub 项目入口。
 * 仓库尚未公开（阻塞项 B2）时留空；演示环境不得展示虚构仓库地址，
 * 配置后（VITE_GITHUB_REPO_URL）自动展示真实入口。
 */
export const GITHUB_REPO_URL: string = import.meta.env.VITE_GITHUB_REPO_URL ?? ''
