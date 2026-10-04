import type { DetailProps } from '../../core/types'
import { VERDICT_COLOR, VERDICT_LABEL, checkOf } from './props'

const STANCE = { supports: '▲ supports', contradicts: '▼ contradicts', context: '• context' } as const

/** Grok's reading of X for one story: verdict, what X shows, conflicts, and the posts themselves. */
export function XDetail({ feature, select }: DetailProps) {
  const c = checkOf(feature)
  return (
    <div className="detail truth">
      <div className="verdict" style={{ ['--v' as string]: VERDICT_COLOR[c.verdict] }}>
        <b>{VERDICT_LABEL[c.verdict]}</b>
        <span>{c.confidence}% confidence, as Grok reports it</span>
      </div>
      <h2>{feature.title}</h2>
      <p className="osum">{c.summary}</p>
      <p className="note">
        Checking:{' '}
        <button type="button" className="linkish" onClick={() => select(c.storyId)}>
          {c.storyTitle}
        </button>
      </p>
      {c.details.length > 0 && (
        <>
          <h3>What X shows</h3>
          <ul>
            {c.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {c.discrepancies.length > 0 && (
        <>
          <h3>Conflicts with the story</h3>
          <ul>
            {c.discrepancies.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {c.posts.length > 0 && (
        <>
          <h3>Posts</h3>
          <ul className="xposts">
            {c.posts.map((p) => (
              <li key={p.url}>
                <span className={`xstance xstance-${p.stance}`}>{STANCE[p.stance]}</span>{' '}
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.handle ?? 'post'}
                </a>
                {p.postedAt && <small> · {new Date(p.postedAt).toLocaleString()}</small>}
                <div>{p.text}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={`geo geo-${feature.geoPrecision}`}>
        <b>{feature.geoPrecision.toUpperCase()}</b>
        <span>{feature.geoBasis}</span>
      </div>
      <p className="note">
        Grok&rsquo;s reading of public X posts ({c.model}, {new Date(c.checkedAt).toLocaleString()}). A second opinion to weigh, not proof: check the posts
        yourself before acting on it.
      </p>
    </div>
  )
}
