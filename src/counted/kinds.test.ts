import { describe, expect, it } from 'vitest'
import type { PrivateItem } from '../db'
import type { OwnChip } from '../settings'
import { type CountedInput, dayFactsOf, kindsOf, LEFT_OUT } from './kinds'
import { daysOf } from './occasions'
import { at, checkin, context, day, input, offer, outcome } from './testing'

// The one list of kinds, on a stand-in record (the counted foundation, 2026-11-12; in shadow). The rule under test in
// every case: where the record could not have said either way, a kind is unknown, never "no", and no count moves.

/** For each kind: how many occasions the record can speak for, and how many carried it. */
function counts(inp: CountedInput): Record<string, [number, number]> {
  const days = daysOf(inp.checkins)
  const facts = dayFactsOf(inp, days)
  const out: Record<string, [number, number]> = {}
  for (const kind of kindsOf(inp)) {
    if (kind.unit === 'day') {
      const known = [...facts.values()].filter((d) => kind.known(d))
      out[kind.id] = [known.length, known.filter((d) => kind.happened(d)).length]
    } else {
      const known = days.occasions.filter((o) => kind.known(o))
      out[kind.id] = [known.length, known.filter((o) => kind.happened(o)).length]
    }
  }
  return out
}

const ITEM: PrivateItem = { id: 7, name: 'a private thing', createdAt: at(290, 9), archived: 0 }
const CHIP: OwnChip = { id: 'c1', label: 'called a friend', createdAt: at(290, 9) } as OwnChip
// Two days late in October 2026, after time in nature began to be asked. The first evening carried nearly everything.
const A = 300
const base = (): CountedInput =>
  input({
    checkins: [
      checkin(A, 'morning', { answers: { sleepHours: 2, sleepQuality: 4 } }),
      checkin(A, 'evening', {
        extras: { dinner: true, napped: true, nothingLanded: true, closeToGod: true, necessities: { shower: true }, teethBrushed: 0, nature: true, sweet: true, own: { c1: true }, private: { '7': true }, privateShown: { '7': true }, chipsShown: { sweet: true, nature: true, 'own:c1': true }, caffeineShown: true, caffeineIntake: { band: 3, at: at(A, 20), since: null } },
      }),
      checkin(A + 1, 'morning', { answers: { sleepHours: 3, sleepQuality: 2 } }),
      checkin(A + 1, 'evening', { extras: { teethBrushed: 2, privateShown: { '7': true }, chipsShown: { sweet: true, 'own:c1': true }, caffeineShown: true } }),
    ],
    contexts: [context(A, { atOffice: true }), context(A + 1)],
    items: [ITEM],
    chips: [CHIP],
    offers: [offer(1, A, 'walk-ten'), offer(2, A + 1, 'walk-ten')],
    outcomes: [outcome(1, A, 'walk-ten', 'done'), outcome(2, A + 1, 'walk-ten', 'no')],
    workoutDays: [day(A)],
  })

