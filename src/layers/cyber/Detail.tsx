import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { CYBER_COLOR } from './props'

export function CyberDetail({ feature }: DetailProps) {
  const p = feature.props
  const kind = String(p.kind)
  if (kind === 'ransomware')
    return (
      <SimpleDetail
        feature={feature}
        badge={`RANSOMWARE CLAIM · ${String(p.group).toUpperCase()}`}
        sub={[String(p.victim), p.sector ? String(p.sector) : undefined].filter(Boolean).join(' · ')}
        color={CYBER_COLOR.ransomware}
        summary={`${String(p.group)} lists ${String(p.victim)} on its leak site. A claim by the criminal group, not a confirmed breach. ${p.description ? String(p.description) : ''}`}
        rows={[
          ['Group', String(p.group)],
          ['Victim', String(p.victim)],
          ['Sector', p.sector ? String(p.sector) : undefined],
          ['Country', p.country ? String(p.country) : undefined],
          ['Website', p.domain ? String(p.domain) : undefined],
          ['Claimed', p.claimedAt ? new Date(String(p.claimedAt)).toLocaleString() : undefined],
        ]}
      />
    )
  if (kind === 'c2') {
    const hosts = (p.hosts as { ip: string; port: number; as: string; status: string }[]) ?? []
    return (
      <SimpleDetail
        feature={feature}
        badge={`BOTNET C2 · ${String(p.malware).toUpperCase()}`}
        sub={`${String(p.servers)} servers · ${String(p.online)} online`}
        color={CYBER_COLOR.c2}
        summary="Command-and-control servers that infected machines report to (abuse.ch Feodo Tracker). Hosting country is where the server sits, not who runs it."
        rows={hosts.map((h, i) => [`Server ${i + 1}`, `${h.ip}:${h.port} · ${h.as} · ${h.status}`])}
      />
    )
  }
  return (
    <SimpleDetail
      feature={feature}
      badge={`EXPLOITED VULNERABILITY${p.ransomware ? ' · USED BY RANSOMWARE' : ''}`}
      sub={`${String(p.vendor)} ${String(p.product)}`}
      color={CYBER_COLOR.kev}
      summary={String(p.description ?? '')}
      rows={[
        ['CVE', String(p.cve)],
        ['Name', String(p.name)],
        ['Patch due (US gov)', String(p.due)],
      ]}
    />
  )
}
