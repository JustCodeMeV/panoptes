import { useState } from 'react'
import type { Feature } from '../../shared/feature'
import { OWNERSHIP, STATUS } from '../core/status'
import { VERDICT } from '../layers/narratives/verdict'

type Why = { why: string[]; reasons: string[]; status: string; sources: number; independent: number; countries: number } | null

const PRECISION: Record<string, string> = {
  exact: 'exact position given by the source',
  approximate: 'approximate: area or country centre',
  inferred: 'inferred from the text',
  none: 'no position',
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  return !Number.isFinite(m) ? '' : m < 60 ? `${Math.max(1, m)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

/** The check, whichever way this layer carries it: event check status, story verdict, or none. */
function checkOf(f: Feature): { label: string; color: string; detail?: string } | null {
  const c = f.props.check as { status?: string; reasons?: string[] } | undefined
  if (c?.status && STATUS[c.status]) return { ...STATUS[c.status], detail: c.reasons?.[0] }
  const v = (f.props.assessment as { verdict?: string } | undefined)?.verdict ?? (typeof f.props.verdict === 'string' ? f.props.verdict : undefined)
  const vv = v ? VERDICT[v as keyof typeof VERDICT] : undefined
  return vv ? { label: vv.label.charAt(0) + vv.label.slice(1).toLowerCase(), color: vv.color, detail: vv.blurb } : null
}

/**
 * The same four lines on top of every item, whatever its layer: where (and how sure), who says it
 * (and who stands behind them), when, and how well it is checked. Then why it matters, on demand.
 */
export function ItemSummary({ feature }: { feature: Feature }) {
  const [why, setWhy] = useState<Why | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const p = feature.props
  const own = (typeof p.own === 'string' && OWNERSHIP[p.own]) || (typeof p.type === 'string' && OWNERSHIP[p.type]) || undefined
  const c = p.check as { sources?: number; independent?: number } | undefined
  // A checked event is ARGUS's own synthesis of many reports: say so instead of naming the engine
  const who =
    feature.layerId === 'events' && c?.sources
      ? `${c.sources} sources, ${c.independent ?? 0} independent (merged by ARGUS)`
      : String(p.issuer ?? p.channel ?? feature.source.platform ?? feature.source.provider)
  const updated = typeof p.updatedAt === 'number' && p.updatedAt - Date.parse(feature.observedAt) > 60_000 ? new Date(p.updatedAt).toISOString() : undefined
  const check = checkOf(feature)

  const ask = () => {
    setBusy(true)
    fetch(`/api/why/${encodeURIComponent(feature.id)}`)
      .then((r) => r.json())
      .then((j: { item: Why }) => setWhy(j.item))
      .catch(() => setWhy(null))
      .finally(() => setBusy(false))
  }

  return (
    <div className="item-summary">
      <dl>
        <dt>Where</dt>
        <dd>
          {feature.geoBasis || 'unknown'} <em>({PRECISION[feature.geoPrecision] ?? feature.geoPrecision})</em>
        </dd>
        <dt>Who says it</dt>
        <dd>
          {who}
          {own && <em> ({own})</em>}
        </dd>
        <dt>When</dt>
        <dd>
          {updated ? `first reported ${ago(feature.observedAt)}, updated ${ago(updated)}` : ago(feature.observedAt)}
        </dd>
        <dt>Checked</dt>
        <dd>
          {check ? (
            <>
              <b style={{ color: check.color }}>{check.label}</b>
              {check.detail && <em> · {check.detail}</em>}
            </>
          ) : (
            <em>not checked yet: treat as a lead</em>
          )}
        </dd>
      </dl>
      {why === undefined ? (
        <button type="button" className="item-why" disabled={busy} onClick={ask}>
          {busy ? 'Reading…' : 'Why it matters'}
        </button>
      ) : why === null ? (
        <p className="item-why-none">Nothing to explain yet: this item has not been read into the graph.</p>
      ) : (
        <ul className="item-why-list">
          {[...why.why, ...why.reasons.slice(1)].map((w) => (
            <li key={w}>{w}</li>
          ))}
          {why.status !== 'unchecked' && (
            <li>
              {why.sources} sources · {why.independent} independent · {why.countries} {why.countries === 1 ? 'country' : 'countries'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
