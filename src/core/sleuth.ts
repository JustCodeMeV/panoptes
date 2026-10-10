import { create } from 'zustand'
import type { Feature } from '../../shared/feature'

/**
 * Photo geolocation runs (server/sleuth): start one from an upload, an image URL or a live item,
 * follow it while it works (polled every 2 s; cheap, and works behind any proxy), escalate or stop it.
 */

export type SleuthStep = { at: number; kind: 'tool' | 'note' | 'error'; text: string; ok?: boolean }
export type SleuthFinding = { lat?: number; lon?: number; radius_m?: number; place?: string; level?: string; confidence?: string; heading_deg?: number | null; captured_at?: string | null }
export type SleuthRun = {
  id: string
  status: 'intake' | 'running' | 'done' | 'failed' | 'cancelled'
  createdAt: number
  source: { kind: 'upload' | 'url' | 'item'; url?: string; featureId?: string; title?: string }
  purpose: string
  model: string
  costUsd: number
  toolCalls: number
  budget: { steps: number; usd: number }
  steps: SleuthStep[]
  report?: string
  finding?: SleuthFinding
  images: string[]
  error?: string
}
export type SleuthStatus = {
  llm: boolean
  toolServer: boolean
  active: number
  spentTodayUsd: number
  dailyCapUsd: number
  defaults: { model: string; steps: number; usd: number }
  /** Providers that can see images and call tools, in router order. */
  providers: { id: string; model: string; free: boolean; available: boolean; lastError?: string }[]
  /** "Look harder" levels (Claude), empty without a key. */
  harder: string[]
}

type State = {
  open: boolean
  /** A live item to geolocate (prefills the form). */
  item?: Feature
  run?: SleuthRun
  status?: SleuthStatus
  busy: boolean
  error?: string
  /** Draw the finding on the globe. */
  shown: boolean
  openFor(item?: Feature): void
  close(): void
  refreshStatus(): Promise<void>
  start(body: FormData | Record<string, string>): Promise<void>
  harder(): Promise<void>
  cancel(): Promise<void>
  reset(): void
  show(v: boolean): void
}

let timer: ReturnType<typeof setTimeout> | undefined
const live = (r?: SleuthRun) => r?.status === 'intake' || r?.status === 'running'

async function json<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
  return j
}

export const useSleuth = create<State>((set, get) => {
  const poll = () => {
    clearTimeout(timer)
    const id = get().run?.id
    if (!id) return
    timer = setTimeout(async () => {
      try {
        const { run } = await json<{ run: SleuthRun }>(await fetch(`/api/sleuth/${id}`))
        if (get().run?.id !== id) return
        set({ run, ...(run.finding?.lat !== undefined && !live(run) ? { shown: true } : {}) })
        if (live(run)) poll()
      } catch {
        poll()
      }
    }, 2000)
  }
  const after = (run: SleuthRun) => {
    set({ run, busy: false, error: undefined })
    if (live(run)) poll()
  }
  const fail = (e: unknown) => set({ busy: false, error: e instanceof Error ? e.message : String(e) })

  return {
    open: false,
    busy: false,
    shown: false,
    openFor: (item) => {
      set({ open: true, item, ...(item ? { run: undefined, error: undefined } : {}) })
      void get().refreshStatus()
    },
    close: () => set({ open: false }),
    refreshStatus: async () => {
      try {
        set({ status: await json<SleuthStatus>(await fetch('/api/sleuth/status')) })
      } catch {
        /* the panel says the service is unavailable */
      }
    },
    start: async (body) => {
      set({ busy: true, error: undefined, run: undefined, shown: false })
      try {
        const init: RequestInit =
          body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        after((await json<{ run: SleuthRun }>(await fetch('/api/sleuth', init))).run)
      } catch (e) {
        fail(e)
      }
    },
    harder: async () => {
      const id = get().run?.id
      if (!id) return
      set({ busy: true, error: undefined })
      try {
        after((await json<{ run: SleuthRun }>(await fetch(`/api/sleuth/${id}/harder`, { method: 'POST' }))).run)
      } catch (e) {
        fail(e)
      }
    },
    cancel: async () => {
      const id = get().run?.id
      if (id) await fetch(`/api/sleuth/${id}/cancel`, { method: 'POST' }).catch(() => {})
    },
    reset: () => {
      clearTimeout(timer)
      set({ run: undefined, error: undefined, item: undefined, shown: false })
    },
    show: (v) => set({ shown: v }),
  }
})

/** The picture a live item carries, if any (same rule as the server's imageOf). */
export function imageOf(f: Feature): string | undefined {
  const p = f.props as Record<string, unknown>
  const media = p.media as { thumb?: string } | string | undefined
  const cands = [typeof media === 'object' ? media?.thumb : media, p.thumb, p.image, p.thumbnail, p.photo]
  return cands.find((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
}

/** Reverse image search in the analyst's own browser (free, and not blocked like a datacenter IP). */
export const reverseLinks = (url: string) => [
  ['Google Lens', `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}`],
  ['Yandex', `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(url)}`],
  ['Bing', `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodeURIComponent(url)}`],
  ['TinEye', `https://tineye.com/search?url=${encodeURIComponent(url)}`],
]
