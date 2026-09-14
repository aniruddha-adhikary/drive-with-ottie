import type { Topic } from './types'

export const topics: Topic[] = [
  { id: 'signs', name: 'Traffic Signs', orderOnRoad: 1, blurb: 'Read the road before you reach it.' },
  { id: 'lights', name: 'Traffic Lights', orderOnRoad: 2, blurb: 'Red, amber, green and the arrows in between.' },
  { id: 'markings', name: 'Road Markings', orderOnRoad: 3, blurb: 'What the paint on the road is telling you.' },
  { id: 'junctions', name: 'Junctions & Giving Way', orderOnRoad: 4, blurb: 'Who goes first, and why.' },
  { id: 'expressway', name: 'Expressways', orderOnRoad: 5, blurb: 'Joining, leaving and lane discipline.' },
  { id: 'parking', name: 'Stopping & Parking', orderOnRoad: 6, blurb: 'Where you can and cannot leave the car.' },
]

export const topicsByRoad = [...topics].sort((a, b) => a.orderOnRoad - b.orderOnRoad)
