import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return (
    <Tag
      className={`rounded-2xl border border-line bg-surface/80 backdrop-blur-sm shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 px-5 pt-5 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>
}

/** 分区标题（带左侧品牌色标记） */
export function SectionTitle({
  children,
  hint,
  className = '',
}: {
  children: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink">
        <span aria-hidden="true" className="h-5 w-1.5 rounded-full bg-brand" />
        {children}
      </h2>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </div>
  )
}