describe('the kinds', () => {
  it('each count where the record can speak, and say how often the thing was there', () => {
    expect(counts(base())).toMatchObject({
      'sleep.short': [2, 1],
      'sleep.long': [2, 0],
      'sleep.sound': [2, 1],
      'evening.mood.high': [2, 0],
      'evening.stress.low': [2, 0],
      // Hunger was not asked on these evenings: unknown.
      'evening.hunger.high': [0, 0],
      'chip.dinner': [2, 1],
      'chip.nothingLanded': [2, 1],
      'chip.hardToSeePoint': [2, 0],
      'chip.napped': [2, 1],
      'chip.coolingOff': [2, 0],
      'chip.closeToGod': [2, 1],
      'necessity.missed': [2, 1],
      'teeth.none': [2, 1],
      // Time in nature was on screen the first evening alone.
      nature: [1, 1],
      'caffeine.200': [2, 1],
      'context.withHer': [2, 2],
      'context.office': [2, 1],
      'context.church': [2, 0],
      workout: [2, 1],
      'move.walk-ten': [2, 1],
      // Check-in kinds: on screen at the two evenings, never at the mornings.
      sweet: [2, 1],
      'caffeine.any': [2, 1],
      'private.7': [2, 1],
      'own.c1': [2, 1],
    })
  })

  it('a day with no evening is unknown for an evening chip, never a no', () => {
    const more = base()
    const before = counts(more)
    const after = counts({ ...more, checkins: [...more.checkins, checkin(A + 2, 'morning')] })
    for (const id of ['chip.dinner', 'chip.napped', 'chip.closeToGod', 'necessity.missed', 'teeth.none', 'nature', 'evening.mood.high', 'evening.stress.low']) expect(after[id], id).toEqual(before[id])
    // That morning answered no sleep reading, and showed no chip and no private item.
    for (const id of ['sleep.short', 'sleep.long', 'sleep.sound', 'sweet', 'caffeine.any', 'private.7', 'own.c1']) expect(after[id], id).toEqual(before[id])
  })

  it('an evening that never showed a thing leaves its counts where they were', () => {
    const more = base()
    const before = counts(more)
    const after = counts({ ...more, checkins: [...more.checkins, checkin(A + 2, 'evening')] })
    for (const id of ['sweet', 'caffeine.any', 'caffeine.200', 'private.7', 'own.c1', 'nature', 'teeth.none']) expect(after[id], id).toEqual(before[id])
    // The chips every evening shows do gain a known evening without them.
    expect(after['chip.dinner']).toEqual([3, 1])
    // The day has no record of its own: its contexts are unknown.
    for (const id of ['context.withHer', 'context.office', 'context.church', 'context.unwell']) expect(after[id], id).toEqual(before[id])
  })

  it('a move offered and never answered, or never offered, is unknown that day', () => {
    const more = base()
    const before = counts(more)
    const unanswered = counts({ ...more, offers: [...more.offers, offer(3, A + 2, 'walk-ten'), offer(4, A + 3, 'walk-ten')], outcomes: [...more.outcomes, outcome(4, A + 3, 'walk-ten', null)], checkins: [...more.checkins, checkin(A + 2, 'evening'), checkin(A + 3, 'evening')] })
    expect(unanswered['move.walk-ten']).toEqual(before['move.walk-ten'])
  })

  it('a day before the first workout the record holds is unknown, and a day after it is a known day without one', () => {
    const more = base()
    expect(counts({ ...more, contexts: [...more.contexts, context(A - 1)] }).workout).toEqual([2, 1])
    expect(counts({ ...more, contexts: [...more.contexts, context(A + 2)] }).workout).toEqual([3, 1])
  })

  it('teeth are counted only from a tap: an evening with none says nothing', () => {
    const more = base()
    const after = counts({ ...more, checkins: [...more.checkins, checkin(A + 2, 'evening', { extras: { dinner: true } })] })
    expect(after['teeth.none']).toEqual([2, 1])
  })

  it('count the level as two kinds by the Weekly View’s bands: under 40 is low, 80 or more is high (2026-11-13)', () => {
    // Six readings, each worth 0, 25, 50, 75 or 100: three at 25 and three at 50 read 38 (37.5 rounded); two at 25 and four at 50 read 42.
    const just = (n: number, level: number, mood: number, more: object = {}) => checkin(n, 'evening', { level, answers: { mood: mood as never, ...more } })
    const low = input({ checkins: [checkin(A, 'evening', { level: 2, answers: { stress: 3, overwhelm: 3, irritation: 3 } }), checkin(A + 1, 'evening', { level: 3, answers: { mood: 2, energy: 2 } })] })
    expect(daysOf(low.checkins).occasions.map((o) => o.reading)).toEqual([38, 42])
    expect(counts(low)['level.low']).toEqual([2, 1])
    expect(counts(low)['level.high']).toEqual([2, 0])
    // Five at 75 and one at 100 read 79; four at 75 and two at 100 read 83.
    const high = input({ checkins: [just(A, 4, 5), just(A + 1, 4, 5, { energy: 5 })] })
    expect(daysOf(high.checkins).occasions.map((o) => o.reading)).toEqual([79, 83])
    expect(counts(high)['level.high']).toEqual([2, 1])
    expect(counts(high)['level.low']).toEqual([2, 0])
    const kinds = kindsOf(high)
    expect(kinds.find((k) => k.id === 'level.low')).toMatchObject({ unit: 'checkin', category: 'dayRecord', private: false, cutoff: 'under 40 out of 100' })
    expect(kinds.find((k) => k.id === 'level.high')).toMatchObject({ unit: 'checkin', category: 'dayRecord', private: false, cutoff: '80 or more out of 100' })
  })

  it('say each kind’s cut-off in words, where it has one', () => {
    const cutoffs = Object.fromEntries(kindsOf(base()).filter((k) => k.cutoff).map((k) => [k.id, k.cutoff]))
    expect(cutoffs).toMatchObject({ 'sleep.short': 'under six hours', 'sleep.long': 'seven hours or more', 'sleep.sound': 'its top two phrases', 'evening.stress.high': 'its top two phrases', 'evening.stress.low': 'its lowest two phrases', 'caffeine.200': 'at least 200 mg' })
    expect(kindsOf(base()).find((k) => k.id === 'chip.dinner')?.cutoff).toBeUndefined()
  })

  it('are one list: no id twice, every private item marked private, every category one the retrieval layer names', () => {
    const kinds = kindsOf(base())
    const ids = kinds.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(kinds.filter((k) => k.private).map((k) => k.id)).toEqual(['private.7'])
    expect(new Set(kinds.map((k) => k.category))).toEqual(new Set(['dayRecord', 'faith', 'her', 'privateItems', 'notes']))
    expect(kinds.find((k) => k.id === 'chip.closeToGod')?.category).toBe('faith')
    expect(kinds.find((k) => k.id === 'context.church')?.category).toBe('faith')
    expect(kinds.find((k) => k.id === 'own.c1')?.label).toBe('called a friend')
    // What no kind counts is written down beside them, each with why.
    expect(LEFT_OUT.every((l) => l.reason.length > 0 && !ids.includes(l.id))).toBe(true)
    expect(LEFT_OUT.map((l) => l.id)).toEqual(expect.arrayContaining(['journal', 'voice', 'ask', 'partner.monthly']))
  })
})
