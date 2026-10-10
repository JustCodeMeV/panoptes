# ARGUS (repo: panoptes)

Open-source intelligence on a 3D globe (CesiumJS), built for defense analysts: unrest, conflict,
disinformation, influence, official statements, cyber threats and physical signals, every item
checked, placed with a stated precision, and linkable into a Maltego-style investigation graph.

```
npm install
cp .env.example .env     # optional
npm run dev              # web :5173 + api :8787
```

No keys required. Keyed sources (Claude, ACLED, FIRMS, Cloudflare Radar, AISStream, YouTube API,
Google Fact Check, xAI, Apify, Cesium ion terrain) are listed in `.env.example`; until set they show
as *off* in the health chip and everything else works.

## What is on the map

Layers are grouped in the left panel; each group has its own switch.

| Group | Layers |
|---|---|
| **Truth & overview** | Region Watch (alerts inside drawn circles) · Events (checked: every report resolved into events and checked) · Instability Index (0-100 per country, explainable) · Campaign Watch (stories whose spread looks coordinated) · Truth Sensor (trending narratives vs fact-checks) |
| **News & social media** | News Wire (72 feeds and searches from every region, grouped into stories) · Telegram Scouts (67 channels, keyless) · Official Statements (ministries and presidencies of 19 governments, UN, EU, NATO) · Research & Analysis (think tanks of every bloc, with who funds them) · Twitter/X (Grok second opinion) · Search Trends (Google Trends) · Live Streams |
| **War & security** | Frontlines & Conflict Zones (Ukraine front line + 25 active wars) · Conflict Events (Wikipedia Current Events, ACLED with keys) · Unrest Hotspots (GDELT) · Maritime & Air Warnings · Military Aircraft · Maritime Chokepoints (ships) |
| **Jamming, outages & cyber** | Cyber Threats (ransomware victims, botnet servers, exploited vulnerabilities) · Internet Outages & Censorship (IODA, OONI, Cloudflare Radar) · GPS Jamming |
| **Hazards & humanitarian** | Natural Hazards (GDACS, USGS, EONET, FIRMS) · Humanitarian & Health (WHO outbreak news, ReliefWeb) |
| **Space & infrastructure** | Low Orbit Satellites (CelesTrak, SGP4) · Deep Sea Cables |
| **Markets & economy** | Prediction Markets (Polymarket, Kalshi, Manifold) · World Markets (indices, commodities, currencies) |

Around the layers:

- **Country atlas, regions and cities**: click a country for a game-style profile (people, economy,
  trade, strategic assets, relations, what is happening there now) with diplomacy and trade map
  modes; click inside it for a region (state, province, oblast), or on a city.
- **Investigation graph**: open any item as entities (events, places, actors, sources, claims,
  assets) and expand them with transforms. See below.
- **Case mode**: a full-screen workbench to work a case: evidence, graph, hypotheses, timeline.
- **Search** (⌘K): countries, places, items on the map and graph entities in one list.
- **Timeline** (◷ above the globe controls): scrub or play the map back over the last 3 days to see
  when things appeared, with an hourly histogram and what appeared in the hour before. A replay of
  what the live layers hold, not an archive; layers without history (front lines, satellites, ships,
  jamming, indices) stay as they are.
- **In-app link viewer**: external links (articles, posts, Telegram, YouTube, TikTok, X) open in a
  floating window instead of a new tab; Telegram videos play.
- **AI analyst brief** (optional, Claude), **influence network**, **demo replay** (`?demo`) and a
  ~40 s **showreel** of the interface (`?showreel`).

## Architecture

