import { readBrainPrefs, type BrainSwitch } from '../brainShared'
import { db, getSettings } from '../db'
import { followedPatterns, shownWriteUps, type FollowedPattern, type ShownMonth } from './join'

// The monthly write-ups on the phone (2026-11-13): the Worker's rows read with the owner's own marks, switches and
// record, and the one mark the owner can make on an observation. Nothing here writes a write-up: the Worker does.

/** What of the monthly write-ups is shown now: every table read in one go, then worked out from them. */
export async function writeUpsNow(): Promise<ShownMonth[]> {
  const [writeups, marks, days, checkins, prefs, settings, items] = await Promise.all([db.writeups.toArray(), db.noteMarks.toArray(), db.days.toArray(), db.checkins.toArray(), db.brainPrefs.get('prefs'), getSettings(), db.privateItems.toArray()])
  const switches = readBrainPrefs(prefs).switches
  // A day still holds a record while its own row or a check-in of it is there.
  const held = new Set<string>([...days.map((d) => d.day), ...checkins.map((c) => c.day)])
  return shownWriteUps({ writeups, marks, days: held, kindOn: (kind) => switches[kind as BrainSwitch] !== false, faithShown: settings.hideFaith !== true, hiddenNames: settings.showPrivate === true ? [] : items.map((i) => i.name) })
}

/** The followed patterns that count now: of each month's newest reading, shown, and not marked wrong. */
export async function followedNow(): Promise<FollowedPattern[]> {
  return followedPatterns(await writeUpsNow())
}

/** Marks an observation wrong by its mark's id, or takes the mark back. A marked one counts for nothing; the Worker's row is untouched. */
export async function markObservation(markId: string, wrong: boolean, now: Date = new Date()): Promise<void> {
  if (!wrong) {
    await db.noteMarks.delete(markId)
    return
  }
  const at = now.toISOString()
  await db.noteMarks.put({ id: markId, kind: 'wrong', at, updatedAt: at })
}
