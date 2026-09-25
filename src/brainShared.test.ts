import { describe, expect, it } from 'vitest'
import { BRAIN_SWITCHES, dayGuard, lackedOf, nearRepeat, numberGrounded, numbersIn, readBrainPrefs, shapeFor, USAGE_TO_CLAUDE, usageTalkRefusal, validateAction, validateOutput, validateReview } from './brainShared'
import type { FactSheet } from './facts'
import { library } from './library'

// The validator: what the brain says must be grounded in facts by id, every number taken from
// them, no evidence claimed beyond the cited cards' grade, none of the verdict words, and short.

const sheet: FactSheet = {
  version: 1,
  day: '2026-09-18',
  builtAt: '2026-09-18T05:00:00.000Z',
  hour: 5,
  weeks: 3,
  days: 22,
  direction: null,
  said: [],
  facts: [
    { id: 'reading.2026-09-17.evening', tags: ['mood'], text: 'Yesterday evening read 62, Solid.', values: { value: 62, band: 'Solid' } },
    { id: 'aim.1', tags: ['study'], text: 'French: planned after her bedtime at 20:00.', values: { name: 'French', planTime: '20:00', gapDays: 3 } },
    { id: 'assoc.napped', tags: ['nap'], text: 'Mornings after a nap read +7, 5 naps.', values: { diff: 7, times: 5 }, n: 5, tier: 'unclear' },
  ],
}

describe('the repeat check (Part 28)', () => {
  const said = [{ day: '2026-09-17', text: 'After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.' }]
  it('catches an echo with a few words changed, and names the day it repeats', () => {
    expect(nearRepeat('After her bedtime held only 1 of 4 plans. Try the next check-in as your cue this week.', said)).toBe('2026-09-17')
    expect(nearRepeat('After her bedtime held 1 of 4 plans. Try the next check-in as the cue this week.', said)).toBe('2026-09-17')
  })
  it('lets the same subject through from a new angle, and says nothing of an empty line', () => {
    expect(nearRepeat('French went from 3 sittings to 0; one short sitting after her bedtime restarts it.', said)).toBeNull()
    expect(nearRepeat('The next check-in held 3 of 3 plans; after her bedtime held 1 of 4. Keep the one that works.', said)).toBeNull()
    expect(nearRepeat('', said)).toBeNull()
    expect(nearRepeat('Anything at all.', [])).toBeNull()
  })
})

