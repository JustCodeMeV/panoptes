// Every design option for ATLAS. A Design picks one index per category; design.ts holds the chosen one.
import type { CSSProperties } from 'react'

type TitleFont = { name: string; family: string; track: string; weight: number }
type SubFont = { name: string; family: string; track: string; upper: boolean }
type Font = { name: string; family: string }
type Colour = { name: string; bg: string; panel: string; line: string; ink: string; dim: string; accent: string; accent2: string; alert: string }
type Surface = { name: string; fill: string; drop?: string; blur?: string; inset?: string }
type Glow = { name: string; text: string; box: string; drop: string; panel: string; anim?: string; elAnim?: string; panelAnim?: string; overlay?: string }

const fonts = (list: string[]): Font[] => list.map((f) => ({ name: f, family: f }))

export const TITLE_FONTS: TitleFont[] = [
  { name: 'Michroma', family: 'Michroma', track: '0.3em', weight: 400 },
  { name: 'Antonio', family: 'Antonio', track: '0.16em', weight: 600 },
  { name: 'Orbitron', family: 'Orbitron', track: '0.28em', weight: 600 },
  { name: 'Rajdhani', family: 'Rajdhani', track: '0.34em', weight: 600 },
  { name: 'Space Grotesk', family: 'Space Grotesk', track: '0.32em', weight: 600 },
  { name: 'Oxanium', family: 'Oxanium', track: '0.3em', weight: 600 },
  { name: 'Chakra Petch', family: 'Chakra Petch', track: '0.3em', weight: 600 },
  { name: 'Syncopate', family: 'Syncopate', track: '0.26em', weight: 700 },
  { name: 'Geist', family: 'Geist', track: '0.4em', weight: 600 },
  { name: 'Saira Condensed', family: 'Saira Condensed', track: '0.28em', weight: 600 },
]

export const MAIN_FONTS = fonts(['Manrope', 'Inter', 'Exo 2', 'IBM Plex Sans', 'Space Grotesk', 'Geist', 'Inter Tight', 'Saira', 'Sora', 'DM Sans'])

export const SUB_FONTS: SubFont[] = [
  { name: 'Tomorrow', family: 'Tomorrow', track: '0.14em', upper: true },
  { name: 'Tektur', family: 'Tektur', track: '0.12em', upper: true },
  { name: 'Chakra Petch', family: 'Chakra Petch', track: '0.14em', upper: true },
  { name: 'Oxanium', family: 'Oxanium', track: '0.14em', upper: true },
  { name: 'Share Tech', family: 'Share Tech', track: '0.16em', upper: true },
  { name: 'Aldrich', family: 'Aldrich', track: '0.12em', upper: true },
  { name: 'Quantico', family: 'Quantico', track: '0.14em', upper: true },
  { name: 'Electrolize', family: 'Electrolize', track: '0.14em', upper: true },
  { name: 'Stick No Bills', family: 'Stick No Bills', track: '0.16em', upper: true },
  { name: 'Major Mono Display', family: 'Major Mono Display', track: '0.06em', upper: false },
]

export const NEWS_FONTS = fonts(['Newsreader', 'Source Serif 4', 'Literata', 'IBM Plex Serif', 'Lora', 'Merriweather', 'Fraunces', 'Spectral', 'Crimson Pro', 'Inter'])

export const MONO_FONTS = fonts(['JetBrains Mono', 'IBM Plex Mono', 'Share Tech Mono', 'Space Mono', 'Fira Code', 'DM Mono', 'Roboto Mono', 'Geist Mono', 'VT323', 'Major Mono Display'])