```
shared/feature.ts            Feature schema (zod): the one contract for ALL layers
shared/entities.ts           Entity graph types: entities, relations, checks, transforms
server/
  core/                      Provider interface, aggregator (parallel, fault-isolated, deduped, TTL,
                             backoff, stale-on-error), pre-gzipped layer responses with ETag, SSE hub
  providers/<layer>/*.ts     One file per data source -> normalized Feature[]
  layers.ts                  SERVER registry: layer id -> providers
  geo/gazetteer.ts           Offline text -> place: countries, cities, flashpoints; Latin, Cyrillic,
                             Arabic, Hebrew script; Spanish, Portuguese and French names
  news/, telegram/, markets/ Real-time engines (polling, clustering, analysis, pub/sub)
  truth/                     Truth sensor; outlet registry (domains.ts); issuer registry (issuers.ts)
  entities/                  Entity graph: rules extractor, resolution, checks, adapters (any layer
                             -> entities), transforms, budgeted Claude extraction
  atlas/                     Country profiles (Factbook + World Bank + Wikipedia), regions
                             (geoBoundaries), region and city profiles (Wikipedia + Wikidata)
  cii/                       Instability index
  cases/db.ts                SQLite: cases, evidence snapshots, workspaces, watches, audit, Apify ledger
  social/apify.ts            X / TikTok / Instagram searches on demand, hard budget
  reader/reader.ts           SSRF-safe article reader for the link viewer
src/
  core/                      LayerDef contract, zustand stores (layers, investigation, cases, atlas)
  globe/                     GlobeHost (viewer, terrain, imagery), LayerRenderer (pins, shapes,
                             clusters, picking), places, overlays, showreel
  ui/                        LayerPanel (search, grouped layers, key, case file), AnalysisPanel,
                             Investigation (graph canvas), Workbench (case mode), LinkViewer
  layers/<id>/               CLIENT layer: LayerDef + Detail component
  layers/index.ts            CLIENT registry
gui_elements/                ARGUS UI kit: design.ts (chosen design), components, tokens
canvas/                      Design editor: npm run canvas (port 5174), exports to gui_elements/design.ts
```

Every `Feature` carries provenance: `source`, `geoPrecision` (`exact` |
`approximate` | `inferred`) and `geoBasis` (why we put it there). The UI shows
precision on pins (solid / framed / corner-ticked squares), in the map **Key** and in the ANALYSIS
panel. Don't drop these fields: the entity graph, cases and checks rely on them.

### Add a layer

1. **Server**: add `server/providers/<layer>/<source>.ts` implementing
   `Provider` (`fetch()` returns `Feature[]` with `layerId: '<layer>'`), then list it in
   `server/layers.ts`. Order = dedupe priority.
2. **Client**: add `src/layers/<layer>/index.tsx` exporting a `LayerDef`
   (colour, panel `group`, refresh interval, pin style, `legend` for per-item colours, list
   subtitle, `Detail` component), then add it to `src/layers/index.ts`.
3. **Entity graph** (optional): event-like layers go through `reportOf` in `server/entities/rules.ts`;
   anything else gets a mapping in `server/entities/adapters.ts` (a generic asset otherwise).

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

## Source neutrality

One rule for every country, applied in code rather than by taste:

- **Outlets are classed by funding and control** (`server/truth/domains.ts`): `state` = government-owned or
  -funded with government editorial control, whichever government it is (VOA and RFE/RL, RT and Xinhua,
  Al Jazeera, TRT and Anadolu, Ukrinform...); `public` = public-service broadcasters with statutory
  independence; `private` = independent newsrooms from any country. Contested cases carry a note.
- **Corroboration needs independent outlets from more than one country**: one national press echoing
  itself is not confirmation.
