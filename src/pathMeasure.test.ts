import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { activeStrands, calibration, checkDue, checksDue, maintenanceOf, readGate, shows, strandsAfterTap, twoNumbers, viewOf, weekOf, type Behaviour, type MeasuredRep, type StageGate } from './pathMeasure'

// The measurement layer, its pure part (P2, 2026-11-06): your own behaviours, never anyone's reaction.
// A rep meets a stage's behaviours by its best view; the gate needs such reps on separate weeks, some
// confirmed from outside the moment, in enough kinds of setting; a stage shown is checked again later;
// and your own checks sit beside an outside view as counts.

const B: Behaviour[] = [
  { id: 'opening', words: 'A clear opening', theirs: 'A clear opening' },
  { id: 'pauses', words: 'Pauses between ideas', theirs: 'Pauses between ideas' },
  { id: 'example', words: 'One example', theirs: 'One example' },
  { id: 'ending', words: 'A clean ending', theirs: 'A clean ending' },
]
const GATE: StageGate = { strand: 'speak', stage: 1, met: 3, weeks: 2, confirmed: 1, kinds: 2 }
const DAY = '2026-11-06'
let id = 0
const rep = (day: string, extra: Partial<MeasuredRep> = {}): MeasuredRep => ({ offerId: ++id, moveId: 'r', day, setting: 'group', outcome: 'done', ...extra })
const three = ['opening', 'pauses', 'example']

describe('a rep’s view of the behaviours', () => {
  it('takes the outside view when there is one, else yours right after, counting only the strand’s behaviours', () => {
    expect(viewOf({ checks: three }, B)).toEqual({ met: 3, outside: false })
    expect(viewOf({ checks: three, recordingChecks: ['opening'] }, B)).toEqual({ met: 3, outside: false })
    expect(viewOf({ checks: ['opening'], otherChecks: three }, B)).toEqual({ met: 3, outside: true })
    expect(viewOf({ checks: [...three, 'not-a-behaviour', 'also-not'] }, B).met).toBe(3)
  })

  it('counts two reps in one week as one week, Monday to Sunday', () => {
    expect(weekOf('2026-11-06')).toBe('2026-11-02')
    expect(weekOf('2026-11-08')).toBe('2026-11-02')
    expect(weekOf('2026-11-09')).toBe('2026-11-09')
  })
})

describe('a stage’s gate', () => {
  it('holds once reps meeting the behaviours fall on enough weeks, one confirmed from outside, in enough kinds of setting', () => {
    const reps = [rep(addDays(DAY, -14), { checks: three }), rep(addDays(DAY, -7), { checks: three, setting: 'oneToOne' }), rep(addDays(DAY, -2), { checks: ['opening'], recordingChecks: three })]
    const g = readGate(GATE, B, reps, null, DAY)
    expect(g).toMatchObject({ metOn: addDays(DAY, -2), weeks: 3, confirmed: 1, kinds: 2, attempts: 3 })
  })

  it('does not hold on your own checks alone, in one week, in one kind of setting, or below the behaviours it asks', () => {
    const own = [rep(addDays(DAY, -14), { checks: three }), rep(addDays(DAY, -7), { checks: three, setting: 'oneToOne' })]
    expect(readGate(GATE, B, own, null, DAY).metOn).toBeNull()
    const oneWeek = [rep('2026-11-02', { checks: three }), rep('2026-11-04', { otherChecks: three, setting: 'oneToOne' })]
    expect(readGate(GATE, B, oneWeek, null, DAY).metOn).toBeNull()
    const oneKind = [rep(addDays(DAY, -14), { checks: three }), rep(addDays(DAY, -2), { otherChecks: three })]
    expect(readGate(GATE, B, oneKind, null, DAY).metOn).toBeNull()
    const two = [rep(addDays(DAY, -14), { checks: ['opening', 'pauses'] }), rep(addDays(DAY, -2), { otherChecks: ['opening', 'pauses'], setting: 'oneToOne' })]
    expect(readGate(GATE, B, two, null, DAY).metOn).toBeNull()
  })

  it('reads only done reps from the day the stage was reached, and counts every checked rep as an attempt', () => {
    const before = [rep(addDays(DAY, -30), { otherChecks: three }), rep(addDays(DAY, -28), { checks: three, setting: 'oneToOne' })]
    expect(readGate(GATE, B, before, addDays(DAY, -20), DAY)).toMatchObject({ metOn: null, attempts: 0 })
    const partly = [rep(addDays(DAY, -14), { checks: three, outcome: 'partly' }), rep(addDays(DAY, -2), { otherChecks: three, setting: 'oneToOne' })]
    expect(readGate(GATE, B, partly, null, DAY).metOn).toBeNull()
  })
})

