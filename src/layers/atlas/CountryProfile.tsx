import { useEffect, useState } from 'react'
import type { Feature } from '../../../shared/feature'
import { countryFeature, openCountry, paintLens, useAtlas, type Lens } from '../../core/atlas'
import type { DetailProps } from '../../core/types'

type Card = { id: string; label: string; value: string; grade: string; pct?: number; hint: string }
type Partner = { name: string; share: number }
type Profile = {
  name: string
  record: {
    capital?: string; governmentType?: string; chiefOfState?: string; headOfGovernment?: string; background?: string; population?: number; medianAge?: number
    languages: string[]; religions: string[]; ethnicGroups: string[]; majorCities: string[]; industries: string[]; agriculture: string[]; resources: string[]
    exportsUsd?: number; importsUsd?: number; exportCommodities: string[]; importCommodities: string[]; exportPartners: Partner[]; importPartners: Partner[]
    composition: { agriculture?: number; industry?: number; services?: number }; gdpUsd?: number; gdpGrowth?: number; inflation?: number; unemployment?: number
    publicDebtPct?: number; reservesUsd?: number; currentAccountUsd?: number; budget: { revenue?: number; spending?: number }
    military: { expenditurePct?: number; forces?: string; personnel?: string; equipment?: string }; terroristGroups: string[]; refugees?: string; ports?: string
    oil: { productionBbl?: number; consumptionBbl?: number; reservesBbl?: number }; gas: { productionM3?: number; consumptionM3?: number; exportsM3?: number }
  }
  wiki?: { extract?: string; description?: string; image?: string; url?: string } | null
  currency?: { code?: string; name?: string; perUsd?: number } | null
  cards: Card[]
  strategic: string[]
  relations: { blocs: { id: string; name: string }[]; allies: { name: string; via: string[] }[]; neighbours: { name: string; km: number; tense: boolean }[]; dependencies: { name: string; share: number; way: string }[]; disputes?: string }
  now: {
    cii: { score: number; components: { id: string; label: string; points: number; max: number }[] } | null
    events: { count: number; top: { id: string; title: string; props: { check?: string; sources?: number } }[] }
    unrest: { count: number }
    telegram: { count: number }
    news: { count: number; top: { id: string; title: string }[] }
    markets: { id: string; title: string; props: { p?: number } }[]
    finance?: { id: string; name: string; price: number; day: number; month?: number }[]
    ships: number
    aircraft: number
  }
}

