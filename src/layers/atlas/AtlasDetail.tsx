import type { DetailProps } from '../../core/types'
import { CountryProfile } from './CountryProfile'
import { PlaceProfile } from './PlaceProfile'

/** Country, region or city, by what was clicked. */
export function AtlasDetail(props: DetailProps) {
  const role = props.feature.props.role
  return role === 'region-selected' || role === 'region' || role === 'city' ? <PlaceProfile {...props} /> : <CountryProfile {...props} />
}
