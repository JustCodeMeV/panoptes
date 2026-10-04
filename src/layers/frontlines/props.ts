export const occupied = (f: { props: Record<string, unknown> }) => f.props.status === 'occupied'
export const isZone = (f: { props: Record<string, unknown> }) => f.props.kind === 'conflict-zone'
export const ZONE_COLOR: Record<string, string> = { high: '#ef4444', elevated: '#f97316', low: '#eab308', quiet: '#78716c' }
