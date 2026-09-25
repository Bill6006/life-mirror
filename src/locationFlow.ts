import { addDays, blockAt, parseDay, type Block } from './blocks'
import { db, ensureDayContext, getSettings, updateSettings, type KnownPlace, type PlaceCandidate } from './db'
import { areaOf, AREA_ACCURACY, ASK_AFTER_DAYS, CANDIDATE_KEEP_DAYS, cellBlock, farApart, fingerprints, guessKind, MAX_CANDIDATES, newSecret, PLACE_ACCURACY, SNOOZE_DAYS, type Area, type PlaceKind, type Where } from './location'
import type { Settings, Weekday } from './settings'
import { sunLocal } from './sun'

// Location Context on this phone (Part 43). A position is read only while Life Mirror is open and
// only once you turned it on and the phone allowed it: at launch, on coming back to it, now and then
// while it stays open, and when a check-in opens. It cannot be read while the app is closed: the web
// gives an app no location in the background (a service worker has none, and there is no geofence).
// Each position is used here at once and let go; see location.ts for what is kept.

/** One position as the phone's location service gave it: used at once, never stored. */
export interface Fix {
  lat: number
  lon: number
  /** How far off it may be, in metres. */
  accuracy: number
}

export type LocationStatus = 'granted' | 'prompt' | 'denied' | 'unavailable'

/** Whether this phone lets Life Mirror read its location, asked without prompting. */
export async function permissionState(): Promise<LocationStatus> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unavailable'
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return p.state as LocationStatus
  } catch {
    return 'prompt'
  }
}

/** One reading of where the phone is: its quick network position unless `precise`; the phone asks you the first time. */
export function readFix(timeoutMs = 20_000, precise = false): Promise<Fix | { error: 'denied' | 'unavailable' | 'timeout' }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve({ error: 'unavailable' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => resolve({ error: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: precise, maximumAge: precise ? 0 : 5 * 60_000, timeout: timeoutMs },
    )
  })
}

/** The quick reading, and when it is too rough to know a place by, one precise try: used and let go the same way. */
export async function bestFix(): Promise<Fix | { error: 'denied' | 'unavailable' | 'timeout' }> {
  const quick = await readFix()
  if ('error' in quick || quick.accuracy <= PLACE_ACCURACY) return quick
  const precise = await readFix(15_000, true)
  return 'error' in precise || precise.accuracy >= quick.accuracy ? quick : precise
}

/** This phone's key for fingerprints, made once; never synced, exported or sent. */
async function secret(): Promise<string> {
  return db.transaction('rw', db.placeMeta, async () => {
    const row = await db.placeMeta.get('secret')
    if (row) return row.value
    const value = newSecret()
    await db.placeMeta.put({ key: 'secret', value })
    return value
  })
}

/**
 * The day's own record of where each part of it was spent: a kind is added once per part. `replacing`,
 * when given, is a kind the last reading added at this very spot before it had a name: it gives way.
 * Whether the kind was added comes back.
 */
export async function recordWhere(day: string, block: Block, where: Where, settings: Settings, replacing: Where | null = null): Promise<boolean> {
  await ensureDayContext(day, settings)
  return db.transaction('rw', db.days, async () => {
    const ctx = await db.days.get(day)
    if (!ctx) return false
    const before = ctx.where?.[block] ?? []
    const list = replacing && replacing !== where ? before.filter((w) => w !== replacing) : before
    if (list.includes(where) && list.length === before.length) return false
    await db.days.put({ ...ctx, where: { ...(ctx.where ?? {}), [block]: list.includes(where) ? list : [...list, where] } })
    return !before.includes(where)
  })
}

/**
 * The last reading, held in memory while the app is open and never stored: its day and part, its own
 * cell's fingerprint, and the kind it added, so naming that spot a moment later corrects the day's
 * record instead of leaving "out, then at Home" for a place that simply had no name yet.
 */
let lastSense: { day: string; block: Block; cell: string; added: Where | null } | null = null

/** The kind the last reading added at one of these cells in this part of the day, if it did. */
function addedHere(day: string, block: Block, cells: readonly string[]): Where | null {
  return lastSense && lastSense.day === day && lastSense.block === block && cells.includes(lastSense.cell) ? lastSense.added : null
}

/** Today's sunrise and sunset follow a new area: the day's record of its light is written again. */
async function relight(day: string, area: Area): Promise<void> {
  const sun = sunLocal(day, area)
  await db.transaction('rw', db.days, async () => {
    const ctx = await db.days.get(day)
    if (!ctx) return
    const { light: _old, ...rest } = ctx
    await db.days.put(sun ? { ...rest, light: sun } : rest)
  })
}

