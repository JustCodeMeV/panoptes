import type { Feature } from '../../shared/feature.ts'
import type { LiveEvent } from '../../shared/live.ts'

/**
 * Automatic English for everything scraped in another language.
 *
 * `localize` never waits on the network: it swaps in a translation it already has and queues
 * anything new; a background worker translates the queue in batches (Google Translate's free web
 * endpoint: no key, auto-detects the language), and the next poll / snapshot / live event carries
 * the English. Translated features keep the original in `props.original` and the detected
 * language in `props.lang`, so the UI can tag the source and offer the original.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=en'
const BATCH_ITEMS = 40
const BATCH_CHARS = 6000
const EVERY_MS = 1500
const MAX_CACHE = 20_000
/** Title-length texts and post bodies are both translated; longer bodies are cut. */
const MAX_TEXT = 1500

type Result = { en: string; lang: string }
const cache = new Map<string, Result | null>() // null = it was English already
const queue = new Map<string, string>() // key -> text
let backoffUntil = 0
const listeners = new Set<() => void>()

/** Called after each batch that produced at least one translation. */
export function onTranslated(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const key = (t: string) => t.trim().slice(0, MAX_TEXT)

// Script letters that are certainly not English
const FOREIGN_SCRIPT = /[Ͱ-ϿЀ-ԯ԰-֏֐-׿؀-ۿऀ-ॿঀ-৿฀-๿Ⴀ-ჿ぀-ヿ㐀-鿿가-힯]/
const ENGLISH = /\b(the|and|of|to|in|is|for|on|with|at|from|by|after|as|are|was|has|have|says|over|amid)\b/gi
const OTHER_LATIN = /\b(el|la|los|las|del|que|por|con|para|une|les|des|est|dans|sur|pour|der|die|das|und|nicht|mit|auf|eine|não|uma|com|il|gli|della|che|per|ve|bir|için|ile|się|nie|jest|że|z|w|na)\b/gi
const LATIN_ACCENTS = /[ñçãõáéíóúâêôàèìòùäöüßğşıłąęśźżćńřšžčě]/i

/** Worth sending for translation? (English is skipped to save calls; the endpoint double-checks.) */
export function looksForeign(t: string): boolean {
  if (FOREIGN_SCRIPT.test(t)) return true
  const en = t.match(ENGLISH)?.length ?? 0
  const other = t.match(OTHER_LATIN)?.length ?? 0
  return other >= 2 && other > en ? true : LATIN_ACCENTS.test(t) && en === 0 && t.split(/\s+/).length >= 3
}

/** Cached translation, or undefined (and queued) when not known yet. Null means "already English". */
function lookup(text: string): Result | null | undefined {
  const k = key(text)
  if (!k || !looksForeign(k)) return null
  if (cache.has(k)) return cache.get(k)
  queue.set(k, k)
  return undefined
}

async function work() {
  if (!queue.size || Date.now() < backoffUntil) return
  const batch: string[] = []
  let chars = 0
  for (const k of queue.keys()) {
    if (batch.length >= BATCH_ITEMS || (batch.length && chars + k.length > BATCH_CHARS)) break
    batch.push(k)
    chars += k.length
  }
  for (const k of batch) queue.delete(k)
  try {
    const body = new URLSearchParams(batch.map((q): [string, string] => ['q', q]))
    const res = await fetch(ENDPOINT, { method: 'POST', body, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const out = (await res.json()) as [string, string][] | [string, string]
    // A single q comes back as one pair, several as a list of pairs
    const pairs = batch.length === 1 ? [out as [string, string]] : (out as [string, string][])
    let any = false
    batch.forEach((k, i) => {
      const [en, lang] = pairs[i] ?? []
      const foreign = !!en && !!lang && lang !== 'en'
      cache.set(k, foreign ? { en, lang } : null)
      any ||= foreign
    })
    if (any) for (const fn of listeners) fn()
    if (cache.size > MAX_CACHE) for (const k of [...cache.keys()].slice(0, cache.size - MAX_CACHE)) cache.delete(k)
  } catch {
    // Put them back and slow down; the originals keep showing meanwhile
    for (const k of batch) queue.set(k, k)
    backoffUntil = Date.now() + 60_000
  }
}
setInterval(() => void work(), EVERY_MS).unref()

/** The feature in English, if it's foreign and a translation is ready (otherwise unchanged). */
export function localize(f: Feature): Feature {
  if (f.props.original) return f
  const title = lookup(f.title)
  if (!title) return f
  const body = typeof f.props.text === 'string' ? lookup(f.props.text) : null
  return {
    ...f,
    title: title.en,
    props: {
      ...f.props,
      lang: title.lang,
      ...(body ? { text: body.en } : {}),
      original: { title: f.title, ...(body ? { text: f.props.text } : {}) },
    },
  }
}

export const localizeAll = (features: Feature[]) => features.map(localize)

/** Live events: the feature and the triggering item's headline. */
export function localizeEvent(e: LiveEvent): LiveEvent {
  if (e.type !== 'upsert') return e
  const item = e.item && lookup(e.item.title)
  return { ...e, feature: localize(e.feature), ...(item && e.item ? { item: { ...e.item, title: item.en } } : {}) }
}
