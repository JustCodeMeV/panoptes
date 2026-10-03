# Panoptes

Open-source map of unrest and influence activity on a 3D globe (CesiumJS), built for defense analysts.

- **Live wire**: 22 news feeds polled every 30-40 s, grouped into stories and re-analyzed as more outlets pick them up, pushed to the browser over SSE.
- **Markets**: Polymarket, Kalshi and Manifold odds on conflict and security, with live probability moves, price history, and links to the news stories they relate to.
- **OSINT signals**: internet blackouts (IODA), UN disaster alerts (GDACS), earthquakes (USGS), NASA natural events.
- **Live streams**: social-media livestreams, playable in-place from the pin.
- **Truth sensor**: trending narratives and fresh debunks cross-referenced against fact-check feeds and news coverage, plus an ad-hoc claim checker.
- **Campaign watch + influence network**: stories whose spread looks coordinated, and a graph of which sources co-amplify them and who usually goes first (recurring pairs highlighted).
- **AI analyst brief** (optional, Claude): a sourced summary of why a story is flagged, how each bloc frames it and what to check next; also semantic fact-check matching for the claim checker.
- **Region watch**: draw a circle around a place; anything new from any layer inside it raises an alert in the live wire.
- **Physical layers**: GPS jamming (GPSJam), military aircraft (adsb.lol), Ukraine frontline (DeepState), web censorship (OONI), submarine cables; ACLED, NASA FIRMS and Cloudflare Radar when keys are set.

```
npm install
cp .env.example .env     # optional
npm run dev              # web :5173 + api :8787
```

No keys required. Keyed sources (Claude, ACLED, FIRMS, Cloudflare Radar, YouTube API,
Google Fact Check) are listed in `.env.example`; until set they show as *off* in the
health chip and everything else works.

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
  globe/                     GlobeHost (viewer, wireframe/satellite), LayerRenderer (pins/clusters/picking/fly-to),
                             GlobeOverlay (position readout + globe controls)
  ui/                        LayerPanel (search, layers, live feed, case file), DetailDock, shell (minimise state)
  layers/<id>/               CLIENT layer: LayerDef + Detail component
  layers/index.ts            CLIENT registry
gui_elements/                ATLAS UI kit: design.ts (chosen design), components, tokens (see gui_elements/README.md)
canvas/                      Design editor: npm run canvas (port 5174), exports to gui_elements/design.ts
```

Every `Feature` carries provenance: `source`, `geoPrecision` (`exact` |
`approximate` | `inferred`) and `geoBasis` (why we put it there). The UI shows
precision on pins (solid / framed / dashed squares) and in the dock. Don't drop these
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

## Live wire (`news` layer, real-time)

```
server/news/sources.ts   feeds (BBC, Al Jazeera, DW, France 24, Guardian, Euronews, Sky, NPR, SCMP,
                         Ukrinform, Defense News, TWZ; state media TASS, RT, Press TV, Al-Manar, CGTN;
                         6 keyword-filtered Google News queries). Add a row to add a feed.
server/news/ingest.ts    conditional-GET polling (ETag), RSS/Atom/RDF parsing
server/news/engine.ts    topic gate -> story clustering -> analysis -> pub/sub
GET /api/stream/news     SSE: `snapshot` on connect, then `news` (new|update), `remove`, `status`
```

- **Analysis on arrival**: each story is geolocated (gazetteer), matched against the fact-check
  corpus, and scored from its own outlet mix: established vs state-affiliated outlets, number of
  distinct outlets. No GDELT round-trip, so verdicts are instant.
- **Stories evolve**: when another outlet picks a story up, it is re-analyzed and pushed as an
  `update` (e.g. `unverified -> corroborated`, or "reported only by state media so far").
- **First poll of every feed is silent** (it is backlog, not breaking news); only genuinely new
  items fire events, ripples and wire entries.
- **Client**: `LayerDef.stream` makes a layer push-driven. New/changed stories ripple on the globe
  and slide into the bottom wire; relative times tick every second.

## Markets (`markets` layer, real-time)

Prediction-market prices are probabilities backed by money, so they are an independent signal
about what people with something to lose expect. They are also thin, manipulable and sometimes
wrong, so every number is shown with a **depth score** (0-100 from traded volume) and play-money
platforms are flagged and given almost no weight.

```
server/markets/sources/   polymarket (gamma API, 9 security tags), kalshi (events + nested markets),
                          manifold (play money, 13 search terms). Each adapter -> RawMarket.
