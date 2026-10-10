import type Anthropic from '@anthropic-ai/sdk'
import { cost, type Model } from './prices.ts'
import { TOOLS } from './tools.ts'

/**
 * SLEUTH AGENT: Claude works through the geo-sleuth method (SKILL.md, verbatim, as the system prompt)
 * using the tool server's scripts. The loop is ours so every request is metered: a run stops at its
 * step or dollar budget and is then asked for its conclusion without tools. The transcript is append-only
 * (prompt cache stays valid, and "look harder" continues it on a stronger model).
 */

type Msg = Anthropic.Beta.BetaMessageParam
type Params = Anthropic.Beta.MessageCreateParamsNonStreaming

export type Step = { at: number; kind: 'tool' | 'note' | 'error'; text: string; ok?: boolean }
export type Finding = {
  lat?: number
  lon?: number
  radius_m?: number
  place?: string
  level?: string
  confidence?: string
  heading_deg?: number | null
  captured_at?: string | null
}
export type AgentState = {
  model: Model
  messages: Msg[]
  steps: Step[]
  toolCalls: number
  costUsd: number
  budget: { steps: number; usd: number }
  report?: string
  finding?: Finding
  stop?: 'done' | 'budget' | 'refused' | 'error' | 'cancelled'
  error?: string
}
export type Deps = {
  create(p: Params): Promise<Anthropic.Beta.BetaMessage>
  exec(name: string, input: unknown): Promise<{ content: Anthropic.Beta.BetaToolResultBlockParam['content']; isError: boolean; summary: string }>
  cancelled(): boolean
  onStep?(): void
}

const ADAPTER = `You are the photo-geolocation analyst inside ARGUS, an OSINT tool. You follow the geo-sleuth skill below exactly; ARGUS has adapted only how commands are run:

- A skill command \`uv run \${CLAUDE_SKILL_DIR}/scripts/<script>.py <args>\` is the tool call run_script {script: "<script>", args: [...]}. Do not prefix paths with the skill directory. Your working directory is this investigation's workspace; the photo under investigation is photo.jpg (possibly with more photos named in the first message).
- References the skill tells you to read (references/*.md, regions/<cc>/*) come from read_skill_file. Workspace files: read_file (text), view_image (images), list_files.
- Step 1 (intake.py and board.py init) has already been run for you; its report is in the first message. Continue from there.
- Nobody can answer questions during the run: do not ask the user anything. Hard rule 0: the analyst's stated purpose is in the first message; if it is missing, or the photo shows a private residence or minors and the purpose does not justify locating it, stop and say why instead of geolocating.
- Every tool call and every token is metered. Follow the skill's "machine ranks first" rules strictly: open only the top few results, prefer cheap discriminating tests, never page through candidates one by one. The remaining budget is shown after each tool result; when it runs out you will be asked to conclude.
- Your final message is the skill's output (conclusion, coordinates with error radius, reasoning chain with the commands actually run, tiered confidence, alternatives, what is missing), written in English, and it ends with exactly one fenced JSON block:
\`\`\`json
{"lat": <number|null>, "lon": <number|null>, "radius_m": <number|null>, "place": "<name>", "level": "<country|admin1|city|area|road|building|floor|none>", "confidence": "<high|medium|low>", "heading_deg": <number|null>, "captured_at": "<ISO time or null>"}
\`\`\`
Use the finest level rated medium or above (the skill's tier table). If nothing can be supported, use nulls and level "none".

=== geo-sleuth SKILL.md ===
`

/** System prompt: identical bytes for every run (cached once, read by every later request). */
export const systemFor = (skill: string): Anthropic.Beta.BetaTextBlockParam[] => [{ type: 'text', text: ADAPTER + skill, cache_control: { type: 'ephemeral' } }]

const EFFORT: Partial<Record<Model, 'low' | 'medium' | 'high'>> = { 'claude-opus-5-5': 'high' }
// Sonnet 5.5 and Opus 5.5 can be declined by safety classifiers on legitimate OSINT; the server then retries on a fallback model
const FALLBACK = new Set<Model>(['claude-sonnet-5-5', 'claude-opus-5-5'])

