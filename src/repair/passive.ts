import { addDays } from '../blocks'
import { liveMoves, PASSIVE, type Window } from '../catalogue'
import type { ReadingId } from '../readings'
import { updateSettings } from '../db'
import type { Settings } from '../settings'
import { testsOfMove } from './engine'
import type { TestShown } from './evidence'

// A one-tap test of a passive item (stage R4b), from the agreed review of 2026-10-09: "a one-tap test proposed when an
// association turns Promising". A passive item rides alongside the move by its own rule, so its record is an association;
// while its test runs, a fair coin decides, on each moment its rule would have it ride alongside, whether it does, and the
// repair reads each as a randomized decision for the item's own test. Only an item the repair can test qualifies: one with
// a test on a reading of the reading out of 100, as the judged design declares them.

/** How long a test of a passive item runs: the queue's own time for a test (`queueMaxDays`). */
export const PASSIVE_TEST_DAYS = 45

/** The chance the coin has, each moment: a fair coin. */
export const PASSIVE_COIN = 0.5

/** A passive item the repair can test: a live passive item with a test the judged design declares. */
export function testablePassive(moveId: string): boolean {
  return PASSIVE.has(moveId) && liveMoves.some((m) => m.id === moveId) && testsOfMove(moveId).length > 0
}

/** The reading and window the item's test reads: its first declared test, as the proposal names it. */
export function passiveTestReading(moveId: string): { target: ReadingId; window: Window } | null {
  return testsOfMove(moveId)[0] ?? null
}

/** The day a test of the item began, if one was set and its time has not run out on `day`. */
export function passiveTestSince(settings: Pick<Settings, 'repairPassiveTests'>, moveId: string, day: string): string | null {
  const set = (settings.repairPassiveTests ?? []).find((t) => t.moveId === moveId)
  if (!set || day < set.since || day >= addDays(set.since, PASSIVE_TEST_DAYS)) return null
  return set.since
}

/** Whether the item's test runs on `day`: set, inside its time, and not yet established on any of its readings. */
export function passiveTestRuns(settings: Pick<Settings, 'repairPassiveTests'>, moveId: string, day: string, tests: readonly Pick<TestShown, 'moveId' | 'level'>[]): boolean {
  return passiveTestSince(settings, moveId, day) !== null && !tests.some((t) => t.moveId === moveId && t.level === 'established')
}

/** Sets a test of the item from `day`, in place of any earlier one of it; kept with the settings, synced whole. */
export function startPassiveTest(moveId: string, day: string): Promise<Settings> {
  return updateSettings((s) => ({ ...s, repairPassiveTests: [...(s.repairPassiveTests ?? []).filter((t) => t.moveId !== moveId), { moveId, since: day }] }))
}
