import type { ControlsProps } from '../../core/types'

/** Newly exploited vulnerabilities (no place on the map) and the most active ransomware groups. */
export function CyberBoard({ features = [], select }: ControlsProps) {
  const kev = features.filter((f) => f.props.kind === 'kev')
  const groups = new Map<string, number>()
  for (const f of features) if (f.props.kind === 'ransomware') groups.set(String(f.props.group), (groups.get(String(f.props.group)) ?? 0) + 1)
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  return (
    <div className="fin-board">
      {top.length > 0 && (
        <div>
          <small>Most active ransomware groups (last claims)</small>
          {top.map(([g, n]) => (
            <button key={g} onClick={() => select?.(features.find((f) => f.props.group === g)!.id)}>
              <span>{g}</span>
              <span />
              <b>{n} victims</b>
            </button>
          ))}
        </div>
      )}
      {kev.length > 0 && (
        <div>
          <small>Exploited in the wild, last 14 days (CISA)</small>
          {kev.slice(0, 8).map((f) => (
            <button key={f.id} onClick={() => select?.(f.id)}>
              <span>{`${String(f.props.vendor)} ${String(f.props.product)}`}</span>
              <span>{String(f.props.cve)}</span>
              <b style={{ color: f.props.ransomware ? '#e879f9' : undefined }}>{f.props.ransomware ? 'ransomware' : ''}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
