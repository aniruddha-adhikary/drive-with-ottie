import { useId, useMemo } from 'react'
import type { MarkingId, SceneSpec, SignPlacement, TimeOfDay, VehicleSpec } from '../content/types'
import { CX, H, HORIZON, W, depthScale, depthY, halfWidth, laneBounds, laneCentre, quad, roadX } from './geometry'
import { SignShape } from './Signs'
import { LightHousing } from './TrafficLight'
import { RearVehicle, SideVehicle } from './Vehicles'
import { timeOfDayNow } from './timeOfDay'

const TJ0 = 0.5 // near edge of a junction / roundabout
const TJ1 = 0.72 // far edge
const TM = 0.42 // depth of lines painted at a junction mouth / crossing

const sky: Record<TimeOfDay, [string, string]> = {
  dawn: ['#f7b267', '#8ec5ff'],
  day: ['#4aa3ff', '#bfe3ff'],
  dusk: ['#3b2a5a', '#ff9a62'],
  night: ['#060b1a', '#14213d'],
}

const asphalt: Record<TimeOfDay, string> = { dawn: '#4b5563', day: '#4b5563', dusk: '#3f4652', night: '#2b3038' }
const grass: Record<TimeOfDay, string> = { dawn: '#6fae5a', day: '#5fa64b', dusk: '#4c7d3d', night: '#22402a' }

interface Props {
  spec: SceneSpec
  /** Fixed time of day; defaults to the wall clock. */
  timeOfDay?: TimeOfDay
  className?: string
  /** Compact mode drops scenery detail for small thumbnails. */
  compact?: boolean
}

