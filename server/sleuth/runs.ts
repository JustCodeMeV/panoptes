import Anthropic from '@anthropic-ai/sdk'
import { createHash, randomBytes } from 'node:crypto'
import type { Feature } from '../../shared/feature.ts'
import { redact } from '../core/secrets.ts'
import { assertPublicUrl } from '../reader/reader.ts'
import { runAgent, systemFor, type AgentState, type Finding, type Step } from './agent.ts'
import { LADDER, type Model } from './prices.ts'
import { execTool, toolServer } from './tools.ts'

/**
 * SLEUTH RUNS: one photo investigation each. Free work first (board init + intake: EXIF, OCR, crops,
 * reverse image search, no LLM), then the metered agent. Bounded three ways: per-run steps and dollars,
 * one run at a time, and a daily dollar cap. The same image is never paid for twice (hash memo).
 */

export type RunStatus = 'intake' | 'running' | 'done' | 'failed' | 'cancelled'
export type RunSource = { kind: 'upload' | 'url' | 'item'; url?: string; featureId?: string; title?: string }
export type Run = {
  id: string
  status: RunStatus
  createdAt: number
  updatedAt: number
  hash: string
  source: RunSource
  purpose: string
  context?: string
  model: Model
  costUsd: number
  toolCalls: number
  budget: { steps: number; usd: number }
  steps: Step[]
  report?: string
  finding?: Finding
  images: string[]
  error?: string
}

const STEPS = Number(process.env.SLEUTH_MAX_STEPS) || 40
const USD: Record<Model, number> = {
  'claude-haiku-5-5': Number(process.env.SLEUTH_USD_HAIKU) || 0.15,
  'claude-sonnet-5-5': Number(process.env.SLEUTH_USD_SONNET) || 1.5,
  'claude-opus-5-5': Number(process.env.SLEUTH_USD_OPUS) || 3,
}
const DAILY_USD = Number(process.env.SLEUTH_DAILY_USD) || 5
const MAX_ACTIVE = Number(process.env.SLEUTH_MAX_ACTIVE) || 1
const MAX_RUNS = 50
const MAX_IMAGE = 20 * 1024 * 1024

const runs = new Map<string, Run>()
const agents = new Map<string, AgentState>()
const cancelled = new Set<string>()
const spentByDay = new Map<string, number>()
const today = () => new Date().toISOString().slice(0, 10)

let client: Anthropic | null | undefined
const getClient = () => (client === undefined ? (client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 180_000, maxRetries: 2 }) : null) : client)

let skillText: string | undefined
async function system() {
  skillText ??= (await toolServer.skill('SKILL.md')) ?? undefined
  if (!skillText) throw new Error('tool server has no SKILL.md')
  return systemFor(skillText)
}

export async function sleuthStatus() {
  const spent = spentByDay.get(today()) ?? 0
  return {
    llm: !!getClient(),
    toolServer: await toolServer.health(),
    active: [...runs.values()].filter((r) => r.status === 'intake' || r.status === 'running').length,
    spentTodayUsd: Math.round(spent * 1000) / 1000,
    dailyCapUsd: DAILY_USD,
    defaults: { model: LADDER[0], steps: STEPS, usd: USD[LADDER[0]] },
  }
}

export const getRun = (id: string) => runs.get(id)
export const listRuns = () => [...runs.values()].sort((a, b) => b.createdAt - a.createdAt).map(({ steps, report: _report, ...r }) => ({ ...r, steps: steps.length }))

// ---- images -------------------------------------------------------------------------------------

/** File extension from the first bytes; null when it is not an image we accept. */
export function imageKind(b: Uint8Array): 'jpg' | 'png' | 'webp' | 'gif' | 'heic' | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp'
  if (String.fromCharCode(...b.slice(0, 3)) === 'GIF') return 'gif'
  if (String.fromCharCode(...b.slice(4, 12)).match(/^ftyp(heic|heix|mif1)/)) return 'heic'
  return null
}

/** Downloads an image from a public URL: redirects re-checked, size capped. */
export async function fetchImage(raw: string): Promise<Uint8Array> {
  let url = raw
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(url)
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 ARGUS' } })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url).toString()
      continue
    }
    if (!res.ok || !res.body) throw new Error(`image download failed (${res.status})`)
    if (Number(res.headers.get('content-length')) > MAX_IMAGE) throw new Error('image larger than 20 MB')
    const chunks: Uint8Array[] = []
    let n = 0
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      n += c.length
      if (n > MAX_IMAGE) throw new Error('image larger than 20 MB')
      chunks.push(c)
    }
    return Buffer.concat(chunks)
  }
  throw new Error('too many redirects')
}

