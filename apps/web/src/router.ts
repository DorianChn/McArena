import { useCallback, useEffect, useState } from 'react'

/** 极简 hash 路由（零依赖）：`#/` `#/setup` `#/arena` `#/result` */
export type RouteName = 'home' | 'setup' | 'arena' | 'result'

const ROUTES: RouteName[] = ['home', 'setup', 'arena', 'result']

function parseHash(hash: string): RouteName {
  const name = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  return (ROUTES as string[]).includes(name) ? (name as RouteName) : 'home'
}

export function useRouter(): {
  route: RouteName
  navigate: (route: RouteName, options?: { replace?: boolean }) => void
} {
  const [route, setRoute] = useState<RouteName>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: RouteName, options?: { replace?: boolean }) => {
    const url = `#/${next === 'home' ? '' : next}`
    if (window.location.hash === url) {
      setRoute(next)
      return
    }
    if (options?.replace) {
      window.history.replaceState(null, '', url)
      setRoute(next)
    } else {
      window.location.hash = url
    }
  }, [])

  return { route, navigate }
}
