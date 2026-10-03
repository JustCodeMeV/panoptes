import { Badge } from '../../gui_elements/Badge'
import { FeedItem, type FeedEntry } from '../../gui_elements/Composites'
import { AnimatedList } from '../../gui_elements/Motion'
import { featuresOf, useStore } from '../core/store'
import { LAYERS } from '../layers'
import { ago, useNow } from './useNow'

/** Live feed: events from every push layer, newest first. New rows push the list down. */
export function LiveFeed() {
  const ticker = useStore((s) => s.ticker)
  const live = useStore((s) => s.live)
  const layers = useStore((s) => s.layers)
  const select = useStore((s) => s.select)
  const now = useNow(1000)
  const streams = LAYERS.filter((l) => l.stream)
  if (!streams.length) return null
  const active = streams.filter((l) => layers[l.id].enabled)
  const connected = active.length > 0 && active.some((l) => live[l.id]?.connected)
  const rate = active.reduce((n, l) => n + (live[l.id]?.eventsPerMin ?? 0), 0)
  const last = Math.max(0, ...active.map((l) => live[l.id]?.lastEventAt ?? 0))
  const idle = last ? Math.round((now - last) / 1000) : undefined

  const featureOf = new Map<string, string>()
  const rows: FeedEntry[] = ticker
    .filter((t) => layers[t.layerId]?.enabled)
    .slice(0, 6)
    .map((t) => {
      const def = LAYERS.find((l) => l.id === t.layerId)
      const f = featuresOf(layers[t.layerId]).find((x) => x.id === t.featureId)
      featureOf.set(t.key, t.featureId)
      return {
        id: t.key,
        title: t.title,
        sub: [def?.label, t.detail].filter(Boolean).join(' · '),
        p: f?.geoPrecision ?? 'none',
        time: ago(t.at, now),
        viewers: t.badge,
        color: t.color,
      }
    })

  return (
    <section className="mt-4 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="sub t-label text-accent">Live feed</span>
        <Badge tone={connected ? 'live' : 'warn'}>{connected ? 'Live' : 'Reconnecting'}</Badge>
      </div>
      <p className="sub t-caption mt-1 text-dim">
        {rate} events/min{idle !== undefined && idle > 20 ? ` · quiet ${idle}s` : ''}
      </p>
      {rows.length === 0 ? (
        <p className="t-caption mt-2 text-dim">Listening… new stories and market moves appear here the moment they happen.</p>
      ) : (
        <div className="-mx-1.5 mt-2">
          <AnimatedList items={rows} render={(e) => <FeedItem entry={e} onClick={() => select(featureOf.get(e.id) ?? null)} />} />
        </div>
      )}
    </section>
  )
}
