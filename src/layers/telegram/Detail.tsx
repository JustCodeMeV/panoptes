import { useState } from 'react'
import type { DetailProps } from '../../core/types'
import { SimpleDetail } from '../common/SimpleDetail'
import { TYPE_COLOR, TYPE_LABEL, clusterOf, compact } from './props'

type Translation = { language: string; english: string; gist: string }

function Translate({ text }: { text: string }) {
  const [t, setT] = useState<Translation | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/llm/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setT(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  if (t)
    return (
      <span className="tg-translation">
        <small>AI translation from {t.language} · gist: {t.gist}</small>
        <span>{t.english}</span>
      </span>
    )
  return (
    <span className="tg-translation">
      <button className="brief-run" onClick={() => void go()} disabled={busy}>
        {busy ? 'Translating…' : '✦ Translate to English'}
      </button>
      {err && <small className="brief-err">Translation unavailable: {err}</small>}
    </span>
  )
}

export function TelegramDetail({ feature }: DetailProps) {
  const p = feature.props
  const type = String(p.type ?? 'osint')
  const color = TYPE_COLOR[type] ?? '#a78bfa'
  const c = clusterOf(feature)
  const text = String(p.text ?? feature.title)
  const media = p.media as { kind: string; thumb?: string } | undefined
  const link = p.link ? (
    <a href={String(p.link)} target="_blank" rel="noreferrer">
      {String(p.link).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
    </a>
  ) : undefined
  return (
    <SimpleDetail
      feature={feature}
      badge={`TELEGRAM · ${TYPE_LABEL[type] ?? type}${p.discovered ? ' · DISCOVERED' : ''}`}
      sub={[`@${String(p.handle)}`, p.subscribers ? `${compact(p.subscribers)} subscribers` : undefined, `tier ${String(p.tier)}`].filter(Boolean).join(' · ')}
      color={color}
      summary={
        <>
          {media?.thumb && <img className="tg-thumb" src={media.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <span className="tg-text">{text}</span>
          {/* Already in English when the server translated it automatically */}
          {p.lang !== 'en' && !p.original && <Translate key={feature.id} text={text} />}
          {c && c.channels.length >= 2 && (
            <span className={`tg-coord ${c.coordinated || c.channels.length >= 3 ? 'alert' : ''}`}>
              <b>{c.coordinated || c.channels.length >= 3 ? '⚑ Coordinated copy' : 'Copied'}</b> Same text on {c.channels.length} channels within an hour, first on @{c.first}
              {c.leadMin > 0 ? ` (${c.leadMin} min before this one)` : ' (this channel was first)'}: {c.channels.map((h) => `@${h}`).join(', ')}
              {c.recurringPair && ` · @${c.recurringPair.to} has copied @${c.recurringPair.from} ${c.recurringPair.count} times in 12 h`}
            </span>
          )}
        </>
      }
      rows={[
        ['Channel', String(p.channel ?? p.handle)],
        ['Views', compact(p.views)],
        ['Views / hour', compact(p.viewsPerHour)],
        ['Forwarded from', p.forwardedFrom ? `@${String(p.forwardedFrom)}${p.forwardedName ? ` (${String(p.forwardedName)})` : ''}` : undefined],
        ['Mentions', Array.isArray(p.mentions) && p.mentions.length ? (p.mentions as string[]).map((h) => `@${h}`).join(' ') : undefined],
        ['Media', media?.kind],
        ['Link', link],
        ['State bloc', p.bloc ? String(p.bloc) : undefined],
      ]}
    />
  )
}
