import type { LayerDef } from '../../core/types'
import { TrendsDetail } from './Detail'

/** Trending searches per country; pinned where security-related searches surge. */
export const trends: LayerDef = {
  id: 'trends',
  group: 'News & social media',
  label: 'Search Trends',
  description: 'What people search for right now in 30 countries (Google Trends). Pinned where searches for explosions, protests, curfews or attacks are trending.',
  color: '#f97316',
  refreshMs: 5 * 60_000,
  defaultEnabled: false,
  pin: (f) => ({ size: 14 + Math.min(12, Number(f.props.securityTerms) * 4), glyph: 'chart' }),
  rank: (f) => Number(f.props.securityTerms) * 1e13 + Date.parse(f.observedAt),
  subtitle: (f) => {
    const t = (f.props.trends as { query: string }[] | undefined) ?? []
    return t.slice(0, 3).map((x) => x.query).join(' · ')
  },
  Detail: TrendsDetail,
}
