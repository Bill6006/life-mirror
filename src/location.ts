// Location Context (Part 43): where you are, as a kind of place, never as coordinates.
//
// A position is read only while Life Mirror is open, used at once on this phone and let go. What
// is kept: the kind of place each part of the day was spent at (Home, Work, Church, a regular place,
// out, or away in a different area); for a place you named, keyed fingerprints of the few map cells
// around it, made with a random key that never leaves this phone, so it is recognised again without
// ever keeping where it is; and, for the sun, the area you are in to a tenth of a degree. Never a
// coordinate, a street address or a trail of positions. Pure: no store, no network.

export type PlaceKind = 'home' | 'work' | 'church' | 'regular'
/** Where a part of the day was spent: a place you named, or out nearby, or away in a different area. */
export type Where = PlaceKind | 'out' | 'away'
export const PLACE_KINDS: readonly PlaceKind[] = ['home', 'work', 'church', 'regular']
export const WHERES: readonly Where[] = ['home', 'work', 'church', 'regular', 'out', 'away']

/** A map cell of about 150 metres a side: small enough to tell a home from a church, too coarse for a doorstep. */
export const CELL_PRECISION = 7
/** The area kept for the sun, in degrees of latitude and longitude: about eleven kilometres. */
export const AREA_STEP = 0.1
/** Further than this from home's area, in degrees (about 33 kilometres), is away in a different area. */
export const AWAY_DEGREES = 0.3
/** A position less certain than this (metres) recognises no place; one less certain than the second sets no area. */
export const PLACE_ACCURACY = 500
export const AREA_ACCURACY = 20_000
/** A place seen on this many different days is asked about, once. */
export const ASK_AFTER_DAYS = 3
/** A place not seen for this many days is forgotten before it is ever asked about. */
export const CANDIDATE_KEEP_DAYS = 21
export const MAX_CANDIDATES = 12
/** After "Not now", the same place waits this many days to be asked again. */
export const SNOOZE_DAYS = 7

export interface Area {
  lat: number
  lon: number
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/** The standard geohash of a point: the map cell it falls in, `precision` characters long. */
export function geohash(lat: number, lon: number, precision: number = CELL_PRECISION): string {
  let [latLo, latHi, lonLo, lonHi] = [-90, 90, -180, 180]
  let bits = 0
  let ch = 0
  let even = true
  let out = ''
  while (out.length < precision) {
    if (even) {
      const mid = (lonLo + lonHi) / 2
      if (lon >= mid) {
        ch = (ch << 1) | 1
        lonLo = mid
      } else {
        ch = ch << 1
        lonHi = mid
      }
    } else {
      const mid = (latLo + latHi) / 2
      if (lat >= mid) {
        ch = (ch << 1) | 1
        latLo = mid
      } else {
        ch = ch << 1
        latHi = mid
      }
    }
    even = !even
    if (++bits === 5) {
      out += BASE32[ch]
      bits = 0
      ch = 0
    }
  }
  return out
}

/** A cell's size in degrees at this precision: latitude, then longitude. */
function cellSize(precision: number): [number, number] {
  const lonBits = Math.ceil((precision * 5) / 2)
  const latBits = Math.floor((precision * 5) / 2)
  return [180 / 2 ** latBits, 360 / 2 ** lonBits]
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/** The cell a point falls in and the eight around it, the point's own first: a place is the block, so a fix near an edge still finds it. */
export function cellBlock(lat: number, lon: number, precision: number = CELL_PRECISION): string[] {
  const [dLat, dLon] = cellSize(precision)
  const out = [geohash(lat, lon, precision)]
  for (const dy of [-1, 0, 1])
    for (const dx of [-1, 0, 1]) {
      if (!dy && !dx) continue
      const y = Math.max(-89.999999, Math.min(89.999999, lat + dy * dLat))
      const c = geohash(y, wrapLon(lon + dx * dLon), precision)
      if (!out.includes(c)) out.push(c)
    }
  return out
}

/** The area kept for the sun: the position rounded to a tenth of a degree. */
export function areaOf(lat: number, lon: number): Area {
  const tenth = (v: number) => Number((Math.round(v / AREA_STEP) * AREA_STEP).toFixed(1)) || 0
  return { lat: tenth(lat), lon: tenth(lon) }
}

/** Whether two areas are far enough apart that one is away from the other. */
export function farApart(a: Area, b: Area): boolean {
  const dLat = Math.abs(a.lat - b.lat)
  const dLon = Math.abs(wrapLon(a.lon - b.lon)) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLon) > AWAY_DEGREES
}

/** A random key for this phone alone, base64: what fingerprints are made with. Never synced, exported or sent. */
export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
}

/** Each cell's keyed fingerprint (HMAC-SHA-256, the first 16 bytes, base64): the same cell always gives the same one, and none can be turned back into a cell without the key. */
export async function fingerprints(secret: string, cells: readonly string[]): Promise<string[]> {
  const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const enc = new TextEncoder()
  return Promise.all(
    cells.map(async (c) => {
      const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`cell:${c}`)))
      return btoa(String.fromCharCode(...mac.slice(0, 16)))
    }),
  )
}

/** What the sightings of an unnamed place suggest it is, from the week's shape alone; null when nothing stands out. */
export interface Sightings {
  /** Different days it was seen. */
  days: number
  morning: number
  afternoon: number
  evening: number
  /** Seen in the morning or the afternoon of one of your office days. */
  office: number
  /** Seen on your church day. */
  church: number
}

export function guessKind(s: Sightings): PlaceKind | null {
  const total = s.morning + s.afternoon + s.evening
  if (!total) return null
  if (s.office * 2 >= total && s.office >= 2) return 'work'
  if (s.church * 2 >= total && s.church >= 2) return 'church'
  if ((s.evening + s.morning) * 3 >= total * 2 && s.evening >= 2) return 'home'
  return null
}