describe('what the brain may say', () => {
  it('accepts a grounded line', () => {
    const v = validateOutput({ mode: 'observation', text: 'Yesterday evening read 62; French waited 3 days. Some evidence says naps help the afternoon.', factIds: ['reading.2026-09-17.evening', 'aim.1'], cardIds: ['naps-cognition'] }, sheet, library)
    expect(v.ok).toBe(true)
  })

  it('refuses a number not on the cited facts, a fact not on the sheet, and a card not admitted', () => {
    expect(validateOutput({ mode: 'observation', text: 'Yesterday evening read 70.', factIds: ['reading.2026-09-17.evening'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('70') })
    expect(validateOutput({ mode: 'observation', text: 'Fine.', factIds: ['reading.2026-09-99.evening'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('not on the sheet') })
    expect(validateOutput({ mode: 'observation', text: 'Fine.', factIds: ['aim.1'], cardIds: ['decision-fatigue-disputed'] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('not admitted') })
    expect(validateOutput({ mode: 'observation', text: 'Fine.', factIds: [], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: 'no fact cited' })
  })

  it('refuses a grade spoken beyond the cards, evidence without a card, a verdict word, a wrong mode, and a long line', () => {
    expect(validateOutput({ mode: 'observation', text: 'Strong evidence says naps help.', factIds: ['assoc.napped'], cardIds: ['naps-cognition'] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('strong evidence') })
    expect(validateOutput({ mode: 'observation', text: 'Research shows naps help.', factIds: ['assoc.napped'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('without citing') })
    expect(validateOutput({ mode: 'observation', text: 'A weak week.', factIds: ['aim.1'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('weak') })
    expect(validateOutput({ mode: 'sermon', text: 'Fine.', factIds: ['aim.1'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('mode') })
    expect(validateOutput({ mode: 'observation', text: Array.from({ length: 61 }, () => 'word').join(' '), factIds: ['aim.1'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('61 words') })
  })

  it('grounds a time and a count as written', () => {
    expect(numbersIn('At 20:00, 3 days and +7 on 5 naps')).toEqual(['20:00', '3', '7', '5'])
    expect(numberGrounded('20:00', sheet, ['aim.1'])).toBe(true)
    expect(numberGrounded('5', sheet, ['assoc.napped'])).toBe(true)
    expect(numberGrounded('5', sheet, ['aim.1'])).toBe(false)
  })
})

describe('the one tap a line may offer, and the week in three parts', () => {
  const withMore: FactSheet = {
    ...sheet,
    facts: [...sheet.facts, { id: 'cadence', tags: [], text: '', values: { w3: 18, w2: 19, w1: 17, w0: 6, depth: 'full', lowDemand: 0 } }, { id: 'untested', tags: [], text: '', values: { moves: 'walk-ten,cyclic-sigh', count: 2 } }],
  }

  it('allows an action only when the sheet makes it possible', () => {
    expect(validateAction(null, withMore)).toEqual({ ok: true, value: null })
    expect(validateAction(undefined, withMore)).toEqual({ ok: true, value: null })
    expect(validateAction({ kind: 'plan', aimId: 1, cue: 'afterBedtime' }, withMore)).toEqual({ ok: true, value: { kind: 'plan', aimId: 1, cue: 'afterBedtime' } })
    expect(validateAction({ kind: 'plan', aimId: 9, cue: 'afterBedtime' }, withMore).ok).toBe(false)
    expect(validateAction({ kind: 'plan', aimId: 1, cue: 'atDawn' }, withMore).ok).toBe(false)
    expect(validateAction({ kind: 'depth', value: 'short' }, withMore).ok).toBe(true)
    expect(validateAction({ kind: 'depth', value: 'short' }, sheet).ok).toBe(false)
    expect(validateAction({ kind: 'test', moveId: 'walk-ten' }, withMore).ok).toBe(true)
    expect(validateAction({ kind: 'test', moveId: 'nap-ten' }, withMore).ok).toBe(false)
    expect(validateAction({ kind: 'delete-everything' }, withMore).ok).toBe(false)
    const v = validateOutput({ mode: 'strategy', text: 'French waited 3 days. Pin it to a moment today.', factIds: ['aim.1'], cardIds: [], action: { kind: 'plan', aimId: 1, cue: 'afterBedtime' } }, withMore, library)
    expect(v).toMatchObject({ ok: true, value: { action: { kind: 'plan', aimId: 1 } } })
    expect(validateOutput({ mode: 'strategy', text: 'Pin it.', factIds: ['aim.1'], cardIds: [], action: { kind: 'plan', aimId: 9, cue: 'afterBedtime' } }, withMore, library)).toMatchObject({ ok: false, reason: expect.stringContaining('aim.9') })
  })

  it('holds each part of the review to the rules of a line', () => {
    expect(validateReview({ held: 'French waited 3 days and then moved.', didNot: 'Nothing else stalled.', change: 'Keep the cue at 20:00.', factIds: ['aim.1'], cardIds: [] }, withMore, library).ok).toBe(true)
    expect(validateReview({ held: 'Fine.', didNot: 'A lazy week.', change: 'Fine.', factIds: ['aim.1'], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: expect.stringContaining('didNot') })
    expect(validateReview({ held: 'Fine.', didNot: 'Fine.', change: '', factIds: ['aim.1'], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: 'change: no text' })
    expect(validateReview({ held: 'Read 99.', didNot: 'Fine.', change: 'Fine.', factIds: ['aim.1'], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: expect.stringContaining('99') })
    expect(validateReview({ held: 'Fine.', didNot: 'Fine.', change: 'Fine.', factIds: [], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: 'no fact cited' })
  })
})

describe('the guard every writer inherits: the day a line is for, and names kept private', () => {
  const day = (id: string, v: Record<string, string | number | null>) => ({ id, tags: [], text: '', values: v })
  const friday = day('week.today', { weekday: 'Friday', daycare: 1, pickup: '17:30', office: 0, church: 0, studyNight: 0 })
  const saturday = day('week.tomorrow', { day: '2026-09-19', weekday: 'Saturday', daycare: 0, pickup: null, office: 0, church: 0, studyNight: 0 })
  const base: FactSheet = { version: 1, day: '2026-09-18', builtAt: '', hour: 22, weeks: 3, days: 22, direction: null, said: [], facts: [friday, saturday] }

  it('reads the shape of the day written for: its own day, or tomorrow when the sheet is the day before', () => {
    expect(shapeFor(base, '2026-09-18')).toMatchObject({ weekday: 'Friday', daycare: true, pickup: '17:30' })
    expect(shapeFor(base, '2026-09-19')).toMatchObject({ weekday: 'Saturday', daycare: false })
    expect(shapeFor(base, '2026-09-20')).toBeNull()
  })

  it('refuses pickup on a day without one, allows it on a day with one, and refuses it when the day is unknown', () => {
    expect(dayGuard('After picking up your child, do a short pleasant task.', base, '2026-09-19')).toBe('speaks of pickup or daycare, which Saturday 2026-09-19 does not hold')
    expect(dayGuard('After pickup, one short sitting.', base, '2026-09-18')).toBeNull()
    expect(dayGuard('After pickup, one short sitting.', base, '2026-09-20')).toMatch(/does not know the shape of 2026-09-20/)
    expect(dayGuard('Pick up the thread with one short sitting after her bedtime.', base, '2026-09-19')).toBeNull()
  })

  it('refuses a study night on any day, even a preferred study day: that engine is retired (Workstream 6, D5)', () => {
    const preferred: FactSheet = { ...base, facts: [{ ...friday, values: { ...friday.values, studyNight: 1 } }, saturday] }
    expect(dayGuard('Tonight is a study night: ten minutes.', preferred, '2026-09-18')).toBe('speaks of a study night, which Friday 2026-09-18 does not hold')
    expect(dayGuard('Ten minutes of the current skill, whenever it suits.', preferred, '2026-09-18')).toBeNull()
  })

  it('refuses a claim that people are around on a day whose shape puts nobody there', () => {
    expect(dayGuard('Talk to someone in person this afternoon.', base, '2026-09-19')).toBe('speaks of people around, which Saturday 2026-09-19 does not hold')
    expect(dayGuard('Talk to someone in person this afternoon.', base, '2026-09-18')).toBeNull()
    expect(dayGuard('Ask a colleague one question.', base, '2026-09-18')).toBe('speaks of the office, which Friday 2026-09-18 does not hold')
    expect(dayGuard('Message one friend now.', base, '2026-09-19')).toBeNull()
  })

  it('refuses a private item by name while its names stay on the Private screen, and lets it stand when shown', () => {
    const withItem: FactSheet = { ...base, facts: [...base.facts, { id: 'private.3', tags: [], text: '', values: { name: 'Late screens' } }] }
    expect(dayGuard('Late screens kept the mornings lower.', withItem, '2026-09-18')).toBe('names a private item while "Show private items by name outside this screen" is off')
    expect(dayGuard('Late screens kept the mornings lower.', { ...withItem, showPrivate: true }, '2026-09-18')).toBeNull()
  })

  it('holds the line and each part of the review to it, and says why for the retry', () => {
    expect(validateOutput({ mode: 'recommendation', text: 'After pickup, one short sitting.', factIds: ['week.today'], cardIds: [] }, base, library, 60, '2026-09-19')).toMatchObject({ ok: false, reason: 'speaks of pickup or daycare, which Saturday 2026-09-19 does not hold' })
    expect(validateOutput({ mode: 'recommendation', text: 'After pickup, one short sitting.', factIds: ['week.today'], cardIds: [] }, base, library, 60, '2026-09-18').ok).toBe(true)
    expect(validateReview({ held: 'Fine.', didNot: 'Fine.', change: 'Talk to someone in person on Saturday.', factIds: ['week.today'], cardIds: [] }, base, library, '2026-09-19')).toMatchObject({ ok: false, reason: 'change: speaks of people around, which Saturday 2026-09-19 does not hold' })
  })
})

describe('what the writer said it lacked (Part 34)', () => {
  it('keeps known ids, each once, at most three, and drops everything else', () => {
    expect(lackedOf(['workoutDetail', 'x', 'workoutDetail', 'notes'])).toEqual(['workoutDetail', 'notes'])
    expect(lackedOf(['longerRecord', 'workoutDetail', 'sleepDetail', 'dayPlans'])).toEqual(['longerRecord', 'workoutDetail', 'sleepDetail'])
    expect(lackedOf('notes')).toEqual([])
    expect(lackedOf(undefined)).toEqual([])
    expect(lackedOf([1, null, { id: 'notes' }])).toEqual([])
  })
})

describe('how Life Mirror is used, as evidence and never an explanation (Follow-up F1)', () => {
  const usage: FactSheet = {
    ...sheet,
    facts: [
      ...sheet.facts,
      { id: 'usage.line', tags: [], text: 'The line’s one tap: offered on 5 of the 7 days to yesterday, taken on 2 of them. Why under the line: opened 4 times.', values: { days: 7, offered: 5, taken: 2, why: 4 } },
      { id: 'usage.screens', tags: [], text: 'Screens in the 28 days to yesterday: opened most, Now 40; opened once or twice, the Evidence screen 1.', values: { days: 28, often: 'Now 40', rarely: 'the Evidence screen 1', never: '', neverDays: 56 } },
    ],
  }
  const line = (text: string, factIds = ['usage.screens']) => validateOutput({ mode: 'observation', text, factIds, cardIds: [] }, usage, library)

  it('gives Claude a switch of its own, on until turned off, and keeps its access gated while the reliability checks run', () => {
    expect(BRAIN_SWITCHES).toContain('usage')
    expect(readBrainPrefs({ switches: { usage: false } }).switches).toEqual({ usage: false })
    // Opening it changes the monitored prompts: only at the owner's word, once monitoring is complete.
    expect(USAGE_TO_CLAUDE).toBe('gated')
  })

  it('lets a line say what was observed, and offer a reason about the app only as a possibility to test', () => {
    expect(line('The Evidence screen was opened once in the 28 days to yesterday.').ok).toBe(true)
    expect(line('The Evidence screen was opened once in 28 days; it may sit too far down to find.').ok).toBe(true)
    expect(line('Why under the line was opened 4 times in 7 days: worth testing whether the line says enough.', ['usage.line']).ok).toBe(true)
  })

  it('refuses a reason stated as fact, and a verdict on the person, hedged or not', () => {
    expect(line('The Evidence screen was opened once in 28 days because you avoid looking at it.')).toMatchObject({ ok: false, reason: 'gives a reason for how the app was used as a fact; say what was observed, or offer a reason as a possibility to test' })
    expect(line('You ignored the Evidence screen: opened once in 28 days.').ok).toBe(false)
    expect(line('The Evidence screen was opened once in 28 days; the Now screen caused that.').ok).toBe(false)
    expect(line('The Evidence screen was opened once in 28 days; you lack motivation.')).toMatchObject({ ok: false, reason: 'passes a verdict on the person from how the app was used; say what was observed' })
    expect(line('The Evidence screen was opened once in 28 days; you may not care about it.').ok).toBe(false)
    expect(line('The Evidence screen was opened once in 28 days; perhaps you gave up on it.').ok).toBe(false)
  })

  it('holds a count to the fact it cites, as every line is', () => {
    expect(line('The Evidence screen was opened 3 times in 28 days.')).toEqual({ ok: false, reason: 'the number 3 is not in the cited facts' })
  })

  it('leaves every line that cites no usage fact as it was', () => {
    const plain = validateOutput({ mode: 'observation', text: 'Yesterday evening read 62 because the day was calm.', factIds: ['reading.2026-09-17.evening'], cardIds: [] }, usage, library)
    expect(plain.ok).toBe(true)
  })

  it('holds a writer given usage without citing it to the same rule once it speaks of that use (the coach)', () => {
    expect(usageTalkRefusal('Since you keep opening Change without choosing, this one is short.')).not.toBeNull()
    expect(usageTalkRefusal('Opened Change 3 times; this one may suit the afternoon better.')).toBeNull()
    expect(usageTalkRefusal('A short hello, because the afternoon is busy.')).toBeNull()
  })
})