export function Scene({ spec, timeOfDay, className, compact = false }: Props) {
  const uid = useId().replace(/:/g, '')
  const clockTod = useMemo(() => timeOfDayNow(), [])
  const tod = spec.timeOfDay ?? timeOfDay ?? clockTod
  const oneWay = spec.road === 'expressway'
  const wide = oneWay
  const lanes = spec.lanes ?? (oneWay ? 3 : 1)
  const egoLane = Math.min(spec.egoLane ?? 1, lanes)
  const markings = new Set<MarkingId>(spec.markings ?? [])
  const hasJunction = spec.road === 't_junction' || spec.road === 'cross_junction' || spec.road === 'roundabout'
  const hasSlip = oneWay && (markings.has('chevron') || (spec.signs ?? []).some((s) => s.id === 'expressway_exit'))
  const night = tod === 'night' || tod === 'dusk'
  const [skyTop, skyBottom] = sky[tod]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={describe(spec)} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBottom} />
        </linearGradient>
        <linearGradient id={`${uid}-road`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={asphalt[tod]} />
          <stop offset="1" stopColor={night ? '#1e2229' : '#6b7280'} />
        </linearGradient>
        <clipPath id={`${uid}-ground`}>
          <rect x={0} y={HORIZON} width={W} height={H - HORIZON} />
        </clipPath>
      </defs>

      {/* Sky */}
      <rect width={W} height={HORIZON + 2} fill={`url(#${uid}-sky)`} />
      {tod === 'night' &&
        !compact &&
        STARS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.8} className="twinkle" style={{ animationDelay: `${(i % 5) * 0.7}s` }} />)}
      {tod === 'day' && <circle cx={300} cy={26} r={14} fill="#fff4b0" opacity={0.95} />}
      {tod === 'dawn' && <circle cx={70} cy={60} r={16} fill="#ffd27f" />}
      {tod === 'dusk' && <circle cx={290} cy={70} r={16} fill="#ff6b35" />}
      {tod === 'night' && <circle cx={296} cy={28} r={11} fill="#f1f5f9" opacity={0.95} />}

      {/* Skyline */}
      {!compact && <Skyline night={night} />}

      {/* Ground */}
      <rect x={0} y={HORIZON} width={W} height={H - HORIZON} fill={grass[tod]} />

      <g clipPath={`url(#${uid}-ground)`}>
        {/* Cross road for junctions */}
        {hasJunction && <rect x={0} y={depthY(TJ1)} width={W} height={depthY(TJ0) - depthY(TJ1)} fill={asphalt[tod]} />}
        {hasJunction && spec.road !== 'roundabout' && (
          <>
            <line x1={0} y1={depthY(TJ1) + 1} x2={W} y2={depthY(TJ1) + 1} stroke="#e5e7eb" strokeWidth={1.2} />
            <line x1={0} y1={depthY(TJ0) - 1} x2={W} y2={depthY(TJ0) - 1} stroke="#e5e7eb" strokeWidth={1.2} />
            <DashedH y={(depthY(TJ0) + depthY(TJ1)) / 2} skip={[roadX(TJ0, -1) - 4, roadX(TJ0, 1) + 4]} />
          </>
        )}

        {/* Main carriageway */}
        <MainRoad road={spec.road} wide={wide} fill={`url(#${uid}-road)`} />

        {/* Slip road on expressways */}
        {hasSlip && (
          <>
            <polygon points={`${roadX(0.28, -1, wide)},${depthY(0.28)} ${roadX(0.75, -1, wide) - 6},${depthY(0.75)} ${roadX(0.75, -1, wide) - 60},${depthY(0.75)} ${0},${depthY(0.55)} ${0},${depthY(0.3)}`} fill={asphalt[tod]} />
            {markings.has('chevron') && <Chevrons wide={wide} />}
          </>
        )}

        {/* Roundabout island */}
        {spec.road === 'roundabout' && (
          <>
            <ellipse cx={CX} cy={depthY(0.6)} rx={halfWidth(0.6) * 2.4} ry={(depthY(TJ0) - depthY(TJ1)) * 0.72} fill={asphalt[tod]} />
            <ellipse cx={CX} cy={depthY(0.61)} rx={halfWidth(0.6) * 1.1} ry={(depthY(TJ0) - depthY(TJ1)) * 0.3} fill={grass[tod]} stroke="#e5e7eb" strokeWidth={1.5} />
            <ellipse cx={CX} cy={depthY(0.61)} rx={halfWidth(0.6) * 0.5} ry={(depthY(TJ0) - depthY(TJ1)) * 0.13} fill="#2f6b3a" />
          </>
        )}

        {/* Edge lines */}
        <EdgeLines road={spec.road} wide={wide} tEnd={hasJunction ? TJ0 : spec.road === 'bend' ? 0.5 : 0.97} />

        {/* Centre and lane lines */}
        <LaneLines oneWay={oneWay} wide={wide} lanes={lanes} markings={markings} tEnd={hasJunction ? TM - 0.01 : spec.road === 'bend' ? 0.5 : 0.97} />

        {/* Kerbside markings */}
        {markings.has('single_yellow') && <polygon points={quad(0, 0.95, -0.965, -0.945, wide)} fill="#f4c20d" />}
        {markings.has('double_yellow_zigzag') && <ZigZag u={-0.9} colour="#f4c20d" double wide={wide} />}
        {markings.has('zig_zag') && (
          <>
            <ZigZag u={-0.9} colour="#f8fafc" wide={wide} />
            <ZigZag u={oneWay ? 0.9 : 0.9} colour="#f8fafc" wide={wide} />
          </>
        )}
        {markings.has('bus_lane_marking') && <BusLane lanes={lanes} oneWay={oneWay} wide={wide} />}

        {/* Transverse markings */}
        {markings.has('box_junction') && hasJunction && <BoxJunction uid={uid} />}
        {markings.has('zebra') && <Zebra wide={wide} />}
        {markings.has('stop_line') && <polygon points={quad(TM, TM + 0.018, -0.97, oneWay ? 0.97 : -0.02, wide)} fill="#f8fafc" />}
        {markings.has('give_way_line') && <GiveWayLine oneWay={oneWay} wide={wide} />}
        {(markings.has('arrow_left') || markings.has('arrow_right') || markings.has('arrow_straight')) && (
          <LaneArrow dir={markings.has('arrow_left') ? 'left' : markings.has('arrow_right') ? 'right' : 'straight'} u={laneCentre(egoLane, lanes, oneWay)} wide={wide} />
        )}

        {/* Scenery */}
        {!compact && <Trees wide={wide} night={night} hasJunction={hasJunction} slip={hasSlip} />}
        {night && !compact && <Lamps wide={wide} />}

        {/* Far-side traffic light */}
        {spec.light && hasJunction && spec.road !== 'roundabout' && <TrafficLightAt t={TJ1 + 0.05} side="right" state={spec.light} />}

        {/* Vehicles, far to near */}
        {(spec.vehicles ?? [])
          .filter((v) => !v.pos.startsWith('behind'))
          .map((v) => ({ v, ...vehiclePlacement(v, egoLane, lanes, oneWay, wide, spec.road) }))
          .sort((a, b) => a.y - b.y)
          .map(({ v, x, y, s, mode }, i) => (
            <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`}>
              {mode === 'rear' && <RearVehicle spec={v} />}
              {mode === 'front' && <RearVehicle spec={v} facing />}
              {mode === 'side_left' && <SideVehicle spec={v} dir="left" />}
              {mode === 'side_right' && <SideVehicle spec={v} dir="right" />}
            </g>
          ))}

        {/* Pedestrian */}
        {spec.pedestrian && <Pedestrian where={spec.pedestrian} wide={wide} />}

        {/* Signs */}
        {(spec.signs ?? []).map((s, i) => (
          <RoadSign key={i} s={s} wide={wide} />
        ))}

        {/* Near-side traffic light (primary signal, left kerb) */}
        {spec.light && hasJunction && spec.road !== 'roundabout' && <TrafficLightAt t={TJ0 - 0.06} side="left" state={spec.light} />}
        {spec.light && !hasJunction && <TrafficLightAt t={0.45} side="left" state={spec.light} />}

        {/* Rain */}
        {spec.weather === 'rain' && <Rain />}
      </g>

      {/* Ego bonnet */}
      <Bonnet indicator={spec.egoIndicator} />
      {(spec.vehicles ?? []).filter((v) => v.pos.startsWith('behind')).map((v, i) => <Mirror key={i} v={v} uid={uid} skyTop={skyTop} asphalt={asphalt[tod]} />)}
    </svg>
  )
}

/* ─── Pieces ─────────────────────────────────────────────────────────────── */

function MainRoad({ road, wide, fill }: { road: SceneSpec['road']; wide: boolean; fill: string }) {
  if (road === 'bend') {
    const x0 = roadX(0, -1), x1 = roadX(0, 1)
    const xa = roadX(0.5, -1), xb = roadX(0.5, 1), ya = depthY(0.5)
    return (
      <>
        <path d={`M${x0},${H} L${x1},${H} L${xb},${ya} Q${xb + 12},${HORIZON + 8} ${W},${HORIZON + 3} L${W},${HORIZON + 22} Q${xa + 44},${HORIZON + 30} ${xa},${ya} Z`} fill={fill} />
        <path d={`M${xb},${ya} Q${xb + 12},${HORIZON + 8} ${W},${HORIZON + 3}`} fill="none" stroke="#e5e7eb" strokeWidth={1.6} opacity={0.9} />
        <path d={`M${xa},${ya} Q${xa + 44},${HORIZON + 30} ${W},${HORIZON + 22}`} fill="none" stroke="#e5e7eb" strokeWidth={1.6} opacity={0.9} />
        <path d={`M${CX},${ya} Q${CX + 28},${HORIZON + 18} ${W},${HORIZON + 12}`} fill="none" stroke="#f8fafc" strokeWidth={1.4} strokeDasharray="6 5" />
      </>
    )
  }
  if (road === 't_junction') return <polygon points={quad(0, TJ1, -1, 1, wide)} fill={fill} />
  return <polygon points={quad(0, 1, -1, 1, wide)} fill={fill} />
}

function EdgeLines({ road, wide, tEnd }: { road: SceneSpec['road']; wide: boolean; tEnd: number }) {
  const t1 = road === 't_junction' || road === 'cross_junction' || road === 'roundabout' ? TJ0 : tEnd
  return (
    <>
      <polygon points={quad(0, t1, -0.985, -0.965, wide)} fill="#e5e7eb" opacity={0.9} />
      <polygon points={quad(0, t1, 0.965, 0.985, wide)} fill="#e5e7eb" opacity={0.9} />
      {road === 'cross_junction' && (
        <>
          <polygon points={quad(TJ1, 0.97, -0.985, -0.965, wide)} fill="#e5e7eb" opacity={0.9} />
          <polygon points={quad(TJ1, 0.97, 0.965, 0.985, wide)} fill="#e5e7eb" opacity={0.9} />
        </>
      )}
    </>
  )
}

function Dashes({ u, t0, t1, n, wide, colour = '#f8fafc', w = 0.012 }: { u: number; t0: number; t1: number; n: number; wide: boolean; colour?: string; w?: number }) {
  const segs = []
  const step = (t1 - t0) / n
  for (let k = 0; k < n; k++) {
    const a = t0 + k * step
    segs.push(<polygon key={k} points={quad(a, a + step * 0.55, u - w, u + w, wide)} fill={colour} />)
  }
  return <>{segs}</>
}

function LaneLines({ oneWay, wide, lanes, markings, tEnd }: { oneWay: boolean; wide: boolean; lanes: number; markings: Set<MarkingId>; tEnd: number }) {
  const els = []
  if (!oneWay) {
    if (markings.has('double_white')) {
      els.push(<polygon key="dw1" points={quad(0, tEnd, -0.035, -0.012, wide)} fill="#f8fafc" />, <polygon key="dw2" points={quad(0, tEnd, 0.012, 0.035, wide)} fill="#f8fafc" />)
    } else {
      els.push(<Dashes key="c" u={0} t0={0} t1={tEnd} n={10} wide={wide} />)
    }
  }
  const [lo, hi] = oneWay ? [-1, 1] : [-1, 0]
  for (let l = 1; l < lanes; l++) {
    const u = lo + ((hi - lo) / lanes) * l
    els.push(<Dashes key={`l${l}`} u={u} t0={0} t1={tEnd} n={10} wide={wide} />)
  }
  return <>{els}</>
}

function DashedH({ y, skip }: { y: number; skip: [number, number] }) {
  const segs = []
  for (let x = 4; x < W; x += 22) {
    if (x + 12 > skip[0] && x < skip[1]) continue
    segs.push(<rect key={x} x={x} y={y - 0.8} width={12} height={1.6} fill="#f8fafc" />)
  }
  return <>{segs}</>
}

function ZigZag({ u, colour, double = false, wide }: { u: number; colour: string; double?: boolean; wide: boolean }) {
  const pts = (uu: number) => {
    const out = []
    const n = 8
    for (let k = 0; k <= n; k++) {
      const t = 0.06 + (k / n) * 0.32
      const du = k % 2 === 0 ? -0.045 : 0.045
      out.push(`${roadX(t, uu + du, wide).toFixed(1)},${depthY(t).toFixed(1)}`)
    }
    return out.join(' ')
  }
  return (
    <>
      <polyline points={pts(u)} fill="none" stroke={colour} strokeWidth={2.2} strokeLinejoin="round" />
      {double && <polyline points={pts(u + 0.08)} fill="none" stroke={colour} strokeWidth={2.2} strokeLinejoin="round" />}
    </>
  )
}

function BusLane({ lanes, oneWay, wide }: { lanes: number; oneWay: boolean; wide: boolean }) {
  const [a, b] = laneBounds(1, lanes, oneWay)
  const u = (a + b) / 2
  return (
    <>
      <polygon points={quad(0, 0.9, a + 0.02, b - 0.02, wide)} fill="#b91c1c" opacity={0.45} />
      <text x={roadX(0.18, u, wide)} y={depthY(0.18)} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff" fontFamily="Inter, system-ui, sans-serif" transform={`scale(1 0.5)`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        BUS LANE
      </text>
    </>
  )
}

function BoxJunction({ uid }: { uid: string }) {
  const y0 = depthY(TJ0), y1 = depthY(TJ1)
  const xl0 = roadX(TJ0, -1), xr0 = roadX(TJ0, 1), xl1 = roadX(TJ1, -1), xr1 = roadX(TJ1, 1)
  const outline = `${xl0},${y0} ${xr0},${y0} ${xr1},${y1} ${xl1},${y1}`
  const lines = []
  for (let k = -6; k <= 6; k++) {
    const off = k * 26
    lines.push(<line key={`a${k}`} x1={xl0 + off} y1={y0} x2={xl0 + off + 90} y2={y1} stroke="#f4c20d" strokeWidth={1.6} />)
    lines.push(<line key={`b${k}`} x1={xr0 + off} y1={y0} x2={xr0 + off - 90} y2={y1} stroke="#f4c20d" strokeWidth={1.6} />)
  }
  return (
    <g>
      <clipPath id={`${uid}-box`}>
        <polygon points={outline} />
      </clipPath>
      <g clipPath={`url(#${uid}-box)`}>{lines}</g>
      <polygon points={outline} fill="none" stroke="#f4c20d" strokeWidth={2.2} />
    </g>
  )
}

function Zebra({ wide }: { wide: boolean }) {
  const t0 = TM - 0.04, t1 = TM + 0.035
  const stripes = []
  const n = wide ? 14 : 12
  for (let k = 0; k < n; k++) {
    const a = -0.95 + (1.9 / n) * k
    const b = a + (1.9 / n) * 0.62
    stripes.push(<polygon key={k} points={quad(t0, t1, a, b, wide)} fill="#f8fafc" />)
  }
  return <>{stripes}</>
}

function GiveWayLine({ oneWay, wide }: { oneWay: boolean; wide: boolean }) {
  const [lo, hi] = oneWay ? [-0.97, 0.97] : [-0.97, -0.03]
  const n = oneWay ? 12 : 6
  const segs = []
  for (let k = 0; k < n; k++) {
    const a = lo + ((hi - lo) / n) * k
    const b = a + ((hi - lo) / n) * 0.6
    segs.push(<polygon key={k} points={quad(TM, TM + 0.02, a, b, wide)} fill="#f8fafc" />)
  }
  return <>{segs}</>
}

function LaneArrow({ dir, u, wide }: { dir: 'left' | 'right' | 'straight'; u: number; wide: boolean }) {
  const t0 = 0.2, t1 = 0.3
  const shaft = quad(t0, t1, u - 0.018, u + 0.018, wide)
  const hx = roadX(t1, u, wide), hy = depthY(t1)
  const s = depthScale(t1) * 1.4
  const head =
    dir === 'straight'
      ? `${hx - 12 * s},${hy} ${hx + 12 * s},${hy} ${hx},${hy - 14 * s}`
      : dir === 'left'
        ? `${hx},${hy - 8 * s} ${hx},${hy + 8 * s} ${hx - 16 * s},${hy}`
        : `${hx},${hy - 8 * s} ${hx},${hy + 8 * s} ${hx + 16 * s},${hy}`
  return (
    <>
      <polygon points={shaft} fill="#f8fafc" />
      {dir !== 'straight' && <rect x={dir === 'left' ? hx - 12 * s : hx} y={hy - 2.4 * s} width={12 * s} height={4.8 * s} fill="#f8fafc" />}
      <polygon points={head} fill="#f8fafc" />
    </>
  )
}

function Chevrons({ wide }: { wide: boolean }) {
  const lines = []
  for (let k = 0; k < 7; k++) {
    const t = 0.32 + k * 0.055
    const xr = roadX(t, -1, wide) - 1
    const xl = xr - 22 - k * 6
    lines.push(<line key={k} x1={xr} y1={depthY(t)} x2={xl} y2={depthY(t) - 7} stroke="#f8fafc" strokeWidth={2} />)
  }
  const outer = `${roadX(0.3, -1, wide)},${depthY(0.3)} ${roadX(0.72, -1, wide)},${depthY(0.72)} ${roadX(0.72, -1, wide) - 56},${depthY(0.72)}`
  return (
    <>
      <polygon points={outer} fill="none" stroke="#f8fafc" strokeWidth={2} />
      {lines}
    </>
  )
}

function RoadSign({ s, wide }: { s: SignPlacement; wide: boolean }) {
  const d = s.depth ?? 0.55
  const sc = depthScale(d) * 1.7
  const x = roadX(d, s.side === 'left' ? -1 : 1, wide) + (s.side === 'left' ? -24 : 24) * sc
  const groundY = depthY(d)
  const poleH = 46 * sc
  return (
    <g transform={`translate(${x.toFixed(1)} ${groundY.toFixed(1)})`}>
      <ellipse rx={7 * sc} ry={2 * sc} fill="#000" opacity={0.3} />
      <rect x={-1.6 * sc} y={-poleH} width={3.2 * sc} height={poleH} fill="#6b7280" />
      <g transform={`translate(0 ${-poleH - 18 * sc}) scale(${sc})`}>
        <SignShape id={s.id} />
      </g>
    </g>
  )
}

function TrafficLightAt({ t, side, state }: { t: number; side: 'left' | 'right'; state: NonNullable<SceneSpec['light']> }) {
  const sc = depthScale(t) * 1.7
  const x = roadX(t, side === 'left' ? -1 : 1) + (side === 'left' ? -16 : 16) * sc
  const gy = depthY(t)
  const poleH = 70 * sc
  return (
    <g transform={`translate(${x.toFixed(1)} ${gy.toFixed(1)})`}>
      <ellipse rx={6 * sc} ry={2 * sc} fill="#000" opacity={0.3} />
      <rect x={-1.8 * sc} y={-poleH} width={3.6 * sc} height={poleH} fill="#374151" />
      <g transform={`translate(0 ${-poleH - 4 * sc}) scale(${sc})`}>
        <LightHousing state={state} />
      </g>
    </g>
  )
}

type Placement = { x: number; y: number; s: number; mode: 'rear' | 'front' | 'side_left' | 'side_right' }

function vehiclePlacement(v: VehicleSpec, egoLane: number, lanes: number, oneWay: boolean, wide: boolean, road: SceneSpec['road']): Placement {
  const ego = laneCentre(egoLane, lanes, oneWay)
  const rear = (t: number, u: number, mode: Placement['mode'] = 'rear'): Placement => ({ x: roadX(t, u, wide), y: depthY(t), s: depthScale(t) * 2.3, mode })
  const leftU = egoLane > 1 ? laneCentre(egoLane - 1, lanes, oneWay) : ego - (oneWay ? 0.6 : 0.5)
  const rightU = egoLane < lanes ? laneCentre(egoLane + 1, lanes, oneWay) : oneWay ? ego + 0.6 : 0.5
  switch (v.pos) {
    case 'ahead':
      return rear(0.36, ego)
    case 'ahead_far':
      return rear(0.62, ego)
    case 'left':
      return rear(0.22, leftU)
    case 'right':
      return rear(0.22, rightU)
    case 'oncoming':
      return rear(0.5, oneWay ? rightU : 0.5, 'front')
    case 'behind_right':
      return rear(0.03, rightU)
    case 'cross_left': {
      const t = road === 'roundabout' ? 0.66 : 0.53
      const dx = road === 'roundabout' ? halfWidth(0.6) * 1.9 : 112
      return { x: CX - dx, y: depthY(t), s: depthScale(t) * 1.15, mode: 'side_right' }
    }
    case 'cross_right': {
      const t = road === 'roundabout' ? 0.52 : 0.53
      const dx = road === 'roundabout' ? halfWidth(0.6) * 1.9 : 112
      return { x: CX + dx, y: depthY(t), s: depthScale(t) * 1.15, mode: 'side_left' }
    }
  }
}

function Pedestrian({ where, wide }: { where: NonNullable<SceneSpec['pedestrian']>; wide: boolean }) {
  const t = TM
  const sc = depthScale(t) * 2.1
  const x = where === 'kerb_left' ? roadX(t, -1, wide) - 10 * sc : where === 'kerb_right' ? roadX(t, 1, wide) + 10 * sc : roadX(t, -0.45, wide)
  const y = depthY(t)
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc})`}>
      <g className={where === 'crossing' ? 'walk' : undefined}>
        <ellipse rx={6} ry={2} fill="#000" opacity={0.3} />
        <rect x={-4} y={-22} width={8} height={12} rx={2} fill="#f59e0b" />
        <rect x={-3.5} y={-10} width={3} height={10} fill="#1f2937" />
        <rect x={0.5} y={-10} width={3} height={10} fill="#1f2937" />
        <circle cy={-27} r={4.5} fill="#e7b58a" />
      </g>
    </g>
  )
}

/** Rear-view mirror inset for traffic behind the ego car. */
function Mirror({ v, uid, skyTop, asphalt }: { v: VehicleSpec; uid: string; skyTop: string; asphalt: string }) {
  const mw = 96, mh = 34
  const x = CX - mw / 2, y = 6
  const vx = v.pos === 'behind_right' ? mw * 0.68 : mw * 0.32
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-3} y={-3} width={mw + 6} height={mh + 6} rx={8} fill="#111827" />
      <clipPath id={`${uid}-mirror`}>
        <rect width={mw} height={mh} rx={6} />
      </clipPath>
      <g clipPath={`url(#${uid}-mirror)`}>
        <rect width={mw} height={mh * 0.45} fill={skyTop} />
        <rect y={mh * 0.45} width={mw} height={mh} fill={asphalt} />
        <line x1={mw / 2} y1={mh * 0.45} x2={mw / 2} y2={mh} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 3" />
        <g transform={`translate(${vx} ${mh - 2}) scale(0.42)`}>
          <RearVehicle spec={v} facing />
        </g>
      </g>
      <text x={mw / 2} y={mh + 14} textAnchor="middle" fontSize={8} fontWeight={600} fill="#e2e8f0">
        behind you
      </text>
    </g>
  )
}

