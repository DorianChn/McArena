import type { ReactNode } from 'react'

/** 加载中（spinner + 文案；支持 aria-live 播报） */
export function Loading({ label = '加载中…', live = false }: { label?: string; live?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-2" role="status" aria-live={live ? 'polite' : 'off'}>
      <span
        className="mca-spin inline-block h-4 w-4 rounded-full border-2 border-gold border-t-transparent"
        aria-hidden="true"
      />
      {label}
    </div>
  )
}

/** 整页 Loading */
export function PageLoading({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div
        className="mca-spin h-10 w-10 rounded-full border-[3px] border-gold border-t-transparent"
        aria-hidden="true"
      />
      <p className="text-sm text-ink-2">{label}</p>
    </div>
  )
}

/** 错误态（含重试操作） */
export function ErrorState({
  title = '出错了',
  message,
  onRetry,
  retryLabel = '重试',
}: {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center"
    >
      <p className="text-sm font-semibold text-danger">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-10 items-center rounded-xl border border-danger/60 px-5 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

/** 空状态 */
export function EmptyState({
  title,
  message,
  action,
  icon = '🍽️',
}: {
  title: string
  message?: string
  action?: ReactNode
  icon?: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/40 px-6 py-12 text-center">
      <p className="text-3xl" aria-hidden="true">
        {icon}
      </p>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      {message && <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-3">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** 细进度条 */
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? '进度'}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-gold transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** 骨架块 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`mca-skeleton rounded-lg ${className}`} />
}
