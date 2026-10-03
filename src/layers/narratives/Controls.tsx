import { useState, type FormEvent } from 'react'
import type { Feature } from '../../../shared/feature'
import type { ControlsProps } from '../../core/types'

/** Ad-hoc claim check: paste something circulating, get an evidence summary. */
export function Controls({ pin }: ControlsProps) {
  const [claim, setClaim] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (claim.trim().length < 8 || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch('/api/truth/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claim }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
      pin((await res.json()) as Feature)
      setClaim('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="claim" onSubmit={submit}>
      <textarea
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder="Check a claim: paste a post, headline or rumour…"
        rows={2}
        maxLength={400}
      />
      <button type="submit" disabled={busy || claim.trim().length < 8}>
        {busy ? 'Cross-referencing…' : 'Cross-reference'}
      </button>
      {error && <span className="err">{error}</span>}
    </form>
  )
}
