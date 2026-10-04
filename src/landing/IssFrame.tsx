// ISS hardware framing the landing view, drawn in SVG: a solar array wing entering from the
// top-left and Canadarm2 reaching in from the top-right, lit by a low sun.

type P = [number, number]

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const pts = (...p: P[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/* ---------------- Solar array ---------------- */

// Panel corners (top-left, top-right, bottom-right, bottom-left), in a receding perspective
const PANEL: [P, P, P, P] = [[-80, -10], [170, 150], [262, 470], [-80, 540]]
const COLS = 9
const ROWS = 16

function SolarArray() {
  const [tl, tr, br, bl] = PANEL
  const at = (u: number, v: number) => lerp(lerp(tl, tr, u), lerp(bl, br, u), v)
  const cells: string[] = []
  for (let c = 0; c <= COLS; c++) cells.push(`M${pts(at(c / COLS, 0))}L${pts(at(c / COLS, 1))}`)
  for (let r = 0; r <= ROWS; r++) cells.push(`M${pts(at(0, r / ROWS))}L${pts(at(1, r / ROWS))}`)
  // Cell sheen: alternate cells catch the sun slightly differently
  const glints: string[] = []
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      if ((c * 7 + r * 3) % 5 === 0) glints.push(pts(at(c / COLS, r / ROWS), at((c + 1) / COLS, r / ROWS), at((c + 1) / COLS, (r + 1) / ROWS), at(c / COLS, (r + 1) / ROWS)))
  return (
    <g>
      <polygon points={pts(tl, tr, br, bl)} fill="url(#iss-cells)" />
      {glints.map((g, i) => <polygon key={i} points={g} fill="#ffd27a" opacity="0.08" />)}
      <path d={cells.join('')} stroke="#1b0f05" strokeWidth="1.6" fill="none" opacity="0.85" />
      {/* Bus bars every third column */}
      <path d={Array.from({ length: 3 }, (_, i) => `M${pts(at((i + 1) / 3, 0))}L${pts(at((i + 1) / 3, 1))}`).join('')} stroke="#d8a65c" strokeWidth="1.2" opacity="0.6" />
      {/* Edge frame and the mast along the leading edge */}
      <polygon points={pts(tl, tr, br, bl)} fill="none" stroke="#c99752" strokeWidth="2.5" />
      <path d={`M${pts(lerp(tr, br, -0.15))}L${pts(lerp(tr, br, 1.08))}`} stroke="url(#iss-mast)" strokeWidth="9" strokeLinecap="round" />
      <polygon points={pts(tl, tr, br, bl)} fill="url(#iss-shade)" />
    </g>
  )
}

/* ---------------- Canadarm2 ---------------- */

/** A cylinder from a to b, shaded across its width like a lit tube. */
function Boom({ id, a, b, w, light, dark }: { id: string; a: P; b: P; w: number; light: string; dark: string }) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const nx = (-dy / len) * (w / 2)
  const ny = (dx / len) * (w / 2)
  const mid = lerp(a, b, 0.5)
  return (
    <g>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={mid[0] + nx} y1={mid[1] + ny} x2={mid[0] - nx} y2={mid[1] - ny}>
          <stop offset="0" stopColor={dark} />
          <stop offset="0.35" stopColor={light} />
          <stop offset="0.55" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <polygon points={pts([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny])} fill={`url(#${id})`} />
      {/* MLI blanket seams */}
      {Array.from({ length: Math.floor(len / 70) }, (_, i) => {
        const p = lerp(a, b, (i + 1) / (Math.floor(len / 70) + 1))
        return <line key={i} x1={p[0] + nx} y1={p[1] + ny} x2={p[0] - nx} y2={p[1] - ny} stroke="#000" strokeOpacity="0.22" strokeWidth="1.5" />
      })}
    </g>
  )
}

/** Foil-wrapped joint housing, a rotated box with panel lines. */
function Joint({ at, w, h, rot }: { at: P; w: number; h: number; rot: number }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${rot})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="url(#iss-foil)" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="none" stroke="#3a2608" strokeWidth="2" />
      <path d={`M${-w / 2 + 10} ${-h / 6}H${w / 2 - 10}M${-w / 2 + 10} ${h / 6}H${w / 2 - 10}M${-w / 6} ${-h / 2 + 8}V${h / 2 - 8}`} stroke="#3a2608" strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x={-w / 2 + 6} y={-h / 2 + 6} width={w * 0.3} height={h * 0.22} fill="#fff3c9" opacity="0.35" />
    </g>
  )
}

