import { MAX_WORDS, nearRepeat, readBrainPrefs, validateOutput, type BrainOutput } from '../../src/brainShared'
import { DEFAULT_FIRMNESS, HOW_FIRM, type FirmnessPref } from '../../src/firmness'
import type { FactSheet } from '../../src/factTypes'
import type { Check } from './ai'
import type { LineBriefing, Said } from './briefing'
import { addDays } from './time'
import type { Store } from './turso'

// The checks every writer's line passes, whoever wrote it (Parts 28 and 30): the validator, the
// day guard and the repeat check. The repeat check reads what was said lately whatever the
// writer may read, since checking a line is the Worker's work, not a read by the writer.

/** The days the repeat check looks back over. */
export const REPEAT_DAYS = 7

/** What was said lately, by the Worker and by the phone, with how each landed. */
export async function saidLately(store: Store, sheet: FactSheet): Promise<Said[]> {
  const feedback = new Map((await store.readFeedback()).map((f) => [f.briefKey, f.answer]))
  return [...(await store.readSaid(7)).map((s) => ({ day: s.day, text: s.text, feedback: feedback.get(`worker:${s.id}`) ?? null })), ...sheet.said.filter((s) => s.source === 'phone').map((s) => ({ day: s.day, text: s.text, feedback: s.feedback }))]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 10)
}

/**
 * How firm for a run (Pass 2): the stored setting once the gate is open, Adaptive until one is
 * chosen; null while it is closed, and then nothing is read.
 */
export async function firmFor(store: Store, gate: 'gated' | 'open' = HOW_FIRM): Promise<FirmnessPref | null> {
  if (gate !== 'open') return null
  return readBrainPrefs(await store.readRecord('brainPrefs', 'prefs')).firmness ?? DEFAULT_FIRMNESS
}

/** A line as the validator reads it, then the repeat check against the lines of the seven days before the day it is for. */
export function lineCheck(b: LineBriefing, said: readonly Said[] = b.said): Check<BrainOutput> {
  const earlier = said.filter((s) => s.day < b.forDay && s.day >= addDays(b.forDay, -REPEAT_DAYS))
  return (raw) => {
    const v = validateOutput(raw, b.sheet, b.cards, MAX_WORDS, b.forDay, b.firm ? { pref: b.firm } : undefined)
    if (!v.ok) return v
    const day = nearRepeat(v.value.text, earlier)
    return day ? { ok: false, reason: `nearly repeats the line said on ${day}; say something else, or the same from a new angle` } : v
  }
}
