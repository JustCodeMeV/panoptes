import type { DetailProps } from '../../core/types'
import { useInvestigation } from '../../core/investigation'
import { SimpleDetail } from '../common/SimpleDetail'
import { CHECK, type CheckProp } from './props'

export function EventDetail({ feature }: DetailProps) {
  const p = feature.props
  const c = p.check as CheckProp
  const k = CHECK[c.status] ?? CHECK['single-source']
  const actors = (p.actors as { label: string; role?: string }[]) ?? []
  return (
    <SimpleDetail
      feature={feature}
      badge={`EVENT · ${String(p.kind).replace('-', ' ').toUpperCase()} · ${k.label.toUpperCase()}`}
      sub={`${c.sources} report(s) · ${c.independent} independent · ${c.countries} countr${c.countries === 1 ? 'y' : 'ies'}`}
      color={k.color}
      summary={
        <>
          <span className="block">Merged from every report of the same event across news, Telegram, the conflict log and GDELT, then checked with one rule for every country.</span>
          <span className="inv-check mt-2 block" style={{ ['--c' as string]: k.color }}>
            <b>{k.label}</b>
            <ul>
              {c.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </span>
          <button className="brief-run mt-2" onClick={() => void useInvestigation.getState().seedEntity(String(p.entityId))}>
            ◆ Open in investigation canvas
          </button>
        </>
      }
      rows={[
        ['Actors', actors.length ? actors.map((a) => `${a.label}${a.role && a.role !== 'participant' ? ` (${a.role})` : ''}`).join(', ') : undefined],
        ['Casualties', p.casualties ? String(p.casualties) : undefined],
      ]}
    />
  )
}
