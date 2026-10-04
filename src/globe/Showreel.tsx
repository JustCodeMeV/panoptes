import { useEffect, useRef } from 'react'
import { Cartesian3, Math as CMath } from 'cesium'
import { useArgusControls } from '../../gui_elements/context'
import { openCountry, useAtlas } from '../core/atlas'
import { featuresOf, useStore } from '../core/store'
import { useInvestigation } from '../core/investigation'
import { LAYERS } from '../layers'
import { HOME, useGlobeUi } from './globeUi'
import { useViewer } from './viewerContext'

/**
 * SHOWREEL: a ~40 s choreographed run through the interface for presentations. It drives the real
 * controls (the same buttons and state a person uses): night sky, satellite day view, every layer
 * on, a close tilted pass over central Europe with live flashes, a country and a story opened and
 * clicked through, panels folded and unfolded, colour schemes, the left panel, other globe views,
 * and it ends on a centred Earth turning slowly. Shift+D starts and stops it, Esc stops it, and
 * `?showreel` in the address starts it once the globe has loaded.
 */

const sleep = (ms: number, s: AbortSignal) =>
  new Promise<void>((res, rej) => {
    if (s.aborted) return rej(new Error('stopped'))
    const t = setTimeout(res, ms)
    s.addEventListener('abort', () => (clearTimeout(t), rej(new Error('stopped'))), { once: true })
  })

/** Presses an on-screen control by its label, like a person would. */
const press = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label^="${label}"]`)?.click()

/** Central Europe, the close pass's centre */
const EUROPE = { lon: 12, lat: 49 }
const inEurope = (p?: { lat: number; lon: number }) => !!p && p.lat > 42 && p.lat < 56 && p.lon > -2 && p.lon < 28

export function Showreel() {
  const viewer = useViewer()!
  const controls = useArgusControls()
  // The latest controls for the running script (they change identity every render)
  const ctl = useRef(controls)
  useEffect(() => {
    ctl.current = controls
  })
  const ready = useGlobeUi((s) => s.ready)
  const run = useRef<AbortController | null>(null)

  useEffect(() => {
    const fly = (lon: number, lat: number, height: number, pitchDeg: number, heading: number, seconds: number) =>
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, height),
        orientation: { heading: CMath.toRadians(heading), pitch: CMath.toRadians(pitchDeg), roll: 0 },
        duration: seconds,
      })
    const ui = () => useGlobeUi.getState()
    const set = (key: 'sky' | 'darkSide' | 'places', on: boolean) => {
      const s = ui()
      if (s[key] !== on) (key === 'sky' ? s.toggleSky : key === 'darkSide' ? s.toggleDarkSide : s.togglePlaces)()
    }
    /** Live flashes over the area in view: the same burst a new story gets. */
    const flash = (n: number) => {
      const st = useStore.getState()
      const ids = LAYERS.flatMap((d) => featuresOf(st.layers[d.id]))
        .filter((f) => inEurope(f.position) && !f.geometry)
        .sort(() => Math.random() - 0.5)
        .slice(0, n)
        .map((f) => f.id)
      const now = Date.now()
      useStore.setState((s) => ({ fresh: { ...s.fresh, ...Object.fromEntries(ids.map((id, i) => [id, now + i])) } }))
    }
    const shell = (left: boolean, right: boolean) => {
      const sq = [...document.querySelectorAll<HTMLButtonElement>('.min-sq')]
      const want = [left, right]
      sq.slice(0, 2).forEach((b, i) => (b.getAttribute('aria-label') === 'Expand') !== want[i] && b.click())
    }

    async function play(s: AbortSignal) {
      const colour = ctl.current.colour
      // Opening: a clean wireframe globe, whole, centred on Europe
      useStore.getState().select(null)
      useInvestigation.getState().close()
      ctl.current.setSatellite(false)
      set('sky', false)
      set('places', false)
      if (useGlobeUi.getState().spin) useGlobeUi.getState().setSpin(false)
      fly(HOME.lon, 38, 26_000_000, -90, 0, 1.6)
      await sleep(1800, s)

      // Space, then the satellite day view, then every data layer
      set('sky', true)
      await sleep(1300, s)
      set('darkSide', false)
      ctl.current.setSatellite(true)
      await sleep(1300, s)
      useStore.getState().setEnabled(LAYERS.filter((d) => !d.hidden).map((d) => d.id), true)
      await sleep(1000, s)

      // A close, tilted pass over central Europe, data flashing in
      fly(EUROPE.lon, EUROPE.lat - 9, 1_400_000, -38, 8, 3.2)
      await sleep(3400, s)
      flash(10)
      await sleep(1200, s)
      flash(10)
      await sleep(1000, s)

      // A zone: Germany's profile, its diplomacy and trade maps
      await openCountry('Germany')
      await sleep(2600, s)
      useAtlas.getState().setLens('trade')
      await sleep(1800, s)
      useAtlas.getState().setLens('diplomacy')
      await sleep(1300, s)

      // A live story from the region, then the same story as an investigation graph
      const st = useStore.getState()
      const story = ['news', 'telegram', 'unrest', 'events'].flatMap((id) => featuresOf(st.layers[id])).find((f) => inEurope(f.position))
      if (story) {
        st.select(story.id)
        await sleep(2200, s)
        void useInvestigation.getState().seed(story.id)
        await sleep(3000, s)
        useInvestigation.getState().close()
      }
      await sleep(300, s)

      // Panels fold away and come back
      shell(true, true)
      await sleep(1700, s)
      shell(false, false)
      await sleep(1500, s)

      // Back out to the whole globe, through the colour schemes
      fly(EUROPE.lon, 35, 18_000_000, -90, 0, 2)
      for (const c of [0, 4, 3, 1]) {
        ctl.current.setColour(c)
        await sleep(650, s)
      }
      ctl.current.setColour(colour)

      // The left panel: a group of layers, focused and closed again
      const tri = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) =>
        b.parentElement?.querySelector('[role=switch][aria-label="Telegram Scouts"]'),
      )
      tri?.click()
      await sleep(1600, s)
      tri?.click()
      await sleep(900, s)

      // Other views of the Earth: night lights, the wireframe, place names, a 3D tilt
      set('darkSide', true)
      await sleep(1400, s)
      ctl.current.setSatellite(false)
      await sleep(1200, s)
      ctl.current.setSatellite(true)
      set('places', true)
      press('3D tilt')
      await sleep(2000, s)
      press('3D tilt')
      await sleep(1200, s)

      // The end: the Earth centred, turning slowly and calmly under the stars
      useStore.getState().select(null)
      set('places', false)
      press('Reset view')
      await sleep(1700, s)
      useGlobeUi.getState().setSpin(true)
    }

    const start = () => {
      run.current?.abort()
      const ac = new AbortController()
      run.current = ac
      play(ac.signal).catch(() => {
        /* stopped */
      })
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.key === 'Escape') run.current?.abort()
      if (e.shiftKey && e.code === 'KeyD' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        if (run.current && !run.current.signal.aborted) run.current.abort()
        else start()
      }
    }
    window.addEventListener('keydown', onKey)
    // Any click on the globe means a person has taken over
    const take = () => run.current?.abort()
    viewer.canvas.addEventListener('pointerdown', take)
    if (ready && new URLSearchParams(location.search).has('showreel') && !run.current) start()
    return () => {
      window.removeEventListener('keydown', onKey)
      viewer.canvas.removeEventListener('pointerdown', take)
    }
  }, [viewer, ready])

  useEffect(() => () => run.current?.abort(), [])

  return null
}
