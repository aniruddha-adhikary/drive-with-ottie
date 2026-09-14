export const W = 360
export const H = 240
export const HORIZON = 92
export const CX = 180

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Screen y for a depth t in [0,1] (0 = bumper, 1 = horizon). Eased so far things bunch up. */
export function depthY(t: number): number {
  const e = 1 - Math.pow(1 - clamp01(t), 1.6)
  return lerp(H, HORIZON, e)
}

/** Half width of the carriageway at depth t. */
export function halfWidth(t: number, wide = false): number {
  const e = 1 - Math.pow(1 - clamp01(t), 1.6)
  return lerp(wide ? 215 : 185, wide ? 26 : 22, e)
}

/** x for a normalised across-road position u in [-1, 1] at depth t. */
export function roadX(t: number, u: number, wide = false): number {
  return CX + u * halfWidth(t, wide)
}

/** Apparent scale of an object at depth t (1 at bumper). */
export function depthScale(t: number): number {
  const e = 1 - Math.pow(1 - clamp01(t), 1.6)
  return lerp(1, 0.14, e)
}

/**
 * Two-way roads: the ego carriageway is the left half (Singapore drives on the
 * left); lanes split that half. One-way roads (expressway) use the full width.
 */
export function laneBounds(lane: number, lanes: number, oneWay: boolean): [number, number] {
  const lo = oneWay ? -1 : -1
  const hi = oneWay ? 1 : 0
  const w = (hi - lo) / lanes
  return [lo + (lane - 1) * w, lo + lane * w]
}

export function laneCentre(lane: number, lanes: number, oneWay: boolean): number {
  const [a, b] = laneBounds(lane, lanes, oneWay)
  return (a + b) / 2
}

export function quad(t0: number, t1: number, u0: number, u1: number, wide = false): string {
  const p: [number, number][] = [
    [roadX(t0, u0, wide), depthY(t0)],
    [roadX(t0, u1, wide), depthY(t0)],
    [roadX(t1, u1, wide), depthY(t1)],
    [roadX(t1, u0, wide), depthY(t1)],
  ]
  return p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}