- **Campaign flags are symmetric**: "government outlet first" and "several governments push it" fire for
  any bloc. Official government and military Telegram channels of every side share one type ("official,
  party to events") and one neutral colour.
- **Sources span regions and blocs**: African (allAfrica, Radio Dabanga, The Africa Report, Premium Times,
  Daily Maverick...), Latin American (Infobae, El País América, BBC Mundo, MercoPress, InSight Crime,
  Agência Brasil, Prensa Latina...), Asian (The Irrawaddy, Myanmar Now, Dawn, Express Tribune, The Hindu,
  Kathmandu Post, Bangkok Post...), Middle Eastern and exiled Russian newsrooms alongside Western ones;
  government-funded outlets of the US, Russia, China, Iran, Qatar, Turkey, Ukraine, Cuba and Brazil.
  Google News queries rotate regional editions and Spanish, Portuguese and French editions.
- **Governments and think tanks get the same rule** (`server/truth/issuers.ts`): every official statement
  is a claim by its issuer, not a fact, whichever government; every think tank carries who funds and
  steers it (RAND: US government contracts; RUSI: part UK government; Valdai: close to the Kremlin;
  CIIS: Chinese foreign ministry; ORF: Reliance; SETA: close to Turkey's governing party...).
- **Conflict parties are listed neutrally**, in no order of legitimacy.
- **The AI brief is told to apply the same scrutiny to every government**, attribute every claim and
  describe all parties' actions in parallel terms.

## Telegram scouts (`telegram` layer, real-time)

```
server/telegram/channels.ts   curated channels: tier, type (gov/media/osint/state/milblog), bloc, region
server/telegram/parse.ts      t.me/s/<handle> preview -> posts (text, views, media, forwards, mentions)
server/telegram/engine.ts     scout pool, adaptive cadence, coordination clusters, discovery, SSE
GET /api/telegram/swarm       scouts, requests/min, discovered channels, busiest channels
POST /api/llm/translate       on-demand translation of one post (Claude, rate-limited)
```

- **Polite by construction**: 6 scouts, one request start per 350 ms swarm-wide, each channel
  polled at a cadence that follows its posting rate (30 s to 10 min), exponential backoff on errors.
  No account and no bot: bots cannot read channels they do not administer; the preview needs neither.
- **Signals**: posts are geolocated (Latin, Cyrillic and Arabic place names) and join live-wire
  stories as social reports; unplaced posts are listed, not pinned. Near-identical text on 3+
  channels within an hour is a coordination cluster; clusters and forwards feed the network graph.

## News Wire (`news` layer, real-time)

```
server/news/sources.ts   72 feeds: international (BBC, Al Jazeera, DW, France 24, Guardian, NPR, SCMP...),
                         regional (Africa, Latin America, Asia, Middle East), state media of every bloc,
                         grouped Google News searches over outlets that refuse RSS, Spanish/Portuguese/
                         French editions, Bluesky searches. Add a row to add a feed.
server/news/ingest.ts    conditional-GET polling (ETag), RSS/Atom/RDF parsing
server/news/engine.ts    topic gate -> story clustering -> analysis -> pub/sub
GET /api/stream/news     SSE: `snapshot` on connect, then `news` (new|update), `remove`, `status`
```

- **Topic gate** (`server/truth/topics.ts`): security, conflict, unrest, politics and disinformation, in
  English, Spanish, Portuguese and French, including gangs, cartels, militias and juntas.
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

## Internet outages & censorship (`osint`) and natural hazards (`hazards`)

| Layer | Provider | Source | Notes |
|---|---|---|---|
| `osint` | `ioda` | Georgia Tech IODA | country-level internet outages (BGP / active probing); placed at the country centre |
| `osint` | `ooni` | OONI | per-country confirmed blocks and anomalies (24 h) |
| `osint` | `cloudflare-radar` | Cloudflare Radar (`CLOUDFLARE_RADAR_TOKEN`) | curated outages with cause |
| `hazards` | `gdacs` | UN/EC GDACS RSS | orange/red disaster alerts only, exact event centre |
| `hazards` | `usgs` | USGS | M4.5+ last 24 h, exact epicentre |
| `hazards` | `eonet` | NASA EONET | volcanoes, storms, floods with a position <3 days old |
| `hazards` | `nasa-firms` | NASA FIRMS (`FIRMS_MAP_KEY`) | high-power thermal anomalies in conflict areas |

## Official statements, research, warnings, humanitarian

| Layer | Sources | Placement |
|---|---|---|
| `statements` | Direct RSS where it exists (US State Department and DoD, Kremlin, UK FCDO and MoD, Council of the EU, UN News), else grouped Google News `site:` searches over the ministries of Russia, China, Ukraine, India, Turkey, Iran, France, Israel, Saudi Arabia, UAE, Japan, South Korea, Germany, South Africa, Mexico, Pakistan, plus EEAS and NATO | where the statement is about, else the issuer's country (stated) |
| `research` | Crisis Group, Bellingcat, War on the Rocks, Al Jazeera Centre (RSS); ISW, CSIS, RUSI, Carnegie, Chatham House, IISS, SIPRI, ECFR, MERICS, RAND, Brookings, CFR, Valdai, RIAC, CIIS, CICIR, ORF, MP-IDSA, SETA, ISS Africa (searches) | where the analysis is about, else unpinned |
| `warnings` | Airspace closures and NOTAMs, live-fire drills and naval exercises, maritime security incidents (UKMTO, JMIC), launch notices, GNSS interference, as reported; NOAA SWPC space weather (Kp, alerts) | where the notice is, located by the gazetteer; space weather is global |
| `humanitarian` | WHO Disease Outbreak News; ReliefWeb (UN OCHA) reports and disasters | the country concerned (stated) |

The official NGA broadcast-warning API stopped updating in 2024, so warnings come from the coverage
of the notices. ReliefWeb's edge refuses some cloud hosts; WHO still feeds the layer there.

## Frontlines & conflict zones (`frontlines`)

- **Ukraine**: DeepState's occupied and contested polygons, updated daily (a Ukrainian OSINT group;
  partisan, well regarded; editorial claims such as Karelia are skipped).
- **Every other active war** (`server/providers/frontlines/conflicts.ts`): Sudan, Gaza, Lebanon, West Bank,
  Syria, Yemen, Myanmar, eastern DR Congo, the Sahel, Lake Chad and Nigeria, Somalia, Ethiopia, South
  Sudan, Cabo Delgado, Cameroon, Central African Republic, Haiti, Colombia, Mexico, Ecuador, Pakistan,
  Kashmir, Iraq, Afghanistan. No open territorial-control feed exists for them, so each is drawn as the
  regions where it is fought (a curated baseline on real geoBoundaries outlines, not a line of control)
  and shaded by what the live layers report there over the last 3 days (high / elevated / low / quiet).
  Edit the list to add a conflict or a region.

## Cyber threats (`cyber`) and world markets (`finance`)

- `cyber`: ransomware.live recent victims (at the victim's country), abuse.ch Feodo Tracker botnet C2
  servers grouped per country and malware family, CISA Known Exploited Vulnerabilities of the last 14 days
  (listed). Victims, groups and malware families become entities.
- `finance`: 40+ instruments from Yahoo's chart API (major indices, oil, gas, gold, wheat, currencies),
  with day and month moves; a board in the panel. Indices and currencies link to their country.

## Entity graph and investigation canvas

Every report is read, checked and turned into entities with relations (`server/entities/`):

- **Entities**: events, locations (country, region, city, place), actors (governments, armed groups,
  threat actors, organisations, think tanks), sources, claims, assets (vessels, aircraft, satellites,
  jamming areas, cables, markets, instruments).
- **Relations**: located_at, involves (with role), reported_by, claims, about, supports, contradicts,
  copies, forwards, near, mentions, leads, member_of, borders, trades_with, issued_by, responds_to,
  affiliated_with, part_of.
- **Pipeline**: rules extractor (places, actors, event kind, casualties) -> resolution (same event from
  several reports) -> check (confirmed / corroborated / single-source / government-only / contested /
  debunked, with reasons). Claude refines places, actors and claims for a budgeted number of events per
  hour (`PANOPTES_EXTRACT_PER_HOUR`, default 25), and on demand ("✦ Read with AI").
- **Any layer** becomes entities on demand (`adapters.ts`): open any item with **Investigate**.
- **Transforms** (Maltego-style, `transforms.ts`, `live.ts`): walk the graph (who reported it, actors,
  claims, nearby events and assets) or fetch now (⚡ news and Telegram search, events in a country,
  leaders, alliances, neighbours, trade partners, Wikipedia, prediction markets, fact-checks, cyber
  incidents, official statements and analyses about it, warnings nearby, humanitarian reports, official
  reactions to an event, what an issuer published, who funds and controls it, related items in every
  layer) and 💲 X / TikTok / Instagram posts via Apify (below).

## Country atlas, regions and cities

- **Country**: CIA World Factbook data (`server/data/countries.json`, built by
  `scripts/build-countries.mjs`), World Bank indicators, Wikipedia, exchange rate; cards for people,
  economy, energy, military, stability, trade; diplomacy and trade map modes with partner arcs.
- **Regions**: opening a country draws its first-level subdivisions from geoBoundaries (open licence);
  each country is thinned once (~2 km), cached on disk and served pre-gzipped. A click inside the
  country opens the region under the cursor; a click on a city dot or name opens the city.
- **Region and city profiles**: Wikipedia summary, population, area and capital (Wikidata), main cities
  of a region, live items inside the region or within 30 km of the city. Breadcrumb
  Country › Region › City. Regions and cities can be investigated (`part_of` their region and country).

## Case mode (workbench)

**Case mode** in the left panel (or `#case` in the address) swaps the globe for a workbench:

- Left: case picker and status (open / monitoring / closed), evidence (frozen snapshots saved with
  **Add to case**) tagged supports / refutes / context with notes, hypotheses with confidence and
  evidence counts, case notes, PDF export.
- Centre: the investigation graph full size, its inspector and transforms, and a mini map.
- Bottom: a timeline of evidence and of the events on the graph.

Evidence opens on the graph even when the item is no longer live. Everything autosaves to the server
(SQLite) and to the browser; a case the server lost (a free host wipes its disk on restart) is
re-created from the browser's copy. The globe stops rendering while case mode is open.

## Photo geolocation (Sleuth)

**📍 Geolocate photo** (on any item that carries a photo, and in case mode) finds where a photo was
taken with the [geo-sleuth](https://github.com/Oldcircle/geo-sleuth) method (MIT, vendored unmodified
in `sleuth/geo-sleuth`). Every conclusion is checked against data, and the result is coordinates with
an error radius, tiered confidence, the reasoning chain and evidence images.

- **Tool server** (`sleuth/server.py`): runs the skill's Python scripts (EXIF, OCR, reverse image
  search, lookup tables, OpenStreetMap, sun and shadow math, terrain skylines, camera pose,
  CLIP-ranked satellite tiles, DINOv2 street-view matching). It accepts only allowlisted scripts,
  keeps one workspace per run, and needs a bearer token (`SLEUTH_TOKEN`). It is a separate container
  (`sleuth/Dockerfile`), because the models and the browser do not fit the web service.
- **Agent** (`server/sleuth/`): Claude follows the skill's `SKILL.md` verbatim and calls the scripts.
  The free steps run first (board, intake); the AI looks only at what the scripts ranked highest.
- **Cost**: default `claude-haiku-5-5`, at most 40 tool calls and $0.15 per run. **Look harder**
  continues the same run on Sonnet 5.5, then Opus 5.5, with a new budget. Other limits: one run at a
  time, $5 a day (`SLEUTH_DAILY_USD`), 10 starts an hour per IP. The prompt is cached, and the same
  image is never paid for twice.
- For items, what the post claims and where ARGUS placed it are given to the agent as hypotheses to
  test. Reverse-search links (Google Lens, Yandex, Bing, TinEye) open in the analyst's browser.

Run the tool server locally (Python 3.10+, [uv](https://docs.astral.sh/uv/)), then set
`SLEUTH_URL=http://127.0.0.1:8790` (the default) for the API:

```sh
cd sleuth && uv venv .venv && uv pip install -p .venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu \
  && uv pip install -p .venv/bin/python -r requirements.txt && .venv/bin/python -m playwright install chromium
SLEUTH_DEV=1 .venv/bin/python server.py
```

## Socials via Apify (X, TikTok, Instagram)

With `APIFY_TOKEN`, the 💲 transforms search X, TikTok and Instagram for an entity. They run only when
an analyst clicks: 15 results per run, at most 6 runs an hour, cached 6 h, per-run charge ceiling
$0.10 (or the actor's own minimum), and a spend ledger in SQLite stops every run once
`APIFY_BUDGET_USD` (default 2.5) is spent. The canvas shows what has been spent.

## Search and link viewer

- **Search** (⌘K / Ctrl+K): one list with countries (open the atlas), places (fly there), items on the
  map across loaded layers (select) and graph entities (open the canvas). Items are searched in the
  browser; `/api/search` serves places and entities only.
- **Link viewer**: external links open in a floating window. Telegram, YouTube, TikTok, Instagram and X
  use their official embeds; other pages are framed when they allow it, else shown in a reader view
  (`/api/reader`: http(s) only, public hosts only after DNS lookup, 1.5 MB cap, rate-limited).

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
keeping each pair's history across all stories. Open it from **Network** in the left panel or
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
| `ships` | AISStream | `AISSTREAM_API_KEY` | vessels at the main chokepoints (live websocket) |
| `satellites` | CelesTrak | none | low-orbit satellites propagated with SGP4 (snapshot fallback) |
| `infrastructure` | TeleGeography | none | submarine cable routes (schematic) |
| `acled` | Wikipedia Current Events; ACLED | none; `ACLED_EMAIL`/`ACLED_PASSWORD` | cited events of the last 3 days; human-coded events, 14 days |

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
4. Cases live on the instance disk, which the free plan wipes on restart and redeploy; the case
   workbench re-creates them from the browser's copy. To keep them server-side, attach a disk and
   set `PANOPTES_DB=/var/data/panoptes.db`.
5. `npm run build` pre-compresses the built files (brotli + gzip, `scripts/precompress.mjs`); the
   server sends them as is with long cache headers. Layer responses are serialised and gzipped once
   per update with an ETag, so repeat polls cost a 304.
6. Memory on the free plan (512 MB) is the tight resource: region boundaries are cached on disk and
   at most 8 countries in memory; the largest (Russia, US) load on demand only.

Locally, `npm run build && npm start` runs the same production setup on :8787.

Google Trends is relayed by a GitHub Actions job (`.github/workflows/trends-relay.yml`, every 30 min)
that writes `trends.json` to the `data` branch, because Google rate-limits cloud IPs; set
`TRENDS_RELAY_URL` to its raw URL. `secret-scan.yml` runs gitleaks on every push; see `SECURITY.md`.

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
- Conflict zones outside Ukraine are a curated baseline of where each war is fought, not lines of
  control; only their shading is live.
- Official statements and think-tank analyses are claims by their issuers, shown with who they are.