const money = (v?: number) => (v === undefined ? '–' : Math.abs(v) >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v}`)
const ICON: Record<string, string> = { population: '👥', economy: '💰', wealth: '💎', industry: '🏭', energy: '⚡', military: '🛡', stability: '⚖', trade: '⚓' }
const RESOURCE_ICON: [RegExp, string][] = [
  [/petroleum|oil/i, '🛢'], [/natural gas/i, '🔥'], [/coal/i, '⛏'], [/uranium/i, '☢'], [/gold/i, '🥇'], [/iron/i, '⚙'], [/copper/i, '🟠'],
  [/rare earth/i, '💠'], [/diamond/i, '💎'], [/timber|forest/i, '🌲'], [/fish/i, '🐟'], [/arable|wheat|land/i, '🌾'], [/hydro|water/i, '💧'],
]
const iconFor = (r: string) => RESOURCE_ICON.find(([re]) => re.test(r))?.[1] ?? '◆'

const LENS_COLORS = { ally: '#3b82f6', bloc: '#93c5fd', tense: '#ef4444', neighbour: '#94a3b8', exports: '#f59e0b', imports: '#eab308' }

function lensFeatures(p: Profile, lens: Lens): Feature[] {
  const out: Feature[] = []
  const add = (name: string, color: string, alpha: number, role: string) => {
    const f = countryFeature(name, { id: `atlas-lens:${role}:${name}`, color, alpha, role })
    if (f) out.push(f)
  }
  if (lens === 'diplomacy') {
    for (const a of p.relations.allies) add(a.name, LENS_COLORS.ally, 0.32, 'ally')
    for (const n of p.relations.neighbours) if (!p.relations.allies.some((a) => a.name === n.name)) add(n.name, n.tense ? LENS_COLORS.tense : LENS_COLORS.neighbour, n.tense ? 0.4 : 0.22, 'neighbour')
  }
  if (lens === 'trade') {
    const self = countryFeature(p.name)
    for (const [list, color, way] of [[p.record.exportPartners, LENS_COLORS.exports, 'exports'], [p.record.importPartners, LENS_COLORS.imports, 'imports']] as const)
      for (const t of list) {
        add(t.name, color, 0.15 + t.share / 60, way)
        const to = countryFeature(t.name)
        if (self?.position && to?.position)
          out.push({
            ...to,
            id: `atlas-lens:arc:${way}:${t.name}`,
            title: `${p.name} ${way === 'exports' ? '→' : '←'} ${t.name} ${t.share}%`,
            geometry: { type: 'LineString', coordinates: [[self.position.lon, self.position.lat], [to.position.lon, to.position.lat]] },
            props: { color, alpha: 0.9, role: 'arc', width: 1 + t.share / 6 },
          })
      }
  }
  return out
}

export function CountryProfile({ feature, select }: DetailProps) {
  const name = String(feature.props.country ?? feature.title)
  const [p, setP] = useState<Profile | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { lens, setLens } = useAtlas()
  useEffect(() => {
    let alive = true
    fetch(`/api/atlas/country/${encodeURIComponent(name)}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? `HTTP ${r.status}`))))
      .then((j) => alive && setP(j))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [name])
  useEffect(() => {
    if (p) void paintLens(lens === 'none' || lens === 'stability' ? [] : lensFeatures(p, lens))
    return () => void paintLens([])
  }, [p, lens])
  if (err) return <p className="osum">No profile for {name}: {err}</p>
  if (!p) return <p className="osum">Loading the atlas for {name}…</p>
  const r = p.record
  const c = r.composition
  const balance = r.exportsUsd !== undefined && r.importsUsd !== undefined ? r.exportsUsd - r.importsUsd : undefined
  const chip = (n: string, extra?: string) => (
    <button key={n + (extra ?? '')} className="atlas-chip" onClick={() => void openCountry(n)} title={`Open ${n}`}>
      {n}
      {extra ? <small> {extra}</small> : null}
    </button>
  )
  return (
    <div className="detail atlas">
      <header className="atlas-head">
        {p.wiki?.image && <img src={p.wiki.image} alt="" referrerPolicy="no-referrer" />}
        <div>
          <h2>{p.name}</h2>
          <span>
            {p.wiki?.description ?? r.governmentType} · capital {r.capital ?? '–'}
            {p.currency?.code ? ` · ${p.currency.code} ${p.currency.perUsd ? `${p.currency.perUsd.toFixed(2)}/$` : ''}` : ''}
          </span>
        </div>
      </header>
      <div className="atlas-lens" role="radiogroup" aria-label="Map mode">
        {(['diplomacy', 'trade', 'none'] as Lens[]).map((l) => (
          <button key={l} className={lens === l ? 'on' : ''} onClick={() => setLens(l)}>
            {l === 'none' ? 'no map mode' : `${l} map`}
          </button>
        ))}
      </div>

      <div className="atlas-cards">
        {p.cards.map((k) => (
          <div key={k.id} className="atlas-card" title={k.hint}>
            <span className="ic">{ICON[k.id]}</span>
            <small>{k.label}</small>
            <b>{k.value}</b>
            <em>{k.grade}</em>
            {k.pct !== undefined && (
              <i>
                <s style={{ width: `${k.pct}%` }} />
              </i>
            )}
          </div>
        ))}
      </div>

      {p.strategic.length > 0 && (
        <>
          <h3>Strategic</h3>
          <ul className="atlas-list">
            {p.strategic.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}

      <h3>Right now</h3>
      <p className="atlas-now">
        {p.now.cii ? <b>Instability {p.now.cii.score}/100</b> : <b>No instability signals</b>} · {p.now.events.count} checked events · {p.now.unrest.count} unrest hotspots ·{' '}
        {p.now.news.count} stories · {p.now.telegram.count} Telegram posts · {p.now.ships} ships · {p.now.aircraft} military aircraft
      </p>
      {!!p.now.finance?.length && (
        <p className="atlas-fin">
          {p.now.finance.map((f) => (
            <button key={f.id} className="atlas-chip" onClick={() => select(f.id)}>
              {f.name} <b style={{ color: f.day >= 0 ? '#4ade80' : '#f87171' }}>{f.day >= 0 ? '+' : ''}{f.day.toFixed(2)}%</b>
            </button>
          ))}
        </p>
      )}
      <ul className="evidence">
        {[...p.now.events.top, ...p.now.news.top].slice(0, 6).map((x) => (
          <li key={x.id}>
            <button className="atlas-link" onClick={() => select(x.id)}>
              {x.title}
            </button>
          </li>
        ))}
        {p.now.markets.map((m) => (
          <li key={m.id}>
            <button className="atlas-link" onClick={() => select(m.id)}>
              {Math.round((m.props.p ?? 0) * 100)}% · {m.title}
            </button>
          </li>
        ))}
      </ul>

      <h3>People</h3>
      <dl className="atlas-dl">
        <dt>Leaders</dt>
        <dd>{[r.chiefOfState, r.headOfGovernment].filter(Boolean).join(' · ') || '–'}</dd>
        <dt>Languages</dt>
        <dd>{r.languages.join(', ') || '–'}</dd>
        <dt>Religions</dt>
        <dd>{r.religions.join(', ') || '–'}</dd>
        <dt>Ethnic groups</dt>
        <dd>{r.ethnicGroups.join(', ') || '–'}</dd>
        <dt>Cities</dt>
        <dd>{r.majorCities.join(', ') || '–'}</dd>
      </dl>

      <h3>Economy</h3>
      {c.agriculture !== undefined && (
        <div className="atlas-comp" title="GDP by sector">
          <s style={{ width: `${c.agriculture}%`, background: '#22c55e' }}>agri {c.agriculture}%</s>
          <s style={{ width: `${c.industry ?? 0}%`, background: '#f59e0b' }}>industry {c.industry}%</s>
          <s style={{ width: `${Math.max(0, 100 - (c.agriculture ?? 0) - (c.industry ?? 0))}%`, background: '#38bdf8' }}>services {c.services}%</s>
        </div>
      )}
      <dl className="atlas-dl">
        <dt>GDP</dt>
        <dd>
          {money(r.gdpUsd)} · growth {r.gdpGrowth ?? '–'}% · inflation {r.inflation ?? '–'}% · unemployment {r.unemployment ?? '–'}%
        </dd>
        <dt>Public finances</dt>
        <dd>
          debt {r.publicDebtPct ?? '–'}% of GDP · budget {money(r.budget.revenue)} in / {money(r.budget.spending)} out · reserves {money(r.reservesUsd)}
        </dd>
        <dt>Industries</dt>
        <dd>{r.industries.join(', ') || '–'}</dd>
        <dt>Farming</dt>
        <dd>{r.agriculture.join(', ') || '–'}</dd>
      </dl>
      <div className="atlas-trade">
        <div>
          <small>Exports {money(r.exportsUsd)}</small>
          <p>{r.exportCommodities.join(', ')}</p>
          {r.exportPartners.map((t) => chip(t.name, `${t.share}%`))}
        </div>
        <div>
          <small>Imports {money(r.importsUsd)}</small>
          <p>{r.importCommodities.join(', ')}</p>
          {r.importPartners.map((t) => chip(t.name, `${t.share}%`))}
        </div>
      </div>
      {balance !== undefined && <p className={`atlas-balance ${balance >= 0 ? 'pos' : 'neg'}`}>Trade balance {money(balance)}</p>}
      <div className="atlas-res">
        {r.resources.map((x) => (
          <span key={x} title={x}>
            {iconFor(x)} {x}
          </span>
        ))}
      </div>

      <h3>Relations</h3>
      {p.relations.blocs.length > 0 && (
        <p className="atlas-blocs">
          {p.relations.blocs.map((b) => (
            <span key={b.id}>{b.name}</span>
          ))}
        </p>
      )}
      <dl className="atlas-dl">
        <dt>Neighbours</dt>
        <dd>{p.relations.neighbours.map((n) => chip(n.name, `${n.km} km${n.tense ? ' ⚠' : ''}`))}</dd>
        <dt>Depends on</dt>
        <dd>{p.relations.dependencies.length ? p.relations.dependencies.map((d) => chip(d.name, `${d.way} ${d.share}%`)) : '–'}</dd>
        <dt>Allies</dt>
        <dd>{p.relations.allies.slice(0, 18).map((a) => chip(a.name, a.via.join('/')))}</dd>
        {p.relations.disputes && (
          <>
            <dt>Disputes</dt>
            <dd>{p.relations.disputes}</dd>
          </>
        )}
      </dl>

      <h3>Military and security</h3>
      <dl className="atlas-dl">
        <dt>Spending</dt>
        <dd>{r.military.expenditurePct ? `${r.military.expenditurePct}% of GDP` : 'not reported'}</dd>
        <dt>Forces</dt>
        <dd>{r.military.forces ?? '–'}</dd>
        <dt>Armed groups</dt>
        <dd>{r.terroristGroups.join(', ') || '–'}</dd>
        {r.refugees && (
          <>
            <dt>Displaced</dt>
            <dd>{r.refugees}</dd>
          </>
        )}
      </dl>
      {(p.wiki?.extract || r.background) && (
        <>
          <h3>Background</h3>
          <p className="osum">{p.wiki?.extract ?? r.background}</p>
        </>
      )}
      <p className="note">Reference data: CIA World Factbook (public domain), World Bank, Wikipedia. Live section: this dashboard's layers, matched by country boundary.</p>
    </div>
  )
}
