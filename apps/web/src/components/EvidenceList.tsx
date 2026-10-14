import { useState } from 'react'
import type { EvidenceRecord } from '@mcarena/shared'
import { Badge } from './ui/Badge.js'

const KIND_LABELS: Record<EvidenceRecord['kind'], string> = {
  'data-source': '数据来源',
  selection: '选择策略',
  search: '搜索过程',
  evaluate: '评估比较',
  price: '计价',
  'constraint-check': '约束校验',
  nutrition: '营养核算',
  judge: '裁判',
  system: '系统',
  error: '错误',
}

const KIND_TONES: Partial<Record<EvidenceRecord['kind'], 'ok' | 'info' | 'warn' | 'danger' | 'gold' | 'brand' | 'neutral'>> = {
  'data-source': 'info',
  selection: 'gold',
  search: 'gold',
  evaluate: 'gold',
  price: 'ok',
  'constraint-check': 'ok',
  judge: 'brand',
  system: 'neutral',
  error: 'danger',
}

/** 决策链路证据列表（可折叠） */
export function EvidenceList({ title, items }: { title: string; items: EvidenceRecord[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-line bg-surface/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-ink-2">{title}</span>
        <span className="flex items-center gap-2 text-xs text-ink-3">
          {items.length} 条证据
          <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-line px-4 py-3">
          {items.map((entry, index) => (
            <li key={`${entry.id}-${index}`} className="flex gap-2.5 text-xs leading-relaxed">
              <Badge tone={KIND_TONES[entry.kind] ?? 'neutral'} className="mt-0.5 shrink-0">
                {KIND_LABELS[entry.kind]}
              </Badge>
              <span className="min-w-0">
                <span className="text-ink-2">{entry.message}</span>
                {entry.resultSummary && <span className="mt-0.5 block text-ink-3">{entry.resultSummary}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
