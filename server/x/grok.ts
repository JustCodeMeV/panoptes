import type { Feature } from '../../shared/feature.ts'
import type { Assessment } from '../../shared/truth.ts'
import { redact } from '../core/secrets.ts'

/**
 * A second opinion from X, through Grok. Grok's server-side `x_search` tool reads public X
 * posts in real time; we hand it everything Argus already knows about a story and ask what X
 * shows: who's posting, first-hand media, contradictions, and a verdict. OPTIONAL: without
 * XAI_API_KEY nothing is called and the layer reports itself as off.
 */

const ENDPOINT = 'https://api.x.ai/v1/responses'
const MODEL = process.env.XAI_MODEL || 'grok-4-1-fast'
const TIMEOUT_MS = 90_000

export type XStance = 'supports' | 'contradicts' | 'context'
export type XPost = { url: string; handle?: string; postedAt?: string; stance: XStance; text: string }
export type XVerdict = 'corroborated' | 'disputed' | 'unverified' | 'false'
export type XCheck = {
  verdict: XVerdict
  /** 0..100: how sure Grok is of its verdict, as it reports it. */
  confidence: number
  summary: string
  details: string[]
  discrepancies: string[]
  location?: { name: string; lat?: number; lon?: number }
  posts: XPost[]
  citations: string[]
  model: string
  checkedAt: string
}

export const grokEnabled = () => !!process.env.XAI_API_KEY

const SYSTEM = `You are an OSINT verification assistant working for a security analyst.
Use the x_search tool to look at what public posts on X say about the story you are given, as of right now.
Be sceptical and specific:
- Separate first-hand material (eyewitness photos or video, local accounts, officials on the record) from reposts and commentary.
- Look for contradictions: old footage, a different place, denials, official statements.
- Name accounts and times; never state a claim as fact unless several independent posts support it.
- If X has little or nothing on it, say so. That is a valid answer.
Reply with ONLY a JSON object, no prose before or after, in exactly this shape:
{"verdict":"corroborated|disputed|unverified|false","confidence":0-100,"summary":"2-3 sentences of what X shows","details":["specific facts found on X, with who and when"],"discrepancies":["anything that conflicts with the story"],"location":{"name":"most specific place X points to","lat":number or null,"lon":number or null},"posts":[{"url":"https://x.com/...","handle":"@...","posted_at":"ISO time","stance":"supports|contradicts|context","text":"short quote or paraphrase in English"}]}
Include at most 6 posts, most informative first. Write everything in English.`

/** Turns what Argus knows about a story into a precise question for Grok. */
export function buildPrompt(story: Feature): string {
  const a = story.props.assessment as Assessment | undefined
  const outlets = (a?.coverage?.articles ?? []).slice(0, 6).map((x) => `- ${x.title} (${x.domain})`)
  const timeline = (a?.campaign?.timeline ?? []).slice(0, 6).map((t) => `- ${new Date(t.at).toISOString()} ${t.source}: ${t.title}`)
  const lines = [
    `Story: ${story.title}`,
    `First seen by us: ${story.observedAt}`,
    story.position ? `Where: ${story.geoBasis ?? ''} (${story.position.lat.toFixed(3)}, ${story.position.lon.toFixed(3)}, ${story.geoPrecision})` : 'Where: no place identified yet',
    a ? `Our current verdict: ${a.verdict}. ${a.reasons.slice(0, 3).join('; ')}` : '',
    outlets.length ? `Outlets carrying it:\n${outlets.join('\n')}` : '',
    timeline.length ? `How it spread:\n${timeline.join('\n')}` : '',
    'Search X from the last 72 hours. What do posts on X show about this, and is it true?',
  ]
  return lines.filter(Boolean).join('\n\n')
}

const VERDICTS = new Set<XVerdict>(['corroborated', 'disputed', 'unverified', 'false'])
const STANCES = new Set<XStance>(['supports', 'contradicts', 'context'])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 8) : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Pulls Grok's JSON out of its reply (tolerating code fences or stray prose) and keeps only well-formed fields. */
export function parseCheck(text: string, citations: string[] = []): Omit<XCheck, 'model' | 'checkedAt'> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const verdict = str(raw.verdict) as XVerdict
  const summary = str(raw.summary)
  if (!VERDICTS.has(verdict) || !summary) return null
  const loc = raw.location as Record<string, unknown> | undefined
  const posts = (Array.isArray(raw.posts) ? raw.posts : [])
    .map((p: Record<string, unknown>) => ({
      url: str(p.url),
      handle: str(p.handle) || undefined,
      postedAt: str(p.posted_at) || undefined,
      stance: (STANCES.has(str(p.stance) as XStance) ? str(p.stance) : 'context') as XStance,
      text: str(p.text),
    }))
    // Only links that really point at X
    .filter((p) => /^https:\/\/(x|twitter)\.com\//.test(p.url) && p.text)
    .slice(0, 6)
  const lat = num(loc?.lat)
  const lon = num(loc?.lon)
  return {
    verdict,
    confidence: Math.max(0, Math.min(100, Math.round(num(raw.confidence) ?? 50))),
    summary,
    details: list(raw.details),
    discrepancies: list(raw.discrepancies),
    location: str(loc?.name) ? { name: str(loc?.name), ...(lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {}) } : undefined,
    posts,
    citations: citations.filter((u) => /^https?:\/\//.test(u)).slice(0, 20),
  }
}

type ResponsesBody = {
  output_text?: string
  output?: { type?: string; content?: { type?: string; text?: string; annotations?: { url?: string }[] }[] }[]
  citations?: (string | { url?: string })[]
  error?: { message?: string }
}

/** Asks Grok about one story. Throws with a readable reason on failure. */
export async function askGrok(story: Feature): Promise<XCheck> {
  const key = process.env.XAI_API_KEY
  if (!key) throw new Error('no XAI_API_KEY')
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(story) },
      ],
      tools: [{ type: 'x_search', from_date: day(3), to_date: day(-1) }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = (await res.json().catch(() => ({}))) as ResponsesBody
  if (!res.ok) throw new Error(redact(`xAI ${res.status}: ${body.error?.message ?? res.statusText}`))
  const parts = body.output?.flatMap((o) => o.content ?? []) ?? []
  const text = body.output_text ?? parts.map((c) => c.text ?? '').join('\n')
  const cites = [
    ...(body.citations ?? []).map((c) => (typeof c === 'string' ? c : (c.url ?? ''))),
    ...parts.flatMap((c) => (c.annotations ?? []).map((a) => a.url ?? '')),
  ]
  const parsed = parseCheck(text, [...new Set(cites)])
  if (!parsed) throw new Error('Grok replied without a usable verdict')
  return { ...parsed, model: MODEL, checkedAt: new Date().toISOString() }
}
