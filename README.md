# Panoptes

Open-source map of unrest and influence activity on a 3D globe (CesiumJS), built for defense analysts.

- **Live streams**: social-media livestreams, playable in-place from the pin.
- **Truth sensor**: trending narratives and fresh debunks cross-referenced against fact-check feeds and news coverage, plus an ad-hoc claim checker.

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
  geo/gazetteer.ts           Offline text -> coordinates (cities, countries, ~45 protest/flashpoint sites)
  truth/                     Truth-sensor engine (see below)
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
| `youtube-api` | `YOUTUBE_API_KEY` | uploader-reported coordinates at full precision, `exact` |
| `youtube-scrape` | nothing | **inferred** from title/channel via gazetteer; unlocatable streams are dropped |
| `seed` | nothing | broadcaster's city, `approximate` (always-on news channels) |

Coordinates are never jittered or coarsened. Inferred positions are the gazetteer
entry (a named site if the text names one, else city, else country centroid), labelled
`inferred`, so overlapping pins stack at one point; clicking a stack opens a chooser.
Scraping is best-effort and may break when YouTube changes; a failing provider never
takes the layer down (see provider chips in the panel).

## Truth sensor (`narratives` layer)

Cross-references what is trending against what fact-checkers and newsrooms have published.
It produces an **evidence summary with a verdict and the reasons for it**, never an
unexplained machine ruling.

```
signals   Google Trends RSS (12 English regions) + Mastodon trending links/posts
            -> topic gate (server/truth/topics.ts) -> clustered into narratives
cross-ref fact-check feeds: StopFake, EUvsDisinfo, Snopes, FactCheck.org, Full Fact,
            Lead Stories, BBC Verify  (+ Google Fact Check API if key set)
            matched by idf-weighted term overlap (>=2 shared terms)
          GDELT DOC (last 3 days, English): distinct domains/countries, established
            outlets vs state-affiliated outlets (editable lists: server/truth/domains.ts)
verdict   debunked | disputed | unverified | corroborated | insufficient
          + attention score 0-100 (priority to look at it, NOT P(false)), with reasons
```

- **Map**: a narrative is pinned only if its text names a place (the place the story is
  *about*, not where it spreads); otherwise it is listed in the panel as unplaced.
- **Check a claim**: paste text into the panel to get the same cross-reference on demand.
  GDELT allows 1 request / 5 s, so lookups are queued (user checks first); if coverage
  isn't back within 20 s the answer comes without it and the lookup finishes in the
  background for the next check.
- **Honest limits**: fact-check verdicts are parsed from the checkers' own headlines
  (keywords); matching is lexical, not semantic; trends feeds are English-region only;
  coverage counts are a proxy for corroboration, not proof. Always follow the evidence
  links. `GET /api/truth/status` shows per-source health.

## Notes

- Inferred locations can be wrong. Treat as leads.
