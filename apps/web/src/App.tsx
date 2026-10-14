import { useCallback, useState } from 'react'
import { AppProvider, useApp } from './state/match.js'
import { ThemeProvider } from './theme.js'
import { useRouter } from './router.js'
import { AppHeader } from './components/AppHeader.js'
import { AppFooter } from './components/AppFooter.js'
import { HomePage } from './pages/HomePage.js'
import { SetupPage } from './pages/SetupPage.js'
import { ArenaPage } from './pages/ArenaPage.js'
import { ResultPage } from './pages/ResultPage.js'
import { ErrorState, PageLoading } from './components/ui/feedback.js'

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ThemeProvider>
  )
}

function AppShell() {
  const { route, navigate } = useRouter()
  const { booting, bootError, reload, match, startMatch, resetMatch } = useApp()
  const [quickStarting, setQuickStarting] = useState(false)

  const quickStart = useCallback(async () => {
    setQuickStarting(true)
    try {
      const result = await startMatch({})
      if (result) navigate('arena')
    } finally {
      setQuickStarting(false)
    }
  }, [startMatch, navigate])

  // 路由与比赛状态一致性：进入 arena/result 但没有结果时，由页面自身渲染空状态
  const go = useCallback(
    (next: 'home' | 'setup' | 'arena' | 'result') => {
      if (next !== 'arena' && next !== 'result') resetMatch()
      navigate(next)
    },
    [navigate, resetMatch],
  )

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-[#201800]"
      >
        跳到主要内容
      </a>
      <AppHeader route={route} navigate={go} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {booting ? (
          <PageLoading label="正在连接 McArena 服务…" />
        ) : bootError ? (
          <ErrorState
            title="无法连接 McArena API"
            message={`${bootError}。请确认后端服务已启动（npm run dev:api），然后重试。`}
            onRetry={() => void reload()}
            retryLabel="重新连接"
          />
        ) : (
          <>
            {route === 'home' && (
              <HomePage navigate={go} onQuickStart={() => void quickStart()} quickStarting={quickStarting} />
            )}
            {route === 'setup' && <SetupPage navigate={go} />}
            {route === 'arena' && <ArenaPage navigate={go} />}
            {route === 'result' && <ResultPage navigate={go} />}
            {match.phase === 'starting' && route === 'home' && (
              <div className="mt-6 text-center text-sm text-ink-3">对决正在发起，即将进入竞技场…</div>
            )}
          </>
        )}
      </main>
      <AppFooter />
    </div>
  )
}
