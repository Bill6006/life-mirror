import { readBrainPrefs, WRITER_MODELS, type BrainSwitch, type WriterModel } from './brainShared'
import { db, type BrainPrefs } from './db'
import { isFirmnessPref } from './firmness'

// The Brain settings (Part 30): which model writes the line, and what Claude may read. One row,
// synced, so the Worker reads it at every request and a switch turned off applies from the next
// read. Every switch is on until turned off (Rule 21 as amended); the model is Opus until changed.

export async function getBrainPrefs(): Promise<BrainPrefs> {
  const row = await db.brainPrefs.get('prefs')
  return { id: 'prefs', updatedAt: row?.updatedAt ?? '', ...readBrainPrefs(row) }
}

/** Sets the writer model; anything outside the four aliases is refused here as it is in the Worker and the routine. */
export async function setWriterModel(model: string): Promise<boolean> {
  if (!(WRITER_MODELS as readonly string[]).includes(model)) return false
  await db.transaction('rw', db.brainPrefs, async () => {
    const cur = await getBrainPrefs()
    await db.brainPrefs.put({ ...cur, writerModel: model as WriterModel, updatedAt: new Date().toISOString() })
  })
  return true
}

/** How firm (Pass 2): Adaptive, Supportive, Balanced or Hard Coach; anything else refused. Kept in the same synced row; nothing reads it while its gate is closed. */
export async function setFirmness(pref: string): Promise<boolean> {
  if (!isFirmnessPref(pref)) return false
  await db.transaction('rw', db.brainPrefs, async () => {
    const cur = await getBrainPrefs()
    await db.brainPrefs.put({ ...cur, firmness: pref, updatedAt: new Date().toISOString() })
  })
  return true
}

/** Turns one category Claude may read on or off; only switches turned off are kept. */
export async function setBrainSwitch(key: BrainSwitch, on: boolean): Promise<void> {
  await db.transaction('rw', db.brainPrefs, async () => {
    const cur = await getBrainPrefs()
    const switches = { ...cur.switches }
    if (on) delete switches[key]
    else switches[key] = false
    await db.brainPrefs.put({ ...cur, switches, updatedAt: new Date().toISOString() })
  })
}
