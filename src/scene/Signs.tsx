import type { SignId } from '../content/types'

const RED = '#d62828'
const BLUE = '#1d5fbf'
const WHITE = '#fff'
const BLACK = '#111'
const GREEN = '#1b7f3b'

const Circle = ({ fill, ring }: { fill: string; ring?: string }) => (
  <>
    <circle r={20} fill={ring ?? fill} />
    {ring && <circle r={15.5} fill={fill} />}
  </>
)

const Triangle = ({ inverted = false }: { inverted?: boolean }) => {
  const pts = inverted ? '-20,-16 20,-16 0,18' : '-20,16 20,16 0,-18'
  const inner = inverted ? '-13,-11 13,-11 0,11' : '-13,11 13,11 0,-11'
  return (
    <>
      <polygon points={pts} fill={RED} strokeLinejoin="round" stroke={RED} strokeWidth={3} />
      <polygon points={inner} fill={WHITE} />
    </>
  )
}

const Slash = ({ double = false }: { double?: boolean }) => (
  <>
    <line x1={-14} y1={-14} x2={14} y2={14} stroke={RED} strokeWidth={3.5} />
    {double && <line x1={14} y1={-14} x2={-14} y2={14} stroke={RED} strokeWidth={3.5} />}
  </>
)

const CarSilhouette = ({ x, fill }: { x: number; fill: string }) => (
  <g transform={`translate(${x} 0)`}>
    <rect x={-5} y={-8} width={10} height={16} rx={2} fill={fill} />
    <rect x={-3.5} y={-5} width={7} height={4} fill={WHITE} opacity={0.7} />
  </g>
)

