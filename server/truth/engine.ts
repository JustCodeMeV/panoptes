import type { Feature } from '../../shared/feature.ts'
import type { Assessment, Signal } from '../../shared/truth.ts'
import { geolocate } from '../geo/gazetteer.ts'
import { assess, spreadOf } from './assess.ts'
import { coverageFor } from './gdelt.ts'
import { judgeFactChecks } from '../llm/analysis.ts'
import { llmEnabled } from '../llm/client.ts'
import { MATCH_STRONG, googleFactChecks, loadCorpus, matchFactChecks, type Corpus, type FactCheckItem } from './factchecks.ts'
import { loadSignals, type RawSignal } from './signals.ts'
import { hash, tokenSet } from './text.ts'
import { isTopical } from './topics.ts'

export const LAYER_ID = 'narratives'
const REFRESH_MS = 10 * 60_000
const MAX_COVERAGE_LOOKUPS = 6
const MAX_DEBUNKS = 20
const DEBUNK_AGE_MS = 10 * 86_400_000

type Cluster = { signals: RawSignal[]; tokens: Set<string> }

/** Greedy grouping of signals about the same thing across platforms/regions. */
function cluster(signals: RawSignal[]): Cluster[] {
  const clusters: Cluster[] = []
  for (const s of signals) {
    const t = tokenSet(`${s.text} ${s.context[0] ?? ''}`)
    if (t.size < 2) continue
    let best: Cluster | undefined
    for (const c of clusters) {
      const shared = [...t].filter((x) => c.tokens.has(x))
      const ok = shared.length >= 2 || shared.some((x) => x.length >= 6)
      if (ok && shared.length / Math.min(t.size, c.tokens.size) >= 0.5) {
        best = c
        break
      }
    }
    if (best) {
      best.signals.push(s)
      for (const x of t) best.tokens.add(x)
    } else clusters.push({ signals: [s], tokens: t })
  }
  return clusters
}

const toSignal = (s: RawSignal): Signal => ({ platform: s.platform, region: s.region, text: s.text, volume: s.volume, url: s.url, at: s.at })

function locate(...texts: string[]) {
  const hit = geolocate(...texts)
  return hit
    ? { position: { lat: hit.lat, lon: hit.lon }, geoPrecision: 'inferred' as const, geoBasis: `narrative mentions "${hit.name}" (${hit.kind}); where the story is about, not where it spreads` }
    : { position: undefined, geoPrecision: 'none' as const, geoBasis: 'no location named in the text' }
}

function toFeature(args: {
  id: string
  title: string
  assessment: Assessment
  geoText: string[]
  observedAt: string
  provider: string
  platform: string
  url?: string
  kind: 'trend' | 'debunk' | 'check'
}): Feature {
  const now = new Date().toISOString()
  const a = args.assessment
  return {
    id: `${LAYER_ID}:${args.id}`,
    layerId: LAYER_ID,
    title: args.title,
    ...locate(...args.geoText),
    observedAt: args.observedAt,
    source: { provider: args.provider, platform: args.platform, url: args.url, retrievedAt: now },
    tags: [a.verdict, args.kind, ...new Set(a.signals.map((s) => s.platform))],
    props: { assessment: a, kind: args.kind, risk: a.risk, verdict: a.verdict },
  }
}

export type EngineStatus = { id: string; ok: boolean; count: number; error?: string }
type Snapshot = { at: number; features: Feature[]; status: EngineStatus[] }

let snapshot: Snapshot | undefined
let building: Promise<Snapshot> | undefined

type Pending = { c: Cluster; top: RawSignal; claim: string; matchText: string; factChecks: ReturnType<typeof matchFactChecks> }

function trendFeature(p: Pending, coverage: Awaited<ReturnType<typeof coverageFor>>, coverageError?: string, coveragePending = false): Feature | null {
  const assessment = assess({ signals: p.c.signals.map(toSignal), factChecks: p.factChecks, coverage, coverageError, coveragePending })
  if (assessment.verdict === 'insufficient' && assessment.risk < 20) return null
  return toFeature({
    id: `trend:${hash(p.c.signals.map((s) => s.text).sort()[0])}`,
    title: p.claim,
    assessment,
    geoText: [p.claim, ...p.c.signals.map((s) => s.text)],
    observedAt: p.top.at,
    provider: 'truth-engine',
    platform: p.top.platform,
    url: p.top.url,
    kind: 'trend',
  })
}

/**
 * Phase 1 (fast): signals + fact-check cross-reference, published at once.
 * Phase 2 (slow, background): GDELT coverage lookups, re-published as each lands.
 */
