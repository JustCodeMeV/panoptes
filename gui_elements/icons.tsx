// 16×16 line icons. Parts marked `fillable` take a fill in the Duotone and Filled icon styles.
export const ICON_PATHS = {
  search: <><circle className="fillable" cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></>,
  close: <path d="M4 4L12 12M12 4L4 12" />,
  layers: <><path className="fillable" d="M8 2L14 5L8 8L2 5Z" /><path d="M2 8L8 11L14 8M2 11L8 14L14 11" /></>,
  globe: <><circle className="fillable" cx="8" cy="8" r="6" /><path d="M2 8H14M8 2C5.5 5 5.5 11 8 14C10.5 11 10.5 5 8 2" /></>,
  live: <><circle className="fillable" cx="8" cy="8" r="2" /><path d="M4.5 4.5A5 5 0 0 0 4.5 11.5M11.5 4.5A5 5 0 0 1 11.5 11.5" /></>,
  filter: <path className="fillable" d="M2 3H14L9.5 8.5V13L6.5 11.5V8.5Z" />,
  settings: <><circle className="fillable" cx="8" cy="8" r="2.4" /><path d="M8 1.5V3.5M8 12.5V14.5M1.5 8H3.5M12.5 8H14.5M3.4 3.4L4.8 4.8M11.2 11.2L12.6 12.6M3.4 12.6L4.8 11.2M11.2 4.8L12.6 3.4" /></>,
  pin: <><path className="fillable" d="M8 14.5C8 14.5 3 9.5 3 6.2A5 5 0 0 1 13 6.2C13 9.5 8 14.5 8 14.5Z" /><circle cx="8" cy="6.2" r="1.6" /></>,
  alert: <><path className="fillable" d="M8 2L14.5 13.5H1.5Z" /><path d="M8 6.5V9.5M8 11.4V11.6" /></>,
  play: <path className="fillable" d="M5 3L13 8L5 13Z" />,
  plus: <path d="M8 3V13M3 8H13" />,
  minus: <path d="M3 8H13" />,
  home: <path className="fillable" d="M2.5 7.5L8 2.5L13.5 7.5V13.5H2.5Z" />,
}

export const ICON_GLYPHS: Record<keyof typeof ICON_PATHS, string> = {
  search: '⌕', close: '✕', layers: '≡', globe: '◍', live: '◉', filter: '⧩', settings: '⚙', pin: '⌖', alert: '⚠', play: '▶', plus: '+', minus: '−', home: '⌂',
}

export type IconName = keyof typeof ICON_PATHS
export const ICON_LIST = Object.keys(ICON_PATHS) as IconName[]
