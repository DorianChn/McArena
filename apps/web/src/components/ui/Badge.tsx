import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'brand' | 'gold' | 'ok' | 'warn' | 'danger' | 'alpha' | 'beta' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'border-line-strong text-ink-2 bg-surface-2',
  brand: 'border-brand/50 text-brand bg-brand-soft',
  gold: 'border-gold/50 text-gold bg-gold-soft',
  ok: 'border-ok/50 text-ok bg-ok/10',
  warn: 'border-warn/50 text-warn bg-warn/10',
  danger: 'border-danger/50 text-danger bg-danger/10',
  alpha: 'border-alpha/50 text-alpha bg-alpha/10',
  beta: 'border-beta/50 text-beta bg-beta/10',
  info: 'border-beta/50 text-beta bg-beta/10',
}

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  title,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** 状态点（呼吸动画用于“进行中”） */
export function StatusDot({ tone = 'ok', live = false }: { tone?: Tone; live?: boolean }) {
  const color: Record<Tone, string> = {
    neutral: 'bg-ink-3',
    brand: 'bg-brand',
    gold: 'bg-gold',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    alpha: 'bg-alpha',
    beta: 'bg-beta',
    info: 'bg-beta',
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color[tone]} ${live ? 'mca-live-dot' : ''}`}
    />
  )
}
