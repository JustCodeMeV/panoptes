import { useEffect, useRef, useState } from 'react'
import { embedFor, useLinkViewer } from '../core/linkViewer'
import { useEscape } from './useEscape'

type Reader = { url: string; framable: boolean; title?: string; site?: string; image?: string; text?: string; error?: string }

/**
 * Floating window for external links: Telegram and YouTube through their
 * official embeds, sites that allow framing in a sandboxed frame, everything
 * else as a clean reader view. Drag by the title bar, resize from the corner.
 */
export function LinkViewer() {
  const { stack, index, back, forward, close } = useLinkViewer()
  const url = stack[index]
  // Reader result keyed by URL: loading is "no result for this URL yet" (no state reset in the effect).
  const [result, setResult] = useState<Reader | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const embed = url ? embedFor(url) : null
  useEscape(!!url, close)

  useEffect(() => {
    if (!url || embed) return
    let alive = true
    fetch(`/api/reader?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j: Reader) => alive && setResult({ ...j, url: j.url || url, requested: url } as Reader))
      .catch((e) => alive && setResult({ url, framable: false, error: String(e), requested: url } as Reader))
    return () => {
      alive = false
    }
  }, [url, embed])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })
    }
    const up = () => (drag.current = null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  if (!url) return null
  const page = result && (result as Reader & { requested?: string }).requested === url ? result : null
  const loading = !embed && !page
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* keep raw */
  }
  return (
    <section className="link-viewer" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} aria-label="Link viewer">
      <header onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y })}>
        <button onClick={back} disabled={index <= 0} aria-label="Back">
          ‹
        </button>
        <button onClick={forward} disabled={index >= stack.length - 1} aria-label="Forward">
          ›
        </button>
        <span title={url}>{page?.title || host}</span>
        <a href={url} target="_blank" rel="noreferrer" data-external="1" title="Open in a new tab">
          ↗
        </a>
        <button onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      <div className="link-body">
        {embed ? (
          <iframe src={embed} title={host} allow="autoplay; encrypted-media; fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
        ) : loading ? (
          <p className="link-note">Opening {host}…</p>
        ) : page?.framable ? (
          <iframe src={page.url} title={host} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" />
        ) : (
          <article className="link-reader">
            <small>{page?.site ?? host} · reader view (the site does not allow being shown inside other apps)</small>
            <h3>{page?.title || url}</h3>
            {page?.image && <img src={page.image} alt="" referrerPolicy="no-referrer" />}
            {page?.text ? page.text.split('\n').map((p, i) => <p key={i}>{p}</p>) : <p className="link-note">{page?.error ?? 'No readable text on this page.'}</p>}
            <a href={url} target="_blank" rel="noreferrer" data-external="1">
              Open the original ↗
            </a>
          </article>
        )}
      </div>
    </section>
  )
}

