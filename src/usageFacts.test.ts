import { describe, expect, it } from 'vitest'
import { USAGE_REASON, USAGE_VERDICT, usageRefusal } from './brainShared'
import type { Aim, BrainBrief, BriefLog, CoachPick, Intention, Offer, Outcome, UseKind, UseRow } from './db'
import type { Fact } from './factTypes'
import { summarizeUse, usageFacts, type UseInput } from './usageFacts'

// Follow-up F1: how Life Mirror is used, as the day's sheet counts it. Windows end yesterday and
// reach back only to when counting began; screens and moves other switches govern are never named;
// no time, no content; what was observed, never why.

const TODAY = '2026-10-20'
const row = (day: string, kind: UseKind, what?: string, hh = 10): UseRow => ({ day, at: `${day}T${String(hh).padStart(2, '0')}:00:00.000Z`, kind, ...(what ? { what } : {}) })
const times = (n: number, day: string, kind: UseKind, what?: string): UseRow[] => Array.from({ length: n }, (_, k) => row(day, kind, what, 8 + k))
const input = (over: Partial<UseInput> = {}): UseInput => ({ rows: [], briefs: [], log: [], picks: [], offers: [], outcomes: [], intentions: [], aims: [], ...over })
/** The log began long before the windows. */
const began = row('2026-08-01', 'screen', 'now')
const byId = (facts: readonly Fact[], id: string) => facts.find((f) => f.id === id)
const offer = (id: number, day: string, moveId: string, skipped: boolean, kind: Offer['kind'] = 'block', over: Partial<Offer> = {}): Offer => ({ id, kind, day, block: 'afternoon', at: `${day}T15:00:00.000Z`, situationKey: 'x', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, skippedAt: skipped ? `${day}T15:05:00.000Z` : null, closedAt: null, ...over }) as Offer
const aim = (id: number, over: Partial<Aim>): Aim => ({ id, kind: 'certification', stepMoveId: null, createdAt: '2026-08-01T10:00:00.000Z', archivedAt: null, ...over }) as Aim
const plan = (aimId: number, day: string, offerId: number | null): Intention => ({ aimId, day, cue: 'nextCheckIn', time: '19:00', setAt: `${day}T12:00:00.000Z`, offerId })

describe('the windows', () => {
  it('end yesterday: today is never counted, and a week is the seven whole days before it', () => {
    const rows = [began, ...times(2, '2026-10-19', 'checkinOpened', 'evening'), row('2026-10-13', 'checkinOpened', 'morning'), row('2026-10-12', 'checkinOpened', 'morning'), ...times(5, TODAY, 'checkinOpened', 'morning'), row('2026-10-19', 'checkinLeft', 'evening')]
    expect(byId(usageFacts(input({ rows }), TODAY), 'usage.checkins')).toEqual({ id: 'usage.checkins', tags: [], text: 'Check-ins in the 7 days to yesterday: opened 3 times, 1 of them left before the end.', values: { days: 7, opened: 3, left: 1 } })
  })

  it('reach back only to when counting began, and say so: silence before it is not a count of nothing', () => {
    const rows = [row('2026-10-18', 'checkinOpened', 'morning'), row('2026-10-19', 'checkinOpened', 'evening')]
    const facts = usageFacts(input({ rows }), TODAY)
    expect(byId(facts, 'usage.checkins')?.text).toBe('Check-ins in the 2 days counted so far, to yesterday: opened 2 times, 0 of them left before the end.')
    for (const f of facts) expect(f.text).not.toMatch(/\b(7|28|56) days\b/)
  })

  it('write nothing from the log while counting began only today', () => {
    const facts = usageFacts(input({ rows: times(4, TODAY, 'screen', 'now') }), TODAY)
    expect(facts.map((f) => f.id)).toEqual([])
  })

  it('count Life Mirror opened from the day that began to be recorded, not the log’s first day', () => {
    const rows = [began, row('2026-10-17', 'appOpened', 'launch', 8), row('2026-10-17', 'appOpened', 'return', 12), row('2026-10-19', 'appOpened', 'launch', 8), row('2026-10-19', 'appOpened', 'return', 20), row(TODAY, 'appOpened', 'launch')]
    expect(byId(usageFacts(input({ rows }), TODAY), 'usage.opened')).toEqual({ id: 'usage.opened', tags: [], text: 'Life Mirror itself: opened on 2 of the 3 days counted so far, to yesterday, 4 times in all.', values: { days: 3, openDays: 2, opens: 4 } })
    const long = [began, row('2026-09-01', 'appOpened', 'launch'), ...times(2, '2026-09-25', 'appOpened', 'launch'), ...times(3, '2026-10-15', 'appOpened', 'launch'), row('2026-10-19', 'appOpened', 'launch')]
    expect(byId(usageFacts(input({ rows: long }), TODAY), 'usage.opened')?.text).toBe('Life Mirror itself: opened on 2 of the 7 days to yesterday, 4 times in all; on 3 of the 28 days to yesterday, 6 times.')
  })
})