/** A place seen again: its sightings counted; a new one noted; the stale and the surplus forgotten. */
async function learn(cells: string[], area: Area, day: string, block: Block, settings: Settings): Promise<void> {
  const weekday = parseDay(day).getDay() as Weekday
  const office = settings.week.officeDays[weekday] && block !== 'evening' ? 1 : 0
  const church = settings.week.churchDay === weekday ? 1 : 0
  await db.transaction('rw', db.placeCandidates, async () => {
    await db.placeCandidates.where('lastDay').below(addDays(day, -CANDIDATE_KEEP_DAYS)).delete()
    const all = await db.placeCandidates.toArray()
    const same = all.find((c) => c.cells.some((x) => cells.includes(x)))
    if (same) {
      const change: Partial<PlaceCandidate> = { lastDay: day, days: same.days + (same.lastDay === day ? 0 : 1), office: same.office + office, church: same.church + church }
      change[block] = same[block] + 1
      await db.placeCandidates.update(same.id as number, change)
      return
    }
    if (all.length >= MAX_CANDIDATES) {
      const oldest = [...all].sort((a, b) => (a.lastDay < b.lastDay ? -1 : 1))[0]
      await db.placeCandidates.delete(oldest.id as number)
    }
    await db.placeCandidates.add({ cells, area, firstDay: day, lastDay: day, days: 1, morning: block === 'morning' ? 1 : 0, afternoon: block === 'afternoon' ? 1 : 0, evening: block === 'evening' ? 1 : 0, office, church })
  })
}

/**
 * One position, used at once and let go. The area (to a tenth of a degree) sets today's sun when it
 * changed; a position certain to within 500 metres is matched against the places you named, the
 * part of the day's kind of place is noted, and a place not named is counted toward the one
 * question. Returns the kind of place, or null when Location Context is off or the fix too coarse.
 */
export async function sense(fix: Fix, now: Date = new Date()): Promise<Where | null> {
  let settings = await getSettings()
  if (!settings.location.on) return null
  const { day, block } = blockAt(now)
  const area = areaOf(fix.lat, fix.lon)
  if (fix.accuracy <= AREA_ACCURACY) {
    const cur = settings.location.area
    if (!cur || cur.lat !== area.lat || cur.lon !== area.lon) {
      // The new area first, so a day begun now takes its light from it; a day already begun is lit again.
      settings = await updateSettings((s) => ({ ...s, location: { ...s.location, area: { ...area, at: now.toISOString() } } }))
      await ensureDayContext(day, settings)
      await relight(day, area)
    }
  }
  if (fix.accuracy > PLACE_ACCURACY) return null
  const cells = await fingerprints(await secret(), cellBlock(fix.lat, fix.lon))
  const places = await db.places.toArray()
  const known = places.find((p) => p.cells.includes(cells[0]))
  let where: Where
  if (known && known.kind !== 'none') where = known.kind
  else {
    const home = places.find((p) => p.kind === 'home' && p.area)?.area ?? settings.place
    where = home && farApart(area, home) ? 'away' : 'out'
  }
  const added = await recordWhere(day, block, where, settings)
  // Another reading at the same spot keeps what the spot added: a second look changes nothing about it.
  const sameSpot = lastSense !== null && lastSense.day === day && lastSense.block === block && lastSense.cell === cells[0]
  lastSense = { day, block, cell: cells[0], added: added ? where : sameSpot ? (lastSense?.added ?? null) : null }
  if (!known) await learn(cells, area, day, block, settings)
  return where
}

let lastRead = 0

/** A reading now, if Location Context is on, the phone already allows it, and none was taken in the last `gapMinutes`. Never prompts. */
export async function sample(now: Date = new Date(), gapMinutes = 10): Promise<Where | null> {
  if (now.getTime() - lastRead < gapMinutes * 60_000) return null
  const settings = await getSettings()
  if (!settings.location.on || (await permissionState()) !== 'granted') return null
  lastRead = now.getTime()
  const fix = await bestFix()
  return 'error' in fix ? null : sense(fix, now)
}

/** The page's own visibility, and nothing else of it. */
export type Visibility = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>

/** Reads at launch, on coming back to the app, and every twenty minutes while it stays open and in view. Nothing while it is closed. */
export function watchLocation(page: Visibility = document, clock: () => Date = () => new Date()): () => void {
  // At launch; not again if a reading was taken this very minute (turning it on takes one).
  void sample(clock(), 1)
  const onVisible = () => {
    if (page.visibilityState === 'visible') void sample(clock())
  }
  page.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => {
    if (page.visibilityState === 'visible') void sample(clock(), 20)
  }, 20 * 60_000)
  return () => {
    page.removeEventListener('visibilitychange', onVisible)
    clearInterval(timer)
  }
}

/** Turns Location Context on: the phone asks you, once, and the first reading is taken. What the phone answered comes back. */
export async function turnOn(now: Date = new Date()): Promise<LocationStatus> {
  await updateSettings((s) => ({ ...s, location: { ...s.location, on: true } }))
  const fix = await bestFix()
  if ('error' in fix) return fix.error === 'denied' ? 'denied' : fix.error === 'unavailable' ? 'unavailable' : 'prompt'
  lastRead = now.getTime()
  await sense(fix, now)
  return 'granted'
}

