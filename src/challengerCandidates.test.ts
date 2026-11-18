import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { candidatesFor, conditionsFor, EVENING_ID, nightCondition, noticedCondition, noticedTypes, privateCondition, SLEEP_ID, type ChallengerRecord } from './challengerRecord'
import { FIXTURE_ITEM, FIXTURE_QUOTE, FIXTURE_TODAY, FIXTURE_TYPE, fixtureCheckin, fixtureItemAndNotes } from './challengerTesting'
import type { CheckIn } from './db'
import { buildExport, forecastAdjustment } from './export'
import { DEFAULT_SETTINGS } from './settings'
import { noticedOf } from './noteEvents/join'
import { wrongIdOf, type NoteEvent, type NoteMark } from './noteEvents/shared'

// The challenger's candidates beyond the things of last night (2026-11-14): each private item where it was on screen
// at the evening check-in, and each type of note event, each only while its Brain switch is on. Stand-in records only.

const TODAY = FIXTURE_TODAY
const day = (back: number): string => addDays(TODAY, -back)
const record = (checkins: readonly CheckIn[]): ChallengerRecord => ({ checkins, contexts: new Map(), eveningWorkouts: new Set(), natureMoves: new Set(), hideFaith: false })

/** The stand-in record with a private item and note events, read as the writer reads it: the join, and both switches as given. */
function itemAndNotes(privateOn = true, notesOn = true, marks: NoteMark[] = []): ChallengerRecord {
  const { checkins, events } = fixtureItemAndNotes()
  return { ...record(checkins), items: [FIXTURE_ITEM], noticed: noticedOf({ events, marks, checkins, kept: [] }), privateOn, notesOn }
}

const key = String(FIXTURE_ITEM.id)
const evening = (back: number, extras: NonNullable<CheckIn['extras']>, id: number, at?: string): CheckIn => ({ ...fixtureCheckin(day(back), 'evening', 3), id, extras, ...(at ? { completedAt: at } : {}) })
const event = (checkinId: number, back: number, noticedAt: string): NoteEvent => ({ id: `ev-${checkinId}`, type: FIXTURE_TYPE, note: { store: 'checkins', id: String(checkinId), day: day(back), block: 'evening' }, quote: FIXTURE_QUOTE, noticedAt, method: 'stand-in' })

