import { Suspense, lazy } from 'react'
import App from './App'
import { useIsLanding } from './route'

const Landing = lazy(() => import('./landing/Landing'))

/** The app, or the landing page behind the logo (#welcome). */
export function Root() {
  return useIsLanding() ? (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  ) : (
    <App />
  )
}
