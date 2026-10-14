import { Badge } from './ui/Badge.js'
import { useTheme } from '../theme.js'
import { useApp } from '../state/match.js'
import type { RouteName } from '../router.js'
import { GITHUB_REPO_URL } from '../lib/share.js'
import type { DataOrigin } from '@mcarena/shared'

const NAV: Array<{ route: RouteName; label: string }> = [
  { route: 'home', label: '首页' },
  { route: 'setup', label: '挑战设置' },
]

const ORIGIN_BADGE: Record<DataOrigin, { tone: 'ok' | 'info' | 'warn'; label: string }> = {
  'official-live': { tone: 'ok', label: '官方实时数据' },
  'official-snapshot': { tone: 'info', label: '官方快照' },
  mock: { tone: 'warn', label: '模拟数据' },
}

export function AppHeader({ route, navigate }: { route: RouteName; navigate: (route: RouteName) => void }) {
  const { theme, toggle } = useTheme()
  const { health } = useApp()

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <a
          href="#/"
          onClick={(event) => {
            event.preventDefault()
            navigate('home')
          }}
          className="flex items-center gap-2.5 rounded-lg text-ink"
          aria-label="返回 McArena 首页"
        >
          <LogoMark />
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight">
              McArena <span className="text-gold">麦门竞技场</span>
            </span>
            <span className="hidden text-[11px] text-ink-3 sm:block">双 Agent 点餐决策竞技 · 可解释裁判</span>
          </span>
        </a>

        <nav aria-label="主导航" className="ml-auto flex items-center gap-1">
          {NAV.map((item) => (
            <a
              key={item.route}
              href={`#/${item.route === 'home' ? '' : item.route}`}
              onClick={(event) => {
                event.preventDefault()
                navigate(item.route)
              }}
              aria-current={route === item.route ? 'page' : undefined}
              className={[
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                route === item.route ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
              ].join(' ')}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {health && (
            <span className="hidden sm:inline-flex">
              <Badge tone={ORIGIN_BADGE[health.dataOrigin].tone}>
                <span className="hidden md:inline">{ORIGIN_BADGE[health.dataOrigin].label}</span>
                <span className="md:hidden">数据</span>
              </Badge>
            </span>
          )}
          <a
            href={GITHUB_REPO_URL || undefined}
            target="_blank"
            rel="noreferrer noopener"
            aria-disabled={GITHUB_REPO_URL ? undefined : true}
            title={GITHUB_REPO_URL ? 'GitHub 项目仓库' : 'GitHub 仓库尚未公开（报名期间开放）'}
            onClick={(event) => {
              if (!GITHUB_REPO_URL) event.preventDefault()
            }}
            className={[
              'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong transition',
              GITHUB_REPO_URL ? 'text-ink-2 hover:border-gold hover:text-gold' : 'cursor-not-allowed text-ink-3 opacity-60',
            ].join(' ')}
          >
            <GitHubIcon />
            <span className="sr-only">GitHub 项目入口</span>
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition hover:border-gold hover:text-gold"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  )
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="var(--brand)" />
      <path d="M11 27V13h6.4c3.2 0 5.2 1.8 5.2 4.6 0 2.2-1.2 3.7-3.2 4.3L24 27h-4l-3.6-4.6h-1.6V27H11Zm2.8-7h3.2c1.4 0 2.3-.8 2.3-2.1s-.9-2.1-2.3-2.1h-3.2v4.2Z" fill="#fff" />
      <circle cx="28.5" cy="14.5" r="2.6" fill="var(--gold)" />
      <circle cx="28.5" cy="25.5" r="2.6" fill="var(--gold)" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}