server/markets/gate.ts    topic gate: security/conflict terms; elections only for non-US countries;
                          sport/celebrity/crypto/fiction noise removed. Editable.
server/markets/engine.ts  polls (polymarket 60 s, kalshi 3 min, manifold 4 min), per-platform caps,
                          emits `upsert` on a >=2-point move between polls or a newly linked story.
GET /api/markets/history  7-day price series (Polymarket CLOB / Kalshi candlesticks / recorded)
```

- **Headline outcome**: winner-take-all events show the current favourite; date ladders ("by
  October 31?") show the busiest market, with all outcomes listed in the detail view.
- **Placement**: pinned at the place the question is about ("Will the U.S. invade Iran" -> Iran).
- **Cross-reference** (`server/core/xref.ts`): news stories and markets are linked both ways by
  distinctive-term overlap. A story's assessment then includes "what the market says", and an
  `unverified` story that a deep market prices above 50% is flagged and gets a higher attention
  score ("markets treat this as likely while confirmation is still thin").
- **Generic live plumbing**: `server/core/hub.ts` + `shared/live.ts`. Any engine registers a stream
  and publishes `upsert/remove/status`; the client hook and live wire pick it up via `LayerDef.stream`
  and `LayerDef.ticker`.

## OSINT signals (`osint` layer)

| Provider | Source | Notes |
|---|---|---|
| `ioda` | Georgia Tech IODA | country-level internet outages (BGP / active probing); critical alert or 2 sources; placed at country centroid (inferred) |
| `gdacs` | UN/EC GDACS RSS | Orange/Red disaster alerts only, exact event centre |
| `usgs` | USGS | M4.5+ last 24 h, exact epicentre |
| `eonet` | NASA EONET | volcanoes, storms, floods with a position <3 days old (wildfires omitted as noise) |

Also added: Bellingcat to the live wire. `osint.places` was unreachable (no DNS record) when this
was built, so feeds were chosen from well-known public sources and verified individually. Metaculus
needs an API login and is not included; PolitiFact, AFP, Reuters, AP, Liveuamap and the State
Department block anonymous requests.

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

## Influence network

`GET /api/network` builds a co-amplification graph from live stories (`shared/network.ts`):
two sources are linked when both carried a story within 6 h; the arrow points from the
one that was usually first, with the median lead in minutes. A pair that recurs on 3+
flagged stories is drawn red. `?story=<id>` restricts it to one story's sources while
keeping each pair's history across all stories. Open it from **⌘ Network** in the panel or
the **Network** tab next to a story's timeline. Leads for an analyst, not attribution.

## AI analyst brief (optional)

With `ANTHROPIC_API_KEY` set (default model `claude-haiku-4-5`, override with
`PANOPTES_LLM_MODEL`), the **✦ Analyst brief** button on any story asks Claude for a
summary, why it is flagged, how each outlet group frames it, next checks and English
glosses of foreign headlines, using only the evidence the engine already gathered. The
claim checker also has Claude judge lexical fact-check candidates as same claim / related /
unrelated. Calls are cached per story state and capped per hour
(`PANOPTES_LLM_MAX_PER_HOUR`, default 60). Without a key both fall back to keyword matching.

## Region watch (`watch` layer, real-time)

Add a watch by place name (gazetteer) or `lat, lon` plus a radius. Watches are stored in
SQLite and audit-logged. `server/watch/engine.ts` checks every streamed upsert (news,
markets) and sweeps polled layers every minute; anything inside a watch is pushed on
`/api/stream/watch` as an alert, so the live wire, panel, globe and case file treat it like
any other layer. What is already inside when a watch is created is a silent baseline.
Livestreams and frontline polygons are excluded by default.

## Physical layers

| Layer | Source | Key | Notes |
|---|---|---|---|
| `gnss` | GPSJam daily H3 cells | none | aircraft reporting degraded GPS; cells with >10% affected, yesterday |
| `military-air` | adsb.lol `/v2/mil` | none | only aircraft broadcasting ADS-B; many fly dark |
| `frontlines` | DeepState | none | occupied + contested polygons; editorial claims skipped |
| `infrastructure` | TeleGeography | none | submarine cable routes (schematic) |
| `osint` + | OONI | none | per-country confirmed blocks / anomalies (24 h) |
| `osint` + | NASA FIRMS | `FIRMS_MAP_KEY` | high-power thermal anomalies in conflict areas only |
| `osint` + | Cloudflare Radar | `CLOUDFLARE_RADAR_TOKEN` | curated outages with cause |
| `acled` | ACLED | `ACLED_EMAIL`/`ACLED_PASSWORD` | human-coded events, actors, fatalities, 14 days |

Features may carry a GeoJSON `geometry` (polygon/line); the globe draws it instead of a pin.

## Deploy (Render)

The app needs its Node server (polling engines, SSE, SQLite), so a static host
like Netlify alone won't work. One Render web service serves both the API and
the built frontend; `render.yaml` describes it.

1. Render dashboard → **New → Web Service** → pick this repo, build `npm install; npm run build`,
   start `npm start`. The server binds `0.0.0.0` when `RENDER` is set; any Node ≥ 24 works.
   (`render.yaml` describes the same service if you prefer **New → Blueprint**.)
2. Optional keys: see `.env.example`. Every source works without them or shows why it is idle.
3. Free plan sleeps after ~15 min idle (about a minute to wake, a few more for feeds
   to fill). Use **Starter** or open the site ~10 min before a demo.
4. Cases live on the instance disk and are wiped on redeploy. To keep them, attach
   a disk and set `PANOPTES_DB=/var/data/panoptes.db`.

Locally, `npm run build && npm start` runs the same production setup on :8787.

## Demo replay (presenter walk-through)

A scripted, offline replay of one rumour from first post to debunk, played through
the real UI and data shapes. Every item is tagged `demo` and titled `DEMO:` so it can't
be mistaken for a live event. Start it with **▶ Run demo** in the layer panel, or open
`http://localhost:5173/?demo` to start it automatically after 6 s. Press Esc or
**■ Stop demo** to stop. About 100 s end to end.

