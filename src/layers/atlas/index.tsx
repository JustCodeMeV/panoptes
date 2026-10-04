import type { LayerDef } from '../../core/types'
import { CountryProfile } from './CountryProfile'

/** Click any country: its atlas profile (people, economy, trade, strategic, relations, right now) and map modes. */
export const atlas: LayerDef = {
  id: 'atlas',
  label: 'Country atlas',
  description: 'Click a country on the globe for its profile and map modes.',
  color: '#38bdf8',
  refreshMs: 0,
  defaultEnabled: true,
  hidden: true,
  pin: () => ({ size: 1 }),
  shape: (f) =>
    f.props.role === 'selected'
      ? { color: '#38bdf8', alpha: 0.12, width: 2.5 }
      : f.props.role === 'arc'
        ? { color: String(f.props.color), alpha: 0.9, width: Number(f.props.width) || 2 }
        : { color: String(f.props.color ?? '#94a3b8'), alpha: Number(f.props.alpha) || 0.25 },
  subtitle: () => 'country profile',
  Detail: CountryProfile,
}
