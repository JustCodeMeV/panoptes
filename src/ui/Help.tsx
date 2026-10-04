import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '../../gui_elements/Controls'
import { Panel } from '../../gui_elements/Panel'
import { Scroller } from '../../gui_elements/Scroller'

const SECTIONS: [string, string[]][] = [
  ['The map', [
    'Drag to rotate, scroll to zoom. The strip at the bottom has zoom, rotate, tilt, places, sky and home.',
    'Each pin is an item from a layer. Click it to open it in the ANALYSIS panel on the right. Numbers are clusters: click to spread or zoom in.',
    'Pin shape tells how sure the position is: solid = exact, framed = approximate (area or country centre), corner ticks = inferred from the text. The Key at the bottom of the left panel explains every colour.',
  ]],
  ['Layers', [
    'The left panel groups layers by theme. Switch a whole group or a single layer on and off; the arrow opens a layer to see its sources and its items.',
    'News, Telegram, statements and research are claims, not facts: each item shows who said it and how that source is funded and controlled.',
  ]],
  ['Countries, regions, cities', [
    'Click any country for its atlas profile: people, economy, trade, strategic assets, relations and what is happening there now. Diplomacy and trade map modes colour its partners.',
    'Click inside the open country to open a region, or click a city name or dot to open the city.',
  ]],
  ['Search', [
    'Type in the search box (or press ⌘K / Ctrl+K): countries, places, items on the map and investigation entities in one list. Arrow keys and Enter to open.',
  ]],
  ['Investigate', [
    'On any item, Investigate opens it as entities (event, places, actors, sources, claims) on a graph.',
    'Click an entity and run transforms to expand it: who reported it, actors, nearby events, official reactions, news and Telegram search now, and more. 💲 transforms search X, TikTok and Instagram and cost a little credit.',
  ]],
  ['Cases', [
    'Add to case saves a frozen copy of an item. Case mode (left panel) opens a full-screen workbench: tag evidence as supporting or refuting, write hypotheses and notes, grow the graph, read the timeline, export a PDF.',
  ]],
  ['Back in time', [
    '◷ Timeline above the globe controls replays the last days: drag the slider or press Play to see when things appeared. Live returns to now.',
  ]],
  ['Watch and alerts', [
    'Region Watch: draw a circle around a place; anything new inside it raises an alert in the live feed.',
    'The news feed on the right updates live; click a row to open it.',
  ]],
]

/** Basic usage, in one panel. */
export function Help({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed top-1/2 left-1/2 z-40 w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2" role="dialog" aria-label="How to use ARGUS">
      <Panel>
        <Scroller innerClassName="max-h-[calc(100vh-96px)] pr-2">
          <div className="mb-3 flex items-center gap-3">
            <span className="sub t-label text-accent">How to use ARGUS</span>
            <span className="ml-auto">
              <IconButton icon="close" onClick={onClose} />
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {SECTIONS.map(([title, lines]) => (
              <section key={title}>
                <h3 className="sub t-caption mb-1 text-accent-2">{title}</h3>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {lines.map((l) => (
                    <li key={l} className="t-body leading-snug">{l}</li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="t-caption text-dim">▶ Run demo plays a scripted walk-through of one rumour from first post to debunk. Esc closes this panel.</p>
          </div>
        </Scroller>
      </Panel>
    </div>,
    document.querySelector('.argus') ?? document.body,
  )
}
