import { useSyncExternalStore } from 'react'

/** The landing page lives behind the logo, at #welcome; everything else is the app. */
export const LANDING_HASH = '#welcome'

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function useIsLanding() {
  return useSyncExternalStore(subscribe, () => window.location.hash === LANDING_HASH)
}

/** Back to the app: drop the hash without leaving a "#" in the address bar. */
export function openApp() {
  history.pushState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
