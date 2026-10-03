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

## How the app uses it

Already wired in on this branch:

- `vite.config.ts` runs the Tailwind plugin; `src/index.css` imports Tailwind and `gui_elements/theme.css`,
  then styles the layer detail views with the ATLAS tokens.
- `src/main.tsx` loads `fonts.css` and wraps the app in `<AtlasTheme remember>` (the viewer's colour
  scheme and satellite choice persist between visits).
- `src/App.tsx` lays out the screen from `LAYOUTS[design.layout]`: left panel, globe area, dock.
  The globe area spans the space between the panels and grows as they minimise (`src/ui/shell.ts`).
- `src/ui/LayerPanel.tsx`: `Panel` + `RollUp` with `Header`, `Search` (filters every layer's list),
  the layer accordion (`LayerPanel` with `Toggle`, `Badge`, source status, each layer's controls,
  `FeedItem` rows), `LiveFeed` (`AnimatedList` push-down), the case file and `Legend`.
- `src/ui/DetailDock.tsx`: `DockTransition` + `RollUp` + `Panel` + `Dock`, wrapping each layer's own
  `Detail` view. Minimise rolls it up, then the globe controls glide to the edge; restore reverses it.
- `src/globe/`: Cesium styled to the design (wireframe coastlines/borders/graticule, satellite imagery
  toggle, square halo pins, LCD clusters, crosshair selection, flash burst, fly-to timing from `flights.ts`),
  with `GlobeOverlay` placing `GlobeHUD` (live camera position + UTC) and `GlobeControls` on the globe.

The Cesium drawing (`src/globe/pins.ts`, the flash in `LayerRenderer.tsx`, `GlobeHost.tsx`) implements the
chosen globe options; changing the Pins, Clusters, Selected pin, Event flash or Globe style choices in
`design.ts` restyles the editor's mock globe but needs a matching change there. Layers keep their own
colours (13 layers outnumber the 6-colour layer palette).

## Tokens available as Tailwind classes

Colours: `bg`, `panel`, `line`, `ink`, `dim`, `accent`, `accent-2`, `alert`, `ok`, `warn`, `err`, `live`
(`bg-panel`, `text-accent`, `border-line`, …). Fonts: `font-title`, `font-main`, `font-sub`, `font-news`,
`font-mono`. Utilities: `sub` (label style), `title-weight`, `tracking-(--tracking-title)`, `chamfer`,
`t-title` / `t-h` / `t-body` / `t-label` / `t-caption` (type scale), `gap-s` / `gap-m` (spacing).
Layer colours: `var(--layer-1)` … `var(--layer-6)`. Motion: `var(--dur)`, `var(--ease)`.
