import type { LayerDef } from '../../core/types'
import { XDetail } from './Detail'
import { VERDICT_COLOR, VERDICT_LABEL, X_COLOR, checkOf } from './props'

/**
 * Twitter/X: a second opinion from X on stories that are spreading but unsettled. Argus picks
 * the story, writes Grok a precise brief, and Grok reads public X posts in real time
 * (server/x/). Needs XAI_API_KEY; checks only run while this switch is on.
 */
export const x: LayerDef = {
  id: 'x',
  group: 'News & social media',
  label: 'Twitter/X',
  description:
    'A second opinion from X. When a story is spreading but unverified, Argus briefs Grok, which reads public X posts in real time and reports what they show, who is posting, contradictions and a verdict. Runs only while switched on (needs an xAI key).',
  color: X_COLOR,
  refreshMs: 0,
  stream: '/api/stream/x',
  defaultEnabled: false,
  pin: (f) => ({ size: 20, color: VERDICT_COLOR[checkOf(f).verdict], glyph: 'pulse' }),
  ticker: (f) => ({ badge: `𝕏 ${checkOf(f).verdict.toUpperCase()}`, color: VERDICT_COLOR[checkOf(f).verdict], detail: checkOf(f).storyTitle }),
  rank: (f) => Date.parse(checkOf(f).checkedAt) || 0,
  legend: Object.entries(VERDICT_COLOR),
  subtitle: (f) => `${VERDICT_LABEL[checkOf(f).verdict]} · ${checkOf(f).confidence}% · ${checkOf(f).posts.length} posts`,
  Detail: XDetail,
}
