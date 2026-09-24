import { parseDay } from './blocks'

// Daylight from where you are (Part 35): sunrise and sunset from a coarse place typed once, by the
// solar equations the US National Oceanic and Atmospheric Administration publishes. Pure
// arithmetic on the phone: no network, no location service, nothing sent anywhere.

export interface Place {
  lat: number
  lon: number
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Day of the year, 1 to 366. */
function dayOfYear(day: string): number {
  const d = parseDay(day)
  const start = Date.UTC(d.getFullYear(), 0, 1)
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86_400_000) + 1
}

/**
 * Sunrise and sunset as minutes after midnight UTC on the day (sunset may pass 1440), with the
 * standard zenith of 90.833° for refraction and the sun's radius; null when the sun neither rises
 * nor sets that day (a polar day or night).
 */
export function sunUtc(day: string, place: Place): { rise: number; set: number } | null {
  const leap = new Date(parseDay(day).getFullYear(), 1, 29).getMonth() === 1
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (dayOfYear(day) - 1)
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const lat = rad(place.lat)
  const cosH = Math.cos(rad(90.833)) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)
  if (cosH > 1 || cosH < -1) return null
  const ha = deg(Math.acos(cosH))
  return { rise: 720 - 4 * (place.lon + ha) - eqtime, set: 720 - 4 * (place.lon - ha) - eqtime }
}

/** Minutes after UTC midnight of the day, as this phone's local time on that day, HH:MM. */
function localHHMM(day: string, utcMinutes: number): string {
  const d = parseDay(day)
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + Math.round(utcMinutes) * 60_000)
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

/** Sunrise and sunset in this phone's local time, HH:MM; null on a day the sun neither rises nor sets. */
export function sunLocal(day: string, place: Place): { rise: string; set: string } | null {
  const s = sunUtc(day, place)
  return s ? { rise: localHHMM(day, s.rise), set: localHHMM(day, s.set) } : null
}

/**
 * A place typed as "latitude, longitude", each rounded to one decimal (about eleven kilometres):
 * enough for the sun, too coarse for an address. Null for anything else.
 */
export function parsePlace(text: string): Place | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text)
  if (!m) return null
  const lat = Math.round(Number(m[1]) * 10) / 10
  const lon = Math.round(Number(m[2]) * 10) / 10
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null
  return { lat, lon }
}

/** A place as it is shown and typed back. */
export function placeText(p: Place): string {
  return `${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}`
}
