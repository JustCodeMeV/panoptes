import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { extractText } from '../entities/read.ts'
import { stripHtml } from '../truth/text.ts'

/**
 * READER for the in-app link window. Tells the client whether a page may be
 * framed, and returns a clean text version when it may not. SSRF-safe: only
 * http(s), only public addresses (checked after DNS resolution, and again on
 * every redirect), capped size and time.
 */

const MAX_BYTES = 1_500_000
const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
const TIMEOUT_MS = 10_000

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7))
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff')
}

/** Throws unless the URL is http(s) and every address its host resolves to is public. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) links can be opened')
  if (u.username || u.password) throw new Error('links with credentials are refused')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('private or local addresses are refused')
  return u
}

export type Reader = { url: string; framable: boolean; title?: string; site?: string; image?: string; text?: string; error?: string }

/** Whether the response headers allow embedding the page in another site's frame. */
export function framable(h: Headers): boolean {
  const xfo = (h.get('x-frame-options') ?? '').toLowerCase()
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return false
  const csp = (h.get('content-security-policy') ?? '').toLowerCase()
  const fa = csp.match(/frame-ancestors([^;]*)/)?.[1]?.trim()
  return !fa || fa.includes('*')
}

async function readBody(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) {
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readPage(raw: string): Promise<Reader> {
  let url = await assertPublicUrl(raw)
  // Follow redirects by hand so each hop is checked.
  let res: Response | undefined
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; argus-reader/1.0)', accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!loc) break
    url = await assertPublicUrl(new URL(loc, url).toString())
  }
  if (!res) throw new Error('no response')
  const html = (res.headers.get('content-type') ?? '').includes('html') ? await readBody(res) : ''
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, 'i'))?.[1]
  return {
    url: url.toString(),
    framable: res.ok && framable(res.headers),
    title: decode(stripHtml(meta('og:title') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')),
    site: meta('og:site_name') ?? url.hostname.replace(/^www\./, ''),
    image: meta('og:image'),
    text: html ? decode(extractText(html)) : undefined,
    ...(res.ok ? {} : { error: `the site answered HTTP ${res.status}` }),
  }
}
