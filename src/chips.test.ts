import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { chipStates } from './audit'
import { chipAnswer } from './chips'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const mk = (day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn => ({
  day,
  block,
  answers: allAt(blockReadings(block), p),
  startedAt: '',
  completedAt: 'x',
  updatedAt: '',
  activeMs: 30_000,
  extras,
})

describe('the evening chips, answered from the record like for like', () => {
  it('says first time recorded when the record has none', () => {
    expect(chipAnswer([], 'nothingLanded', '2026-09-11').times).toBe(0)
    const todayOnly = [mk('2026-09-11', 'evening', 3, { nothingLanded: true })]
    expect(chipAnswer(todayOnly, 'nothingLanded', '2026-09-11').times).toBe(0)
  })

  it('counts earlier evenings with the chip and sets the mornings after against the mornings after evenings that started the same', () => {
    const all = [
      mk('2026-09-01', 'evening', 2, { nothingLanded: true }),
      mk('2026-09-02', 'morning', 4),
      mk('2026-09-02', 'evening', 2),
      mk('2026-09-03', 'morning', 2),
      mk('2026-09-05', 'evening', 1, { nothingLanded: true }),
      mk('2026-09-06', 'morning', 4),
      mk('2026-09-06', 'evening', 4),
      mk('2026-09-08', 'evening', 1, { hardToSeePoint: true }),
    ]
    const a = chipAnswer(all, 'nothingLanded', '2026-09-11')
    expect(a.times).toBe(2)
    expect(a.withEvent.n).toBe(2)
    // Every reading at one position scores 50: three ingredients read up, three read down.
    expect(a.withEvent.mean).toBe(50)
    expect(a.without.n).toBe(1)
    // The one comparison evening (09-02, all at 2) started in the same band as 09-01 (all at 2): a matched difference of zero.
    expect(a.bands).toBe(1)
    expect(a.diff).toBe(0)
    const b = chipAnswer(all, 'hardToSeePoint', '2026-09-11')
    expect(b.times).toBe(1)
    expect(b.withEvent.n).toBe(0)
    expect(b.withEvent.mean).toBeNull()
    expect(chipAnswer(all, 'coolingOff', '2026-09-11').times).toBe(0)
  })
})

describe('the Caffeine item retires by the check-ins it was shown in', () => {
  it('counts only windows where it was on screen, any block, and a single band keeps it', () => {
    const shown = Array.from({ length: 31 }, (_, i) => mk('2026-08-' + String(i + 1).padStart(2, '0'), i % 2 ? 'morning' : 'afternoon', 3, { caffeineShown: true }))
    const states = chipStates(shown, [], {}, '2026-09-01')
    expect(states.find((s) => s.id === 'caffeine')).toMatchObject({ evenings: 31, retired: true })
    // Windows it was never shown in count for nothing: silence is not evidence.
    const unseen = Array.from({ length: 31 }, (_, i) => mk('2026-08-' + String(i + 1).padStart(2, '0'), 'morning', 3))
    expect(chipStates(unseen, [], {}, '2026-09-01').find((s) => s.id === 'caffeine')).toMatchObject({ evenings: 0, retired: false })
    const once = shown.map((c, i) => (i === 29 ? { ...c, extras: { ...c.extras, caffeineIntake: { band: 2 as const, at: '2026-08-30T08:00:00.000Z', since: null } } } : c))
    expect(chipStates(once, [], {}, '2026-09-01').find((s) => s.id === 'caffeine')?.retired).toBe(false)
  })
})

describe('the chips added in stage 3, item 5, compared only where shown (Rule 2)', () => {
  // Twelve evenings from before Outside a while today existed, then six that showed it: three tapped, three left.
  const before = Array.from({ length: 12 }, (_, i) => [mk(`2026-08-${String(i + 1).padStart(2, '0')}`, 'evening', 3), mk(`2026-08-${String(i + 2).padStart(2, '0')}`, 'morning', 3)]).flat()
  const shown = (day: string, outside: boolean): CheckIn[] => [mk(`2026-09-${day}`, 'evening', 3, { chipsShown: { outside: true }, ...(outside ? { outside: true as const } : {}) }), mk(`2026-09-${String(Number(day) + 1).padStart(2, '0')}`, 'morning', outside ? 4 : 2)]
  const after = [...shown('01', true), ...shown('03', false), ...shown('05', true), ...shown('07', false), ...shown('09', true), ...shown('11', false)]

  it('sets the evenings that showed it against each other alone, never the evenings before it existed', () => {
    const a = chipAnswer([...before, ...after], 'outside', '2026-09-20')
    expect(a.times).toBe(3)
    expect(a.without.n).toBe(3)
    // The probe that could have said yes: read as shown, the twelve earlier evenings join the side without.
    const asShown = before.map((c) => (c.block === 'evening' ? { ...c, extras: { chipsShown: { outside: true as const } } } : c))
    expect(chipAnswer([...asShown, ...after], 'outside', '2026-09-20').without.n).toBe(15)
  })

  it('leaves the chips from before item 5 as they always were, every evening on one side or the other', () => {
    const napped = [...before, mk('2026-09-01', 'evening', 3, { napped: true }), mk('2026-09-02', 'morning', 3)]
    expect(chipAnswer(napped, 'napped', '2026-09-20').without.n).toBe(12)
  })
})

describe('last night, in the morning’s brief, for a chip added in stage 3, item 5 (Rule 2)', () => {
  it('sets it only against the evenings that showed it', async () => {
    const { db } = await import('./db')
    const { briefData } = await import('./forecastFlow')
    await db.delete()
    await db.open()
    /** A check-in at a level: the readings that read up at one end, the ones that read down at the other (0 or 100). */
    const at = (day: string, block: CheckIn['block'], high: boolean, extras?: CheckIn['extras']): CheckIn => {
      const c = mk(day, block, 3, extras)
      const answers = { ...c.answers }
      for (const id of Object.keys(answers) as ReadingId[]) if (['mood', 'energy', 'focus'].includes(id)) answers[id] = high ? 5 : 1
      for (const id of Object.keys(answers) as ReadingId[]) if (['stress', 'overwhelm', 'irritation'].includes(id)) answers[id] = high ? 1 : 5
      return { ...c, answers }
    }
    // Ten evenings from before Outside a while today existed, every morning after them high; then six that showed it,
    // three tapped and followed by a high morning, three left and followed by a low one; last night tapped.
    const before = Array.from({ length: 10 }, (_, i) => [mk(`2026-08-${String(i + 1).padStart(2, '0')}`, 'evening', 3), at(`2026-08-${String(i + 2).padStart(2, '0')}`, 'morning', true)]).flat()
    const shown = [1, 3, 5, 7, 9, 11].flatMap((d) => [mk(`2026-09-${String(d).padStart(2, '0')}`, 'evening', 3, { chipsShown: { outside: true }, ...(d % 4 === 1 ? { outside: true as const } : {}) }), at(`2026-09-${String(d + 1).padStart(2, '0')}`, 'morning', d % 4 === 1)])
    const lastNight = [mk('2026-09-14', 'evening', 3, { chipsShown: { outside: true }, outside: true })]
    await db.checkins.bulkAdd([...before, ...shown, ...lastNight])
    const brief = await briefData('2026-09-15')
    expect(brief.lastNight?.key).toBe('outside')
    // Four evenings carried it, last night among them; three have a morning after.
    expect(brief.lastNight?.n).toBe(4)
    // Without it: the three evenings that showed it and were left, every morning after them low; never the ten high
    // mornings after evenings from before it existed.
    expect(brief.lastNight?.with).toBe(100)
    expect(brief.lastNight?.without).toBe(0)
  })
})
