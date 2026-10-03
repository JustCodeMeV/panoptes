import type { Feature } from './feature.ts'
import type { Assessment, SourceClass } from './truth.ts'

/** Co-amplification graph: who carries the same stories, and who tends to go first. */
export type NetNode = { id: string; cls: SourceClass; bloc?: string; stories: number; flagged: number }
export type NetEdge = {
  /** Leader (more often first) -> follower. */
  from: string
  to: string
  /** Stories both carried within the window. */
  weight: number
  /** On how many of those stories `from` was first. */
  led: number
  medianLeadMin: number
  /** Same pair on >=3 flagged (campaign-watch) stories. */
  recurring: boolean
  stories: string[]
}
export type NetGraph = { nodes: NetNode[]; edges: NetEdge[]; stories: { id: string; title: string; flagged: boolean }[]; generatedAt: string }

const WINDOW_MS = 6 * 3600_000
export const RECURRING_MIN = 3

export const isFlagged = (a: Assessment | undefined) => {
  const c = a?.campaign
  return !!c && c.score >= 25 && c.flags.some((x) => x.severity !== 'info')
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/**
 * Builds the co-amplification graph from live stories. Two sources are linked
 * when both carried a story within 6 h of each other; the edge points from the
 * source that was first more often. Leads for an analyst, not attribution.
 */
export function buildNetwork(features: Feature[], opts: { onlyFlagged?: boolean; maxNodes?: number; maxEdges?: number } = {}): NetGraph {
  const nodes = new Map<string, NetNode>()
  const pairs = new Map<string, { a: string; b: string; aFirst: number; leads: number[]; stories: string[]; flagged: number }>()
  const stories: NetGraph['stories'] = []

  for (const f of features) {
    const a = f.props.assessment as Assessment | undefined
    const tl = a?.campaign?.timeline
    if (!tl?.length) continue
    const flagged = isFlagged(a)
    if (opts.onlyFlagged && !flagged) continue
    // First appearance per source.
    const first = new Map<string, (typeof tl)[number]>()
    for (const i of [...tl].sort((x, y) => x.at - y.at)) if (!first.has(i.source)) first.set(i.source, i)
    if (first.size < 2) continue
    stories.push({ id: f.id, title: f.title, flagged })
    for (const i of first.values()) {
      const n = nodes.get(i.source) ?? { id: i.source, cls: i.cls, bloc: i.bloc, stories: 0, flagged: 0 }
      n.stories++
      if (flagged) n.flagged++
      nodes.set(i.source, n)
    }
    const seq = [...first.values()]
    for (let x = 0; x < seq.length; x++)
      for (let y = x + 1; y < seq.length; y++) {
        const p = seq[x]
        const q = seq[y]
        if (q.at - p.at > WINDOW_MS) break
        const [a1, b1] = p.source < q.source ? [p.source, q.source] : [q.source, p.source]
        const key = `${a1}|${b1}`
        const e = pairs.get(key) ?? { a: a1, b: b1, aFirst: 0, leads: [], stories: [], flagged: 0 }
        if (p.source === a1) e.aFirst++
        e.leads.push((q.at - p.at) / 60_000)
        e.stories.push(f.id)
        if (flagged) e.flagged++
        pairs.set(key, e)
      }
  }

  let edges: NetEdge[] = [...pairs.values()].map((e) => {
    const n = e.stories.length
    const aLeads = e.aFirst * 2 >= n
    return {
      from: aLeads ? e.a : e.b,
      to: aLeads ? e.b : e.a,
      weight: n,
      led: aLeads ? e.aFirst : n - e.aFirst,
      medianLeadMin: Math.round(median(e.leads)),
      recurring: e.flagged >= RECURRING_MIN,
      stories: e.stories.slice(0, 20),
    }
  })

  let nodeList = [...nodes.values()]
  const max = opts.maxNodes ?? 120
  if (nodeList.length > max) {
    const degree = new Map<string, number>()
    for (const e of edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + e.weight)
    nodeList = nodeList.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, max)
    const keep = new Set(nodeList.map((n) => n.id))
    edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to))
  }
  edges.sort((a, b) => Number(b.recurring) - Number(a.recurring) || b.weight - a.weight)
  return { nodes: nodeList, edges: edges.slice(0, opts.maxEdges ?? 400), stories, generatedAt: new Date().toISOString() }
}

/** Restricts a graph to the sources of one story; edges keep their global history. */
export function storySubgraph(g: NetGraph, f: Feature): NetGraph {
  const ids = new Set((f.props.assessment as Assessment | undefined)?.campaign?.timeline.map((i) => i.source) ?? [])
  const edges = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
  const storyIds = new Set(edges.flatMap((e) => e.stories))
  return { nodes: g.nodes.filter((n) => ids.has(n.id)), edges, stories: g.stories.filter((s) => storyIds.has(s.id)), generatedAt: g.generatedAt }
}