export const COLOURS: Colour[] = [
  { name: 'Bridge Cyan', bg: '#04070d', panel: '#0a101c', line: '#1b2536', ink: '#e6edf7', dim: '#7d8799', accent: '#5ce1ff', accent2: '#7c9cff', alert: '#ff3b47' },
  { name: 'Starfleet Amber', bg: '#07060a', panel: '#110e14', line: '#2a2230', ink: '#f4ece2', dim: '#9a8f86', accent: '#ffb547', accent2: '#c98cff', alert: '#ff5a4e' },
  { name: 'Arctic', bg: '#05080c', panel: '#0c1218', line: '#1f2a35', ink: '#eef5fb', dim: '#8293a3', accent: '#bfe6ff', accent2: '#7fd1ff', alert: '#ff6b6b' },
  { name: 'Emerald Ops', bg: '#030806', panel: '#08120e', line: '#16281f', ink: '#e3f5ec', dim: '#76917f', accent: '#3dffa8', accent2: '#2ad4ff', alert: '#ff4d5e' },
  { name: 'Violet Nebula', bg: '#06050c', panel: '#0f0c1a', line: '#251f3a', ink: '#ece8fb', dim: '#8a83a8', accent: '#b18cff', accent2: '#ff7ad9', alert: '#ff4d6d' },
  { name: 'Red Alert', bg: '#080506', panel: '#130b0d', line: '#2e1a1e', ink: '#f6e9ea', dim: '#9a8487', accent: '#ff4d5e', accent2: '#ffb347', alert: '#ffd23f' },
  { name: 'Gilded', bg: '#070605', panel: '#100e0b', line: '#2a251d', ink: '#f3ede2', dim: '#968c7c', accent: '#d8b46a', accent2: '#f0e2c0', alert: '#ff5a4e' },
  { name: 'Monochrome', bg: '#050505', panel: '#0e0e10', line: '#242428', ink: '#f2f2f4', dim: '#85858d', accent: '#ffffff', accent2: '#a0a0a8', alert: '#ff3b47' },
  { name: 'Teal Ember', bg: '#040808', panel: '#0a1314', line: '#1a2a2b', ink: '#e6f3f2', dim: '#7c9493', accent: '#2ee6d6', accent2: '#ff8a3d', alert: '#ff4d5e' },
  { name: 'Deep Navy', bg: '#050917', panel: '#0b1226', line: '#1c2747', ink: '#e7ecfb', dim: '#8590b3', accent: '#7aa2ff', accent2: '#5ce1ff', alert: '#ff4d6d' },
]

