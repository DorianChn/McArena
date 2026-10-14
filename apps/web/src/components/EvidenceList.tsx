import type { EvidenceRecord } from '@mcarena/shared'

const KIND_LABELS: Record<EvidenceRecord['kind'], string> = {
  'data-source': '数据来源',
  selection: '选择',
  'constraint-check': '约束校验',
  price: '价格',
  nutrition: '营养',
  judge: '裁判',
  error: '错误',
  system: '系统',
}

export function EvidenceList({ title, items }: { title: string; items: EvidenceRecord[] }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">暂无证据记录。</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded border border-zinc-700 px-1.5 py-0.5">{KIND_LABELS[item.kind]}</span>
                <time>{item.at}</time>
              </div>
              <p className="mt-1 text-sm text-zinc-200">{item.message}</p>
              {item.resultSummary && <p className="mt-1 text-xs text-zinc-500">{item.resultSummary}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
