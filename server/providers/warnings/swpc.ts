import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'

/**
 * SPACE WEATHER (NOAA SWPC): geomagnetic storms degrade GNSS accuracy and HF
 * radio worldwide, which matters when reading GPS-jamming and outage signals.
 * One status item (planetary Kp, last 24 h) plus the alerts of the last day.
 */
const G = (kp: number) => (kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0)

export const swpcProvider: Provider = {
  id: 'swpc',
  layerId: 'warnings',
  ttlMs: 30 * 60_000,
  async fetch({ signal }) {
    const now = Date.now()
    const [kpRows, alerts] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { signal }).then((r) => (r.ok ? r.json() : [])) as Promise<{ time_tag: string; Kp: number }[]>,
      fetch('https://services.swpc.noaa.gov/products/alerts.json', { signal }).then((r) => (r.ok ? r.json() : [])) as Promise<{ product_id: string; issue_datetime: string; message: string }[]>,
    ])
    const day = kpRows.filter((k) => now - Date.parse(`${k.time_tag}Z`) < 86_400_000)
    const kp = Math.max(0, ...day.map((k) => Number(k.Kp) || 0))
    const g = G(kp)
    const out: Feature[] = [
      {
        id: 'warnings:swpc-kp',
        layerId: 'warnings',
        title: g ? `Geomagnetic storm G${g} (Kp ${kp.toFixed(1)}): GNSS and HF radio degraded` : `Space weather quiet (Kp ${kp.toFixed(1)} in the last 24 h)`,
        geoPrecision: 'none',
        geoBasis: 'global: affects the whole planet, strongest at high latitudes',
        observedAt: new Date(now).toISOString(),
        source: { provider: 'swpc', platform: 'NOAA Space Weather Prediction Center', url: 'https://www.swpc.noaa.gov/', retrievedAt: new Date(now).toISOString() },
        tags: ['warning', 'space-weather'],
        props: { kind: 'space-weather', category: 'space weather', kp, storm: g, military: false },
      },
    ]
    for (const a of alerts) {
      const at = Date.parse(`${a.issue_datetime.replace(' ', 'T')}Z`)
      if (!(now - at < 86_400_000)) continue
      const head = /^(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT|EXTENDED WARNING|CANCEL[A-Z ]*):\s*(.+)$/m.exec(a.message)
      if (!head || /CANCEL|SUMMARY/.test(head[1])) continue
      out.push({
        id: `warnings:swpc-${a.product_id}-${at}`,
        layerId: 'warnings',
        title: `Space weather ${head[1].toLowerCase()}: ${head[2].trim()}`.slice(0, 160),
        geoPrecision: 'none',
        geoBasis: 'global',
        observedAt: new Date(at).toISOString(),
        source: { provider: 'swpc', platform: 'NOAA Space Weather Prediction Center', url: 'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings', retrievedAt: new Date(now).toISOString() },
        tags: ['warning', 'space-weather'],
        props: { kind: 'space-weather', category: 'space weather', text: a.message.slice(0, 1200), military: false },
      })
    }
    return out
  },
}
