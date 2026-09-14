import type { LightState } from '../content/types'

const OFF = '#2a2f36'
const RED = '#ff3b30'
const AMBER = '#ffb300'
const GREEN = '#2ecc40'

/**
 * Traffic light housing in a local box roughly 16 wide by 44 tall, origin at
 * the top-centre of the housing. Scale externally.
 */
export function LightHousing({ state }: { state: LightState }) {
  const red = state === 'red' || state === 'red_amber'
  const amber = state === 'amber' || state === 'red_amber'
  const green = state === 'green'
  const arrow = state === 'green_arrow_right'
  const flashing = state === 'flashing_amber'
  const lamp = (cy: number, on: boolean, colour: string, cls?: string) => (
    <circle cx={0} cy={cy} r={5} fill={on ? colour : OFF} className={on ? cls : undefined} style={on ? { filter: `drop-shadow(0 0 4px ${colour})` } : undefined} />
  )
  return (
    <g>
      <rect x={-8} y={0} width={16} height={arrow ? 58 : 44} rx={3} fill="#1a1d22" stroke="#0b0d10" strokeWidth={1} />
      {lamp(8, red, RED)}
      {lamp(22, amber || flashing, AMBER, flashing ? 'blink' : undefined)}
      {lamp(36, green, GREEN)}
      {arrow && (
        <g transform="translate(0 50)">
          <circle r={5} fill="#0f2a14" />
          <path d="M-3,0 h4" stroke={GREEN} strokeWidth={1.6} />
          <polygon points="0.5,-2.6 4,0 0.5,2.6" fill={GREEN} style={{ filter: `drop-shadow(0 0 3px ${GREEN})` }} />
        </g>
      )}
    </g>
  )
}

/** Standalone light for explainers and the glossary. */
export function LightGlyph({ state, size = 72 }: { state: LightState; size?: number }) {
  return (
    <svg width={size * 0.5} height={size} viewBox="-12 -4 24 66" role="img" aria-label={`traffic light ${state.replace(/_/g, ' ')}`}>
      <LightHousing state={state} />
    </svg>
  )
}
