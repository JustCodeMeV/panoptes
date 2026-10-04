import { useEffect } from 'react'
import { create } from 'zustand'

/** The in-app link window: history of opened links (back / forward) and the current one. */
export const useLinkViewer = create<{
  stack: string[]
  index: number
  open(url: string): void
  back(): void
  forward(): void
  close(): void
}>((set) => ({
  stack: [],
  index: -1,
  open: (url) => set((s) => ({ stack: [...s.stack.slice(0, s.index + 1), url], index: s.index + 1 })),
  back: () => set((s) => ({ index: Math.max(0, s.index - 1) })),
  forward: () => set((s) => ({ index: Math.min(s.stack.length - 1, s.index + 1) })),
  close: () => set({ stack: [], index: -1 }),
}))

/** Telegram, YouTube, TikTok, Instagram and X posts have official embeds that work in a frame (and play video). */
export function embedFor(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 't.me' || host === 'telegram.me') {
      const m = u.pathname.match(/^\/(?:s\/)?([A-Za-z0-9_]{4,})\/(\d+)/)
      if (m) return `https://t.me/${m[1]}/${m[2]}?embed=1&dark=1`
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{6,})/)?.[1]
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`
    }
    const tt = host.endsWith('tiktok.com') && u.pathname.match(/\/video\/(\d+)/)
    if (tt) return `https://www.tiktok.com/embed/v2/${tt[1]}`
    const ig = host.endsWith('instagram.com') && u.pathname.match(/^\/(p|reel|tv)\/([\w-]+)/)
    if (ig) return `https://www.instagram.com/${ig[1]}/${ig[2]}/embed`
    const tw = (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') && u.pathname.match(/\/status\/(\d+)/)
    if (tw) return `https://platform.twitter.com/embed/Tweet.html?id=${tw[1]}&theme=dark`
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=1&mute=1`
  } catch {
    return null
  }
  return null
}

/** Any external link click inside the app opens the viewer (modifier-clicks and the viewer's own "↗" links keep the browser behaviour). */
export function useLinkCapture() {
  const open = useLinkViewer((s) => s.open)
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.dataset.external === '1' || a.hasAttribute('download')) return
      if (!/^https?:/i.test(a.href) || new URL(a.href).origin === window.location.origin) return
      e.preventDefault()
      open(a.href)
    }
    document.addEventListener('click', on, true)
    return () => document.removeEventListener('click', on, true)
  }, [open])
}