function Bonnet({ indicator }: { indicator?: SceneSpec['egoIndicator'] }) {
  const left = indicator === 'left' || indicator === 'hazard'
  const right = indicator === 'right' || indicator === 'hazard'
  return (
    <g>
      <path d={`M0,${H} L0,${H - 20} Q${CX},${H - 40} ${W},${H - 20} L${W},${H} Z`} fill="#0f1b2d" />
      <path d={`M0,${H - 20} Q${CX},${H - 40} ${W},${H - 20}`} fill="none" stroke="#2b3f5e" strokeWidth={2} />
      <rect x={10} y={H - 22} width={26} height={6} rx={2} fill={left ? '#ffb300' : '#4a4a2a'} className={left ? 'blink' : undefined} />
      <rect x={W - 36} y={H - 22} width={26} height={6} rx={2} fill={right ? '#ffb300' : '#4a4a2a'} className={right ? 'blink' : undefined} />
    </g>
  )
}

function Trees({ wide, night, hasJunction, slip }: { wide: boolean; night: boolean; hasJunction: boolean; slip: boolean }) {
  const spots: Array<[number, number]> = [
    [0.12, -1],
    [0.3, 1],
    [0.8, -1],
    [0.88, 1],
    [0.55, 1],
  ]
  return (
    <>
      {spots
        .filter(([t]) => !(hasJunction && t > TJ0 - 0.05 && t < TJ1 + 0.05))
        .filter(([t, side]) => !(slip && side < 0 && t > 0.25 && t < 0.8))
        .map(([t, side], i) => {
          const sc = depthScale(t) * 1.6
          const x = roadX(t, side, wide) + side * (38 + (i % 2) * 14) * sc
          const y = depthY(t)
          return (
            <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc})`}>
              <rect x={-2.5} y={-22} width={5} height={22} fill="#7c4a1e" />
              <g className="sway" style={{ animationDelay: `${i * 0.6}s` }}>
                <circle cy={-32} r={16} fill={night ? '#1f4d2a' : '#2f8f46'} />
                <circle cx={-9} cy={-26} r={11} fill={night ? '#1a4324' : '#28803d'} />
                <circle cx={9} cy={-27} r={11} fill={night ? '#245a30' : '#36a350'} />
              </g>
            </g>
          )
        })}
    </>
  )
}

function Lamps({ wide }: { wide: boolean }) {
  return (
    <>
      {[0.2, 0.45, 0.7].map((t, i) => {
        const sc = depthScale(t) * 1.7
        const x = roadX(t, 1, wide) + 14 * sc
        const y = depthY(t)
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <rect x={-1.2 * sc} y={-80 * sc} width={2.4 * sc} height={80 * sc} fill="#4b5563" />
            <rect x={-14 * sc} y={-82 * sc} width={14 * sc} height={2.4 * sc} fill="#4b5563" />
            <circle cx={-14 * sc} cy={-79 * sc} r={3 * sc} fill="#ffe9a8" style={{ filter: 'drop-shadow(0 0 6px #ffd66b)' }} />
            <ellipse cx={-22 * sc} cy={0} rx={40 * sc} ry={12 * sc} fill="#ffe9a8" opacity={0.12} />
          </g>
        )
      })}
    </>
  )
}

function Skyline({ night }: { night: boolean }) {
  const blocks = [
    [8, 30, 22],
    [40, 44, 28],
    [78, 26, 20],
    [110, 38, 26],
    [150, 20, 16],
    [200, 34, 24],
    [240, 48, 30],
    [292, 28, 22],
    [326, 36, 24],
  ] as const
  return (
    <g>
      {blocks.map(([x, h, w], i) => (
        <g key={i}>
          <rect x={x} y={HORIZON - h} width={w} height={h + 2} fill={night ? '#111827' : '#9fb3c8'} />
          {night &&
            Array.from({ length: Math.floor(h / 8) }).map((_, r) => (
              <rect key={r} x={x + 3} y={HORIZON - h + 3 + r * 8} width={w - 6} height={2} fill="#ffe9a8" opacity={(r + i) % 3 === 0 ? 0.9 : 0.35} />
            ))}
        </g>
      ))}
    </g>
  )
}

function Rain() {
  return (
    <g className="rain" opacity={0.55}>
      {Array.from({ length: 26 }).map((_, i) => {
        const x = (i * 37) % W
        const y = HORIZON + ((i * 53) % (H - HORIZON))
        return <line key={i} x1={x} y1={y} x2={x - 4} y2={y + 14} stroke="#dbeafe" strokeWidth={1.2} />
      })}
    </g>
  )
}

const STARS: Array<[number, number, number]> = [
  [20, 14, 1], [48, 30, 0.8], [90, 12, 1.1], [130, 40, 0.7], [170, 18, 1], [215, 34, 0.8], [250, 10, 1.2], [340, 40, 0.8], [110, 62, 0.6], [200, 60, 0.7],
]

function describe(spec: SceneSpec): string {
  const bits = [spec.road.replace('_', ' ')]
  if (spec.signs?.length) bits.push(`signs: ${spec.signs.map((s) => s.id.replace(/_/g, ' ')).join(', ')}`)
  if (spec.light) bits.push(`traffic light ${spec.light.replace(/_/g, ' ')}`)
  if (spec.markings?.length) bits.push(`markings: ${spec.markings.map((m) => m.replace(/_/g, ' ')).join(', ')}`)
  if (spec.vehicles?.length) bits.push(`vehicles: ${spec.vehicles.map((v) => `${v.kind} ${v.pos.replace(/_/g, ' ')}`).join(', ')}`)
  if (spec.pedestrian) bits.push(`pedestrian ${spec.pedestrian.replace(/_/g, ' ')}`)
  return bits.join('; ')
}