async function build(): Promise<Snapshot> {
  const corpus = await loadCorpus()
  const { signals, sources } = await loadSignals()
  const status: EngineStatus[] = [
    ...corpus.feeds.map((f) => ({ id: `factcheck:${f.publisher}`, ok: f.ok, count: f.count, error: f.error })),
    ...sources,
  ]
  status.push({ id: 'signals:total', ok: true, count: signals.length })

  const topical = signals.filter((s) => isTopical(`${s.text} ${s.context.join(' ')}`))
  status.push({ id: 'signals:topical', ok: true, count: topical.length })
  const clusters = cluster(topical)
    .map((c) => ({ c, volume: c.signals.reduce((n, s) => n + (s.volume ?? 0), 0), spread: spreadOf(c.signals.map(toSignal)) }))
    .sort((a, b) => b.spread * 1e6 + b.volume - (a.spread * 1e6 + a.volume))
    .slice(0, 24)

  const claimedDebunks = new Set<string>()
  const pending: Pending[] = clusters.map(({ c }) => {
    const top = [...c.signals].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0]
    const matchText = `${top.text} ${top.context[0] ?? ''}`
    const factChecks = matchFactChecks(corpus, matchText)
    factChecks.forEach((m) => m.score >= MATCH_STRONG && claimedDebunks.add(m.url))
    return { c, top, claim: top.context[0] ?? top.text, matchText, factChecks }
  })

  const cutoff = Date.now() - DEBUNK_AGE_MS
  const debunkFeatures = corpus.items
    .filter((i) => (i.verdict === 'false' || i.verdict === 'misleading' || i.verdict === 'analysis') && i.date && +new Date(i.date) > cutoff && !claimedDebunks.has(i.url) && isTopical(`${i.title} ${i.summary.slice(0, 200)}`))
    .sort((a, b) => +new Date(b.date!) - +new Date(a.date!))
    .slice(0, MAX_DEBUNKS)
    .map(debunkFeature)

  const trendFeatures: (Feature | null)[] = pending.map((p, i) => trendFeature(p, null, undefined, i < MAX_COVERAGE_LOOKUPS))
  const publish = (): Snapshot =>
    (snapshot = { at: Date.now(), features: [...trendFeatures.filter((f): f is Feature => !!f), ...debunkFeatures], status })
  const first = publish()

  void (async () => {
    for (let i = 0; i < Math.min(MAX_COVERAGE_LOOKUPS, pending.length); i++) {
      try {
        trendFeatures[i] = trendFeature(pending[i], await coverageFor(pending[i].matchText, 0))
      } catch (e) {
        trendFeatures[i] = trendFeature(pending[i], null, e instanceof Error ? e.message : String(e))
      }
      publish()
    }
  })()
  return first
}

function debunkFeature(d: FactCheckItem): Feature {
  const assessment = assess({
    signals: [],
    factChecks: [{ publisher: d.publisher, title: d.title, url: d.url, date: d.date, verdict: d.verdict, score: 1 }],
    coverage: null,
  })
  return toFeature({
    id: `debunk:${hash(d.url)}`,
    title: d.title,
    assessment,
    geoText: [d.title],
    observedAt: d.date ?? new Date().toISOString(),
    provider: 'factcheck-feeds',
    platform: d.publisher,
    url: d.url,
    kind: 'debunk',
  })
}

/** Cached snapshot; rebuilds in the background when stale. */
export async function getNarratives(): Promise<{ features: Feature[]; status: EngineStatus[] }> {
  const stale = !snapshot || Date.now() - snapshot.at > REFRESH_MS
  if (stale && !building) {
    building = build()
      .then((s) => (snapshot = s))
      .finally(() => (building = undefined))
  }
  if (!snapshot) await building
  return { features: snapshot!.features, status: snapshot!.status }
}

export const engineStatus = () => snapshot?.status ?? []

/** Ad-hoc: cross-reference one claim typed or pasted by an analyst. Jumps the GDELT queue. */
export async function checkClaim(claim: string): Promise<Feature> {
  const text = claim.trim().slice(0, 400)
  const corpus: Corpus = await loadCorpus()
  // With an LLM, cast a wider lexical net and let it judge meaning; without one, keyword matching as before.
  const judged = llmEnabled() ? await judgeFactChecks(text, matchFactChecks(corpus, text, 8, 0.25)) : null
  const factChecks = judged ?? matchFactChecks(corpus, text, 5)
  try {
    factChecks.push(...(await googleFactChecks(text)))
  } catch (e) {
    console.warn(`[truth] google fact check: ${e instanceof Error ? e.message : e}`)
  }
  // GDELT is slow and rate-limited: give it a budget, then answer with what we have.
  // The lookup keeps running and is cached, so re-checking the claim later picks it up.
  let coverage = null
  let coverageError: string | undefined
  let coveragePending = false
  const lookup = coverageFor(text, 10)
  lookup.catch(() => undefined)
  try {
    coverage = await Promise.race([
      lookup,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('__budget__')), 20_000)),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === '__budget__') coveragePending = true
    else coverageError = msg
  }
  const now = new Date().toISOString()
  const assessment = assess({
    signals: [{ platform: 'user-input', text, at: now }],
    factChecks: factChecks.sort((a, b) => b.score - a.score).slice(0, 6),
    coverage,
    coverageError,
    coveragePending,
  })
  return toFeature({
    id: `check:${hash(text)}`,
    title: text,
    assessment,
    geoText: [text],
    observedAt: now,
    provider: 'truth-engine',
    platform: 'analyst',
    kind: 'check',
  })
}
