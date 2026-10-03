import { useEffect } from 'react'
import { LAYERS } from '../layers'
import { useStore } from './store'
import type { LayerResponse } from '../../shared/feature'

/** Polls the API for every enabled layer. Mount once at the app root. */
export function useLayerData() {
  const enabledKey = useStore((s) =>
    LAYERS.filter((l) => s.layers[l.id].enabled)
      .map((l) => l.id)
      .join(','),
  )

  useEffect(() => {
    const ids = enabledKey ? enabledKey.split(',') : []
    const controllers: AbortController[] = []
    const timers: number[] = []

    for (const id of ids) {
      const def = LAYERS.find((l) => l.id === id)!
      const ac = new AbortController()
      controllers.push(ac)

      const load = async () => {
        const { setLoading, setData, setError } = useStore.getState()
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
      timers.push(window.setInterval(load, def.refreshMs))
    }

    return () => {
      controllers.forEach((c) => c.abort())
      timers.forEach((t) => clearInterval(t))
    }
  }, [enabledKey])
}
