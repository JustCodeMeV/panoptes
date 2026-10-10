import type Anthropic from '@anthropic-ai/sdk'

/**
 * What a geolocation run costs, from the usage Claude reports on every response.
 * $ per million tokens (Anthropic first-party rates, 2026-10). Cache writes (5-minute TTL) bill 1.25x input;
 * cache reads are listed per model. Haiku 5.5 bills 5x above a 100K-token prompt.
 */
export type Model = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'

type Rate = { in: number; out: number; read: number; long?: { above: number; factor: number } }
export const RATES: Record<Model, Rate> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01, long: { above: 100_000, factor: 5 } },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, read: 0.2 },
}

/** Cheapest first: "look harder" moves one step up. */
export const LADDER: Model[] = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']

type Usage = Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens'>

/** Dollars for one response. */
export function cost(model: Model, u: Usage): number {
  const r = RATES[model]
  const write = u.cache_creation_input_tokens ?? 0
  const read = u.cache_read_input_tokens ?? 0
  const prompt = u.input_tokens + write + read
  const f = r.long && prompt > r.long.above ? r.long.factor : 1
  return (f * (u.input_tokens * r.in + write * r.in * 1.25 + read * r.read + u.output_tokens * r.out)) / 1e6
}
