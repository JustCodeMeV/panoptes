export const share = (f: { props: Record<string, unknown> }) => Number(f.props.share) || 0
export const color = (s: number) => (s >= 0.5 ? '#ef4444' : s >= 0.25 ? '#f97316' : '#facc15')