| Step | On screen | Say |
|---|---|---|
| 1 | A 300 km watch on the Strait of Hormuz fires: a Telegram post, *Social-first* | "An analyst is watching this strait. It starts on one channel. No outlet has it." |
| 2 | Three more accounts on Telegram and Bluesky, *Social surge* | "Amplification across platforms, still no confirmation." |
| 3 | Polymarket "US–Iran Hormuz agreement" drops 18 pts, *Market reacting* | "People are putting money on it. That's a signal, not proof." |
| 4 | TASS and Press TV pick it up, *Aligned state outlets* (RU + IR) | "State media from two blocs frame it before any established outlet." |
| 5 | The **Network** tab: TASS → Press TV in red, a recurring pair | "This isn't the first time: same order on five flagged stories, Press TV four minutes behind." |
| 6 | Lead Stories fact-check, verdict **debunked**, and the analyst brief appears | "The footage is from 2023. The brief explains why it was flagged and what to check next." |
| 7 | GPS jamming and military aircraft layers switch on; the market drifts lower | "Nothing physical backs it up, yet the fear premium stays." |
| 8 | Al Jazeera English plays live in the dock, pinned at Doha | "Analysts can watch live regional coverage without leaving the map." |
| 9 | The story is saved to the `DEMO: Hormuz tanker rumour` case | "A frozen snapshot with timeline, network, brief and every source, ready for handoff." |
| 10 | Replay complete; demo pins are cleared | "Watch → claim → money → media → network → verdict → evidence." |

Notes for presenting:
- Run `npm run dev` first. The replay itself needs no live data, but saving to the case needs the API. If the API is down, step 9 says so and moves on.
- Replays reuse one demo case and refresh its snapshot, so running the demo several times doesn't pile up duplicates. Your previously active case is restored afterwards.
- The network numbers and the brief in steps 5-6 are pre-written for the replay (live ones come from `/api/network` and Claude). Step 7's jamming and aircraft are live data.
- Step 8 embeds Al Jazeera's real 24/7 channel. It shows whatever they are broadcasting at the time, not footage of the scripted event.

## Notes

- Inferred locations can be wrong. Treat as leads.
