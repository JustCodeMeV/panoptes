import type { Feature } from '../../../shared/feature.ts'
import type { Provider } from '../../core/provider.ts'

/** CISA Known Exploited Vulnerabilities added in the last 14 days (keyless). Not geographic: listed, not pinned. */
type Kev = { cveID: string; vendorProject: string; product: string; vulnerabilityName: string; dateAdded: string; shortDescription: string; dueDate: string; knownRansomwareCampaignUse: string }

export const kevProvider: Provider = {
  id: 'cisa-kev',
  layerId: 'cyber',
  ttlMs: 6 * 3600_000,
  async fetch({ signal }) {
    const r = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { headers: { 'user-agent': 'argus-research/0.1' }, signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} cisa.gov`)
    const j = (await r.json()) as { vulnerabilities: Kev[] }
    const cut = Date.now() - 14 * 86400_000
    const now = new Date().toISOString()
    return j.vulnerabilities
      .filter((v) => Date.parse(v.dateAdded) >= cut)
      .map(
        (v): Feature => ({
          id: `cyber:kev:${v.cveID}`,
          layerId: 'cyber',
          title: `${v.cveID}: ${v.vendorProject} ${v.product} exploited in the wild`,
          geoPrecision: 'none',
          geoBasis: 'a software flaw, not a place',
          observedAt: new Date(v.dateAdded).toISOString(),
          source: { provider: 'cisa-kev', platform: 'cisa.gov', url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, retrievedAt: now },
          tags: ['cyber', 'vulnerability', v.knownRansomwareCampaignUse === 'Known' ? 'ransomware-use' : 'exploited'],
          props: { kind: 'kev', cve: v.cveID, vendor: v.vendorProject, product: v.product, name: v.vulnerabilityName, description: v.shortDescription, due: v.dueDate, ransomware: v.knownRansomwareCampaignUse === 'Known' },
        }),
      )
  },
}