const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`
const NOISE = svg(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .11 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)
const HEXMESH = svg(
  "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='48'><path d='M14 0L28 8V24L14 32L0 24V8ZM14 32V48' fill='none' stroke='#7fd1ff' stroke-opacity='.11'/></svg>",
)
const a2 = (p: number) => `color-mix(in srgb, var(--color-accent-2) ${p}%, transparent)`
const panelMix = (mix: string) => `color-mix(in srgb, var(--color-panel) ${mix})`

const SURFACES: Surface[] = [
  { name: 'Flat', fill: 'var(--color-panel)' },
  { name: 'Frosted glass', fill: panelMix('50%, transparent'), blur: 'blur(14px) saturate(150%)', inset: 'inset 0 1px 0 rgba(255,255,255,.07)' },
  { name: 'Deep shadow', fill: 'var(--color-panel)', drop: 'drop-shadow(0 22px 22px rgba(0,0,0,.8))' },
  { name: 'Hard offset', fill: 'var(--color-panel)', drop: `drop-shadow(7px 7px 0 ${a2(30)})` },
  {
    name: 'Bevel',
    fill: `linear-gradient(180deg, ${panelMix('88%, white')}, var(--color-panel) 35%, ${panelMix('70%, black')})`,
    inset: 'inset 0 1px 0 rgba(255,255,255,.14), inset 0 -2px 0 rgba(0,0,0,.45)',
  },
  { name: 'Sheen', fill: `linear-gradient(115deg, var(--color-panel) 0 38%, ${panelMix('86%, var(--color-accent-2)')} 50%, var(--color-panel) 62%)` },
  {
    name: 'Grit',
    fill: `${NOISE}, radial-gradient(circle at 85% 90%, rgba(0,0,0,.45), transparent 40%), radial-gradient(circle at 10% 20%, rgba(120,140,150,.08), transparent 35%), var(--color-panel)`,
  },
  {
    name: 'Blueprint grid',
    fill: `linear-gradient(${a2(8)} 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, ${a2(8)} 1px, transparent 1px) 0 0 / 16px 16px, var(--color-panel)`,
  },
  { name: 'Hex mesh', fill: `${HEXMESH}, var(--color-panel)` },
  { name: 'Dot matrix', fill: `radial-gradient(${a2(20)} 1px, transparent 1.6px) 0 0 / 6px 6px, var(--color-panel)` },
]

const NO_DROP = 'drop-shadow(0 0 0 transparent)'
const SCAN = 'repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 1px, transparent 1px 3px), radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45))'

const GLOWS: Glow[] = [
  { name: 'Off', text: 'none', box: 'none', drop: NO_DROP, panel: NO_DROP },
  { name: 'Ice bloom', text: `0 0 18px ${a2(85)}`, box: `0 0 14px ${a2(45)}`, drop: `drop-shadow(0 0 6px ${a2(90)})`, panel: `drop-shadow(0 0 18px ${a2(32)})` },
  {
    name: 'Tron edge',
    text: `0 0 2px #fff, 0 0 10px ${a2(100)}, 0 0 26px ${a2(60)}`,
    box: `0 0 0 1px ${a2(80)}, 0 0 12px ${a2(55)}`,
    drop: `drop-shadow(0 0 3px ${a2(100)}) drop-shadow(0 0 10px ${a2(70)})`,
    panel: `drop-shadow(0 0 1.5px ${a2(100)}) drop-shadow(0 0 12px ${a2(55)})`,
  },
  {
    name: 'Neon tube',
    text: `0 0 1px #fff, 0 0 6px ${a2(100)}, 0 0 16px ${a2(90)}, 0 0 42px ${a2(60)}`,
    box: `0 0 6px ${a2(90)}, 0 0 22px ${a2(55)}`,
    drop: `drop-shadow(0 0 4px ${a2(100)}) drop-shadow(0 0 14px ${a2(80)})`,
    panel: `drop-shadow(0 0 8px ${a2(45)}) drop-shadow(0 0 32px ${a2(25)})`,
  },
  {
    name: 'CRT phosphor',
    text: `0 0 2px ${a2(100)}, 0 0 9px ${a2(80)}`,
    box: `0 0 10px ${a2(45)}`,
    drop: `drop-shadow(0 0 5px ${a2(75)})`,
    panel: `drop-shadow(0 0 22px ${a2(22)})`,
    anim: 'g-flicker 4.5s infinite',
    overlay: SCAN,
  },
  {
    name: 'Chromatic split',
    text: `-2px 0 0 rgba(255,60,130,.8), 2px 0 0 ${a2(95)}, 0 0 14px ${a2(45)}`,
    box: `-2px 0 0 rgba(255,60,130,.6), 2px 0 0 ${a2(80)}`,
    drop: `drop-shadow(-2px 0 0 rgba(255,60,130,.65)) drop-shadow(2px 0 0 ${a2(85)})`,
    panel: `drop-shadow(-3px 0 6px rgba(255,60,130,.3)) drop-shadow(3px 0 6px ${a2(40)})`,
  },
  {
    name: 'Breathing',
    text: `0 0 16px ${a2(90)}`,
    box: `0 0 14px ${a2(55)}`,
    drop: `drop-shadow(0 0 7px ${a2(95)})`,
    panel: `drop-shadow(0 0 16px ${a2(38)})`,
    anim: 'g-pulse-text 3s ease-in-out infinite',
    elAnim: 'g-pulse-el 3s ease-in-out infinite',
    panelAnim: 'g-pulse-panel 3s ease-in-out infinite',
  },
  { name: 'Underglow', text: `0 7px 16px ${a2(75)}`, box: `0 6px 14px ${a2(55)}`, drop: `drop-shadow(0 4px 6px ${a2(85)})`, panel: `drop-shadow(0 18px 20px ${a2(50)})` },
  {
    name: 'Glitch',
    text: `0 0 10px ${a2(65)}`,
    box: `0 0 10px ${a2(45)}`,
    drop: `drop-shadow(0 0 5px ${a2(70)})`,
    panel: `drop-shadow(0 0 12px ${a2(25)})`,
    anim: 'g-glitch 3.4s infinite',
    elAnim: 'g-glitch-el 3.4s infinite',
  },
  {
    name: 'Overdrive',
    text: `0 0 2px #fff, 0 0 8px #fff, 0 0 20px ${a2(100)}, 0 0 50px ${a2(85)}, 0 0 90px ${a2(55)}`,
    box: `0 0 6px #fff, 0 0 24px ${a2(90)}`,
    drop: `drop-shadow(0 0 5px #fff) drop-shadow(0 0 16px ${a2(100)}) drop-shadow(0 0 36px ${a2(70)})`,
    panel: `drop-shadow(0 0 3px ${a2(100)}) drop-shadow(0 0 24px ${a2(60)}) drop-shadow(0 0 60px ${a2(30)})`,
  },
]

type TypeScale = { name: string; title: number; h: number; body: number; label: number; caption: number }
type Semantic = { name: string; ok: string; warn: string; err: string; live: string }
type Palette = { name: string; colors: string[] }
type Motion = { name: string; dur: string; ease: string }

const TYPE_SCALES: TypeScale[] = [
  { name: 'Tight HUD', title: 18, h: 13, body: 12, label: 9, caption: 10 },
  { name: 'Compact', title: 20, h: 14, body: 12.5, label: 10, caption: 10.5 },
  { name: 'Standard', title: 22, h: 15, body: 13.5, label: 10.5, caption: 11 },
  { name: 'Comfortable', title: 24, h: 16, body: 14.5, label: 11, caption: 12 },
  { name: 'Editorial', title: 26, h: 19, body: 15, label: 11, caption: 12 },
  { name: 'Large display', title: 32, h: 18, body: 14, label: 11, caption: 12 },
  { name: 'Tiny caps', title: 20, h: 13, body: 13, label: 8.5, caption: 9.5 },
  { name: 'Brutalist', title: 40, h: 22, body: 15, label: 12, caption: 12 },
]

