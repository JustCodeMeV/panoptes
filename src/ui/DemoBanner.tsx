import { useEffect, useRef } from 'react'
import { useDemo } from '../core/demo'
import { runDemo, STEPS } from '../demo/script'

/** Narration for the scripted replay + the button that starts it. */
export function DemoButton() {
  const running = useDemo((s) => s.running)
  const ac = useRef<AbortController | null>(null)
  const start = () => {
    ac.current?.abort()
    ac.current = new AbortController()
    void runDemo(ac.current.signal)
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && ac.current?.abort()
    window.addEventListener('keydown', esc)
    if (new URLSearchParams(location.search).has('demo')) {
      const t = setTimeout(start, 6000)
      return () => (clearTimeout(t), window.removeEventListener('keydown', esc))
    }
    return () => window.removeEventListener('keydown', esc)
  }, [])
  return (
    <button className="demo-btn" onClick={() => (running ? ac.current?.abort() : start())}>
      {running ? '■ Stop demo' : '▶ Run demo'}
    </button>
  )
}

export function DemoBanner() {
  const { running, step, caption, sub } = useDemo()
  if (!running || !caption) return null
  return (
    <div className="demo-banner">
      <div className="demo-tag">SCRIPTED DEMO REPLAY · step {step}/{STEPS} · Esc to stop</div>
      <div className="demo-cap">{caption}</div>
      {sub && <div className="demo-sub">{sub}</div>}
    </div>
  )
}
