import type { VehicleKind, VehicleSpec } from '../content/types'

const AMBER = '#ffb300'

const palette: Record<VehicleKind, { body: string; glass: string; w: number; h: number; len: number }> = {
  car: { body: '#3b82f6', glass: '#bfe3ff', w: 60, h: 40, len: 96 },
  bus: { body: '#7c3aed', glass: '#d9ccff', w: 72, h: 66, len: 150 },
  lorry: { body: '#e2e8f0', glass: '#a7c4dc', w: 74, h: 62, len: 130 },
  motorcycle: { body: '#f97316', glass: '#333', w: 20, h: 34, len: 48 },
  ambulance: { body: '#ffffff', glass: '#bfe3ff', w: 66, h: 56, len: 120 },
  bicycle: { body: '#22c55e', glass: '#333', w: 14, h: 30, len: 36 },
}

function Indicators({ w, h, indicator }: { w: number; h: number; indicator?: VehicleSpec['indicator'] }) {
  const y = -h * 0.28
  const left = indicator === 'left' || indicator === 'hazard'
  const right = indicator === 'right' || indicator === 'hazard'
  return (
    <>
      <rect x={-w / 2 + 2} y={y} width={8} height={5} rx={1} fill={left ? AMBER : '#5a4a00'} className={left ? 'blink' : undefined} />
      <rect x={w / 2 - 10} y={y} width={8} height={5} rx={1} fill={right ? AMBER : '#5a4a00'} className={right ? 'blink' : undefined} />
    </>
  )
}

/** Vehicle seen from behind (or from the front when `facing`). Origin: ground, centre. */
export function RearVehicle({ spec, facing = false }: { spec: VehicleSpec; facing?: boolean }) {
  const p = palette[spec.kind]
  const { w, h } = p
  if (spec.kind === 'motorcycle' || spec.kind === 'bicycle') {
    return (
      <g>
        <ellipse cx={0} cy={-2} rx={w * 0.45} ry={3} fill="#000" opacity={0.25} />
        <rect x={-3} y={-h * 0.45} width={6} height={h * 0.45} rx={2} fill="#222" />
        <rect x={-w / 2} y={-h * 0.7} width={w} height={h * 0.3} rx={3} fill={p.body} />
        <circle cx={0} cy={-h * 0.85} r={5} fill="#222" />
        <circle cx={0} cy={-h * 0.85} r={3.2} fill={p.glass} />
        {spec.kind === 'motorcycle' && <rect x={-2.5} y={-h * 0.62} width={5} height={4} fill={facing ? '#fff7cc' : '#ff3b30'} />}
      </g>
    )
  }
  const cabH = spec.kind === 'bus' || spec.kind === 'lorry' || spec.kind === 'ambulance' ? h * 0.35 : h * 0.4
  return (
    <g>
      <ellipse cx={0} cy={-1} rx={w * 0.55} ry={4} fill="#000" opacity={0.3} />
      <rect x={-w / 2 - 2} y={-8} width={12} height={9} rx={2} fill="#151515" />
      <rect x={w / 2 - 10} y={-8} width={12} height={9} rx={2} fill="#151515" />
      <rect x={-w / 2} y={-h} width={w} height={h - 4} rx={6} fill={p.body} stroke="rgba(0,0,0,.25)" />
      <rect x={-w / 2 + 6} y={-h + 5} width={w - 12} height={cabH} rx={4} fill={p.glass} />
      {spec.kind === 'lorry' && <rect x={-w / 2} y={-h + cabH + 8} width={w} height={h - cabH - 12} fill="#94a3b8" />}
      {spec.kind === 'ambulance' && (
        <>
          <rect x={-w / 2 + 4} y={-h * 0.45} width={w - 8} height={6} fill="#ff3b30" />
          <rect x={-3} y={-h * 0.6} width={6} height={16} fill="#ff3b30" />
          <rect x={-8} y={-h * 0.6 + 5} width={16} height={6} fill="#ff3b30" />
          <rect x={-12} y={-h - 6} width={10} height={6} rx={1} fill="#ff3b30" className={spec.siren ? 'siren-a' : undefined} />
          <rect x={2} y={-h - 6} width={10} height={6} rx={1} fill="#3b82f6" className={spec.siren ? 'siren-b' : undefined} />
        </>
      )}
      {spec.kind === 'bus' && <rect x={-w / 2 + 6} y={-h + cabH + 8} width={w - 12} height={4} fill="#fff" opacity={0.6} />}
      {facing ? (
        <>
          <rect x={-w / 2 + 4} y={-h * 0.28} width={12} height={6} rx={2} fill="#fff7cc" style={{ filter: 'drop-shadow(0 0 4px #fff7cc)' }} />
          <rect x={w / 2 - 16} y={-h * 0.28} width={12} height={6} rx={2} fill="#fff7cc" style={{ filter: 'drop-shadow(0 0 4px #fff7cc)' }} />
        </>
      ) : (
        <>
          <rect x={-w / 2 + 3} y={-h * 0.22} width={10} height={5} rx={1} fill="#ff3b30" />
          <rect x={w / 2 - 13} y={-h * 0.22} width={10} height={5} rx={1} fill="#ff3b30" />
          <Indicators w={w} h={h} indicator={spec.indicator} />
        </>
      )}
    </g>
  )
}

/** Vehicle seen from the side, travelling in `dir`. Origin: ground, centre. */
export function SideVehicle({ spec, dir }: { spec: VehicleSpec; dir: 'left' | 'right' }) {
  const p = palette[spec.kind]
  const len = p.len
  const h = p.h
  const flip = dir === 'left' ? -1 : 1
  const boxy = spec.kind === 'bus' || spec.kind === 'lorry' || spec.kind === 'ambulance'
  return (
    <g transform={`scale(${flip} 1)`}>
      <ellipse cx={0} cy={0} rx={len * 0.5} ry={4} fill="#000" opacity={0.3} />
      <circle cx={-len * 0.32} cy={-7} r={8} fill="#151515" />
      <circle cx={len * 0.32} cy={-7} r={8} fill="#151515" />
      <circle cx={-len * 0.32} cy={-7} r={3.5} fill="#666" />
      <circle cx={len * 0.32} cy={-7} r={3.5} fill="#666" />
      {boxy ? (
        <>
          <rect x={-len / 2} y={-h} width={len} height={h - 8} rx={4} fill={p.body} stroke="rgba(0,0,0,.25)" />
          <rect x={-len / 2 + 6} y={-h + 6} width={len - 12} height={h * 0.3} rx={3} fill={p.glass} />
          {spec.kind === 'ambulance' && <rect x={-len / 2 + 6} y={-h * 0.5} width={len - 12} height={6} fill="#ff3b30" />}
        </>
      ) : (
        <>
          <path d={`M${-len / 2},-8 v-${h * 0.4} h${len * 0.22} l${len * 0.14},-${h * 0.45} h${len * 0.3} l${len * 0.16},${h * 0.45} h${len * 0.18} v${h * 0.4} z`} fill={p.body} stroke="rgba(0,0,0,.25)" />
          <path d={`M${-len * 0.24},-${h * 0.42} l${len * 0.11},-${h * 0.36} h${len * 0.26} l${len * 0.12},${h * 0.36} z`} fill={p.glass} />
        </>
      )}
      <rect x={len / 2 - 6} y={-h * 0.42} width={6} height={5} rx={1} fill="#fff7cc" />
      <rect x={-len / 2} y={-h * 0.42} width={6} height={5} rx={1} fill="#ff3b30" />
    </g>
  )
}
