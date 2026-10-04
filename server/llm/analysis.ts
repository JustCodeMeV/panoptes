import { z } from 'zod/v4'
import type { Feature } from '../../shared/feature.ts'
import type { Assessment, Brief, FactCheckMatch } from '../../shared/truth.ts'
import { MATCH_MIN } from '../truth/factchecks.ts'
import { memo, structured } from './client.ts'

const MODEL = process.env.PANOPTES_LLM_MODEL || 'claude-haiku-4-5'

// ---------- analyst brief ----------

const BriefSchema = z.object({
  summary: z.string().describe('Two sentences: what is being claimed and where it stands now.'),
  whyFlagged: z.array(z.string()).describe('One line per spread-pattern flag or verdict reason, in plain words. Empty if nothing is flagged.'),
  frames: z.array(z.object({ actor: z.string(), frame: z.string() })).describe('How each outlet group or state bloc frames the story. Only actors present in the input.'),
  checkNext: z.array(z.string()).describe('Two or three concrete next steps for an analyst to confirm or refute it.'),
  glosses: z.array(z.object({ source: z.string(), english: z.string() })).describe('English translation of every non-English headline, keyed by source. Empty if all are English.'),
})

const BRIEF_SYSTEM = `You are an intelligence analyst's assistant inside Panoptes, a tool that maps unrest and influence campaigns.
You receive one story: headlines from the outlets and social accounts that carried it, a heuristic spread-pattern analysis, matched fact-checks and related prediction markets.
Write a short, neutral brief. Rules:
- Use only the evidence given. Never add facts, names, numbers or attributions that are not in the input.
- Spread patterns are leads, not proof of coordination: say "consistent with", not "is".
- Name outlets and blocs exactly as given. Keep every line under 30 words.
- Be neutral between countries and blocs. Apply the same scrutiny to every government, military and outlet, Western or not: no side's official statements are assumed accurate, and "government-funded" means the same thing for the US, Russia, Qatar or Ukraine.
- Attribute every claim to who makes it ("X says", "Y's ministry claims"). Describe actions in parallel terms for all parties (e.g. "Israeli strikes" / "Hezbollah strikes", "Russian strikes" / "Ukrainian strikes"); avoid loaded words such as "regime", "terrorist", "propaganda" or "aggression" unless quoting a source.`

function briefInput(f: Feature): string {
  const a = f.props.assessment as Assessment
  const c = a.campaign
  const t0 = c?.timeline[0]?.at
  const lines = [
    `HEADLINE: ${f.title}`,
    `VERDICT (heuristic): ${a.verdict}; attention ${a.risk}/100`,
    `REASONS: ${a.reasons.join(' | ')}`,
  ]
  if (c) {
    lines.push(`SPREAD SCORE: ${c.score}/100; state blocs: ${c.blocs.join(', ') || 'none'}; social accounts: ${c.socialAccounts}`)
    lines.push(`FLAGS: ${c.flags.map((x) => `${x.label} (${x.severity}): ${x.detail}`).join(' | ') || 'none'}`)
    lines.push('TIMELINE (minutes after first item, source, class, bloc, headline):')
    for (const i of c.timeline.slice(0, 25)) lines.push(`  +${Math.round((i.at - (t0 ?? i.at)) / 60_000)}m ${i.source} [${i.cls}${i.bloc ? `/${i.bloc}` : ''}] ${i.title}`)
  } else {
    for (const s of a.signals.slice(0, 12)) lines.push(`  ${s.platform} ${s.region ?? ''}: ${s.text}`)
  }
  if (a.factChecks.length) lines.push(`FACT-CHECKS: ${a.factChecks.map((m) => `${m.publisher} rated "${m.verdict}": ${m.title}`).join(' | ')}`)
  if (a.markets?.length) lines.push(`MARKETS: ${a.markets.map((m) => `${m.title} = ${Math.round(m.p * 100)}% (${m.platform}${m.playMoney ? ', play money' : ''})`).join(' | ')}`)
  return lines.join('\n')
}

const briefMemo = memo<Brief>()

/** Cached per story state: regenerated when the timeline or verdict changes. */
export function briefFor(f: Feature): Promise<Brief | null> {
  const a = f.props.assessment as Assessment | undefined
  if (!a) return Promise.resolve(null)
  const key = `${f.id.replace(/^campaigns:/, 'news:')}|${a.verdict}|${a.campaign?.timeline.length ?? a.signals.length}|${a.factChecks.length}`
  return briefMemo(key, async () => {
    const out = await structured({ system: BRIEF_SYSTEM, prompt: briefInput(f), schema: BriefSchema, maxTokens: 1500 })
    return out && { ...out, model: MODEL, at: new Date().toISOString() }
  })
}

// ---------- semantic fact-check matching ----------

const JudgeSchema = z.object({
  results: z.array(z.object({ index: z.number(), relation: z.enum(['same', 'related', 'unrelated']) })),
})

const JUDGE_SYSTEM = `You compare a claim with published fact-check headlines.
For each numbered fact-check answer:
- "same": it checks this specific claim (same event and assertion, wording may differ or be in another language).
- "related": same topic or event, but checks a different assertion.
- "unrelated": anything else.
Judge only from the text given.`

const judgeMemo = memo<FactCheckMatch[]>()

/**
 * Re-ranks lexical candidates by meaning. "same" becomes a strong match,
 * "related" stays as weak context, "unrelated" is dropped. Null = LLM unavailable.
 */
export function judgeFactChecks(claim: string, candidates: FactCheckMatch[]): Promise<FactCheckMatch[] | null> {
  if (!candidates.length) return Promise.resolve([])
  return judgeMemo(`${claim}|${candidates.map((c) => c.url).join(',')}`, async () => {
    const prompt = `CLAIM: ${claim}\n\nFACT-CHECKS:\n${candidates.map((c, i) => `${i}. [${c.publisher}] ${c.title}`).join('\n')}`
    const out = await structured({ system: JUDGE_SYSTEM, prompt, schema: JudgeSchema, maxTokens: 800 })
    if (!out) return null
    return applyJudgement(candidates, out.results)
  })
}

export function applyJudgement(candidates: FactCheckMatch[], results: { index: number; relation: 'same' | 'related' | 'unrelated' }[]): FactCheckMatch[] {
  const rel = new Map(results.map((r) => [r.index, r.relation]))
  const kept: FactCheckMatch[] = []
  candidates.forEach((c, i) => {
    const r = rel.get(i)
    if (r === 'same') kept.push({ ...c, judged: 'same', score: Math.max(c.score, 0.8) })
    else if (r === 'related') kept.push({ ...c, judged: 'related', score: Math.min(Math.max(c.score, MATCH_MIN), 0.5) })
  })
  return kept.sort((a, b) => b.score - a.score)
}