describe('a stage shown, checked again', () => {
  const plan = { at: [30, 90], every: 180 }
  it('is due a month later, three months later, then every six months', () => {
    const shown = '2026-01-01'
    expect(checksDue(shown, plan, '2026-12-31')).toEqual([addDays(shown, 30), addDays(shown, 90), addDays(shown, 270), addDays(shown, 450)])
  })

  it('holds while each check is met, and brings the stage back when one is missed past the grace or not met', () => {
    const shown = addDays(DAY, -100)
    const met = [rep(addDays(shown, 31), { checks: three }), rep(addDays(shown, 92), { checks: three })]
    expect(maintenanceOf(shown, GATE, B, met, plan, DAY)).toEqual({ kind: 'holding', next: addDays(shown, 270) })
    expect(maintenanceOf(shown, GATE, B, [met[0]], plan, DAY)).toEqual({ kind: 'holding', next: addDays(shown, 90) })
    expect(maintenanceOf(shown, GATE, B, [met[0]], plan, addDays(shown, 90 + 15))).toEqual({ kind: 'refresh', since: addDays(shown, 90) })
    const notMet = [rep(addDays(shown, 31), { checks: ['opening'] })]
    expect(maintenanceOf(shown, GATE, B, notMet, plan, DAY)).toEqual({ kind: 'refresh', since: addDays(shown, 31) })
    // A later rep that meets it again holds the stage once more.
    expect(maintenanceOf(shown, GATE, B, [...notMet, rep(addDays(shown, 40), { checks: three }), met[1]], plan, DAY).kind).toBe('holding')
  })
})

describe('the strands on', () => {
  it('are those you chose, else every strand but the one a yes at the start opens', () => {
    const path = { strands: [{ id: 'talk' }, { id: 'speak' }, { id: 'nerves' }] as never, start: { opens: 'nerves' } as never }
    expect(activeStrands(path, {})).toEqual(['talk', 'speak'])
    expect(activeStrands(path, { strands: ['nerves', 'gone'] })).toEqual(['nerves'])
    expect(activeStrands({ strands: path.strands, start: undefined }, {})).toEqual(['talk', 'speak', 'nerves'])
  })
})

describe('two numbers, never one', () => {
  it('keeps practice apart from what is shown, and your checks beside an outside view as counts', () => {
    const reps = [rep(addDays(DAY, -9), { checks: three }), rep(addDays(DAY, -5), { outcome: 'partly' }), rep(addDays(DAY, -3), { checks: three, setting: 'oneToOne' }), rep(addDays(DAY, -1), { outcome: 'no' })]
    expect(twoNumbers(GATE, B, reps, reps)).toEqual({ practised: 3, shownIn: 2, of: 2 })
    expect(calibration([{ checks: ['opening'], otherChecks: three }, { checks: three, recordingChecks: ['opening', 'pauses'] }, { checks: three }], B)).toEqual({ reps: 2, yours: 4, outside: 5 })
  })
})

// Round 1 of the known-answer test (P5): a gate names what its stage is for; a strand that waits is off until you
// turn it on and pauses what it names; the app's own private check is open monthly while its strand is on.
describe('a gate that names what its stage is for', () => {
  const NAMED: StageGate = { ...GATE, confirmed: 0, kinds: 1, requires: ['ending'] }
  it('counts a rep only when its best view shows each required behaviour', () => {
    expect(shows({ checks: three }, NAMED, B)).toBe(false)
    expect(shows({ checks: [...three, 'ending'] }, NAMED, B)).toBe(true)
    // The best view is the one that counts: an outside view without the ending does not show it, whatever you checked.
    expect(shows({ checks: ['opening', 'ending'], recordingChecks: three }, NAMED, B)).toBe(false)
    const r = readGate(NAMED, B, [rep('2026-11-02', { checks: three }), rep('2026-11-09', { checks: three })], null, '2026-11-10')
    expect(r.metOn).toBeNull()
    expect(readGate(NAMED, B, [rep('2026-11-02', { checks: ['opening', 'pauses', 'ending'] }), rep('2026-11-09', { checks: ['example', 'pauses', 'ending'] })], null, '2026-11-10').metOn).toBe('2026-11-09')
    // Without `requires`, any three, exactly as before.
    expect(readGate({ ...NAMED, requires: undefined }, B, [rep('2026-11-02', { checks: three }), rep('2026-11-09', { checks: three })], null, '2026-11-10').metOn).toBe('2026-11-09')
  })
})

describe('a strand that waits', () => {
  const path = { strands: [{ id: 'meet', name: 'Meeting', what: '', stages: [] }, { id: 'together', name: 'Together', what: '', stages: [], waits: true, pauses: ['meet'] }, { id: 'nerves', name: 'Nerves', what: '', stages: [] }], start: { questions: [], help: '', opens: 'nerves', focus: [] } }
  it('is off until you turn it on, as the strand a yes opens is', () => {
    expect(activeStrands(path, {})).toEqual(['meet'])
    expect(activeStrands(path, { strands: ['together'] })).toEqual(['together'])
  })
  it('pauses the strands it names while it is on, and brings them back when it goes off', () => {
    expect(strandsAfterTap(path, ['meet', 'nerves'], 'together')).toEqual(['together', 'nerves'])
    expect(strandsAfterTap(path, ['together', 'nerves'], 'together')).toEqual(['meet', 'nerves'])
    // A strand without pauses turns on and off alone; the last one on never goes off.
    expect(strandsAfterTap(path, ['meet'], 'nerves')).toEqual(['meet', 'nerves'])
    expect(strandsAfterTap(path, ['meet'], 'meet')).toEqual([])
  })
  it('opens the app’s own private check monthly while its strand is on', () => {
    const checked = { ...path, check: { strand: 'together', name: 'A monthly private check', questions: [], help: '' } }
    expect(checkDue(checked, {}, DAY)).toBe(false)
    expect(checkDue(checked, { strands: ['together'] }, DAY)).toBe(true)
    expect(checkDue(checked, { strands: ['together'], checkedMonth: '2026-11' }, DAY)).toBe(false)
    expect(checkDue(checked, { strands: ['together'], checkedMonth: '2026-10' }, DAY)).toBe(true)
  })
})
