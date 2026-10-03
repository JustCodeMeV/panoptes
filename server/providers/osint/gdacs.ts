import { XMLParser } from 'fast-xml-parser'
import type { Provider } from '../../core/provider.ts'
import { LAYER_ID, fetchText, osintFeature, type Severity } from './util.ts'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown) => (v == null ? '' : typeof v === 'object' ? String((v as Record<string, unknown>)['#text'] ?? '') : String(v))
const TYPE: Record<string, string> = { EQ: 'earthquake', TC: 'cyclone', FL: 'flood', VO: 'volcano', DR: 'drought', WF: 'wildfire', TS: 'tsunami' }

/** UN/EC Global Disaster Alert and Coordination System: Orange/Red alerts only (Green is noise). */
export const gdacsProvider: Provider = {
  id: 'gdacs',
  layerId: LAYER_ID,
  async fetch() {
    const doc = parser.parse(await fetchText('https://www.gdacs.org/xml/rss.xml'))
    const out = []
    for (const it of arr<Record<string, unknown>>(doc.rss?.channel?.item)) {
      const level = str(it['gdacs:alertlevel']).toLowerCase()
      if (level !== 'orange' && level !== 'red') continue
      if (str(it['gdacs:iscurrent']) === 'false') continue
      const pt = str(it['georss:point']).split(/\s+/).map(Number)
      if (pt.length < 2 || pt.some(Number.isNaN)) continue
      const type = str(it['gdacs:eventtype'])
      const sev = it['gdacs:severity'] as { '@_unit'?: string; '@_value'?: string; '#text'?: string } | undefined
      const sevText = sev ? str(sev).trim() : ''
      out.push(
        osintFeature({
          provider: 'gdacs',
          feed: 'GDACS',
          externalId: str(it.guid),
          title: str(it.title),
          category: TYPE[type] ?? type.toLowerCase(),
          severity: (level === 'red' ? 'high' : 'medium') as Severity,
          magnitude: sevText || undefined,
          summary: str(it.description),
          lat: pt[0],
          lon: pt[1],
          precision: 'exact',
          basis: 'GDACS event centre',
          url: str(it.link),
          at: new Date(str(it.pubDate)).toISOString(),
        }),
      )
    }
    return out
  },
}
