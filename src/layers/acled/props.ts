export const TYPE_COLOR: Record<string, string> = {
  Battles: '#ef4444',
  'Explosions/Remote violence': '#f97316',
  'Violence against civilians': '#b91c1c',
  Protests: '#fb923c',
  Riots: '#f43f5e',
  'Strategic developments': '#a78bfa',
}
export const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v))