export function parseFinding(text: string): Finding | undefined {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
  const last = blocks.at(-1)?.[1]
  if (!last) return undefined
  try {
    const j = JSON.parse(last) as Finding
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    const lat = num(j.lat)
    const lon = num(j.lon)
    const ok = lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    return { ...j, lat: ok ? lat : undefined, lon: ok ? lon : undefined, radius_m: num(j.radius_m) }
  } catch {
    return undefined
  }
}

const budgetLine = (s: AgentState) =>
  `[budget] ${s.toolCalls}/${s.budget.steps} tool calls, $${s.costUsd.toFixed(3)} of $${s.budget.usd.toFixed(2)} spent`

/** Runs until Claude concludes or the budget is spent. Mutates and returns the state. */
export async function runAgent(s: AgentState, system: Anthropic.Beta.BetaTextBlockParam[], deps: Deps): Promise<AgentState> {
  const note = (kind: Step['kind'], text: string, ok?: boolean) => {
    s.steps.push({ at: Date.now(), kind, text, ok })
    deps.onStep?.()
  }
  let concluding = false
  for (;;) {
    if (deps.cancelled()) {
      s.stop = 'cancelled'
      return s
    }
    const over = s.toolCalls >= s.budget.steps || s.costUsd >= s.budget.usd
    if (over && !concluding) {
      concluding = true
      note('note', `budget reached (${budgetLine(s).slice(9)}); asking for the conclusion`)
      s.messages.push({
        role: 'user',
        content: 'Budget reached: no more tool calls. Write your final message now from what has been verified so far: state the supported level, the search coverage, what was not checked and what is missing, and end with the JSON block.',
      })
    }
    let res: Anthropic.Beta.BetaMessage
    try {
      res = await deps.create({
        model: s.model,
        max_tokens: 16_000,
        system,
        tools: TOOLS,
        ...(concluding ? { tool_choice: { type: 'none' as const } } : {}),
        messages: s.messages,
        cache_control: { type: 'ephemeral' },
        ...(EFFORT[s.model] ? { output_config: { effort: EFFORT[s.model] } } : {}),
        ...(FALLBACK.has(s.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
    } catch (e) {
      const status = (e as { status?: number }).status
      s.stop = 'error'
      s.error =
        status === 401 ? 'the Anthropic API key was rejected (401): check ANTHROPIC_API_KEY'
        : status === 429 ? 'Anthropic rate limit reached (429): try again in a minute'
        : e instanceof Error ? e.message.slice(0, 300) : String(e)
      note('error', s.error, false)
      return s
    }
    s.costUsd += cost(s.model, res.usage)
    s.messages.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] })

    if (res.stop_reason === 'refusal') {
      s.stop = 'refused'
      s.error = res.stop_details?.explanation ?? 'the model declined this request'
      note('error', `declined: ${s.error}`, false)
      return s
    }
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
    if (res.stop_reason === 'max_tokens' && uses.length) {
      s.stop = 'error'
      s.error = 'response cut at max_tokens'
      note('error', s.error, false)
      return s
    }
    if (!uses.length || concluding) {
      s.report = text
      s.finding = parseFinding(text)
      s.stop = concluding ? 'budget' : 'done'
      note('note', s.finding?.lat !== undefined ? `concluded: ${s.finding.place ?? ''} ±${s.finding.radius_m ?? '?'} m (${s.finding.confidence ?? '?'})` : 'concluded without a location', true)
      return s
    }
    if (text) note('note', text.slice(0, 400))
    // All results of one turn go back in one message (parallel tool use)
    const results: Anthropic.Beta.BetaContentBlockParam[] = []
    for (const u of uses) {
      s.toolCalls++
      const r = await deps.exec(u.name, u.input)
      note('tool', r.summary, !r.isError)
      results.push({ type: 'tool_result', tool_use_id: u.id, content: r.content, is_error: r.isError || undefined })
    }
    results.push({ type: 'text', text: budgetLine(s) })
    s.messages.push({ role: 'user', content: results })
  }
}