const SEMANTICS: Semantic[] = [
  { name: 'Arctic signal', ok: '#7fd1ff', warn: '#ffd479', err: '#ff6b6b', live: '#ff4d6d' },
  { name: 'Classic', ok: '#3ddc84', warn: '#ffb020', err: '#ff4d4f', live: '#ff2d55' },
  { name: 'Neon', ok: '#39ff14', warn: '#fff01f', err: '#ff073a', live: '#ff00e6' },
  { name: 'Muted', ok: '#8fbfa8', warn: '#d8c18a', err: '#d48a8a', live: '#e07b7b' },
  { name: 'Amber CRT', ok: '#ffd27a', warn: '#ffb000', err: '#ff5f1f', live: '#ff8c00' },
  { name: 'Mono + red', ok: '#e6e6e6', warn: '#b3b3b3', err: '#ff3b3b', live: '#ff3b3b' },
  { name: 'Synthwave', ok: '#00f0ff', warn: '#ffd319', err: '#ff2975', live: '#f222ff' },
  { name: 'Military', ok: '#9bbc5a', warn: '#e0c060', err: '#d9534f', live: '#ff7043' },
  { name: 'Infra-red', ok: '#ff9e80', warn: '#ffd180', err: '#ff1744', live: '#ff5252' },
  { name: 'Toxic', ok: '#b6ff00', warn: '#f7ff00', err: '#ff3d00', live: '#00ffa3' },
]

export const LAYER_PALETTES: Palette[] = [
  { name: 'Ice spectrum', colors: ['#bfe6ff', '#7fd1ff', '#4aa8ff', '#9f9bff', '#ff9ecf', '#ffd27a'] },
  { name: 'Signal', colors: ['#ff4d6d', '#ffb020', '#3ddc84', '#4aa8ff', '#b18cff', '#2ee6d6'] },
  { name: 'Neon', colors: ['#00f0ff', '#ff00e6', '#39ff14', '#fff01f', '#ff6b00', '#9d00ff'] },
  { name: 'Thermal', colors: ['#ffef5c', '#ffb000', '#ff6a00', '#ff2d55', '#c2185b', '#7b1fa2'] },
  { name: 'Tron', colors: ['#6ff3ff', '#ff9a3c', '#ffffff', '#2b8cff', '#ff4f4f', '#8cff66'] },
  { name: 'Pastel CRT', colors: ['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#ff8b94', '#b8b5ff'] },
  { name: 'Military', colors: ['#9bbc5a', '#c8b273', '#8a9a5b', '#d9a066', '#6b8e9e', '#b85c4a'] },
  { name: 'Synthwave', colors: ['#f222ff', '#ff2975', '#8c1eff', '#00f0ff', '#ffd319', '#ff901f'] },
  { name: 'Mono tints', colors: ['#ffffff', '#cfd8dc', '#90a4ae', '#607d8b', '#b0bec5', '#eceff1'] },
  { name: 'Toxic', colors: ['#b6ff00', '#00ffa3', '#00e5ff', '#f7ff00', '#ff3d00', '#d500f9'] },
]

const SPACINGS = [
  { name: 'Cockpit (tightest)', mult: 0.6 },
  { name: 'Dense', mult: 0.75 },
  { name: 'Compact', mult: 0.875 },
  { name: 'Standard', mult: 1 },
  { name: 'Airy', mult: 1.2 },
  { name: 'Spacious', mult: 1.4 },
]

export const MOTIONS: Motion[] = [
  { name: 'Snappy', dur: '160ms', ease: 'cubic-bezier(.2,.9,.3,1)' },
  { name: 'Smooth', dur: '320ms', ease: 'cubic-bezier(.4,0,.2,1)' },
  { name: 'Springy', dur: '450ms', ease: 'cubic-bezier(.3,1.5,.5,1)' },
  { name: 'Mechanical', dur: '320ms', ease: 'steps(4)' },
  { name: 'Cinematic', dur: '700ms', ease: 'cubic-bezier(.65,0,.35,1)' },
  { name: 'Glide', dur: '500ms', ease: 'cubic-bezier(.16,1,.3,1)' },
  { name: 'Hydraulic', dur: '420ms', ease: 'cubic-bezier(.7,0,.2,1)' },
  { name: 'Instant', dur: '1ms', ease: 'linear' },
]

