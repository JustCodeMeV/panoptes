import { stripHtml } from '../truth/text.ts'

/** One post from a channel's public web preview (https://t.me/s/<handle>). */
export type TgPost = {
  /** "<handle>/<message id>" as Telegram writes it (data-post). */
  post: string
  handle: string
  msgId: number
  text: string
  at: number
  views?: number
  media?: { kind: 'photo' | 'video'; thumb?: string }
  /** Channel this post was forwarded from (handle), when it is a forward. */
  forwardedFrom?: string
  forwardedName?: string
  /** Other channels referenced: t.me links and @mentions (handles, lowercase-insensitive). */
  mentions: string[]
  /** First outbound non-Telegram link (link preview / article). */
  link?: string
}

export type TgPage = { title?: string; subscribers?: number; posts: TgPost[] }

/** "17.8K" -> 17800, "1.2M" -> 1200000. */
export function count(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = s.trim().match(/^([\d.,]+)\s*([KMB])?$/i)
  if (!m) return undefined
  const n = Number(m[1].replace(/,/g, ''))
  return Math.round(n * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase() as 'K'] ?? 1))
}

const HANDLE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/
const NOT_CHANNELS = new Set(['s', 'joinchat', 'addstickers', 'share', 'proxy', 'iv', 'c', 'boost', 'addlist', 'contact'])

function mentionsIn(html: string, self: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/href="https?:\/\/t\.me\/([A-Za-z0-9_]+)/g)) if (HANDLE.test(m[1]) && !NOT_CHANNELS.has(m[1].toLowerCase())) out.add(m[1])
  for (const m of stripHtml(html).matchAll(/(?<![\w@])@([A-Za-z][A-Za-z0-9_]{4,31})\b/g)) out.add(m[1])
  return [...out].filter((h) => h.toLowerCase() !== self.toLowerCase() && !/bot$/i.test(h))
}

const FOOTER = /subscribe|subscribers|join us|join our|our channel|follow us|подпис|підпис|наш канал|канал в |casino|non-kyc|sportsbook|promo code|бонус|реклама|sponsored/i

/** Drops the channel's own sign-off and ad footer: everything from "@<own handle>" on, and trailing promo lines. */
export function cleanText(text: string, handle: string): string {
  let t = text
  const sig = t.search(new RegExp(`@${handle}\\b`, 'i'))
  if (sig > 30) t = t.slice(0, sig)
  const lines = t.split('\n')
  while (lines.length > 1 && (FOOTER.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines.pop()
  return lines.join('\n').replace(/[\s|•·—-]+$/u, '').trim()
}

export function parsePage(html: string, handle: string): TgPage {
  const title = html.match(/tgme_channel_info_header_title"><span dir="auto">([^<]*)/)?.[1]
  const subscribers = count(html.match(/counter_value">([^<]*)<\/span> <span class="counter_type">subscribers/)?.[1])
  const posts: TgPost[] = []
  for (const block of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = block.match(/data-post="([^"]+)"/)?.[1]
    if (!post) continue
    const textHtml = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
    // stripHtml collapses whitespace; keep line breaks through it with a placeholder.
    const text = cleanText(stripHtml(textHtml.replace(/<br\s*\/?>/g, ' \uE000 ')).replace(/ ?\uE000 ?/g, '\n').trim(), handle)
    const when = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1]
    const t = when ? Date.parse(when) : NaN
    const fwd = block.match(/tgme_widget_message_forwarded_from_name" href="https?:\/\/t\.me\/([A-Za-z0-9_]+)[^"]*"><span dir="auto">([^<]*)/)
    const photo = block.match(/tgme_widget_message_photo_wrap[^"]*" style="[^"]*background-image:url\('([^']+)'/)?.[1]
    const video = /tgme_widget_message_video/.test(block)
    const videoThumb = block.match(/tgme_widget_message_video_thumb" style="background-image:url\('([^']+)'/)?.[1]
    const link = [...textHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).find((u) => !/^https?:\/\/t\.me\//.test(u))
    const msgId = Number(post.split('/').pop())
    posts.push({
      post,
      handle,
      msgId,
      text,
      at: Number.isNaN(t) ? Date.now() : Math.min(t, Date.now()),
      views: count(block.match(/tgme_widget_message_views">([^<]*)/)?.[1]),
      ...(photo || video ? { media: { kind: video ? ('video' as const) : ('photo' as const), thumb: videoThumb ?? photo } } : {}),
      ...(fwd ? { forwardedFrom: fwd[1], forwardedName: stripHtml(fwd[2]) } : {}),
      // Only references that survive footer removal: ads and sign-offs are not a channel network.
      mentions: mentionsIn(textHtml, handle).filter((h) => text.toLowerCase().includes(h.toLowerCase())),
      ...(link ? { link: link.replace(/&amp;/g, '&') } : {}),
    })
  }
  return { title: title && stripHtml(title), subscribers, posts }
}
