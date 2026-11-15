// Minimal client-side router (History API, no dependency). The backend's SPA fallback
// serves index.html for these paths, so deep links and reloads work.
import {useEffect, useState} from 'react'

export const ROUTES = {
  '/': 'Mission overview',
  '/crew': 'Crew health',
  '/trends': 'Physiological trends',
  '/history': 'Event history',
  '/crew-map': 'Crew Health Map',
  '/companion': 'Medical companion',
} as const
export type Route = keyof typeof ROUTES

const base = import.meta.env.BASE_URL
const normalise = (path: string): Route => {
  const relative = '/' + path.slice(base.length).replace(/\/$/, '')
  return (Object.hasOwn(ROUTES, relative) ? relative : '/') as Route
}
export const routeHref = (route: Route) => base + route.slice(1)

export function navigate(to: Route) {
  if (normalise(location.pathname) === to) return
  history.pushState({}, '', routeHref(to))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => normalise(location.pathname))
  useEffect(() => {
    const onPop = () => { setRoute(normalise(location.pathname)); window.scrollTo(0, 0) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return route
}

/** Same-tab navigation for plain left clicks; modifier clicks keep native behaviour (new tab etc.). */
export function linkTo(to: Route) {
  return (e: {preventDefault: () => void; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean}) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
}