/** The picture a live item carries (Telegram photo or video thumbnail, social media, article image). */
export function imageOf(f: Feature): string | undefined {
  const p = f.props as Record<string, unknown>
  const media = p.media as { thumb?: string } | string | undefined
  const cands = [typeof media === 'object' ? media?.thumb : media, p.thumb, p.image, p.thumbnail, p.photo]
  return cands.find((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
}

/** What the item claims, for the agent to test (a hint, never evidence). */
export function contextOf(f: Feature): string {
  const p = f.props as Record<string, unknown>
  const lines = [
    `Source item: ${f.title}`,
    `Layer: ${f.layerId}; platform: ${f.source.platform}; observed ${f.observedAt}`,
    typeof p.text === 'string' && `Post text: ${p.text.slice(0, 1200)}`,
    f.position && `ARGUS placed this item at ${f.position.lat.toFixed(4)}, ${f.position.lon.toFixed(4)} (${f.geoPrecision ?? 'unknown precision'}: ${f.geoBasis ?? 'from the text'}). That is a claim to test, not a fact.`,
    typeof p.country === 'string' && `Claimed or inferred country: ${p.country}`,
  ]
  return lines.filter(Boolean).join('\n')
}

// ---- runs ---------------------------------------------------------------------------------------

export type StartInput = { image: Uint8Array; purpose: string; source: RunSource; context?: string }

export async function startRun(inp: StartInput): Promise<Run> {
  const kind = imageKind(inp.image)
  if (!kind) throw new Error('not a JPEG, PNG, WebP, GIF or HEIC image')
  if (inp.image.length > MAX_IMAGE) throw new Error('image larger than 20 MB')
  const purpose = inp.purpose.trim().slice(0, 500)
  if (purpose.length < 3) throw new Error('state the purpose of this geolocation')
  if (!getClient()) throw new Error('ANTHROPIC_API_KEY is not configured')
  if (!(await toolServer.health())) throw new Error('the sleuth tool server is not reachable')
  const hash = createHash('sha256').update(inp.image).digest('hex')
  const prior = [...runs.values()].find((r) => r.hash === hash && r.status !== 'failed' && r.status !== 'cancelled')
  if (prior) return prior
  if ([...runs.values()].filter((r) => r.status === 'intake' || r.status === 'running').length >= MAX_ACTIVE) throw new Error('another geolocation is running; try again when it finishes')
  if ((spentByDay.get(today()) ?? 0) >= DAILY_USD) throw new Error(`daily geolocation budget ($${DAILY_USD}) reached`)

  const id = `run-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const model = LADDER[0]
  const run: Run = {
    id, status: 'intake', createdAt: Date.now(), updatedAt: Date.now(), hash, source: inp.source, purpose, context: inp.context,
    model, costUsd: 0, toolCalls: 0, budget: { steps: STEPS, usd: USD[model] }, steps: [], images: [],
  }
  runs.set(id, run)
  trim()
  void execute(run, inp.image, kind)
  return run
}

function trim() {
  const old = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt)
  while (old.length > MAX_RUNS) {
    const r = old.shift()!
    if (r.status === 'intake' || r.status === 'running') continue
    runs.delete(r.id)
    agents.delete(r.id)
    void toolServer.drop(r.id)
  }
}

const step = (run: Run, kind: Step['kind'], text: string, ok?: boolean) => {
  run.steps.push({ at: Date.now(), kind, text, ok })
  run.updatedAt = Date.now()
}

async function execute(run: Run, image: Uint8Array, kind: string) {
  try {
    // The scripts read photo.jpg; other formats keep their extension and the agent is told the name
    const name = `photo.${kind}`
    await toolServer.putPhoto(run.id, name, image)
    await toolServer.run(run.id, 'board', ['init', '--photo', name])
    step(run, 'tool', 'board init', true)
    const intake = await toolServer.run(run.id, 'intake', [name, '--out-dir', 'intake'])
    step(run, 'tool', `intake (EXIF, OCR, crops, reverse image search) in ${(intake.ms / 1000).toFixed(0)}s`, intake.code === 0)
    const report = (await toolServer.text(run.id, 'intake/intake.md')) ?? `intake failed:\n${intake.stderr.slice(-2000)}`
    const photo = await toolServer.image(run.id, name, 1280)
    const first: Anthropic.Beta.BetaContentBlockParam[] = [
      ...(photo ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: photo.type as 'image/jpeg', data: photo.data } }] : []),
      {
        type: 'text',
        text: [
          `The photo under investigation is ${name} (shown above, downscaled; view_image it or its crops for detail).`,
          `Analyst's stated purpose: ${run.purpose}`,
          run.context && `Context from ARGUS (hypotheses to test, not facts):\n${run.context}`,
          `Budget for this run: ${run.budget.steps} tool calls, $${run.budget.usd.toFixed(2)}.`,
          `=== intake/intake.md (step 1 output) ===\n${report.slice(0, 14_000)}`,
        ].filter(Boolean).join('\n\n'),
      },
    ]
    const state: AgentState = { model: run.model, messages: [{ role: 'user', content: first }], steps: run.steps, toolCalls: 0, costUsd: 0, budget: run.budget }
    agents.set(run.id, state)
    await drive(run, state)
  } catch (e) {
    run.status = 'failed'
    run.error = redact(e instanceof Error ? e.message : String(e)).slice(0, 300)
    step(run, 'error', run.error, false)
  }
}

