import { useEffect } from 'react'
import { LAYERS } from '../layers'
import { useStore } from './store'
import { LIVE_EVENT_TYPES, type LiveEvent } from '../../shared/live'
import type { LayerResponse } from '../../shared/feature'
import type { LayerDef } from './types'

/** How often a polled layer refetches, or null for "fetch once" (`refreshMs: 0`, e.g. the client-only atlas). */
export const pollEvery = (def: Pick<LayerDef, 'refreshMs'>): number | null => (def.refreshMs > 0 ? def.refreshMs : null)

/**
 * Keeps every enabled layer fresh. Polled layers refetch on an interval;
 * `stream` layers hold an EventSource (auto-reconnecting) and get pushed updates.
 * Mount once at the app root.
 */
export function useLayerData() {
  const enabledKey = useStore((s) =>
    LAYERS.filter((l) => s.layers[l.id].enabled)
      .map((l) => l.id)
      .join(','),
  )

  useEffect(() => {
    const ids = enabledKey ? enabledKey.split(',') : []
    const cleanups: (() => void)[] = []

    for (const id of ids) {
      const def = LAYERS.find((l) => l.id === id)!
      const { setLoading, setData, setError, setLive, applyLive } = useStore.getState()

      if (def.stream) {
        setLoading(id, true)
        const es = new EventSource(def.stream)
        es.onopen = () => setLive(id, { connected: true })
        es.onerror = () => setLive(id, { connected: false })
        es.addEventListener('snapshot', (m) => {
          const snap = JSON.parse((m as MessageEvent).data) as LayerResponse
          setData(id, snap)
          useStore.getState().seedTicker(id, snap.features)
          setLive(id, { connected: true, lastEventAt: Date.now() })
        })
        for (const type of LIVE_EVENT_TYPES) {
          es.addEventListener(type, (m) => applyLive(id, JSON.parse((m as MessageEvent).data) as LiveEvent))
        }
        cleanups.push(() => {
          es.close()
          setLive(id, { connected: false })
        })
        continue
      }

      const ac = new AbortController()
      const load = async () => {
        setLoading(id, true)
        try {
          const res = await fetch(`/api/layers/${id}`, { signal: ac.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          setData(id, (await res.json()) as LayerResponse)
        } catch (e) {
          if (!ac.signal.aborted) setError(id, e instanceof Error ? e.message : String(e))
        }
      }
      void load()
      // setInterval(fn, 0) would refetch every few milliseconds, forever
      const every = pollEvery(def)
      const timer = every ? window.setInterval(load, every) : 0
      cleanups.push(() => {
        ac.abort()
        clearInterval(timer)
      })
    }
    return () => cleanups.forEach((c) => c())
  }, [enabledKey])
}
