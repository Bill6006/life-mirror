import { CHOICES_KEY, onChoicesChanged } from './choicesWatch'
import { db, getSettings, updateSettings, type KnownPlace } from './db'
import { withDefaults, type Settings } from './settings'
import { tokenStorage } from './tokenVault'

// Sync safety (the owner's fix of 2026-10-19): a choice made by hand survives tab changes, reloads, sync, recalibration
// and the app reopening. This phone's browser has cleared the app's database before, local storage surviving
// each time (2026-10-02). The record comes back from the cloud copy, but what is this phone's alone is never synced, so
// that another phone is never switched on by it: Location Context's switch and the area it last read, the weather's
// switch, the places named and the key their fingerprints use. Those keep a second copy in local storage, as the token
// does: written whenever they change, and put back when the database comes back without them. A mark in the database,
// matched by the copy, tells a database in use from one the browser cleared. Never synced, never exported; a wipe takes it.

/** The database's own mark, kept beside the places' key. */
export const MARK_KEY = 'dbMark'

export interface ChoicesCopy {
  mark: string
  location: Settings['location']
  weather: Settings['weather']
  places: Omit<KnownPlace, 'id'>[]
  secret: string | null
  savedAt: string
}

/** Until the start-up check has run, no write may overwrite the copy it is about to read. */
let ready = false
/** The copy's write under way, if any, and whether a change came while it ran. */
let keeping: Promise<void> | null = null
let again = false

function newMark(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The copy as kept; null when there is none, or it cannot be read or is not whole. */
export function readChoicesCopy(): ChoicesCopy | null {
  try {
    const raw = tokenStorage()?.getItem(CHOICES_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<ChoicesCopy>
    if (typeof c.mark !== 'string' || !c.mark || !Array.isArray(c.places)) return null
    const s = withDefaults({ location: c.location, weather: c.weather } as Partial<Settings>)
    const places = c.places.filter((p): p is Omit<KnownPlace, 'id'> => Boolean(p) && typeof p.kind === 'string' && Array.isArray(p.cells) && typeof p.learnedAt === 'string')
    return { mark: c.mark, location: s.location, weather: s.weather, places, secret: typeof c.secret === 'string' && c.secret ? c.secret : null, savedAt: typeof c.savedAt === 'string' ? c.savedAt : '' }
  } catch {
    return null
  }
}

function writeCopy(c: ChoicesCopy): void {
  try {
    tokenStorage()?.setItem(CHOICES_KEY, JSON.stringify(c))
  } catch {
    // A copy that cannot be written leaves the database as the only one, as before.
  }
}

/** This phone's choices as the database holds them now. */
async function current(mark: string): Promise<ChoicesCopy> {
  const [s, places, secret] = await Promise.all([getSettings(), db.places.toArray(), db.placeMeta.get('secret')])
  return { mark, location: s.location, weather: s.weather, places: places.map(({ id: _id, ...p }) => p), secret: secret?.value ?? null, savedAt: new Date().toISOString() }
}

/**
 * Writes the copy again from the database, at once, once the start-up check has run and while the database carries its
 * mark: one write at a time, and one more when a change came during it. Never delayed, since a choice made just before
 * the app closes must be in the copy (2026-10-19: a 50-millisecond wait lost a place named and left at once). What
 * changes a choice awaits it, so the choice is kept when the action is done. A copy that cannot be written fails nothing.
 */
export function keepChoices(): Promise<void> {
  if (keeping) {
    again = true
    return keeping
  }
  const run = async () => {
    do {
      again = false
      if (!ready || !tokenStorage()) return
      const mark = await db.placeMeta.get(MARK_KEY)
      if (mark) writeCopy(await current(mark.value))
    } while (again)
  }
  keeping = run()
    .catch(() => undefined)
    .finally(() => {
      keeping = null
    })
  return keeping
}

/**
 * At start-up, before the app draws. No copy yet: one is made from the database, and the database marked. The database
 * carries a mark: it is the one in use, and the copy is written again from it, which also catches a change whose copy
 * was cut short when the app last closed. No mark in the database while a copy stands: the browser cleared it, and this
 * phone's choices are put back from the copy, all in one write, so nothing reads Location Context on before its places
 * and their key are back.
 */
export async function restoreChoices(): Promise<'first' | 'kept' | 'restored' | 'none'> {
  // The copy is read before anything can write it again.
  const copy = readChoicesCopy()
  onChoicesChanged(() => void keepChoices())
  if (!tokenStorage()) {
    ready = true
    return 'none'
  }
  const mark = await db.placeMeta.get(MARK_KEY)
  let outcome: 'first' | 'kept' | 'restored'
  if (!copy || mark) {
    if (!mark) await db.placeMeta.put({ key: MARK_KEY, value: newMark() })
    outcome = copy ? 'kept' : 'first'
  } else {
    await db.transaction('rw', [db.settings, db.places, db.placeMeta], async () => {
      if (copy.secret && !(await db.placeMeta.get('secret'))) await db.placeMeta.put({ key: 'secret', value: copy.secret })
      if ((await db.places.count()) === 0 && copy.places.length) await db.places.bulkAdd(copy.places.map((p) => ({ ...p })))
      await updateSettings((s) => ({ ...s, location: copy.location, weather: copy.weather }))
      await db.placeMeta.put({ key: MARK_KEY, value: copy.mark })
    })
    outcome = 'restored'
  }
  ready = true
  await keepChoices()
  return outcome
}

/** For the tests: as a fresh start finds it. */
export function resetChoicesForTests(): void {
  ready = false
  keeping = null
  again = false
  onChoicesChanged(null)
}