async function drive(run: Run, state: AgentState) {
  run.status = 'running'
  const before = state.costUsd
  const c = getClient()!
  await runAgent(state, await system(), {
    create: (p) => c.beta.messages.create(p),
    exec: (name, input) => execTool(run.id, name, input),
    cancelled: () => cancelled.has(run.id),
    onStep: () => {
      run.costUsd = state.costUsd
      run.toolCalls = state.toolCalls
      run.updatedAt = Date.now()
    },
  })
  spentByDay.set(today(), (spentByDay.get(today()) ?? 0) + state.costUsd - before)
  Object.assign(run, { costUsd: state.costUsd, toolCalls: state.toolCalls, report: state.report, finding: state.finding, updatedAt: Date.now() })
  run.status = state.stop === 'cancelled' ? 'cancelled' : state.stop === 'error' || state.stop === 'refused' ? 'failed' : 'done'
  if (state.error) run.error = redact(state.error)
  // Images worth showing: evidence first, then sheets and renders the agent produced
  const files = await toolServer.list(run.id).then((l) => l.files).catch(() => [] as string[])
  const imgs = files.filter((f) => /\.(jpe?g|png)$/i.test(f) && !f.startsWith('intake/edges/') && !f.startsWith('intake/variants/') && !f.startsWith('.cache/'))
  run.images = [...imgs.filter((f) => /evidence/i.test(f)), ...imgs.filter((f) => !/evidence/i.test(f))].slice(0, 30)
}

/** Continue the same investigation on the next stronger model, with a fresh budget for it. */
export async function harder(id: string): Promise<Run> {
  const run = runs.get(id)
  const state = agents.get(id)
  if (!run || !state) throw new Error('no such run')
  if (run.status === 'intake' || run.status === 'running') throw new Error('the run is still going')
  const next = LADDER[LADDER.indexOf(run.model) + 1]
  if (!next) throw new Error('already on the strongest model')
  if ((spentByDay.get(today()) ?? 0) >= DAILY_USD) throw new Error(`daily geolocation budget ($${DAILY_USD}) reached`)
  if ([...runs.values()].filter((r) => r.status === 'intake' || r.status === 'running').length >= MAX_ACTIVE) throw new Error('another geolocation is running')
  cancelled.delete(id)
  run.model = state.model = next
  run.budget = state.budget = { steps: state.toolCalls + STEPS, usd: state.costUsd + USD[next] }
  run.error = undefined
  step(run, 'note', `looking harder with ${next}`)
  state.messages.push({
    role: 'user',
    content: `The analyst asked you to look harder; you are now running on a stronger model with a new budget (${STEPS} more tool calls, $${USD[next].toFixed(2)}). Re-check the conclusion above against the skill's hard rules: which clues are unused, which candidates were down-weighted without evidence, which discriminating test was skipped. Continue the investigation, then give a new final message with the JSON block.`,
  })
  void drive(run, state).catch((e) => {
    run.status = 'failed'
    run.error = redact(e instanceof Error ? e.message : String(e)).slice(0, 300)
  })
  return run
}

export function cancel(id: string) {
  if (!runs.has(id)) return false
  cancelled.add(id)
  return true
}
