import type { DetailProps } from '../../core/types'

type Trend = { query: string; traffic: string; at: number; news: { title: string; url: string; source: string }[]; security: boolean }

export function TrendsDetail({ feature }: DetailProps) {
  const p = feature.props
  const trends = (p.trends as Trend[]) ?? []
  const sec = Number(p.securityTerms)
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: sec ? '#f97316' : '#64748b' }}>
        <b>SEARCH TRENDS · {String(p.geo)}</b>
        <span>{sec ? `${sec} security-related search${sec > 1 ? 'es' : ''} trending` : 'nothing security-related trending'}</span>
      </div>
      <h2>{String(p.country)}</h2>
      <p className="osum">What people in this country are searching for right now (Google Trends). Searches surge before reporting does, and show what people fear.</p>
      <ul className="evidence">
        {trends.map((t) => (
          <li key={t.query}>
            <span className="chip" style={{ background: t.security ? '#f97316' : '#475569' }}>
              {t.traffic || 'trend'}
            </span>
            <b>{t.query}</b>
            {t.news[0] && (
              <small>
                <a href={t.news[0].url} target="_blank" rel="noreferrer">
                  {t.news[0].title}
                </a>{' '}
                · {t.news[0].source}
              </small>
            )}
          </li>
        ))}
      </ul>
      <p className="note">Security terms are matched by keyword in 12 languages; a match is a lead, not a confirmed event.</p>
    </div>
  )
}
