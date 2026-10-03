import { fontSpec, MAIN_FONTS, MONO_FONTS, NEWS_FONTS, SUB_FONTS, TITLE_FONTS } from '../gui_elements/catalog'

/** Load every font the canvas can audition: one stylesheet per family so one bad request can't break the rest. */
export function loadAllFonts() {
  const specs = new Set([
    ...[...TITLE_FONTS, ...MAIN_FONTS, ...SUB_FONTS, ...MONO_FONTS].map((f) => fontSpec(f.family)),
    ...NEWS_FONTS.map((f) => fontSpec(f.family, true)),
  ])
  for (const spec of specs) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${spec.replaceAll(' ', '+')}&display=swap`
    document.head.appendChild(link)
  }
}
