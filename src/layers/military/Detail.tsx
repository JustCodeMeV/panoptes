import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { str } from './props'

export function AircraftDetail({ feature }: DetailProps) {
  const p = feature.props
  return (
    <SimpleDetail
      feature={feature}
      badge={p.squawk ? `MILITARY AIRCRAFT · SQUAWK ${String(p.squawk)}` : 'MILITARY AIRCRAFT'}
      sub={[str(p.desc) ?? str(p.type), str(p.operator)].filter(Boolean).join(' · ')}
      color={p.squawk ? '#ef4444' : '#a3e635'}
      summary="Only aircraft that broadcast ADS-B appear. Many military flights fly dark, so an empty sky proves nothing; tankers, ISR and transports often do broadcast."
      rows={[
        ['Callsign', str(p.callsign)],
        ['Registration', str(p.registration)],
        ['Type', str(p.type)],
        ['Altitude', str(p.altitude)],
        ['Speed', p.speedKt ? `${Math.round(Number(p.speedKt))} kt` : undefined],
        ['Heading', p.track !== undefined ? `${Math.round(Number(p.track))}°` : undefined],
        ['ICAO hex', str(p.hex)],
      ]}
    />
  )
}
