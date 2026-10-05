/** What an event's check status means, in plain words (Brief, item card). */
export const STATUS: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed: independent outlets in several countries', color: '#22c55e' },
  corroborated: { label: 'Corroborated by independent outlets', color: '#84cc16' },
  'single-source': { label: 'Single source so far', color: '#eab308' },
  'government-only': { label: 'Only government outlets so far', color: '#f97316' },
  contested: { label: 'Contested: sources disagree', color: '#e879f9' },
  debunked: { label: 'Debunked by a fact-check', color: '#ef4444' },
}

/** Who stands behind a source, in plain words. */
export const OWNERSHIP: Record<string, string> = {
  state: 'government or state-run',
  public: 'public, statutorily independent',
  private: 'independent',
  gov: 'official government or military channel',
  media: 'newsroom',
  osint: 'OSINT account',
  milblog: 'partisan military blogger',
}
