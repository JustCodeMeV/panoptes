# Panoptes (ATLAS) — Visual Parts To-Do

The product shows as **ATLAS**; the repo and code keep the working name Panoptes.

Workflow: `npm run canvas` opens the design editor (port 5174). Left: every part below as a
dropdown, 6 per page. Right: the live ATLAS screen, updating as you pick. Pick the
winners, then **Export to gui_elements** writes `gui_elements/design.ts` + `fonts.css`; every
component reads its variant from there. See `gui_elements/README.md` for wiring.

Direction: cyberpunk, Tron, Star Trek, post-apocalyptic tech dystopia. Quirky, harsh angles, chamfers.

Status key: `[~]` in the editor, default pick not yet confirmed · `[x]` confirmed by Philip (still editable)

Parts are ordered so that later parts build on earlier ones (tokens → primitives → composites → motion).

---

## 1. Foundations (design tokens)

- [x] **Fonts**: title Orbitron, main Saira, news reader Source Serif 4, mono JetBrains Mono
- [x] **Subtitle font**: Tektur (`sub` utility)
- [x] **Type scale**: sizes, weights, line heights, letter-spacing, uppercase label style
- [x] **Colours**: Arctic palette
- [x] **Accent & semantic colours**: brand accent, ok / warning / error / live
- [x] **Layer colour palette**: one distinct colour per data layer, legible on the globe and in panels
- [x] **Spacing scale**: 4/8-based gaps, paddings, panel gutters
- [x] **Radii, borders & dividers**: Side rail panel frame (`Panel.tsx`)
- [x] **Elevation & glass**: Flat (solid panel, no shadow or blur)
- [x] **Glow**: Off
- [x] **Iconography**: icon set or custom glyphs, stroke weight, sizes
- [x] **Motion tokens**: durations, easing curves, stagger (shared by every animation below)

## 2. Primitives

- [x] **Buttons**: Chamfer primary/secondary (`Button.tsx`). Still to do: icon-only, destructive, loading, focus
- [x] **Switches / toggles**: Bracket (`Toggle.tsx`)
- [x] **Checkboxes & radios** (filters) (batch 3)
- [x] **Close / collapse controls**: panel close, dock close, chevrons (batch 3)
- [x] **Badges & counts**: LCD (`Badge.tsx`)
- [x] **Status chips**: LCD badge with `tone`
- [x] **Geo-precision markers**: exact / approximate / inferred, used on pins, lists, legend and dock (batch 3)
- [x] **Inputs**: search field (batch 3); text input and select still to do
- [x] **Slider / range**: time window (batch 3)
- [x] **Tooltips**: hover info on pins, buttons and chips (batch 3)
- [x] **Scrollbars**: thin custom scrollbars for panels and lists
- [x] **Focus ring**: keyboard focus style (accessibility)

## 3. Layout

- [x] **Overall screen layout**: globe stage, left panel, right dock, top/bottom bars
- [x] **Header / wordmark**: ATLAS title treatment and tagline
- [x] **Responsive behaviour**: laptop, wide screen, tablet; mobile fallback (bottom sheet?)
- [x] **Z-order & overlaps**: what sits above what, Cesium credit placement

## 4. Composite components

- [x] **Layer panel (left)**: header, layer sections, footer legend
- [x] **Layer section / row**: switch, title, count, description, status line
- [x] **Feed list item**: precision dot, title, subtitle, hover, selected state
- [x] **Detail dock (right)**: kind label, title, metadata, close
- [x] **Media player frame**: livestream embed container, loading, offline/error state
- [x] **Metadata block**: source, geo basis, precision, timestamps, viewers
- [x] **Legend**: precision key, layer colours
- [x] **Toasts / notifications**: API errors, new events
- [x] **Empty, loading & error states**: skeletons, spinners, "no data" panels
- [x] **Globe HUD**: chamfered corner box (coords, alt, UTC), bottom-left; slides to the left edge when the left panel is minimised
- [x] **Globe control stack**: zoom slider + Z readout, rotate, north, 3D tilt, satellite toggle, auto-rotate, layers, home (`GlobeControls`)
- [x] **Colour scheme switcher**: palette button in the globe control stack, opens the 10 schemes

## 5. Globe visuals

- [x] **Globe base style**: Wireframe, with a toggleable satellite imagery view
- [x] **Pins**: shape and size per layer and per precision
- [x] **Clusters**: cluster bubble style and count label
- [x] **Selected pin state**: highlight ring, label
- [x] **Globe flashing animation**: pulse/flash on new or live events
- [x] **Camera fly-to feel**: speed and easing when a feature is selected

## 6. Motion

- [x] **Panel movement animation**: drag / slide / reposition
- [x] **Panel close/open animation**: roll up to header (left: ATLAS + search stay; right: dock header stays, controls glide to the edge, restore in reverse)
- [x] **Dock enter/exit animation**: when a feature is selected or cleared
- [x] **List animations**: rest of the list glides down, then the new item flies in from the left
- [x] **Micro-interactions**: button press, switch flip, hover glows
- [x] **Loading animation**: app boot / splash, data refresh indicator
- [x] **Reduced-motion fallback**: respects `prefers-reduced-motion`

## 7. Hand-off

- [x] **`gui_elements/` structure**: `design.ts` (chosen design), `catalog.ts` (all options), components by area
- [x] **Integration notes for the backend**: in `gui_elements/README.md`
