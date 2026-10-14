import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { api, ApiClientError } from './api/client.js'
import { describeOrigin, DATA_ORIGIN_LABELS } from '@mcarena/shared'
import type { DataOrigin, HealthResponse, MatchResult, SnapshotInfoResponse } from '@mcarena/shared'
import { ChallengeCard } from './components/ChallengeCard.js'
import { AgentCard } from './components/AgentCard.js'
import { JudgePanel } from './components/JudgePanel.js'
import { EvidenceList } from './components/EvidenceList.js'

type ViewState =
  | { kind: 'booting' }
  | {
      kind: 'ready'
      health: HealthResponse
      snapshot: SnapshotInfoResponse | null
      snapshotError: ApiClientError | null
    }
  | { kind: 'fatal'; message: string }

export default function App() {
  const [state, setState] = useState<ViewState>({ kind: 'booting' })
  const [seedInput, setSeedInput] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<ApiClientError | null>(null)

  const loadInitial = useCallback(async () => {
    try {
      const health = await api.health()
      let snapshot: SnapshotInfoResponse | null = null
      let snapshotError: ApiClientError | null = null
      try {
        snapshot = await api.snapshotInfo()
      } catch (err) {
        snapshotError = err instanceof ApiClientError ? err : null
      }
      setState({ kind: 'ready', health, snapshot, snapshotError })
    } catch (err) {
      setState({
        kind: 'fatal',
        message: err instanceof Error ? err.message : '无法连接 API 服务（请确认 npm run dev 已启动后端）',
      })
    }
  }, [])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  async function onStart(event: FormEvent) {
    event.preventDefault()
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const seed = seedInput.trim() === '' ? undefined : Number(seedInput.trim())
      if (seed !== undefined && !Number.isInteger(seed)) {
        throw new ApiClientError({ code: 'VALIDATION_ERROR', message: '种子必须为整数' })
      }
      setResult(await api.startMatch(seed === undefined ? {} : { seed }))
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err
          : new ApiClientError({ code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }),
      )
    } finally {
      setRunning(false)
    }
  }

  if (state.kind === 'booting') {
    return <Shell><p className="text-zinc-400">正在连接 McArena API…</p></Shell>
  }

  if (state.kind === 'fatal') {
    return (
      <Shell>
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-200">
          <h2 className="font-semibold">无法启动</h2>
          <p className="mt-1 text-sm">{state.message}</p>
        </div>
      </Shell>
    )
  }

  const { health, snapshot } = state

  return (
    <Shell>
      <div className="space-y-6">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">控制台</h2>
            <OriginBadge origin={health.dataOrigin} mode={health.dataMode} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="数据模式" value={health.dataMode === 'live' ? '实时' : health.dataMode === 'replay' ? '快照回放' : '模拟'} />
            <Stat label="官方 Token" value={health.mcp.configured ? '已配置' : '未配置'} />
            <Stat label="MCP 地址" value={health.mcp.url} />
            <Stat label="API 版本" value={health.version} />
          </dl>
          {snapshot && (
            <p className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
              数据源：{snapshot.sourceRef} ｜ 采集时间：{snapshot.capturedAt} ｜ 餐品 {snapshot.menuItemCount} 项 ｜ sha256：
              {snapshot.sha256 ?? '（模拟数据无校验值）'}
              <br />
              {snapshot.notice}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-lg font-semibold">开始比赛</h2>
          <form onSubmit={(event) => void onStart(event)} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm text-zinc-300">
              随机种子（可复现同一局）
              <input
                value={seedInput}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSeedInput(event.target.value)}
                placeholder="留空则随机生成"
                inputMode="numeric"
                className="mt-1 block w-48 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400"
              />
            </label>
            <button
              type="submit"
              disabled={running}
              className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? '比赛进行中…' : '开始比赛'}
            </button>
          </form>
        </section>

        {health.dataOrigin === 'mock' && <MockWarning />}

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            比赛失败：{error.body.message}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <MockResultNotice warnings={result.warnings} />
            <ChallengeCard challenge={result.challenge} />
            <div className="grid gap-4 lg:grid-cols-2">
              {result.agents.map((agent) => (
                <AgentCard key={agent.agentId} agent={agent} />
              ))}
            </div>
            <JudgePanel judge={result.judge} />
            <EvidenceList
              title="决策链路（Agent α 证据）"
              items={result.agents[0]?.evidence ?? []}
            />
            <EvidenceList
              title="决策链路（Agent β 证据）"
              items={result.agents[1]?.evidence ?? []}
            />
            <p className="text-xs text-zinc-500">
              引擎版本：编排 {result.engineVersions.orchestrator} ｜ Agent α {result.engineVersions.agentAlpha} ｜ Agent β{' '}
              {result.engineVersions.agentBeta} ｜ 裁判 {result.engineVersions.judge}
            </p>
          </div>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            McArena <span className="text-amber-400">麦门 AI 竞技场</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">双 Agent 点餐决策竞技 · 可解释裁判 · 可复现回放</p>
        </div>
      </header>
      {children}
    </main>
  )
}

function OriginBadge({ origin, mode }: { origin: DataOrigin; mode: string }) {
  const colors: Record<DataOrigin, string> = {
    'official-live': 'border-emerald-600 bg-emerald-950/50 text-emerald-300',
    'official-snapshot': 'border-sky-600 bg-sky-950/50 text-sky-300',
    mock: 'border-amber-600 bg-amber-950/50 text-amber-300',
  }
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${colors[origin]}`}>
      数据来源：{DATA_ORIGIN_LABELS[origin].label}（{mode}）
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 truncate text-zinc-100" title={value}>
        {value}
      </dd>
    </div>
  )
}

function MockWarning() {
  return (
    <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
      <strong className="font-semibold">⚠ 当前为模拟数据模式</strong>
      <p className="mt-1 leading-relaxed">
        {describeOrigin('mock')} 申请麦当劳 MCP Token 并配置 MCD_MCP_MODE=live 后，即可切换为官方实时数据（阶段02）。
      </p>
    </div>
  )
}

function MockResultNotice({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  )
}
