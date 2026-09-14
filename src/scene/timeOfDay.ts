import type { TimeOfDay } from '../content/types'

export function timeOfDayNow(d = new Date()): TimeOfDay {
  const h = d.getHours()
  if (h >= 6 && h < 8) return 'dawn'
  if (h >= 8 && h < 18) return 'day'
  if (h >= 18 && h < 20) return 'dusk'
  return 'night'
}