/** Turns it off: nothing more is read, and the sun goes back to the place you typed. What it learned stays until you forget it. */
export async function turnOff(): Promise<void> {
  await updateSettings((s) => ({ ...s, location: { ...s.location, on: false } }))
}

/** The one question, when a place has been seen on three different days and none was asked today: the place and what it looks like. */
export async function pendingQuestion(today: string): Promise<{ candidate: PlaceCandidate; guess: PlaceKind | null } | null> {
  const [settings, asked, all] = await Promise.all([getSettings(), db.placeMeta.get('askedOn'), db.placeCandidates.toArray()])
  if (!settings.location.on || asked?.value === today) return null
  const ready = all.filter((c) => c.days >= ASK_AFTER_DAYS && (!c.askAfter || c.askAfter <= today)).sort((a, b) => b.days - a.days)
  return ready[0] ? { candidate: ready[0], guess: guessKind(ready[0]) } : null
}

/** The answer: a kind names the place for good, "not one to note" keeps it from being asked again, "not now" waits a week. */
export async function answerQuestion(candidateId: number, answer: PlaceKind | 'none' | 'later', now: Date = new Date()): Promise<void> {
  const { day: today, block } = blockAt(now)
  let cells: string[] = []
  await db.transaction('rw', [db.placeCandidates, db.places, db.placeMeta], async () => {
    const c = await db.placeCandidates.get(candidateId)
    if (!c) return
    await db.placeMeta.put({ key: 'askedOn', value: today })
    if (answer === 'later') return void (await db.placeCandidates.update(candidateId, { askAfter: addDays(today, SNOOZE_DAYS) }))
    await db.places.add({ kind: answer, cells: c.cells, ...(c.area ? { area: c.area } : {}), learnedAt: now.toISOString() })
    await db.placeCandidates.delete(candidateId)
    cells = c.cells
  })
  // Answered while standing there: the out the last reading added here becomes the place's kind.
  const was = answer === 'later' || answer === 'none' ? null : addedHere(today, block, cells)
  if (was && answer !== 'later' && answer !== 'none') await recordWhere(today, block, answer, await getSettings(), was)
}

/** One-time setup: names where you are now. A place you had already named here is renamed instead; nothing is asked about it again. */
export async function nameHere(kind: PlaceKind, label: string | null = null, now: Date = new Date()): Promise<'named' | LocationStatus | 'coarse'> {
  const fix = await bestFix()
  if ('error' in fix) return fix.error === 'denied' ? 'denied' : fix.error === 'unavailable' ? 'unavailable' : 'prompt'
  if (fix.accuracy > PLACE_ACCURACY) return 'coarse'
  const cells = await fingerprints(await secret(), cellBlock(fix.lat, fix.lon))
  const area = areaOf(fix.lat, fix.lon)
  await db.transaction('rw', [db.places, db.placeCandidates], async () => {
    const same = (await db.places.toArray()).find((p) => p.cells.includes(cells[0]))
    const named: Partial<KnownPlace> = { kind, ...(kind === 'regular' && label ? { label: label.slice(0, 40) } : { label: undefined }) }
    if (same) await db.places.update(same.id as number, named)
    else await db.places.add({ kind, cells, area, learnedAt: now.toISOString(), ...(kind === 'regular' && label ? { label: label.slice(0, 40) } : {}) })
    for (const c of await db.placeCandidates.toArray()) if (c.cells.some((x) => cells.includes(x))) await db.placeCandidates.delete(c.id as number)
  })
  const settings = await getSettings()
  const { day, block } = blockAt(now)
  await recordWhere(day, block, kind, settings, addedHere(day, block, cells))
  return 'named'
}

/** What a named place is called: its kind, and your own word for a regular place. */
export async function renamePlace(id: number, kind: PlaceKind, label: string | null = null): Promise<void> {
  await db.places.update(id, { kind, label: kind === 'regular' && label ? label.slice(0, 40) : undefined })
}

export async function forgetPlace(id: number): Promise<void> {
  await db.places.delete(id)
}

/** Everything it learned, gone from this phone: the places, the places being learned, the key and the area. What the days recorded stays in their record. */
export async function forgetAll(): Promise<void> {
  await db.transaction('rw', [db.places, db.placeCandidates, db.placeMeta], async () => {
    await db.places.clear()
    await db.placeCandidates.clear()
    await db.placeMeta.clear()
  })
  await updateSettings((s) => ({ ...s, location: { ...s.location, area: null } }))
}

/** The places named, for Settings and the export: their kinds and your words, never their fingerprints. */
export async function namedPlaces(): Promise<{ id: number; kind: PlaceKind | 'none'; label: string | null; learnedAt: string }[]> {
  return (await db.places.toArray()).map((p) => ({ id: p.id as number, kind: p.kind, label: p.label ?? null, learnedAt: p.learnedAt }))
}
