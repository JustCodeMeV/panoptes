const STOP = new Set(
  `a an the and or but if of to in on at by for with from as is are was were be been being it its this that these
those he she they we you i his her their our your not no do does did has have had will would can could should may
might about after before over under into out up down than then so such also just more most new says say said report
reports reported live latest news video watch update updates breaking today why what who how when where which while
amid against between during via vs fact check claim claims viral post posts people year years day days week first yes
make makes made get gets got one two three here there still now only even very much many some any all`.split(/\s+/),
)

/** Lowercased, accent-folded, lightly stemmed content words. */
export function tokens(text: string): string[] {
  const out: string[] = []
  const words = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []
  for (const w of words) {
    if (w.length < 3 || STOP.has(w)) continue
    out.push(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
  }
  return out
}

export const tokenSet = (text: string) => new Set(tokens(text))

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Short search query: proper nouns first, then longest content words. */
export function searchTerms(text: string, max = 4): string[] {
  const proper = [...text.matchAll(/(?<=\s)([A-Z][\p{L}]{2,})/gu)].map((m) => m[1].toLowerCase())
  const rest = [...new Set(tokens(text))].sort((a, b) => b.length - a.length)
  return [...new Set([...proper, ...rest])].slice(0, max)
}

export function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}
