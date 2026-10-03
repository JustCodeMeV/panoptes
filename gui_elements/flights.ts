// Fly-to presets (catalog "Fly-to"): duration in ms, easing, and how far the camera pulls out mid-flight.
// The canvas mock globe animates with these; the Cesium globe uses the same durations.
const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
}
export const FLIGHTS = [
  { dur: 450, ease: ease.outCubic, dip: 1 },
  { dur: 1100, ease: ease.inOutCubic, dip: 0.92 },
  { dur: 2200, ease: ease.inOutSine, dip: 0.85 },
  { dur: 0, ease: ease.outCubic, dip: 1 },
  { dur: 900, ease: ease.outBack, dip: 1 },
  { dur: 1500, ease: ease.inOutCubic, dip: 0.6 },
]
