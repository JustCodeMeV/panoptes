export const EXPOSURE_COLOR: Record<string, string> = {
  ics: '#ef4444',
  cameras: '#38bdf8',
  databases: '#a78bfa',
  rdp: '#f59e0b',
}
export const exposureColor = (cat: string) => EXPOSURE_COLOR[cat] ?? '#94a3b8'
