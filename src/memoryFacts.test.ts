import { describe, expect, it } from 'vitest'
import type { Aim, BrainBrief, BriefFeedback, BriefLog, CheckIn, DayContext, Intention, Outcome } from './db'
import { MEMORY_DAYS, memoryFacts, type MemoryInput } from './memoryFacts'

// The Brain with a memory (stage 3, group 1): one fact for each line seen in the 30 days before today,
// with what it asked, whether the tap was taken, whether the plan was kept, how it went and how it
// landed, from the phone's own record; a faith practice in the general form; no words of the line.

const TODAY = '2026-10-20'
const at = (day: string, h: number, m = 0) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m).toISOString()
const LEARN: Aim = { id: 3, kind: 'certification', stepMoveId: null, name: 'Veltish', createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null } as Aim
const PRAY: Aim = { id: 5, kind: 'practice', stepMoveId: 'five-minutes-prayer', createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null } as Aim
const SOCIAL: Aim = { id: 4, kind: 'path', path: 'social', stepMoveId: null, createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null } as Aim

/** A phone line, seen at 08:00 on its day unless said otherwise. */
const phone = (id: number, day: string, action: BriefLog['action'], shown: string | null = at(day, 8)): BriefLog => ({ id, day, situationId: 'say-when', mode: 'recommendation', text: 'A line.', factIds: [], cardIds: [], ...(action ? { action } : {}), at: at(day, 7, 30), ...(shown ? { shownAt: shown } : {}) })
const worker = (id: string, day: string, action: BrainBrief['action'], written = at(day, 6)): BrainBrief => ({ id, day, kind: 'brief', text: 'A line.', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: written, action })
const plan = (id: number, aimId: number, day: string, cue: Intention['cue'], offerId: number | null, setAt = at(day, 9)): Intention => ({ id, aimId, day, cue, time: '17:00', setAt, offerId })
const outcome = (offerId: number, day: string, o: Outcome['outcome'], ease?: Outcome['ease']): Outcome => ({ offerId, moveId: 'skill:2', day, block: 'evening', at: at(day, 21), outcome: o, why: null, passiveOutcome: null, ...(ease ? { ease } : {}) })
const checkin = (day: string, h: number, asked: CheckIn['asked']): CheckIn => ({ day, block: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening', asked, startedAt: at(day, h), completedAt: at(day, h, 2), updatedAt: at(day, h, 2), answers: {}, activeMs: 1 })

function input(over: Partial<MemoryInput>): MemoryInput {
  return { today: TODAY, log: [], brainBriefs: [], contexts: [], feedback: [], intentions: [], offers: [], outcomes: [], checkins: [], cards: [], aims: [LEARN, PRAY, SOCIAL], ...over }
}
const one = (over: Partial<MemoryInput>) => {
  const facts = memoryFacts(input(over))
  expect(facts).toHaveLength(1)
  return facts[0]
}

describe('a plan asked for', () => {
  it('made, its step started that day and answered: what was asked, taken, kept, how it went and how it landed', () => {
    const f = one({
      log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 3, cue: 'nextCheckIn' })],
      intentions: [plan(7, 3, '2026-10-18', 'nextCheckIn', 40)],
      outcomes: [outcome(40, '2026-10-18', 'done', 'right')],
      feedback: [{ day: '2026-10-18', briefKey: 'phone:2026-10-18:1', situationId: 'say-when', answer: 'useful', at: at('2026-10-18', 8, 5) } as BriefFeedback],
    })
    expect(f).toEqual({
      id: 'memory.2026-10-18',
      tags: [],
      text: 'The line seen on 2026-10-18 asked for a plan for Veltish at the next check-in: a plan was made that day, and a step was started that day and marked done; it felt about right. It was received as: useful.',
      values: { day: '2026-10-18', ask: 'plan', aimId: 3, cue: 'nextCheckIn', planCue: 'nextCheckIn', taken: 'yes', kept: 'yes', went: 'done', ease: 'right', received: 'useful' },
    })
  })

  it('made for another moment and never started, or never made', () => {
    const other = one({ log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 3, cue: 'afterPickup' })], intentions: [plan(7, 3, '2026-10-18', 'afterBedtime', null)] })
    expect(other.text).toBe('The line seen on 2026-10-18 asked for a plan for Veltish after pickup: a plan was made that day, after her bedtime instead, and no step of it was started that day. It was received as: untapped.')
    expect(other.values).toMatchObject({ taken: 'yes', kept: 'no', cue: 'afterPickup', planCue: 'afterBedtime' })
    const none = one({ log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 3, cue: 'afterPickup' })], intentions: [plan(7, 3, '2026-10-17', 'afterPickup', 40)] })
    expect(none.text).toBe('The line seen on 2026-10-18 asked for a plan for Veltish after pickup: no plan for it was made that day. It was received as: untapped.')
    expect(none.values).toEqual({ day: '2026-10-18', ask: 'plan', aimId: 3, cue: 'afterPickup', taken: 'no', received: 'untapped' })
  })

  it('reads the day’s latest plan alone, and a step left unanswered as not answered, with no ease', () => {
    const f = one({
      log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 3, cue: 'nextCheckIn' })],
      // Replaced the same day: the earlier plan was never one to keep.
      intentions: [plan(7, 3, '2026-10-18', 'afterPickup', null, at('2026-10-18', 9)), plan(8, 3, '2026-10-18', 'nextCheckIn', 41, at('2026-10-18', 10))],
      outcomes: [outcome(41, '2026-10-18', null, 'hard')],
    })
    expect(f.text).toBe('The line seen on 2026-10-18 asked for a plan for Veltish at the next check-in: a plan was made that day, and a step was started that day and not answered. It was received as: untapped.')
    expect(f.values).toMatchObject({ kept: 'yes', went: 'unanswered', ease: null })
  })

  it('names a paused commitment, one no longer kept and the Social path plainly', () => {
    const paused = one({ log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 3, cue: 'nextCheckIn' })], aims: [{ ...LEARN, pausedAt: '2026-10-19T12:00:00.000Z' }] })
    expect(paused.text).toContain('asked for a plan for a commitment now paused at the next check-in')
    const gone = one({ log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 3, cue: 'nextCheckIn' })], aims: [] })
    expect(gone.text).toContain('asked for a plan for a commitment no longer kept')
    expect(gone.values.aimId).toBe(3)
    const path = one({ log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 4, cue: 'nextCheckIn' })] })
    expect(path.text).toContain('asked for a plan for the Social path at the next check-in')
  })

  it('keeps a faith practice in the general form: nothing taken, kept, answered or counted (Rule 10)', () => {
    const f = one({ log: [phone(1, '2026-10-18', { kind: 'plan', aimId: 5, cue: 'nextCheckIn' })], intentions: [plan(7, 5, '2026-10-18', 'nextCheckIn', 40)], outcomes: [outcome(40, '2026-10-18', 'done')] })
    expect(f.text).toBe('The line seen on 2026-10-18 was about the commitment “Five minutes of prayer”, a faith practice: offered, never counted. It was received as: untapped.')
    expect(f.values).toEqual({ day: '2026-10-18', ask: 'plan', aimId: 5, faith: 1, received: 'untapped' })
  })
})