describe('a private item and a type of note event as conditions of the next morning', () => {
  it('reads a private item as marked, not marked, or unknown where it was not on screen, and moves only the morning after it was marked', () => {
    const rows = [evening(4, { privateShown: { [key]: true }, private: { [key]: true } }, 1), evening(3, { privateShown: { [key]: true } }, 2), evening(2, { privateShown: {} }, 3), { ...evening(1, { privateShown: { [key]: true }, private: { [key]: true } }, 4), answers: {} }]
    const c = privateCondition(FIXTURE_ITEM, record(rows))
    expect(c.id).toBe(`private.${key}`)
    expect([4, 3, 2, 1, 0].map((back) => c.stateOn(day(back)))).toEqual(['yes', 'no', null, null, null])
    expect(c.blocks).toEqual(['morning'])
    expect([c.moves('yes'), c.moves('no')]).toEqual([true, false])
  })

  it('counts an evening only where it was completed before the next day began, for every condition read from it', () => {
    // Logged the next morning at nine: after the next day had begun, so it was not known at that day's start.
    const late = new Date(`${day(2)}T09:00:00`).toISOString()
    const extras: NonNullable<CheckIn['extras']> = { privateShown: { [key]: true }, private: { [key]: true }, dinner: true, note: 'a note' }
    const r = record([evening(3, extras, 1, late), evening(2, extras, 2)])
    for (const c of [privateCondition(FIXTURE_ITEM, r), nightCondition('dinner', r), noticedCondition(FIXTURE_TYPE, r)]) {
      expect(c.stateOn(day(3))).toBeNull()
      expect(c.stateOn(day(2))).not.toBeNull()
    }
  })

  it('reads a type of note event only at an evening with a note: present when one of its events was identified before the morning’s day began', () => {
    const note = { note: `I ${FIXTURE_QUOTE} again.` }
    const rows = [evening(5, note, 11), evening(4, note, 12), evening(3, { note: 'A quiet evening.' }, 13), evening(2, {}, 14)]
    // The first identified that night; the second only once the morning's day had begun, so it does not count for that morning.
    const events = [event(11, 5, new Date(`${day(5)}T22:00:00`).toISOString()), event(12, 4, new Date(`${day(3)}T08:00:00`).toISOString())]
    const r: ChallengerRecord = { ...record(rows), noticed: noticedOf({ events, marks: [], checkins: rows, kept: [] }), notesOn: true }
    const c = noticedCondition(FIXTURE_TYPE, r)
    expect(c.id).toBe(`noticed.${FIXTURE_TYPE}`)
    expect([5, 4, 3, 2, 1].map((back) => c.stateOn(day(back)))).toEqual(['yes', 'no', 'no', null, null])
    expect(c.blocks).toEqual(['morning'])
    expect([c.moves('yes'), c.moves('no')]).toEqual([true, false])
    // Marked wrong, the event counts nowhere.
    const marks: NoteMark[] = [{ id: wrongIdOf('ev-11'), kind: 'wrong', at: day(1), updatedAt: day(1) }]
    expect(noticedCondition(FIXTURE_TYPE, { ...r, noticed: noticedOf({ events, marks, checkins: rows, kept: [] }) }).stateOn(day(5))).toBe('no')
  })

  it('takes private items and types of note event as candidates only while their Brain switches are on, after the things of last night, one family', () => {
    const ids = (r: ChallengerRecord): string[] => candidatesFor(r, TODAY).map((f) => f.compared.id)
    const both = ids(itemAndNotes())
    expect(both.slice(-2)).toEqual([`private.${key}`, `noticed.${FIXTURE_TYPE}`])
    expect(both.slice(0, -2).every((id) => id.startsWith('assoc.'))).toBe(true)
    expect(ids(itemAndNotes(false, true)).slice(-1)).toEqual([`noticed.${FIXTURE_TYPE}`])
    expect(ids(itemAndNotes(false, true)).some((id) => id.startsWith('private.'))).toBe(false)
    expect(ids(itemAndNotes(true, false)).slice(-1)).toEqual([`private.${key}`])
    expect(ids(itemAndNotes(true, false)).some((id) => id.startsWith('noticed.'))).toBe(false)
  })

  it('puts both on the list when they stand at a steady pattern', () => {
    expect(conditionsFor(itemAndNotes(), TODAY).map((c) => c.id)).toEqual([SLEEP_ID, EVENING_ID, `private.${key}`, `noticed.${FIXTURE_TYPE}`])
    // Every event marked wrong: the type is no candidate at all.
    const { events } = fixtureItemAndNotes()
    const marks: NoteMark[] = events.map((e) => ({ id: wrongIdOf(e.id), kind: 'wrong', at: day(1), updatedAt: day(1) }))
    expect(conditionsFor(itemAndNotes(true, true, marks), TODAY).map((c) => c.id)).toEqual([SLEEP_ID, EVENING_ID, `private.${key}`])
  })

  it('takes a type of note event only once five check-ins hold one of its events, identified before the day of the run began', () => {
    const { checkins, events } = fixtureItemAndNotes()
    const r = (list: readonly NoteEvent[]): ChallengerRecord => ({ ...record(checkins), noticed: noticedOf({ events: list, marks: [], checkins, kept: [] }), notesOn: true })
    expect(events.length).toBeGreaterThan(20)
    expect(noticedTypes(r(events.slice(0, 5)), TODAY)).toEqual([FIXTURE_TYPE])
    expect(noticedTypes(r(events.slice(0, 4)), TODAY)).toEqual([])
    // Five, the fifth identified only today: four count.
    const today = new Date(`${TODAY}T10:00:00`).toISOString()
    expect(noticedTypes(r([...events.slice(0, 4), { ...events[4], noticedAt: today }]), TODAY)).toEqual([])
    // Five of another type: that type, never this one.
    expect(noticedTypes(r(events.slice(0, 5).map((e) => ({ ...e, type: 'argument' }))), TODAY)).toEqual(['argument'])
    // Four on check-ins and a fifth on a note kept from a question, written at no check-in: four count.
    const keptNote = { id: 900, day: day(2), text: `Kept: I ${FIXTURE_QUOTE}.` }
    const onKept: NoteEvent = { ...events[4], id: 'ev-kept', note: { store: 'notes', id: '900', day: day(2) } }
    expect(noticedOf({ events: [onKept], marks: [], checkins, kept: [keptNote] })).toHaveLength(1)
    expect(noticedTypes({ ...record(checkins), noticed: noticedOf({ events: [...events.slice(0, 4), onKept], marks: [], checkins, kept: [keptNote] }), notesOn: true }, TODAY)).toEqual([])
  })

  it('compares a private item only at the evenings where it was on screen, and a type of note event only at the evenings with a note', () => {
    const { checkins } = fixtureItemAndNotes()
    const compared = (r: ChallengerRecord, prefix: string) => candidatesFor(r, TODAY).find((f) => f.compared.id.startsWith(prefix))?.compared
    const all = compared(itemAndNotes(), 'private.')
    // Twenty evenings that never showed the item: twenty fewer occasions, never twenty more without it.
    const hidden = checkins.map((c, i) => (c.block === 'evening' && i < 40 ? { ...c, extras: { note: c.extras?.note } } : c))
    const fewer = compared({ ...itemAndNotes(), checkins: hidden }, 'private.')
    expect((all?.n ?? 0) + (all?.m ?? 0) - ((fewer?.n ?? 0) + (fewer?.m ?? 0))).toBe(20)
    // A note event's occasions are the evenings with a note and a morning after, before today: fewer than all the evenings.
    const noted = checkins.filter((c, i) => c.block === 'evening' && typeof c.extras?.note === 'string' && i + 1 < checkins.length).length
    const notes = compared(itemAndNotes(), 'noticed.')
    expect((notes?.n ?? 0) + (notes?.m ?? 0)).toBe(noted)
    expect(noted).toBeLessThan(checkins.filter((c) => c.block === 'evening').length - 1)
    // An event identified only today is not yet one: the evening it sits on counts as without it.
    const { events } = fixtureItemAndNotes()
    const late = events.map((e, i) => (i === 0 ? { ...e, noticedAt: new Date(`${TODAY}T10:00:00`).toISOString() } : e))
    const withLate = compared({ ...itemAndNotes(), noticed: noticedOf({ events: late, marks: [], checkins, kept: [] }) }, 'noticed.')
    expect((notes?.n ?? 0) - (withLate?.n ?? 0)).toBe(1)
  })
})

