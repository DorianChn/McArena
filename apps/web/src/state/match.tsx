import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiClientError } from '../api/client.js'
import type { ChallengeConstraints, HealthResponse, MatchResult, SnapshotInfoResponse } from '@mcarena/shared'

/** 比赛运行阶段（驱动竞技场 UI） */
export type MatchPhase = 'idle' | 'starting' | 'playing' | 'judging' | 'done' | 'error'

export interface MatchState {
  phase: MatchPhase
  result: MatchResult | null
  error: ApiClientError | null
  /** 实际耗时（毫秒）= 前端发起请求到收到结果的墙上时间 */
  wallMs: number | null
  /** 最近一次发起参数（用于失败重试） */
  lastInput: { seed?: number; constraints?: ChallengeConstraints } | null
}

interface AppContextValue {
  health: HealthResponse | null
  snapshot: SnapshotInfoResponse | null
  snapshotError: ApiClientError | null
  booting: boolean
  bootError: string | null
  reload: () => Promise<void>
  match: MatchState
  /** 发起比赛：可带自定义约束（阶段05）；不传则由服务端随机生成任务卡 */
  startMatch: (input: { seed?: number; constraints?: ChallengeConstraints }) => Promise<MatchResult | null>
  /** 回放模式：直接拿已有结果进入结果页（重新挑战/复现） */
  replay: (result: MatchResult) => void
  resetMatch: () => void
  /** 竞态保护：仅接受最后一次请求的结果 */
  requestIdRef: React.MutableRefObject<number>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotInfoResponse | null>(null)
  const [snapshotError, setSnapshotError] = useState<ApiClientError | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [match, setMatch] = useState<MatchState>({
    phase: 'idle',
    result: null,
    error: null,
    wallMs: null,
    lastInput: null,
  })
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    setBooting(true)
    setBootError(null)
    try {
      const loadedHealth = await api.health()
      setHealth(loadedHealth)
      try {
        setSnapshot(await api.snapshotInfo())
        setSnapshotError(null)
      } catch (err) {
        setSnapshot(null)
        setSnapshotError(err instanceof ApiClientError ? err : null)
      }
    } catch (err) {
      setBootError(err instanceof Error ? err.message : '无法连接 API 服务（请确认后端已启动）')
    } finally {
      setBooting(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const startMatch = useCallback<AppContextValue['startMatch']>(async (input) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setMatch({ phase: 'starting', result: null, error: null, wallMs: null, lastInput: input })
    const startedAt = performance.now()
    try {
      const result = await api.startMatch({
        seed: input.seed,
        constraints: input.constraints,
      })
      if (requestIdRef.current !== requestId) return null // 已被更新的请求取代
      setMatch({ phase: 'done', result, error: null, wallMs: performance.now() - startedAt, lastInput: input })
      return result
    } catch (err) {
      if (requestIdRef.current !== requestId) return null
      const error =
        err instanceof ApiClientError
          ? err
          : new ApiClientError({ code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) })
      setMatch({ phase: 'error', result: null, error, wallMs: null, lastInput: input })
      return null
    }
  }, [])

  const replay = useCallback((result: MatchResult) => {
    setMatch({ phase: 'done', result, error: null, wallMs: null, lastInput: null })
  }, [])

  const resetMatch = useCallback(() => {
    requestIdRef.current += 1
    setMatch({ phase: 'idle', result: null, error: null, wallMs: null, lastInput: null })
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      health,
      snapshot,
      snapshotError,
      booting,
      bootError,
      reload: load,
      match,
      startMatch,
      replay,
      resetMatch,
      requestIdRef,
    }),
    [health, snapshot, snapshotError, booting, bootError, load, match, startMatch, replay, resetMatch],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp 必须在 AppProvider 内使用')
  return context
}
