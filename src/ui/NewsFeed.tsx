import { Badge } from '../../gui_elements/Badge'
import { FeedItem, FoldToggle, type FeedEntry } from '../../gui_elements/Composites'
import { AnimatedList } from '../../gui_elements/Motion'
import { srcTag } from '../../shared/lang'
import { featuresOf, useStore } from '../core/store'
import { LAYERS } from '../layers'
import { ago, useNow } from './useNow'

const STREAMS = LAYERS.filter((l) => l.stream)

/** Connection, rate and quiet time across the enabled push layers. */
function useNewsStatus() {
  const live = useStore((s) => s.live)
  const layers = useStore((s) => s.layers)
  const now = useNow(1000)
  const active = STREAMS.filter((l) => layers[l.id].enabled)
  const connected = active.length > 0 && active.some((l) => live[l.id]?.connected)
  const rate = active.reduce((n, l) => n + (live[l.id]?.eventsPerMin ?? 0), 0)
  const last = Math.max(0, ...active.map((l) => live[l.id]?.lastEventAt ?? 0))
  const idle = last ? Math.round((now - last) / 1000) : undefined
  return { connected, rate, idle }
}

/** News feed heading: title, events per minute, the LIVE light and the fold toggle. Stays visible when its panel is minimised. */
export function NewsFeedHead({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { connected, rate, idle } = useNewsStatus()
  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} className="sub t-label min-w-0 flex-1 cursor-pointer text-left text-accent">
          News feed
        </button>
        <Badge tone={connected ? 'live' : 'warn'}>{connected ? 'Live' : 'Reconnecting'}</Badge>
        <FoldToggle open={open} onToggle={onToggle} label="News feed" />
      </div>
      <p className="sub t-caption mt-1 text-dim">
        {rate} events/min{idle !== undefined && idle > 20 ? ` · quiet ${idle}s` : ''}
      </p>
    </div>
  )
}

/** The newest events from every push layer. New rows push the list down. */
export function NewsFeedList() {
  const ticker = useStore((s) => s.ticker)
  const layers = useStore((s) => s.layers)
  const select = useStore((s) => s.select)
  const now = useNow(1000)

  const featureOf = new Map<string, string>()
  const rows: FeedEntry[] = ticker
    .filter((t) => layers[t.layerId]?.enabled)
    .slice(0, 8)
    .map((t) => {
      const def = LAYERS.find((l) => l.id === t.layerId)
      const f = featuresOf(layers[t.layerId]).find((x) => x.id === t.featureId)
      featureOf.set(t.key, t.featureId)
      return {
        id: t.key,
        title: t.title,
        sub: [f && srcTag(f.props), def?.label, t.detail].filter(Boolean).join(' · '),
        p: f?.geoPrecision ?? 'none',
        time: ago(t.at, now),
        viewers: t.badge,
        color: t.color,
      }
    })

  return rows.length === 0 ? (
    <p className="t-caption pt-2 text-dim">Listening… new stories and market moves appear here the moment they happen.</p>
  ) : (
    <div className="-mx-1.5 pt-2">
      <AnimatedList items={rows} render={(e) => <FeedItem entry={e} onClick={() => select(featureOf.get(e.id) ?? null)} />} />
    </div>
  )
}