const BUTTON_NAMES = ['Pill', 'Outline glow', 'Ghost', 'LCARS', 'Chamfer', 'Glass', 'Underline', 'Gradient', 'Rail', 'Square caps']
const FRAME_NAMES = ['Chamfer 2-corner', 'Chamfer 4-corner', 'HUD brackets', 'Notch', 'Side rail', 'Double line', 'Dashed + studs', 'Soft (rounded)', 'Cut + ticks', 'Header bar']
const TOGGLE_NAMES = ['Chamfer slide', 'Light cycle', 'Split ON/OFF', 'Bracket', 'Hazard', 'LED bar', 'Hex node', 'Grip rocker', 'Glitch', 'Reactor dial']
const BADGE_NAMES = ['Chamfer tag', 'Bracket', 'Blink dot', 'Hazard', 'Inverted block', 'Hex', 'Code', 'LCD', 'LCARS cap', 'Arrow ticker']
const CHECK_NAMES = ['Chamfer tick', 'Bracket [x]', 'LED', 'Slash', 'Diamond', 'Fill sweep', 'Hazard', 'Crosshair', 'Glyph ■', 'Notched']
const SEARCH_NAMES = ['Chamfer field', 'Terminal prompt', 'Bracket', 'Scan underline', 'Side rail', 'LCD', 'Label block', 'Corner ticks', 'Command (⌘K)', 'Ghost']
const SLIDER_NAMES = ['Chamfer thumb', 'Ruler needle', 'Segments', 'Bracket thumb', 'Gauge pointer', 'Rail fill', 'LCD bar', 'Dot track', 'Hex thumb', 'Window']
const MARKER_NAMES = ['Square', 'Diamond', 'Crosshair', 'Chamfer', 'Pulse', 'Bracket', 'Triangle', 'Target', 'Hex', 'Glyph tag']
const TOOLTIP_NAMES = ['Chamfer box', 'Leader line', 'Bracket', 'LCD', 'Side rail', 'Inverted block', 'Terminal', 'Corner ticks', 'Underline', 'Header strip']
const ICON_NAMES = ['Chamfer square', 'Bracket text', 'Ghost', 'Circle', 'LCD', 'Rail tab', 'Hex', 'Corner ticks', 'Caps words', 'Inverted']
const ICONSTYLE_NAMES = ['Thin line', 'Regular line', 'Bold line', 'Rounded', 'Duotone', 'Filled', 'Pixel', 'Boxed', 'Glyph (unicode)', 'Neon outline']
const SCROLLBAR_NAMES = ['Hairline', 'Thin accent', 'Rail track', 'Chamfer thumb', 'Hover reveal', 'LCD', 'Segmented', 'Wide block', 'Native']
const FOCUS_NAMES = ['Dashed accent', 'Solid offset', 'Glow', 'Dotted wide', 'Underline', 'Inverted', 'Double ring', 'Thick block']
const LAYOUT_NAMES = ['Classic: left panel, right dock', 'Left stack', 'Bottom sheet', 'Top bar + dock', 'Floating cards', 'Split 30/70', 'Cockpit (bars + sides)', 'Theater (globe first)']
const HEADER_NAMES = ['Wordmark', 'Wordmark + tagline', 'Bracketed', 'Rail header', 'LCARS bar', 'Glitch slash', 'Stacked + version', 'Mark + wordmark', 'Terminal', 'Inverted block']
const RESPONSIVE_NAMES = ['Collapse to icon rail', 'Bottom sheet', 'Tab bar', 'Overlay drawers', 'Modal detail']
const ZORDER_NAMES = ['Float over globe', 'Docked beside globe', 'Translucent overlay', 'Auto-hide panels']
const LAYERPANEL_NAMES = ['Sections + descriptions', 'Compact rows', 'Accordion', 'Tabs', 'Grid tiles', 'Terminal list', 'LCARS stack']
const LAYERROW_NAMES = ['Toggle left', 'Toggle right', 'Count first', 'Two-line status', 'Colour bar', 'Sparkline', 'Minimal']
const FEED_NAMES = ['Dot + two lines', 'Thumbnail card', 'One-line compact', 'Timeline', 'Ticker mono', 'Big headline', 'Rail select', 'Bracket select']
const DOCK_NAMES = ['Kind label + close', 'Tabbed', 'Hero media', 'Meta column', 'Terminal readout', 'LCARS']
const MEDIA_NAMES = ['Plain 16:9', 'HUD corners + REC', 'CRT scanlines', 'Chamfer frame', 'Letterbox + meta bar', 'Picture-in-picture']
const META_NAMES = ['Key / value table', 'Two-column grid', 'Inline chips', 'Terminal printout', 'LCD readouts', 'Timeline']
const LEGEND_NAMES = ['Horizontal row', 'Vertical list', 'Boxed key', 'Chips', 'LCD']
const TOAST_NAMES = ['Chamfer card', 'Side rail', 'Terminal line', 'Top banner', 'LCD', 'Inverted', 'Ticker strip']
const STATE_NAMES = ['Skeleton bars', 'Scan line', 'Spinner ring', 'Terminal dots', 'Radar sweep', 'NO SIGNAL glitch', 'Segment progress', 'Pulse']
const HUD_NAMES = ['Corner readouts', 'Bottom bar', 'Compass ring', 'Zoom stack', 'Center crosshair', 'Tron frame', 'LCARS side', 'Corner box']
const GLOBE_NAMES = ['Wireframe', 'Dot matrix', 'Solid dark', 'Hologram', 'Topo lines', 'Night lights', 'Blueprint', 'Thermal', 'CRT green', 'Ice']
const PIN_NAMES = ['Flat marker', 'Stem beacon', 'Floating label', 'Halo', 'Light beam', 'Ground ring', 'Spike']
const CLUSTER_NAMES = ['Circle count', 'Hex count', 'Chamfer box', 'Ring segments', 'Bracket count', 'Heat blob', 'LCD']
const SELECTED_NAMES = ['Pulse ring', 'Crosshair lock', 'Corner brackets', 'Label tag', 'Beam', 'Rotating reticle', 'Spotlight']
const FLASH_NAMES = ['Ripple', 'Flash burst', 'Radar ping', 'Glitch flicker', 'Beam up', 'Shockwave', 'None']
const FLYTO_NAMES = ['Fast & sharp', 'Smooth arc', 'Cinematic', 'Snap', 'Overshoot', 'Zoom out & in']
const PANELMOVE_NAMES = ['Free drag', 'Snap to edges', 'Magnetic dock', 'Slide on rail', 'Fixed']
const PANELOPEN_NAMES = ['Collapse to edge tab', 'Fold vertical', 'Shutter wipe', 'Fade + scale', 'Glitch out', 'Slide out', 'Minimise to icon', 'Roll up to header']
const DOCKANIM_NAMES = ['Slide from right', 'Wipe reveal', 'Fade up', 'Scale from pin', 'Glitch in', 'Unfold']
const LISTANIM_NAMES = ['Fade in', 'Slide in, staggered', 'Typewriter', 'Flash highlight', 'Drop from top', 'None', 'Push down, new from left']
const MICRO_NAMES = ['Scale press', 'Flash on press', 'Ripple', 'Glitch tap', 'Bevel push', 'None']
const BOOT_NAMES = ['Boot sequence', 'Scan bar', 'Radar sweep', 'Segment loader', 'Glitch logo', 'Spinner']
const REDUCED_NAMES = ['Respect OS setting', 'Always animate', 'Always reduce']