describe('the forecast’s two fields in the export', () => {
  const names = new Map([[key, FIXTURE_ITEM.name]])
  const row = { adj: -3.3, adjBy: [SLEEP_ID, `private.${key}`, `noticed.${FIXTURE_TYPE}`] }

  it('carries the points added and the conditions, a private item only with private items and then by its name', () => {
    expect(forecastAdjustment(row, names, false)).toEqual({ adj: -3.3, adjBy: [SLEEP_ID, `noticed.${FIXTURE_TYPE}`] })
    expect(forecastAdjustment(row, names, true)).toEqual({ adj: -3.3, adjBy: [SLEEP_ID, `private: ${FIXTURE_ITEM.name}`, `noticed.${FIXTURE_TYPE}`] })
    expect(forecastAdjustment({}, names, true)).toEqual({})
    const f = { day: TODAY, block: 'morning' as const, horizon: 0, madeOn: TODAY, model: 'sameBlock', point: 40, lo: 30, hi: 50, whatIf: null, ...row }
    const json = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], forecasts: [f] }).json
    const compact = JSON.stringify(JSON.parse(json))
    expect(compact).toContain(`"adj":-3.3,"adjBy":["${SLEEP_ID}","noticed.${FIXTURE_TYPE}"]`)
    expect(compact).not.toContain(`private.${key}`)
  })
})
