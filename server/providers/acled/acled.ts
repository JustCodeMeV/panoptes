import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'
import { TtlCache } from '../../core/cache.ts'

export const LAYER_ID = 'acled'
const cache = new TtlCache<Feature[]>(3600_000)
let token: { value: string; until: number } | null = null

type Ev = {
  event_id_cnty: string; event_date: string; event_type: string; sub_event_type: string; actor1: string; actor2?: string
  country: string; admin1?: string; location: string; latitude: string; longitude: string; geo_precision?: string
  fatalities?: string; notes?: string; source?: string
}

async function auth(email: string, password: string): Promise<string> {
  if (token && token.until > Date.now()) return token.value
  const res = await fetch('https://acleddata.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password, grant_type: 'password', client_id: 'acled', scope: 'authenticated' }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`ACLED auth HTTP ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  token = { value: j.access_token, until: Date.now() + ((j.expires_in ?? 86400) - 300) * 1000 }
  return token.value
}

/**
 * ACLED: human-coded political violence and protest events with actors,
 * fatalities and sourced notes. The research standard. Free for
 * non-commercial use; needs ACLED_EMAIL + ACLED_PASSWORD (OAuth).
 * ACLED publishes with a lag of days, so this shows the last 14 days.
 */
export const acledProvider: Provider = {
  id: 'acled',
  layerId: LAYER_ID,
  async fetch() {
    const email = process.env.ACLED_EMAIL
    const password = process.env.ACLED_PASSWORD
    if (!email || !password) throw new Error('no ACLED_EMAIL / ACLED_PASSWORD')
    return cache.get('events', async () => {
      const bearer = await auth(email, password)
      const day = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10)
      const q = new URLSearchParams({ _format: 'json', event_date: `${day(14)}|${day(0)}`, event_date_where: 'BETWEEN', limit: '4000' })
      const res = await fetch(`https://acleddata.com/api/acled/read?${q}`, { headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(60_000) })
      if (res.status === 401) token = null
      // Login works but the account lacks ACLED's "API" access group (granted by ACLED on request).
      if (res.status === 403) throw new Error('ACLED: account has no API access yet (ask access@acleddata.com)')
      if (!res.ok) throw new Error(`ACLED HTTP ${res.status}`)
      const j = (await res.json()) as { data?: Ev[]; status?: number; error?: { message?: string } }
      if (!j.data) throw new Error(`ACLED: ${j.error?.message ?? 'no data'}`)
      return j.data.map(toFeature)
    })
  },
}

export function toFeature(e: Ev): Feature {
  const now = new Date().toISOString()
  const prec = Number(e.geo_precision ?? 1)
  const fat = Number(e.fatalities ?? 0)
  return {
    id: `${LAYER_ID}:${e.event_id_cnty}`,
    layerId: LAYER_ID,
    title: `${e.sub_event_type} · ${e.location}, ${e.country}`,
    position: { lat: Number(e.latitude), lon: Number(e.longitude) },
    // ACLED geo_precision: 1 = the named town, 2 = nearby/district, 3 = province-level.
    geoPrecision: prec === 1 ? 'exact' : 'approximate',
    geoBasis: prec === 1 ? `ACLED-coded location: ${e.location}` : `ACLED precision ${prec}: placed at ${e.location}${e.admin1 ? `, ${e.admin1}` : ''}`,
    observedAt: `${e.event_date}T12:00:00.000Z`,
    source: { provider: 'acled', platform: 'ACLED', url: 'https://acleddata.com/dashboard/', retrievedAt: now },
    tags: [e.event_type, ...(fat ? ['fatalities'] : [])],
    props: { kind: 'acled', eventType: e.event_type, subType: e.sub_event_type, actor1: e.actor1, actor2: e.actor2 || undefined, fatalities: fat, notes: e.notes, sources: e.source, date: e.event_date },
  }
}