describe('the screens', () => {
  it('name the most opened, and the sections not opened in 56 days; never a Partner, her or private screen, nor one it does not know', () => {
    const d = '2026-10-15'
    const rows = [began, ...times(10, d, 'screen', 'now'), ...times(4, d, 'screen', 'aims'), ...times(2, d, 'screen', 'settings:week'), row(d, 'screen', 'evidence'), ...times(3, d, 'screen', 'partnerNotes'), ...times(2, d, 'screen', 'her'), row(d, 'screen', 'private'), ...times(5, d, 'screen', 'mystery'), row(d, 'screen', 'settings:nothing'), row('2026-09-01', 'screen', 'mirror')]
    const f = byId(usageFacts(input({ rows }), TODAY), 'usage.screens')
    expect(f?.text).toBe('Screens in the 28 days to yesterday: opened most, Now 10, Aims 4, Settings → The week 2, the Evidence screen 1; not opened in the 56 days to yesterday, Moves, the weekly view, History, the catalogue, Readings and chips, Brain, the Legend, Becoming, Follow-through.')
    expect(f?.text).not.toMatch(/partner|her\b|private|mystery|nothing/i)
  })

  it('say the window once when counting began inside both of them', () => {
    const rows = [...times(3, '2026-10-10', 'screen', 'now'), row('2026-10-12', 'screen', 'aims')]
    expect(byId(usageFacts(input({ rows }), TODAY), 'usage.screens')?.text).toBe('Screens in the 10 days counted so far, to yesterday: opened most, Now 3, Aims 1; not opened in that time, Mirror, Moves, the Evidence screen, the weekly view, History, the catalogue, Readings and chips, Brain, the Legend, Becoming, Follow-through.')
  })

  it('name a section opened once or twice when it is not among the most opened', () => {
    const d = '2026-10-15'
    const rows = [began, ...times(10, d, 'screen', 'now'), ...times(4, d, 'screen', 'aims'), ...times(3, d, 'screen', 'mirror'), ...times(3, d, 'screen', 'moves'), ...times(3, d, 'screen', 'history'), ...times(3, d, 'screen', 'settings:week'), row(d, 'screen', 'evidence')]
    expect(byId(usageFacts(input({ rows }), TODAY), 'usage.screens')?.text).toContain('opened most, Now 10, Aims 4, History 3, Mirror 3, Moves 3; opened once or twice, the Evidence screen 1; not opened in')
  })
})

