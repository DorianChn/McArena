import type { JudgeResult } from '@mcarena/shared'

const WINNER_LABELS: Record<JudgeResult['winner'], string> = {
  alpha: 'Agent α 胜出',
  beta: 'Agent β 胜出',
  tie: '双方战平',
}

export function JudgePanel({ judge }: { judge: JudgeResult }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">裁判裁决</h2>
        <span className="rounded-full border border-amber-600 bg-amber-950/50 px-3 py-1 text-xs text-amber-300">
          {WINNER_LABELS[judge.winner]}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{judge.headline}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="pb-2">维度</th>
              <th className="pb-2 text-right">得分</th>
              <th className="pb-2 text-right">满分</th>
              <th className="pb-2">公式</th>
            </tr>
          </thead>
          <tbody>
            {judge.dimensions.map((dimension) => (
              <tr key={dimension.key} className="border-t border-zinc-800 align-top">
                <td className="py-2">{dimension.label}</td>
                <td className="py-2 text-right text-amber-300">{dimension.score.toFixed(1)}</td>
                <td className="py-2 text-right text-zinc-400">{dimension.max}</td>
                <td className="py-2 font-mono text-xs text-zinc-400">{dimension.formula}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-700 font-semibold">
              <td className="pt-2">加权总分</td>
              <td className="pt-2 text-right text-amber-300">{judge.totalScore.toFixed(1)}</td>
              <td className="pt-2 text-right text-zinc-400">{judge.totalMax}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {judge.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-zinc-400">
          {judge.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
