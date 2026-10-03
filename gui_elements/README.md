# gui_elements

The ATLAS UI kit. The product shows as **ATLAS**; the repo and code keep the working name Panoptes.

Every part of the visual language (53 categories, from fonts to fly-to feel) has several variants. The
**chosen** variant of each lives in one file, [`design.ts`](design.ts). Philip picks them in the design
editor (`npm run canvas`, port 5174) and presses **Export to gui_elements**, which rewrites
`design.ts` and `fonts.css`. Components read the design at runtime, so nothing else changes on export.

## Files

| File | What it is |
|---|---|
| `design.ts` | **The chosen design**: one option index per category. Written by the canvas export. |
| `catalog.ts` | Every option for every category, `designVars()` (design → CSS variables), `designClasses()`, `durationMs()`, `fontsUrl()`. |
| `AtlasTheme.tsx` | `<AtlasTheme>`: applies the design (fonts, colours, surface, glow, spacing, motion, focus ring, scrollbars, micro-interactions, reduced motion) and holds the runtime view controls. With `remember` they persist per viewer. |
| `context.ts` | `useDesign()` (active design) and `useAtlasControls()` (colour scheme, satellite view). |
| `theme.css` | Tailwind tokens and utilities (`bg-panel`, `text-accent`, `font-title`, `sub`, `chamfer`, …). Imports `styles.css` (component variants) and `styles-2.css` (design-wide behaviour, motion). |
| `fonts.css` | Google Fonts for exactly the chosen fonts. Written by the export. |
| `Button.tsx`, `Toggle.tsx`, `Badge.tsx`, `Panel.tsx`, `Icon.tsx` (+ `icons.tsx` data) | Primitives |
| `Controls.tsx` | `Search`, `Select`, `Slider`, `Marker` / `MarkerGlyph` (geo precision), `Tooltip`, `IconButton`, `IconSet`, `Check` |
| `Composites.tsx` | `Header`, `LayerPanel`, `LayerRow`, `FeedItem`, `Dock`, `MediaFrame`, `MetaBlock`, `Legend`, `Toast`, `StateView`, `BootLoader`, `GlobeHUD` |
| `GlobeControls.tsx` | `GlobeControls`: the control stack beside the globe (zoom slider with Z readout, rotate, north, 3D tilt, satellite toggle, auto-rotate, layers, colour scheme, home). |
| `Motion.tsx` | `MovablePanel`, `Collapsible`, `RollUp` (minimise to header: the bottom rolls up to the element marked `data-roll-keep`), `DockTransition`, `AnimatedList` |
| `layouts.ts` | `LAYOUTS`: panel placement per screen layout. |
| `flights.ts` | `FLIGHTS`: fly-to presets (duration, easing, mid-flight pull-out). |

The design editor itself lives in `canvas/` (`npm run canvas`), including a browser mock of the globe;
the kit has no dependency on it.

## Wiring it into the app

1. Install Tailwind v4:
   ```bash
   npm i -D tailwindcss @tailwindcss/vite
   ```
2. In `vite.config.ts`: `import tailwindcss from '@tailwindcss/vite'`, then `plugins: [react(), tailwindcss(), ...]`.
3. At the top of `src/index.css`:
   ```css
   @import "tailwindcss";
   @import "../gui_elements/theme.css";
   ```
   Tailwind's base reset (preflight) comes with this and restyles some existing elements
   (headings, lists, buttons); the current `index.css` already resets buttons.
4. In `src/main.tsx`: `import '../gui_elements/fonts.css'`, and wrap the app:
   ```tsx
   import { AtlasTheme } from '../gui_elements/AtlasTheme'
   <AtlasTheme remember className="h-full"><App /></AtlasTheme>
   ```
5. Replace the hand-rolled UI in `src/ui/` with the kit, for example:

| Today | Use |
|---|---|
| `.panel` / `.dock` asides | `<Panel>` (placement from `LAYOUTS[design.layout]`) |
| `<h1>ATLAS</h1>` + tagline | `<Header />` |
| `.switch` checkbox | `<Toggle checked onChange label />` |
| `.count` pill, provider status | `<Badge>128</Badge>`, `<Badge tone="ok">OK 12</Badge>`, `<Badge tone="err">✕</Badge>` |
| layer sections | `<LayerPanel layers onToggle />` |
| `.list` buttons | `<AnimatedList items render={(e) => <FeedItem entry={e} selected onClick />} />` |
| `.dot-exact` etc. | `<Marker p="exact" />` |
| dock close `×` | `<IconButton icon="close" onClick />` |
| DetailDock | `<DockTransition show><RollUp minimized><Panel><Dock title media={<MediaFrame />} onClose onMinimize minimized>…</Dock></Panel></RollUp></DockTransition>` |
| panel minimise | Wrap the left panel in `<RollUp minimized>` and mark the header + search wrapper `data-roll-keep`. Minimise leaves ATLAS and search; the position box and globe take the freed space. For the dock: minimise rolls it up, then the globe controls glide to the right edge; restore moves the controls back first, then rolls the dock open (see `canvas/builder/FullMock.tsx` for the exact sequence). Close hides the dock; selecting a feed item or pin reopens it. |
| player | `<MediaFrame state="live" />` around the embed |
| API error / loading | `<StateView kind="error" onRetry />`, `<Toast tone="err" title body />` |
| globe buttons | `<GlobeControls zoom onZoom onRotate onNorth tilt onTilt playing onPlay layersOn onLayers onHome />`, placed bottom-right of the globe area, left of the dock. Map each callback to the Cesium camera. The map button toggles `useAtlasControls().satellite`: switch Cesium between the wireframe style and satellite imagery. The palette button switches the colour scheme (handled inside `AtlasTheme`, nothing to wire). |
| coords / time readout | `<GlobeHUD />` (Corner box): one block in the bottom-left corner of the globe area |

`d3-geo`, `topojson-client` and `world-atlas` are dev dependencies used only by `MockGlobe` on the
canvas; the app keeps Cesium and maps the globe choices onto it.

## Tokens available as Tailwind classes

Colours: `bg`, `panel`, `line`, `ink`, `dim`, `accent`, `accent-2`, `alert`, `ok`, `warn`, `err`, `live`
(`bg-panel`, `text-accent`, `border-line`, …). Fonts: `font-title`, `font-main`, `font-sub`, `font-news`,
`font-mono`. Utilities: `sub` (label style), `title-weight`, `tracking-(--tracking-title)`, `chamfer`,
`t-title` / `t-h` / `t-body` / `t-label` / `t-caption` (type scale), `gap-s` / `gap-m` (spacing).
Layer colours: `var(--layer-1)` … `var(--layer-6)`. Motion: `var(--dur)`, `var(--ease)`.