describe('the line, Change, the coach, plans, skips and setup', () => {
  it('set the line’s tap against the days it was offered, and count Why', () => {
    const briefs = [{ id: 'a', kind: 'brief', day: '2026-10-15', action: { kind: 'depth', value: 'short' } }, { id: 'b', kind: 'brief', day: '2026-10-17', action: { kind: 'depth', value: 'short' } }] as unknown as BrainBrief[]
    const log = [{ id: 1, day: '2026-10-18', action: { kind: 'depth', value: 'short' }, shownAt: '2026-10-18T12:00:00.000Z' }] as unknown as BriefLog[]
    const rows = [began, row('2026-10-17', 'lineAction', 'depth'), row('2026-10-19', 'lineAction', 'depth'), row('2026-10-14', 'lineWhy'), row('2026-10-15', 'lineWhy'), row('2026-10-16', 'lineWhy'), row('2026-10-18', 'lineWhy')]
    expect(byId(usageFacts(input({ rows, briefs, log }), TODAY), 'usage.line')).toEqual({ id: 'usage.line', tags: [], text: 'The line’s one tap: offered on 3 of the 7 days to yesterday, taken on 1 of them. Why under the line: opened 4 times.', values: { days: 7, offered: 3, taken: 1, why: 4 } })
  })

  it('count Change opened and a rep chosen there, and the openings that ended without one; nothing when no path is on and Change was never opened', () => {
    const path = aim(5, { kind: 'path', path: 'social' } as Partial<Aim>)
    const rows = [began, row('2026-10-01', 'screen', 'pathChange'), row('2026-10-05', 'screen', 'pathChange'), row('2026-10-19', 'screen', 'pathChange'), row('2026-10-05', 'changePicked')]
    expect(byId(usageFacts(input({ rows, aims: [path] }), TODAY), 'usage.change')).toEqual({ id: 'usage.change', tags: [], text: 'Change on the People row in the 28 days to yesterday: opened 3 times, a rep chosen there once; 2 openings ended without one.', values: { days: 28, opened: 3, chosen: 1, without: 2 } })
    expect(byId(usageFacts(input({ rows: [began], aims: [path] }), TODAY), 'usage.change')?.text).toBe('Change on the People row in the 28 days to yesterday: not opened.')
    expect(byId(usageFacts(input({ rows: [began] }), TODAY), 'usage.change')).toBeUndefined()
  })

  it('count the coach’s picks not taken from its first pick, leaving out the day still running', () => {
    const pick = (day: string) => ({ id: `coach:${day}`, day, block: 'morning', path: 'social', ids: ['greet-by-name'], versions: {}, model: 'claude', at: `${day}T11:00:00.000Z` }) as CoachPick
    const picks = ['2026-10-10', '2026-10-15', '2026-10-19', TODAY].map(pick)
    const offers = [offer(1, '2026-10-15', 'greet-by-name', false, 'step', { chosenBy: 'coach' })]
    expect(byId(usageFacts(input({ picks, offers }), TODAY), 'usage.coach')).toEqual({ id: 'usage.coach', tags: [], text: 'The coach’s pick in the 10 days counted so far, to yesterday: made on 3 days, not taken on 2 of them.', values: { days: 10, picked: 3, notTaken: 2 } })
  })

  it('count plans for your own commitments: made, started and done; a path’s and a faith practice’s are theirs to read', () => {
    const aims = [aim(1, { kind: 'certification' }), aim(2, { kind: 'path', path: 'social' } as Partial<Aim>), aim(3, { kind: 'practice', stepMoveId: 'one-verse' })]
    const intentions = [plan(1, '2026-09-01', null), plan(1, '2026-10-01', 101), plan(1, '2026-10-05', 102), plan(1, '2026-10-10', null), plan(1, '2026-10-19', null), plan(2, '2026-10-02', null), plan(2, '2026-10-03', null), plan(3, '2026-10-04', 103)]
    const outcomes = [{ offerId: 101, outcome: 'done' }, { offerId: 102, outcome: 'partly' }, { offerId: 103, outcome: 'done' }] as Outcome[]
    expect(byId(usageFacts(input({ aims, intentions, outcomes }), TODAY), 'usage.plans')).toEqual({ id: 'usage.plans', tags: [], text: 'Plans in the 28 days to yesterday: 4 made, 2 of them started, 1 done.', values: { days: 28, planned: 4, started: 2, done: 1 } })
  })

  it('name the kinds of suggestion skipped again and again, three times or more and at least half the times offered; never faith, the Partner path, her moves or study', () => {
    let id = 0
    const many = (n: number, skipped: number, moveId: string, kind: Offer['kind'] = 'block') => Array.from({ length: n }, (_, k) => offer(++id, '2026-10-10', moveId, k < skipped, kind))
    const offers = [offer(++id, '2026-08-01', 'nap-ten', false), ...many(5, 4, 'nap-ten'), ...many(3, 3, 'message-a-friend'), ...many(4, 4, 'one-verse'), ...many(3, 3, 're-engage-someone'), ...many(3, 3, 'chore-together'), ...many(3, 3, 'time-with-her'), ...many(3, 3, 'retrieval-ten'), ...many(4, 2, 'eye-contact-stranger'), ...many(3, 3, 'sit-outside-five', 'step')]
    const f = byId(usageFacts(input({ offers }), TODAY), 'usage.skips')
    expect(f).toEqual({ id: 'usage.skips', tags: [], text: 'Suggestions skipped again and again in the 28 days to yesterday: rest moves, 4 of the 5 offered; people moves, 3 of the 3 offered.', values: { days: 28, list: 'rest moves, 4 of the 5 offered; people moves, 3 of the 3 offered' } })
  })

  it('count Add a commitment opened against the commitments added', () => {
    const rows = [began, ...times(3, '2026-10-05', 'screen', 'addAim')]
    const aims = [aim(1, { createdAt: '2026-10-05T12:00:00.000Z' }), aim(2, { createdAt: '2026-09-01T12:00:00.000Z' })]
    expect(byId(usageFacts(input({ rows, aims }), TODAY), 'usage.setup')?.text).toBe('Add a commitment in the 28 days to yesterday: opened 3 times, 1 commitment added.')
  })
})

