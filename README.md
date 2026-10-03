# Panoptes

Open-source map of unrest and influence activity on a 3D globe (CesiumJS).
First layer: **live social-media streams**, playable in-place from the pin.

```
npm install
cp .env.example .env     # optional
npm run dev              # web :5173 + api :8787
```

No keys required. Without `YOUTUBE_API_KEY` the layer uses a key-less YouTube
scrape plus a curated seed list.

## Architecture

```
shared/feature.ts            Feature schema (zod): the one contract for ALL layers
server/
  core/                      Provider interface, aggregator (parallel, fault-isolated, deduped), TTL cache
  providers/<layer>/*.ts     One file per data source -> normalized Feature[]
  layers.ts                  SERVER registry: layer id -> providers
  geo/gazetteer.ts           Offline text -> coordinates
src/
  core/                      LayerDef contract, zustand store, polling hook
  globe/                     GlobeHost (viewer), LayerRenderer (generic pins/clusters/picking/fly-to)
  ui/                        LayerPanel (toggles + feed list), DetailDock
  layers/<id>/               CLIENT layer: LayerDef + Detail component
  layers/index.ts            CLIENT registry
```

Every `Feature` carries provenance: `source`, `geoPrecision` (`exact` |
`approximate` | `inferred`) and `geoBasis` (why we put it there). The UI shows
precision on pins (solid / ringed / dashed) and in the dock. Don't drop these
fields: later modules (cases, correlation, disinformation scoring) rely on them.

### Add a layer

1. **Server**: add `server/providers/<layer>/<source>.ts` implementing
   `Provider` (`fetch()` returns `Feature[]` with `layerId: '<layer>'`), then list it in
   `server/layers.ts`. Order = dedupe priority.
2. **Client**: add `src/layers/<layer>/index.tsx` exporting a `LayerDef`
   (colour, refresh interval, pin size, list subtitle, `Detail` component), then
   add it to `src/layers/index.ts`.

The globe, panel, polling, clustering, picking and dock need no changes.

### Add a source to an existing layer

Write one provider file and add it to that layer's array in `server/layers.ts`.

## Livestream layer

| Provider | Needs | Position |
|---|---|---|
| `youtube-api` | `YOUTUBE_API_KEY` | uploader-reported, **coarsened to ~1 km**, `approximate` |
| `youtube-scrape` | nothing | **inferred** from title/channel via gazetteer; unlocatable streams are dropped |
| `seed` | nothing | broadcaster base, `approximate` (always-on news channels) |

Scraping is best-effort and may break when YouTube changes; the provider
failing never takes the layer down (see provider chips in the panel).

## Safety notes

- Individual streamers are never pinned precisely.
- Inferred locations are labelled as such and can be wrong. Treat as leads.
