export type SignId =
  | 'stop'
  | 'give_way'
  | 'no_entry'
  | 'speed_limit_50'
  | 'speed_limit_70'
  | 'speed_limit_90'
  | 'no_u_turn'
  | 'no_right_turn'
  | 'no_left_turn'
  | 'keep_left'
  | 'turn_left_ahead'
  | 'one_way'
  | 'zebra_ahead'
  | 'traffic_light_ahead'
  | 'school_zone'
  | 'slippery_road'
  | 'road_narrows'
  | 'road_hump'
  | 'u_turn_permitted'
  | 'bus_lane'
  | 'no_stopping'
  | 'no_waiting'
  | 'expressway_exit'
  | 'no_overtaking'
  | 'roundabout_ahead'
  | 'pedestrians_prohibited'
  | 'no_horn'

export type LightState = 'red' | 'amber' | 'green' | 'red_amber' | 'green_arrow_right' | 'flashing_amber' | 'off'

export type MarkingId =
  | 'stop_line'
  | 'give_way_line'
  | 'zebra'
  | 'box_junction'
  | 'double_white'
  | 'single_white_broken'
  | 'chevron'
  | 'zig_zag'
  | 'bus_lane_marking'
  | 'double_yellow_zigzag'
  | 'single_yellow'
  | 'arrow_left'
  | 'arrow_right'
  | 'arrow_straight'

export type VehicleKind = 'car' | 'bus' | 'lorry' | 'motorcycle' | 'ambulance' | 'bicycle'
export type VehiclePos = 'ahead' | 'ahead_far' | 'left' | 'right' | 'oncoming' | 'behind_right' | 'cross_left' | 'cross_right'

export interface VehicleSpec {
  kind: VehicleKind
  pos: VehiclePos
  indicator?: 'left' | 'right' | 'hazard'
  siren?: boolean
}

export type RoadType = 'straight' | 't_junction' | 'cross_junction' | 'expressway' | 'roundabout' | 'bend'
export type Side = 'left' | 'right'
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'
export type Weather = 'clear' | 'rain'

export interface SignPlacement {
  id: SignId
  side: Side
  /** 0 = near the ego car, 1 = at the horizon. Default 0.55. */
  depth?: number
}

export interface SceneSpec {
  road: RoadType
  lanes?: 1 | 2 | 3
  egoLane?: 1 | 2 | 3
  signs?: SignPlacement[]
  light?: LightState
  markings?: MarkingId[]
  vehicles?: VehicleSpec[]
  pedestrian?: 'kerb_left' | 'kerb_right' | 'crossing'
  weather?: Weather
  timeOfDay?: TimeOfDay
  egoIndicator?: 'left' | 'right' | 'hazard'
}

export type TermCategory = 'sign' | 'light' | 'marking' | 'rule' | 'vehicle' | 'place'

export interface ScenePair {
  yes: { caption: string; scene: SceneSpec }
  no: { caption: string; scene: SceneSpec }
}

export interface Term {
  id: string
  name: string
  category: TermCategory
  /** Canonical visual: a sign, a light state, or a marking. */
  visual: { sign: SignId } | { light: LightState } | { marking: MarkingId } | { scene: SceneSpec }
  plainMeaning: string
  pair?: ScenePair
  confusables: string[]
}

export interface Question {
  id: string
  topic: string
  /** Stem text. `{{term_id}}` marks a tappable glossary term rendered with its display text. */
  stem: string
  options: string[]
  answerIdx: number
  whyOneLiner: string
  scene: SceneSpec
  difficulty: 1 | 2 | 3
}

export interface Topic {
  id: string
  name: string
  orderOnRoad: number
  blurb: string
}
