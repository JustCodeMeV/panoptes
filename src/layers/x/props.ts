import type { Feature } from '../../../shared/feature'

export type XVerdict = 'corroborated' | 'disputed' | 'unverified' | 'false'
export type XPost = { url: string; handle?: string; postedAt?: string; stance: 'supports' | 'contradicts' | 'context'; text: string }
export type XCheck = {
  verdict: XVerdict
  confidence: number
  summary: string
  details: string[]
  discrepancies: string[]
  location?: { name: string }
  posts: XPost[]
  citations: string[]
  model: string
  checkedAt: string
  storyId: string
  storyTitle: string
}

export const X_COLOR = '#e7e9ea'
export const VERDICT_COLOR: Record<XVerdict, string> = { corroborated: '#22c55e', disputed: '#f59e0b', unverified: '#94a3b8', false: '#ef4444' }
export const VERDICT_LABEL: Record<XVerdict, string> = { corroborated: 'X CORROBORATES', disputed: 'X DISPUTES', unverified: 'X UNCLEAR', false: 'X CONTRADICTS' }

export const checkOf = (f: Feature) => f.props as unknown as XCheck