/** All categories, foundations first. The canvas pages through them 6 at a time. */
export const CATEGORIES = [
  { key: 'title', section: 'Foundations', label: 'Title font', options: TITLE_FONTS.map((f) => f.name) },
  { key: 'main', section: 'Foundations', label: 'Main font', options: MAIN_FONTS.map((f) => f.name) },
  { key: 'sub', section: 'Foundations', label: 'Subtitle font', options: SUB_FONTS.map((f) => f.name) },
  { key: 'news', section: 'Foundations', label: 'News font', options: NEWS_FONTS.map((f) => f.name) },
  { key: 'mono', section: 'Foundations', label: 'Data font', options: MONO_FONTS.map((f) => f.name) },
  { key: 'type', section: 'Foundations', label: 'Type scale', options: TYPE_SCALES.map((t) => t.name) },
  { key: 'colour', section: 'Foundations', label: 'Colour', options: COLOURS.map((c) => c.name) },
  { key: 'semantic', section: 'Foundations', label: 'Status colours', options: SEMANTICS.map((c) => c.name) },
  { key: 'layers', section: 'Foundations', label: 'Layer colours', options: LAYER_PALETTES.map((c) => c.name) },
  { key: 'spacing', section: 'Foundations', label: 'Spacing', options: SPACINGS.map((c) => c.name) },
  { key: 'frame', section: 'Foundations', label: 'Panel frame', options: FRAME_NAMES },
  { key: 'surface', section: 'Foundations', label: 'Surface', options: SURFACES.map((s) => s.name) },
  { key: 'glow', section: 'Foundations', label: 'Glow', options: GLOWS.map((g) => g.name) },
  { key: 'iconStyle', section: 'Foundations', label: 'Icon style', options: ICONSTYLE_NAMES },
  { key: 'motion', section: 'Foundations', label: 'Motion timing', options: MOTIONS.map((m) => m.name) },
  { key: 'button', section: 'Primitives', label: 'Button', options: BUTTON_NAMES },
  { key: 'toggle', section: 'Primitives', label: 'Toggle', options: TOGGLE_NAMES },
  { key: 'check', section: 'Primitives', label: 'Checkbox', options: CHECK_NAMES },
  { key: 'icons', section: 'Primitives', label: 'Icon controls', options: ICON_NAMES },
  { key: 'badge', section: 'Primitives', label: 'Badges', options: BADGE_NAMES },
  { key: 'marker', section: 'Primitives', label: 'Precision marker', options: MARKER_NAMES },
  { key: 'search', section: 'Primitives', label: 'Inputs', options: SEARCH_NAMES },
  { key: 'slider', section: 'Primitives', label: 'Slider', options: SLIDER_NAMES },
  { key: 'tooltip', section: 'Primitives', label: 'Tooltip', options: TOOLTIP_NAMES },
  { key: 'scrollbar', section: 'Primitives', label: 'Scrollbar', options: SCROLLBAR_NAMES },
  { key: 'focus', section: 'Primitives', label: 'Focus ring', options: FOCUS_NAMES },
  { key: 'layout', section: 'Layout', label: 'Screen layout', options: LAYOUT_NAMES },
  { key: 'header', section: 'Layout', label: 'Header', options: HEADER_NAMES },
  { key: 'responsive', section: 'Layout', label: 'Responsive', options: RESPONSIVE_NAMES },
  { key: 'zorder', section: 'Layout', label: 'Panels vs globe', options: ZORDER_NAMES },
  { key: 'layerPanel', section: 'Composites', label: 'Layer panel', options: LAYERPANEL_NAMES },
  { key: 'layerRow', section: 'Composites', label: 'Layer row', options: LAYERROW_NAMES },
  { key: 'feed', section: 'Composites', label: 'Feed item', options: FEED_NAMES },
  { key: 'dock', section: 'Composites', label: 'Detail dock', options: DOCK_NAMES },
  { key: 'media', section: 'Composites', label: 'Media frame', options: MEDIA_NAMES },
  { key: 'meta', section: 'Composites', label: 'Metadata', options: META_NAMES },
  { key: 'legend', section: 'Composites', label: 'Legend', options: LEGEND_NAMES },
  { key: 'toast', section: 'Composites', label: 'Toast', options: TOAST_NAMES },
  { key: 'states', section: 'Composites', label: 'Empty / loading / error', options: STATE_NAMES },
  { key: 'hud', section: 'Composites', label: 'Globe HUD', options: HUD_NAMES },
  { key: 'globe', section: 'Globe', label: 'Globe style', options: GLOBE_NAMES },
  { key: 'pin', section: 'Globe', label: 'Pins', options: PIN_NAMES },
  { key: 'cluster', section: 'Globe', label: 'Clusters', options: CLUSTER_NAMES },
  { key: 'selected', section: 'Globe', label: 'Selected pin', options: SELECTED_NAMES },
  { key: 'flash', section: 'Globe', label: 'Event flash', options: FLASH_NAMES },
  { key: 'flyto', section: 'Globe', label: 'Fly-to', options: FLYTO_NAMES },
  { key: 'panelMove', section: 'Motion', label: 'Panel movement', options: PANELMOVE_NAMES },
  { key: 'panelOpen', section: 'Motion', label: 'Panel open / close', options: PANELOPEN_NAMES },
  { key: 'dockAnim', section: 'Motion', label: 'Dock enter / exit', options: DOCKANIM_NAMES },
  { key: 'listAnim', section: 'Motion', label: 'List animation', options: LISTANIM_NAMES },
  { key: 'micro', section: 'Motion', label: 'Micro-interactions', options: MICRO_NAMES },
  { key: 'boot', section: 'Motion', label: 'Loading / boot', options: BOOT_NAMES },
  { key: 'reduced', section: 'Motion', label: 'Reduced motion', options: REDUCED_NAMES },
] as const

