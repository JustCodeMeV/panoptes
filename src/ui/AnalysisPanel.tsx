import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '../../gui_elements/Button'
import { durationMs } from '../../gui_elements/catalog'
import { Dock, FoldBody, Header } from '../../gui_elements/Composites'
import { useDesign } from '../../gui_elements/context'
import { RollUp } from '../../gui_elements/Motion'
import { Panel } from '../../gui_elements/Panel'
import { Scroller } from '../../gui_elements/Scroller'
import { useCases } from '../core/cases'
import { useInvestigation } from '../core/investigation'
import { srcTag, translatedFrom } from '../../shared/lang'
import { featuresOf, useSelected, useStore } from '../core/store'
import { LAYERS } from '../layers'
import { VERDICT_COLOR, VERDICT_LABEL, checkOf } from '../layers/x/props'
import { NewsFeedHead, NewsFeedList } from './NewsFeed'
import { useShell, type PanelBox } from './shell'

/** First line of a machine-translated story: where it came from, and the original on demand. */
function Translated({ props }: { props: Record<string, unknown> }) {
  const [show, setShow] = useState(false)
  const from = translatedFrom(props)
  if (!from) return null
  const original = props.original as { title: string; text?: string }
  return (
    <div className="mb-3 border-l-2 border-warn/70 pl-2">
      <div className="flex items-center gap-2">
        <span className="sub t-caption flex-1 text-warn">
          {srcTag(props)} Original info in {from.name}
        </span>
        <button type="button" onClick={() => setShow(!show)} className="sub t-caption cursor-pointer text-accent-2 hover:text-accent">
          {show ? 'Hide original' : 'Show original'}
        </button>
      </div>
      {show && (
        <p className="t-caption mt-1.5 whitespace-pre-line text-dim" lang={String(props.lang)}>
          {original.text ?? original.title}
        </p>
      )}
    </div>
  )
}

/** When Grok has checked this story on X: its verdict, one click from the full reading. */
function XSecondOpinion({ storyId }: { storyId: string }) {
  const check = useStore((s) => featuresOf(s.layers.x).find((f) => f.props.storyId === storyId))
  const select = useStore((s) => s.select)
  if (!check) return null
  const c = checkOf(check)
  return (
    <button
      type="button"
      onClick={() => select(check.id)}
      className="mb-3 flex w-full cursor-pointer items-center gap-2 border border-line px-2.5 py-2 text-left transition-colors hover:border-accent-2/60"
    >
      <span className="sub t-label" style={{ color: VERDICT_COLOR[c.verdict] }}>
        𝕏 {VERDICT_LABEL[c.verdict]}
      </span>
      <span className="t-caption text-dim">{c.confidence}% · Grok read {c.posts.length} posts</span>
      <span className="ml-auto text-accent-2">›</span>
    </button>
  )
}

/** The open story: its layer's detail view, the stack chooser for co-located items, and "Add to case". */
function Story() {
  const feature = useSelected()
  const select = useStore((s) => s.select)
  const stack = useStore((s) => s.stack)
  const layers = useStore((s) => s.layers)
  const addToCase = useCases((s) => s.add)
  const toast = useCases((s) => s.toast)
  const def = feature && LAYERS.find((l) => l.id === feature.layerId)
  if (!feature || !def?.Detail) return null
  const Detail = def.Detail
  const allFeatures = stack.length > 1 ? Object.values(layers).flatMap(featuresOf) : []

  return (
    <div className="dock-body mt-4 border-t border-line pt-3 [animation:da-fade_var(--dur)_var(--ease)_both]" style={{ '--c': def.color } as CSSProperties} key={feature.id}>
      <Dock kind={def.label} title={feature.title} onClose={() => select(null)}>
        <Translated props={feature.props} />
        <XSecondOpinion storyId={feature.id} />
        {stack.length > 1 && (
          <Scroller className="mb-3 border border-line" innerClassName="flex max-h-36 flex-col gap-0.5 p-2">
            <span className="sub t-label mb-1 text-dim">{stack.length} items at this location</span>
            {stack.map((id) => {
              const f = allFeatures.find((x) => x.id === id)
              return f ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => select(id)}
                  className={`t-caption cursor-pointer truncate px-1.5 py-1 text-left ${id === feature.id ? 'bg-accent-2/15 text-accent' : 'hover:bg-ink/5'}`}
                >
                  {f.title}
                </button>
              ) : null
            })}
          </Scroller>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void addToCase(feature)}>
            {toast ?? '＋ Add to case'}
          </Button>
          <Button variant="secondary" onClick={() => void useInvestigation.getState().seed(feature.id)} title="Open this item as entities (events, places, actors, sources, claims) and expand them">
            ◆ Investigate
          </Button>
        </div>
        <div className="mt-3">
          <Detail feature={feature} select={select} />
        </div>
      </Dock>
    </div>
  )
}

/**
 * Right panel, always on screen: ANALYSIS and the news feed heading stay pinned; the feed and the
 * open story scroll beneath. Minimising rolls it up to the feed heading, then the globe controls
 * glide out to the screen edge; restoring brings the controls back first, then rolls it open.
 */
export function AnalysisPanel({ box }: { box: PanelBox }) {
  const rightMin = useShell((s) => s.rightMin)
  const setShell = useShell((s) => s.set)
  const dur = durationMs(useDesign())
  const [feedOpen, setFeedOpen] = useState(true)
  const story = useRef<HTMLDivElement>(null)
  const selectedId = useSelected()?.id

  const minimise = () => {
    setShell({ rightMin: true })
    setTimeout(() => setShell({ toolOut: true }), dur)
  }
  const restore = () => {
    setShell({ toolOut: false })
    setTimeout(() => setShell({ rightMin: false }), dur)
  }

  // Opening a story brings the panel back if minimised, and scrolls the story into view
  useEffect(() => {
    if (!selectedId) return
    if (useShell.getState().rightMin) restore()
    const t = setTimeout(() => story.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return (
    // Only as tall as its content, up to the layout's full height
    <div className="absolute z-10 flex flex-col" style={{ right: box.inset, top: box.top, width: box.width, maxHeight: box.height }}>
      <RollUp minimized={rightMin} className="flex min-h-0 flex-col">
        <Panel className="min-h-0" onMinimize={rightMin ? restore : minimise} minimized={rightMin}>
          <div className="flex min-h-0 flex-auto flex-col">
            {/* Pinned: minimised, the panel ends on this block's bottom line */}
            <div data-roll-keep="flush" className="flex-none border-b border-line/60 pb-3">
              <Header name="ANALYSIS" />
              <div className="mt-3">
                <NewsFeedHead open={feedOpen} onToggle={() => setFeedOpen(!feedOpen)} />
              </div>
            </div>
            <Scroller className="flex-auto" innerClassName="pr-2.5">
              <FoldBody open={feedOpen}>
                <NewsFeedList />
              </FoldBody>
              <div ref={story} className="scroll-mt-2">
                <Story />
              </div>
            </Scroller>
          </div>
        </Panel>
      </RollUp>
    </div>
  )
}
