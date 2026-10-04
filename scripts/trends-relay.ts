/**
 * Google Trends relay, run every 30 min by .github/workflows/trends-relay.yml.
 *
 * Google rate-limits its trending RSS per IP and has flagged our Render
 * instance. A GitHub runner gets a fresh IP each run, fetches every feed once,
 * politely (one at a time, 1.5 s apart), and writes them to trends.json on the
 * `data` branch; the server reads that file (server/core/googletrends.ts).
 * A feed that fails keeps its previous copy, so one bad run loses nothing.
 *
 * Usage: node scripts/trends-relay.ts [path/to/trends.json]   (Node >= 23.6)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ALL_GEOS } from '../server/core/trendsGeos.ts'

type Feed = { xml: string; at: number }
const out = process.argv[2] ?? 'trends.json'
let prev: Record<string, Feed> = {}
try {
  if (existsSync(out)) prev = JSON.parse(readFileSync(out, 'utf8')).feeds ?? {}
} catch {
  // no or unreadable previous data: start fresh
}
const feeds: Record<string, Feed> = { ...prev }
const failed: string[] = []

for (const geo of ALL_GEOS) {
  try {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, {
      headers: { 'user-agent': 'Mozilla/5.0 panoptes-trends-relay/1.0' },
      redirect: 'manual', // a redirect is Google's CAPTCHA page, not data
      signal: AbortSignal.timeout(15_000),
    })
    const xml = res.status === 200 ? await res.text() : ''
    if (!xml.includes('<rss')) throw new Error(`HTTP ${res.status}`)
    feeds[geo] = { xml, at: Date.now() }
  } catch (e) {
    failed.push(`${geo} (${e instanceof Error ? e.message : String(e)})`)
  }
  await new Promise((r) => setTimeout(r, 1500))
}

const ok = ALL_GEOS.length - failed.length
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), ok, failed, feeds }))
console.log(`trends relay: ${ok}/${ALL_GEOS.length} fetched${failed.length ? `; failed: ${failed.join(', ')}` : ''}`)
if (!Object.keys(feeds).length) process.exit(1)