export type Category = (typeof CATEGORIES)[number]['key']
export type Design = Record<Category, number>

/** Design → CSS custom properties. AtlasTheme puts these on its wrapper. */
export function designVars(d: Design): CSSProperties {
  const t = TITLE_FONTS[d.title]
  const sf = SUB_FONTS[d.sub]
  const c = COLOURS[d.colour]
  const s = SURFACES[d.surface]
  const g = GLOWS[d.glow]
  const ts = TYPE_SCALES[d.type]
  const sm = SEMANTICS[d.semantic]
  const m = MOTIONS[d.motion]
  const drops = [s.drop, g.panel].filter((x) => x && x !== NO_DROP)
  const vars: Record<string, string> = {
    '--font-title': `'${t.family}', sans-serif`,
    '--font-main': `'${MAIN_FONTS[d.main].family}', sans-serif`,
    '--font-sub': `'${sf.family}', sans-serif`,
    '--font-news': `'${NEWS_FONTS[d.news].family}', serif`,
    '--font-mono': `'${MONO_FONTS[d.mono].family}', ui-monospace, monospace`,
    '--tracking-title': t.track,
    '--title-weight': String(t.weight),
    '--sub-track': sf.track,
    '--sub-case': sf.upper ? 'uppercase' : 'none',
    '--fs-title': `${ts.title}px`,
    '--fs-h': `${ts.h}px`,
    '--fs-body': `${ts.body}px`,
    '--fs-label': `${ts.label}px`,
    '--fs-caption': `${ts.caption}px`,
    '--color-bg': c.bg,
    '--color-panel': c.panel,
    '--color-line': c.line,
    '--color-ink': c.ink,
    '--color-dim': c.dim,
    '--color-accent': c.accent,
    '--color-accent-2': c.accent2,
    '--color-alert': sm.live,
    '--color-ok': sm.ok,
    '--color-warn': sm.warn,
    '--color-err': sm.err,
    '--color-live': sm.live,
    '--space': String(SPACINGS[d.spacing].mult),
    '--pad': `calc(16px * ${SPACINGS[d.spacing].mult})`,
    '--panel-fill': s.fill,
    '--panel-blur': s.blur ?? 'none',
    '--panel-inset': s.inset ?? 'none',
    // No filter at all when nothing glows or drops, so frosted glass can blur what's behind it
    '--panel-filter': drops.length ? drops.join(' ') : 'none',
    '--glow-text': g.text,
    '--text-shadow-glow': g.text,
    '--shadow-glow': g.box,
    '--glow-drop': g.drop,
    '--glow-anim': g.anim ?? 'none',
    '--glow-el-anim': g.elAnim ?? 'none',
    '--glow-panel-anim': g.panelAnim ?? 'none',
    '--glow-overlay': g.overlay ?? 'none',
    '--dur': m.dur,
    '--ease': m.ease,
  }
  LAYER_PALETTES[d.layers].colors.forEach((col, i) => (vars[`--layer-${i + 1}`] = col))
  return vars as CSSProperties
}