/** Everything at once: a record rich enough that every usage fact is written. */
function rich(): UseInput {
  const d = '2026-10-15'
  const rows = [began, row('2026-09-01', 'appOpened', 'launch'), ...times(3, d, 'appOpened', 'launch'), ...times(6, d, 'screen', 'now'), ...times(2, d, 'screen', 'pathChange'), ...times(2, d, 'screen', 'addAim'), row(d, 'screen', 'evidence'), ...times(3, d, 'checkinOpened', 'evening'), row(d, 'checkinLeft', 'evening'), row(d, 'lineWhy'), row(d, 'lineAction', 'depth'), row(d, 'notification', 'cue'), row(d, 'changePicked')]
  let id = 0
  const offers = Array.from({ length: 4 }, () => offer(++id, d, 'nap-ten', true))
  return input({
    rows,
    briefs: [{ id: 'a', kind: 'brief', day: d, action: { kind: 'depth', value: 'short' } }] as unknown as BrainBrief[],
    picks: [{ id: 'c', day: d, block: 'morning', path: 'social', ids: ['greet-by-name'], versions: {}, model: 'claude', at: `${d}T11:00:00.000Z` }] as CoachPick[],
    offers,
    intentions: [plan(1, d, null)],
    aims: [aim(1, { createdAt: `${d}T12:00:00.000Z` }), aim(5, { kind: 'path', path: 'social' } as Partial<Aim>)],
  })
}

describe('what a usage fact may say', () => {
  it('writes every fact of the rich record, each a usage fact with no tags, so none retrieves a card or weighs on a line', () => {
    const facts = usageFacts(rich(), TODAY)
    expect(facts.map((f) => f.id).sort()).toEqual(['usage.change', 'usage.checkins', 'usage.coach', 'usage.line', 'usage.notifications', 'usage.opened', 'usage.plans', 'usage.screens', 'usage.setup', 'usage.skips'])
    for (const f of facts) expect(f.tags).toEqual([])
  })

  it('carries no time of day, no date, no id of a record and nothing you wrote: counts, windows and fixed names', () => {
    for (const f of usageFacts(rich(), TODAY)) {
      expect(f.text).not.toMatch(/\d{1,2}:\d{2}/)
      expect(f.text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      expect(JSON.stringify(f.values)).not.toMatch(/\d{4}-\d{2}-\d{2}|T\d{2}:/)
      expect(f.text).not.toMatch(/depth|cue|greet-by-name|nap-ten|launch/)
    }
  })

  it('says what was observed and never why: no reason, no cause, no verdict on the person', () => {
    for (const f of usageFacts(rich(), TODAY)) {
      expect(USAGE_REASON.test(f.text), f.text).toBe(false)
      expect(USAGE_VERDICT.test(f.text), f.text).toBe(false)
      expect(usageRefusal(f.text)).toBeNull()
    }
  })

  it('grounds every number it says in its own values, so a line citing it can repeat any of them', () => {
    for (const f of usageFacts(rich(), TODAY)) {
      const values = Object.values(f.values).map(String)
      for (const n of f.text.match(/\d+/g) ?? []) expect(values.some((v) => v === n || v.includes(n)), `${f.id}: ${n}`).toBe(true)
    }
  })

  it('counts with the same rule the Data and privacy summary uses', () => {
    const i = rich()
    const u = summarizeUse(i, '2026-10-13', '2026-10-19', TODAY)
    expect(byId(usageFacts(i, TODAY), 'usage.checkins')?.values).toMatchObject({ opened: u.checkins.opened, left: u.checkins.left })
    expect(byId(usageFacts(i, TODAY), 'usage.line')?.values).toMatchObject({ offered: u.line.withAction, taken: u.line.taken, why: u.line.why })
  })
})