describe('the other asks', () => {
  it('a lighter check-in: taken when the next check-in after it asked the shorter set', () => {
    const line = worker('w1', '2026-10-18', { kind: 'depth', value: 'short' }, '2026-10-17T10:00:00.000Z')
    const contexts = [{ day: '2026-10-18', shown: { 'worker:w1': at('2026-10-18', 8) } } as unknown as DayContext]
    // The morning's check-in at 07:00 came before it was seen; the afternoon's is the next after it.
    const shorter = one({ brainBriefs: [line], contexts, checkins: [checkin('2026-10-18', 7, ['mood', 'energy', 'sleepHours']), checkin('2026-10-18', 13, ['mood', 'energy', 'stress']), checkin('2026-10-18', 19, ['mood'])] })
    expect(shorter.text).toBe('The line seen on 2026-10-18 asked for a lighter check-in: the next check-in after it asked the shorter set. It was received as: untapped.')
    expect(shorter.values).toEqual({ day: '2026-10-18', ask: 'depth', taken: 'yes', received: 'untapped' })
    const full = one({ brainBriefs: [line], contexts, checkins: [checkin('2026-10-18', 13, ['mood', 'energy', 'stress', 'focus'])] })
    expect(full.text).toContain('the next check-in after it still asked the full set')
    expect(full.values.taken).toBe('no')
    const unknown = one({ brainBriefs: [line], contexts, checkins: [checkin('2026-10-16', 13, ['mood'])] })
    expect(unknown.text).toContain('no check-in has followed it yet')
    expect(unknown.values.taken).toBeNull()
  })

  it('a lighter check-in seen later than written: counted from the moment the record says it was first on screen', () => {
    const line = worker('w1', '2026-10-18', { kind: 'depth', value: 'short' }, '2026-10-17T10:00:00.000Z')
    const marked = { day: '2026-10-18', shown: { 'worker:w1': at('2026-10-18', 15) } } as unknown as DayContext
    // The short check-in at 13:00 came before the line was seen; the full one at 19:00 is the next after it.
    const f = one({ brainBriefs: [line], contexts: [marked], checkins: [checkin('2026-10-18', 13, ['mood', 'energy', 'stress']), checkin('2026-10-18', 19, ['mood', 'energy', 'stress', 'focus'])] })
    expect(f.values.taken).toBe('no')
  })

  it('a test: set when a card for its move was made that day', () => {
    const line = phone(1, '2026-10-18', { kind: 'test', moveId: 'walk-ten', reading: 'energy', block: 'afternoon' })
    const set = one({ log: [line], cards: [{ moveId: 'walk-ten', createdAt: at('2026-10-18', 8, 1) }] })
    expect(set.text).toBe('The line seen on 2026-10-18 asked to test A ten-minute walk, now on Energy in the afternoon: the test was set that day. It was received as: untapped.')
    expect(set.values).toEqual({ day: '2026-10-18', ask: 'test', move: 'A ten-minute walk, now', moveId: 'walk-ten', reading: 'Energy', block: 'afternoon', taken: 'yes', received: 'untapped' })
    const later = one({ log: [line], cards: [{ moveId: 'walk-ten', createdAt: at('2026-10-19', 8) }, { moveId: 'green-walk', createdAt: at('2026-10-18', 9) }] })
    expect(later.text).toContain('no test of it was set that day')
  })

  it('nothing to tap, with the tap on the line', () => {
    const f = one({ log: [phone(1, '2026-10-18', undefined)], feedback: [{ day: '2026-10-18', briefKey: 'phone:2026-10-18:1', situationId: 'say-when', answer: 'knew', at: at('2026-10-18', 9) } as BriefFeedback] })
    expect(f).toEqual({ id: 'memory.2026-10-18', tags: [], text: 'The line seen on 2026-10-18 asked for nothing to tap. It was received as: knew.', values: { day: '2026-10-18', ask: 'nothing', received: 'knew' } })
  })
})