/** Duration of the design's motion timing, in ms (for JS-driven sequences). */
export const durationMs = (d: Design) => parseFloat(MOTIONS[d.motion].dur)

/** Wrapper classes for design choices that are pure CSS (focus ring, scrollbars, micro-interactions, reduced motion). */
export const designClasses = (d: Design) =>
  `focus-${d.focus + 1} sb-${d.scrollbar + 1} mi-${d.micro + 1} rm-${d.reduced + 1} is-${d.iconStyle + 1}`

// Fonts that don't ship the usual 400–700 range; Google rejects requests for weights a font lacks.
const WEIGHTS: Record<string, string> = {
  Michroma: '', 'Share Tech': '', 'Share Tech Mono': '', Aldrich: '', Electrolize: '', 'Major Mono Display': '', VT323: '',
  Syncopate: ':wght@400;700', 'Space Mono': ':wght@400;700', Quantico: ':wght@400;700', 'DM Mono': ':wght@400;500',
}
const SERIF = ':ital,wght@0,400;0,600;1,400'

/** Google Fonts family spec (name + weights) for one family. */
export function fontSpec(family: string, serif = false) {
  if (family === 'Merriweather') return `${family}:ital,wght@0,400;0,700;1,400`
  if (serif && family !== 'Inter') return family + SERIF
  return family + (WEIGHTS[family] ?? ':wght@400;500;600;700')
}

/** Google Fonts URL for exactly the fonts a design uses. */
export function fontsUrl(d: Design) {
  const fams = [
    fontSpec(TITLE_FONTS[d.title].family),
    fontSpec(MAIN_FONTS[d.main].family),
    fontSpec(SUB_FONTS[d.sub].family),
    fontSpec(NEWS_FONTS[d.news].family, true),
    fontSpec(MONO_FONTS[d.mono].family),
  ]
  return `https://fonts.googleapis.com/css2?${[...new Set(fams)].map((f) => `family=${f.replaceAll(' ', '+')}`).join('&')}&display=swap`
}
