import { useInvestigation } from '../core/investigation'
import { setMode, useShell, type Mode } from './shell'

const MODES: [Mode, string, string][] = [
  ['brief', 'Brief', 'What needs attention now'],
  ['map', 'Map', 'Every layer on the globe'],
  ['investigate', 'Investigate', 'Cases, evidence and the graph'],
]

/** The three main views, always reachable at the top of the screen. */
export function ModeBar() {
  const mode = useShell((s) => s.mode)
  return (
    <nav className="modebar" aria-label="Main view">
      {MODES.map(([m, label, hint]) => (
        <button key={m} type="button" className={mode === m ? 'on' : ''} aria-current={mode === m ? 'page' : undefined} title={hint} onClick={() => {
          // The floating graph belongs to the moment you opened it, not to a view switch
          if (m !== 'investigate') useInvestigation.getState().close()
          setMode(m)
        }}>
          {label}
        </button>
      ))}
    </nav>
  )
}
