import { CATEGORIES, fontsUrl, type Design } from '../../gui_elements/catalog'

/** The gui_elements files that capture a design. */
export function exportFiles(d: Design) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const lines = CATEGORIES.map((c) => `  ${c.key}: ${d[c.key]}, // ${c.options[d[c.key]]}`).join('\n')
  const design = `// The chosen ATLAS design: one option index per category (option names are in catalog.ts).
// Exported from the design editor on ${stamp} UTC. Safe to edit by hand.
import type { Design } from './catalog'

export const DESIGN: Design = {
${lines}
}
`
  const fonts = `/* Google Fonts for the exported ATLAS design (${stamp} UTC). Import once, from main.tsx. */
@import url('${fontsUrl(d)}');
`
  return { 'design.ts': design, 'fonts.css': fonts }
}