function Canadarm() {
  const shoulder: P = [1760, -120]
  const elbow: P = [1345, 285]
  const wrist: P = [1150, 370]
  const tip: P = [1060, 455]
  return (
    // Tucked into the top-right corner so the end effector clears the title
    <g transform="translate(200 -150)">
      <Boom id="iss-boom1" a={shoulder} b={elbow} w={78} light="#efe9da" dark="#6d685d" />
      <Boom id="iss-boom2" a={elbow} b={wrist} w={64} light="#e8e1cf" dark="#625c50" />
      {/* Handrails */}
      <path d={`M${pts(lerp(shoulder, elbow, 0.2))}L${pts(lerp(shoulder, elbow, 0.85))}`} stroke="#e8b931" strokeWidth="3" strokeDasharray="26 10" transform="translate(-30 -26)" opacity="0.85" />
      <Joint at={elbow} w={128} h={100} rot={-38} />
      <Joint at={wrist} w={96} h={84} rot={-30} />
      {/* End effector: dark-banded snare cylinder */}
      <Boom id="iss-ee" a={wrist} b={tip} w={84} light="#d9d2bf" dark="#4a453b" />
      {[0.35, 0.6, 0.85].map((t) => {
        const p = lerp(wrist, tip, t)
        return <ellipse key={t} cx={p[0]} cy={p[1]} rx="43" ry="10" transform={`rotate(-43 ${p[0]} ${p[1]})`} fill="none" stroke="#1c1a16" strokeWidth="4" opacity="0.75" />
      })}
      <ellipse cx={tip[0]} cy={tip[1]} rx="40" ry="18" transform={`rotate(-43 ${tip[0]} ${tip[1]})`} fill="#141310" stroke="#8f8878" strokeWidth="3" />
      {/* Camera on the wrist, catching the sun */}
      <rect x={wrist[0] + 22} y={wrist[1] - 70} width="34" height="26" rx="3" fill="#2c2a25" stroke="#bdb6a3" strokeWidth="2" transform={`rotate(-30 ${wrist[0] + 39} ${wrist[1] - 57})`} />
      <circle cx={wrist[0] + 34} cy={wrist[1] - 58} r="6" fill="#0d1a2a" stroke="#9fc6ff" strokeOpacity="0.6" />
    </g>
  )
}

/** Station hardware in the foreground of the landing view. Purely decorative. */
export function IssFrame() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <defs>
        <linearGradient id="iss-cells" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b4318" />
          <stop offset="0.45" stopColor="#9a6528" />
          <stop offset="0.7" stopColor="#5a3612" />
          <stop offset="1" stopColor="#2e1c0a" />
        </linearGradient>
        <linearGradient id="iss-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#ffcf86" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="iss-mast" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8d8a82" />
          <stop offset="1" stopColor="#d9d4c6" />
        </linearGradient>
        <linearGradient id="iss-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d27c" />
          <stop offset="0.4" stopColor="#c08d32" />
          <stop offset="0.7" stopColor="#8a5d18" />
          <stop offset="1" stopColor="#4b3209" />
        </linearGradient>
        <radialGradient id="iss-vignette" cx="0.5" cy="0.55" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#iss-vignette)" />
      <SolarArray />
      <Canadarm />
    </svg>
  )
}