const Figure = ({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={BLACK}>
    <circle cx={0} cy={-8} r={2.6} />
    <path d="M-2.5,-5 h5 l1.5,8 h-2 l-1,-4 -1,4 h-2 l-1.5,-8 z" />
    <path d="M-1.5,3 l-1.5,7 h2 l1,-5 1,5 h2 l-1.5,-7 z" />
  </g>
)

/** A sign face in a 40x40 box centred at the origin. */
export function SignShape({ id }: { id: SignId }) {
  switch (id) {
    case 'stop':
      return (
        <>
          <polygon points="-8,-20 8,-20 20,-8 20,8 8,20 -8,20 -20,8 -20,-8" fill={RED} stroke={WHITE} strokeWidth={1.5} />
          <text y={4} textAnchor="middle" fontSize={11} fontWeight={800} fill={WHITE} fontFamily="Inter, system-ui, sans-serif">
            STOP
          </text>
        </>
      )
    case 'give_way':
      return <Triangle inverted />
    case 'no_entry':
      return (
        <>
          <Circle fill={RED} />
          <rect x={-13} y={-3.5} width={26} height={7} fill={WHITE} />
        </>
      )
    case 'speed_limit_50':
    case 'speed_limit_70':
    case 'speed_limit_90':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <text y={5.5} textAnchor="middle" fontSize={15} fontWeight={800} fill={BLACK} fontFamily="Inter, system-ui, sans-serif">
            {id.replace('speed_limit_', '')}
          </text>
        </>
      )
    case 'no_u_turn':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <path d="M-7,10 v-10 a7,7 0 0 1 14,0 v6" fill="none" stroke={BLACK} strokeWidth={3} />
          <polygon points="3,4 11,4 7,10" fill={BLACK} />
          <Slash />
        </>
      )
    case 'no_right_turn':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <path d="M-8,10 v-8 a5,5 0 0 1 5,-5 h6" fill="none" stroke={BLACK} strokeWidth={3} />
          <polygon points="2,-8 10,-3 2,2" fill={BLACK} />
          <Slash />
        </>
      )
    case 'no_left_turn':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <path d="M8,10 v-8 a5,5 0 0 0 -5,-5 h-6" fill="none" stroke={BLACK} strokeWidth={3} />
          <polygon points="-2,-8 -10,-3 -2,2" fill={BLACK} />
          <Slash />
        </>
      )
    case 'keep_left':
      return (
        <>
          <Circle fill={BLUE} />
          <path d="M8,-11 v8 l-11,11" fill="none" stroke={WHITE} strokeWidth={3.5} />
          <polygon points="-10,12 -3,10 -8,3" fill={WHITE} />
        </>
      )
    case 'turn_left_ahead':
      return (
        <>
          <Circle fill={BLUE} />
          <path d="M6,12 v-10 a6,6 0 0 0 -6,-6 h-6" fill="none" stroke={WHITE} strokeWidth={3.5} />
          <polygon points="-4,-10 -12,-4 -4,2" fill={WHITE} />
        </>
      )
    case 'one_way':
      return (
        <>
          <rect x={-20} y={-12} width={40} height={24} rx={2} fill={BLUE} />
          <line x1={-11} y1={0} x2={8} y2={0} stroke={WHITE} strokeWidth={4} />
          <polygon points="6,-6 14,0 6,6" fill={WHITE} />
        </>
      )
    case 'zebra_ahead':
      return (
        <>
          <Triangle />
          <Figure x={0} y={4} s={0.9} />
          <g stroke={BLACK} strokeWidth={1.2}>
            <line x1={-9} y1={9} x2={9} y2={9} />
            <line x1={-9} y1={6} x2={9} y2={6} />
          </g>
        </>
      )
    case 'traffic_light_ahead':
      return (
        <>
          <Triangle />
          <rect x={-3} y={-6} width={6} height={14} rx={1} fill={BLACK} />
          <circle cy={-3} r={1.6} fill={RED} />
          <circle cy={1} r={1.6} fill="#f4b400" />
          <circle cy={5} r={1.6} fill="#2ecc40" />
        </>
      )
    case 'school_zone':
      return (
        <>
          <Triangle />
          <Figure x={-3} y={4} s={0.75} />
          <Figure x={4} y={5} s={0.6} />
        </>
      )
    case 'slippery_road':
      return (
        <>
          <Triangle />
          <g transform="rotate(-20) translate(0 3)">
            <rect x={-5} y={-4} width={10} height={7} rx={1.5} fill={BLACK} />
          </g>
          <path d="M-7,9 q3,-3 6,0 t6,0" fill="none" stroke={BLACK} strokeWidth={1.2} />
          <path d="M-7,12 q3,-3 6,0 t6,0" fill="none" stroke={BLACK} strokeWidth={1.2} />
        </>
      )
    case 'road_narrows':
      return (
        <>
          <Triangle />
          <path d="M-7,10 v-6 l3,-8" fill="none" stroke={BLACK} strokeWidth={2} />
          <path d="M7,10 v-6 l-3,-8" fill="none" stroke={BLACK} strokeWidth={2} />
        </>
      )
    case 'road_hump':
      return (
        <>
          <Triangle />
          <path d="M-9,9 q9,-12 18,0" fill={BLACK} />
        </>
      )
    case 'u_turn_permitted':
      return (
        <>
          <rect x={-20} y={-20} width={40} height={40} rx={3} fill={BLUE} />
          <path d="M-7,12 v-12 a7,7 0 0 1 14,0 v7" fill="none" stroke={WHITE} strokeWidth={3} />
          <polygon points="2,6 12,6 7,13" fill={WHITE} />
        </>
      )
    case 'bus_lane':
      return (
        <>
          <rect x={-20} y={-20} width={40} height={40} rx={3} fill={BLUE} />
          <rect x={-12} y={-13} width={24} height={16} rx={2} fill={WHITE} />
          <rect x={-9} y={-10} width={18} height={6} fill={BLUE} />
          <circle cx={-7} cy={4} r={2.2} fill={WHITE} />
          <circle cx={7} cy={4} r={2.2} fill={WHITE} />
          <text y={16} textAnchor="middle" fontSize={7} fontWeight={800} fill={WHITE} fontFamily="Inter, system-ui, sans-serif">
            BUS LANE
          </text>
        </>
      )
    case 'no_stopping':
      return (
        <>
          <Circle fill={BLUE} ring={RED} />
          <Slash double />
        </>
      )
    case 'no_waiting':
      return (
        <>
          <Circle fill={BLUE} ring={RED} />
          <Slash />
        </>
      )
    case 'expressway_exit':
      return (
        <>
          <rect x={-20} y={-14} width={40} height={28} rx={2} fill={GREEN} stroke={WHITE} strokeWidth={1.2} />
          <text y={-2} textAnchor="middle" fontSize={7} fontWeight={700} fill={WHITE} fontFamily="Inter, system-ui, sans-serif">
            EXIT 12
          </text>
          <path d="M-8,10 l6,-6 h6" fill="none" stroke={WHITE} strokeWidth={2} />
          <polygon points="2,1 8,4 2,7" fill={WHITE} />
        </>
      )
    case 'no_overtaking':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <CarSilhouette x={-6} fill={RED} />
          <CarSilhouette x={6} fill={BLACK} />
        </>
      )
    case 'roundabout_ahead':
      return (
        <>
          <Triangle />
          <circle r={7} cy={2} fill="none" stroke={BLACK} strokeWidth={2.5} strokeDasharray="8 4" />
          <polygon points="4,-6 9,-3 5,0" fill={BLACK} />
        </>
      )
    case 'pedestrians_prohibited':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <Figure y={2} s={0.9} />
          <Slash />
        </>
      )
    case 'no_horn':
      return (
        <>
          <Circle fill={WHITE} ring={RED} />
          <path d="M-8,-4 h5 l7,-5 v18 l-7,-5 h-5 z" fill={BLACK} />
          <Slash />
        </>
      )
  }
}

/** Standalone sign for explainers and the Sign Book. */
export function SignGlyph({ id, size = 72 }: { id: SignId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-22 -22 44 44" role="img" aria-label={id.replace(/_/g, ' ')}>
      <SignShape id={id} />
    </svg>
  )
}
