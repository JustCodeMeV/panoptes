import type { DetailProps } from '../../core/types'
import { FrontDetail } from './Detail'
import { isZone, ZONE_COLOR } from './props'

type Zone = { conflict: string; parties: string[]; since: string; regions: string[]; note?: string; reports: number; intensity: string; counts: Record<string, number>; top: { id: string; title: string; layerId: string }[] }

/** One armed conflict: who fights, where (regions), and what the live layers report there now. */
export function ZoneDetail({ feature, select }: DetailProps) {
  const z = feature.props as unknown as Zone
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: ZONE_COLOR[z.intensity] }}>
        <b>CONFLICT ZONE · {z.intensity.toUpperCase()} ACTIVITY</b>
        <span>{z.reports} live reports in the last 3 days · since {z.since}</span>
      </div>
      <h2>{z.conflict}</h2>
      <p className="osum">Parties (no order implied): {z.parties.join('; ')}.</p>
      <dl>
        <dt>Where</dt>
        <dd>{z.regions.join(', ')}</dd>
        <dt>Live now</dt>
        <dd>{Object.entries(z.counts).map(([k, n]) => `${n} ${k}`).join(' · ') || 'nothing reported in the live layers'}</dd>
      </dl>
      <ul className="evidence">
        {z.top.map((x) => (
          <li key={x.id}>
            <button className="atlas-link" onClick={() => select(x.id)}>{x.title}</button>
          </li>
        ))}
      </ul>
      <p className="note">
        Shaded area: the regions where this conflict is being fought (a curated baseline on real administrative boundaries), not a line of control.
        {z.note ? ` ${z.note}.` : ''} Colour follows live activity.
      </p>
    </div>
  )
}

/** Conflict zone or DeepState area. */
export const FrontlinesDetail = (p: DetailProps) => (isZone(p.feature) ? <ZoneDetail {...p} /> : <FrontDetail {...p} />)