describe('which lines it remembers', () => {
  it('the lines seen in the 30 days before today, latest first, a day’s second line numbered', () => {
    expect(MEMORY_DAYS).toBe(30)
    const facts = memoryFacts(
      input({
        log: [phone(1, '2026-09-19', undefined), phone(2, '2026-09-20', undefined), phone(3, '2026-10-19', undefined, at('2026-10-19', 8)), phone(4, '2026-10-20', undefined)],
        brainBriefs: [worker('w2', '2026-10-19', null, '2026-10-16T10:00:00.000Z')],
        contexts: [{ day: '2026-10-19', shown: { 'worker:w2': at('2026-10-19', 12) } } as unknown as DayContext],
      }),
    )
    // 09-19 is 31 days back and today's line is today's: neither is remembered.
    expect(facts.map((f) => f.id)).toEqual(['memory.2026-10-19.2', 'memory.2026-10-19', 'memory.2026-09-20'])
  })

  it('never a line that was not seen, the phone’s or the Worker’s', () => {
    const facts = memoryFacts(
      input({
        // Logged after the phone began marking its own line shown, and never marked.
        log: [phone(1, '2026-10-18', undefined, null), { ...phone(2, '2026-10-18', undefined), situationId: null }],
        // Written after the phone began marking the Worker's lines, and never marked; a review is no line.
        brainBriefs: [worker('w1', '2026-10-18', null, '2026-10-18T10:00:00.000Z'), { ...worker('w2', '2026-10-18', null), kind: 'review' }],
        contexts: [{ day: '2026-10-18', shown: { 'worker:w2': at('2026-10-18', 9) } } as unknown as DayContext],
      }),
    )
    expect(facts).toEqual([])
  })
})
