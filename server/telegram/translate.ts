import { z } from 'zod/v4'
import { memo, structured } from '../llm/client.ts'
import { hash } from '../truth/text.ts'

const Translation = z.object({
  language: z.string().describe('Source language name in English, e.g. "Ukrainian"'),
  english: z.string().describe('Faithful English translation; keep place names, units, emoji meaning, and hashtags'),
  gist: z.string().describe('One neutral sentence: who claims what, where'),
})
export type Translation = z.infer<typeof Translation>

const cache = memo<Translation>(500)

/** On-demand translation of one Telegram post (analyst clicks "Translate"); memoized, budget-capped. */
export function translatePost(text: string): Promise<Translation | null> {
  const t = text.slice(0, 1500)
  return cache(hash(t), () =>
    structured({
      system:
        'You translate posts from public Telegram channels for an OSINT analyst. Translate faithfully, do not soften or add claims, and attribute: the gist states what the channel claims, never that it is true.',
      prompt: `Post:\n"""\n${t}\n"""`,
      schema: Translation,
      maxTokens: 1200,
    }),
  )
}
