import { useEffect, useRef } from 'react'
import { Button } from '../../gui_elements/Button'
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
    <Button variant="secondary" onClick={() => (running ? ac.current?.abort() : start())}>
      {running ? '■ Stop demo' : '▶ Run demo'}
    </Button>
  )
}

export function DemoBanner() {
  const { running, step, caption, sub } = useDemo()
  if (!running || !caption) return null
  return (
    // Chamfered caption box, top centre
    <div className="chamfer absolute top-4 left-1/2 z-20 w-[min(640px,calc(100vw-48px))] -translate-x-1/2 bg-accent-2/45 p-px [--cut:12px]">
      <div className="chamfer bg-panel/95 px-5 py-3 text-center backdrop-blur-sm [--cut:12px]" style={{ animation: 'da-fade var(--dur) var(--ease) both' }}>
        <div className="sub t-label text-accent">Scripted demo replay · step {step}/{STEPS} · Esc to stop</div>
        <div className="t-h mt-1 font-semibold text-white">{caption}</div>
        {sub && <div className="t-caption mt-1 text-dim">{sub}</div>}
      </div>
    </div>
  )
}
