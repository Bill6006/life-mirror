import { describe, expect, it } from 'vitest'
import type { CheckIn, PrivateItem, Win } from './db'
import { buildExport, type AimsData, type RecordsData } from './export'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { DEFAULT_SETTINGS } from './settings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))

const items: PrivateItem[] = [{ id: 7, name: 'Item one', createdAt: '', archived: 0 }]
const checkins: CheckIn[] = [
  {
    day: '2026-09-05',
    block: 'evening',
    answers: allAt(blockReadings('evening'), 4),
    startedAt: '2026-09-05T23:00:00.000Z',
    completedAt: '2026-09-05T23:01:00.000Z',
    updatedAt: '2026-09-05T23:01:00.000Z',
    activeMs: 4200,
    extras: { caffeine: true, private: { '7': true } },
  },
  {
    day: '2026-09-05',
    block: 'morning',
    answers: { mood: 2 },
    startedAt: '2026-09-05T12:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-05T12:00:00.000Z',
    activeMs: 900,
  },
]
const wins: Win[] = [{ forDay: '2026-09-06', setOn: '2026-09-05', text: 'Read ten pages, "quietly"', outcome: null, answeredAt: null, updatedAt: '' }]
const settings = { ...DEFAULT_SETTINGS, push: { subscription: { endpoint: 'https://push.example/abc' }, subscribedAt: 'x', changed: false } }

describe('export', () => {
  it('leaves private items out unless asked, in both files', () => {
    const plain = buildExport(checkins, wins, items, settings, { includePrivate: false })
    expect(plain.json).not.toContain('Item one')
    expect(plain.csv).not.toContain('Item one')
    expect(JSON.parse(plain.json).includesPrivateItems).toBe(false)
    const withPrivate = buildExport(checkins, wins, items, settings, { includePrivate: true })
    const parsed = JSON.parse(withPrivate.json)
    expect(parsed.privateItems).toEqual(['Item one'])
    expect(parsed.checkins[1].extras.private).toEqual(['Item one'])
    expect(withPrivate.csv.split('\n')[0]).toContain('private: Item one')
    expect(withPrivate.csv.split('\n')[2]).toMatch(/,yes$/)
  })

  it('never carries the push address, and orders check-ins oldest first', () => {
    const out = buildExport(checkins, wins, items, settings, { includePrivate: false })
    expect(out.json).not.toContain('push.example')
    const parsed = JSON.parse(out.json)
    expect(parsed.checkins.map((c: { block: string }) => c.block)).toEqual(['morning', 'evening'])
    expect(parsed.checkins[1].answers.mood).toEqual({ position: 4, phrase: 'Warm — quietly glad about things' })
    expect(parsed.minimumWins[0].text).toBe('Read ten pages, "quietly"')
  })

  it('writes a CSV with one row per check-in, blanks for unanswered readings, and quoted cells where needed', () => {
    const out = buildExport(checkins, wins, items, settings, { includePrivate: false })
    const lines = out.csv.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0].startsWith('day,block,completed_at,active_ms,mood,')).toBe(true)
    const morning = lines[1].split(',')
    expect(morning[0]).toBe('2026-09-05')
    expect(morning[1]).toBe('morning')
    expect(morning[4]).toBe('2')
    expect(morning[5]).toBe('')
    expect(lines[2]).toContain('yes')
  })

  it('carries the key: which end is good, the phrases in order, and the dated rewording', () => {
    const bundle = buildExport(checkins, [], items, DEFAULT_SETTINGS, { includePrivate: false })
    const parsed = JSON.parse(bundle.json)
    expect(parsed.key.readings.find((r: { id: string }) => r.id === 'stress').goodEnd).toBe('low')
    expect(parsed.key.readings.find((r: { id: string }) => r.id === 'mood').goodEnd).toBe('high')
    expect(parsed.key.readings.find((r: { id: string }) => r.id === 'hunger').goodEnd).toBe('context')
    expect(parsed.key.readings.find((r: { id: string }) => r.id === 'loneliness').anchors[0]).toBe('Content — nothing feels missing')
    expect(parsed.key.reworded.some((r: { reading: string; on: string }) => r.reading === 'loneliness' && r.on === '2026-09-11')).toBe(true)
    expect(parsed.key.events).toContain('coolingOffEvent')
    expect(bundle.offersCsv.split(String.fromCharCode(10))[0]).toContain('outcome')
  })
})

describe('how the app is used, in your own file (Follow-up F1)', () => {
  const useLog = [
    { day: '2026-09-05', at: '2026-09-05T12:00:00.000Z', kind: 'appOpened', what: 'launch' },
    { day: '2026-09-05', at: '2026-09-05T12:01:00.000Z', kind: 'screen', what: 'evidence' },
    { day: '2026-09-05', at: '2026-09-05T12:02:00.000Z', kind: 'screen', what: 'partnerNotes' },
  ] as const
  const usage = [{ id: 'usage.checkins', tags: [], text: 'Check-ins in the 7 days to yesterday: opened 3 times, 1 of them left before the end.', values: { days: 7, opened: 3, left: 1 } }]
  const records = { offers: [], outcomes: [], cards: [], declarations: [], useLog: [...useLog], usage }

  it('carries every use with its kind, its fixed id and its time, and what Claude may be given, word for word', () => {
    const out = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false, includePartner: true }, undefined, records).json)
    expect(out.useLog).toEqual(useLog.map((r) => ({ day: r.day, at: r.at, kind: r.kind, what: r.what })))
    expect(out.usage).toEqual([{ id: 'usage.checkins', text: usage[0].text }])
    expect(out.key.useLog).toMatch(/Never content, never anything outside the app/)
  })

  it('carries Ask Life Mirror’s conversations: each thread, and each question with the answer laid out then and the findings it cited', () => {
    const ask = {
      threads: [{ id: 7, day: '2026-10-19', at: '2026-10-19T13:00:00.000Z', title: 'What do you know about me so far?', from: { kind: 'starter' as const, starter: 'know' as const } }],
      turns: [{ id: 9, threadId: 7, day: '2026-10-19', at: '2026-10-19T13:00:00.000Z', question: 'What do you know about me so far?', tier: 'quick' as const, state: 'answered' as const, kind: 'know' as const, version: 'v', quick: { sections: [{ title: 'What helps you', lines: ['A ten-minute walk, now, for Stress over the next block: Likely: helps'] }] }, cited: [{ key: 'walk-ten|stress|nextBlock', level: 'likely' as const, direction: 'helps' as const, revised: false, lo: 0.1, hi: 0.7 }], updatedAt: '2026-10-19T13:00:00.000Z' }],
    }
    const out = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false }, undefined, { ...records, ask }).json)
    expect(out.ask.threads).toEqual([{ id: 7, day: '2026-10-19', at: '2026-10-19T13:00:00.000Z', title: 'What do you know about me so far?', from: { kind: 'starter', starter: 'know' } }])
    expect(out.ask.turns[0]).toMatchObject({ id: 9, thread: 7, question: 'What do you know about me so far?', state: 'answered', answer: [{ title: 'What helps you', lines: ['A ten-minute walk, now, for Stress over the next block: Likely: helps'] }], cited: [{ key: 'walk-ten|stress|nextBlock', level: 'likely' }] })
    expect(out.key.ask).toMatch(/Nothing here is evidence/)
    // Claude's checked answer, with its turn (stage A2); and that no checked answer came.
    const withClaude = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false }, undefined, { ...records, ask: { ...ask, answers: [{ id: 'turn:9', turnId: 9, threadId: 7, day: '2026-10-19', at: '2026-10-19T15:00:00.000Z', status: 'answered' as const, text: 'A walk likely helps your stress.', factIds: ['ladder.walk-ten.stress'], cardIds: [], model: 'claude-opus-5-5' }] } }).json)
    expect(withClaude.ask.turns[0].claude).toEqual({ status: 'answered', at: '2026-10-19T15:00:00.000Z', text: 'A walk likely helps your stress.', factIds: ['ladder.walk-ten.stress'], cardIds: [], model: 'claude-opus-5-5' })
    expect(out.ask.turns[0]).not.toHaveProperty('claude')
    // Notes kept from Ask, each on its day, in the owner's own words (stage A3).
    const withNotes = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false }, undefined, { ...records, ask: { ...ask, notes: [{ id: 4, day: '2026-10-19', text: 'The neighbours had a party.', from: 'ask' as const, turnId: 9, createdAt: '2026-10-19T13:05:00.000Z', updatedAt: '2026-10-19T13:05:00.000Z' }] } }).json)
    expect(withNotes.notes).toEqual([{ day: '2026-10-19', text: 'The neighbours had a party.', from: 'ask', question: 9, createdAt: '2026-10-19T13:05:00.000Z' }])
    expect(withNotes.key.notes).toMatch(/never a reading or a finding/)
    // A turn's asked marks, keys and days, as the key says (stage A3).
    const withAsked = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false }, undefined, { ...records, ask: { ...ask, turns: [{ ...ask.turns[0], asked: [{ key: 'walk-ten|stress|nextBlock', day: '2026-10-19' }] }] } }).json)
    expect(withAsked.ask.turns[0].asked).toEqual([{ key: 'walk-ten|stress|nextBlock', day: '2026-10-19' }])
    expect(out.ask.turns[0]).not.toHaveProperty('asked')
    expect(out.key.ask).toMatch(/A turn’s asked lists the tests you asked about/)
  })

  it('leaves the Partner path’s own screens out unless the Partner path is included (Part 27)', () => {
    const out = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false }, undefined, records).json)
    expect(out.useLog.map((r: { what: string }) => r.what)).toEqual(['launch', 'evidence'])
  })
})

describe('the record keeps what Loneliness asked, as it stood (Part 42)', () => {
  it('dates the middle phrase and the question reworded, the answers keeping their meaning', () => {
    const key = JSON.parse(buildExport(checkins, wins, items, settings, { includePrivate: false }).json).key
    expect(key.reworded).toContainEqual({ reading: 'loneliness', position: 3, on: '2026-09-24', from: 'Wanting — a fair bit feels missing', to: 'Distant — a fair bit feels missing' })
    expect(key.reprompted).toEqual([{ reading: 'loneliness', on: '2026-09-24', from: 'Right now', to: 'How much meaningful closeness feels missing' }])
  })
})

describe('something to learn, whole, in your own file (Workstream 6; Parts 40 and 41)', () => {
  const aim = { id: 1, kind: 'certification', stepMoveId: null, name: 'Learn a language', about: 'I can read a little', method: 'A phrasebook', currentSkillId: 3, rhythm: { perWeek: 3, restDays: 0 }, schedule: [1, 3], createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null } as const
  const skills = [
    { id: 2, aimId: 1, name: 'Numbers', method: 'A phrasebook', source: 'you', order: 1, startedAt: '2026-09-01T12:00:00.000Z', endedAt: '2026-09-10T12:00:00.000Z', createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null },
    { id: 3, aimId: 1, name: 'Everyday listening', method: 'A phrasebook', how: 'One page, read aloud.', minutes: 30, source: 'claude', likelyNext: 'Short spoken answers', order: 2, startedAt: '2026-09-10T12:00:00.000Z', createdAt: '2026-09-10T12:00:00.000Z', archivedAt: null },
  ] as const
  const offer = { id: 9, kind: 'step', day: '2026-09-12', block: 'evening', at: '2026-09-12T23:00:00.000Z', situationKey: 'aim:certification:1', target: 'focus', stance: '', band: '', reading: 0, moveId: 'skill:3', cardId: null, candidates: ['skill:3'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: '2026-09-12T23:00:00.000Z' } as const
  const outcome = { offerId: 9, moveId: 'skill:3', day: '2026-09-12', block: 'evening', at: '2026-09-12T23:00:00.000Z', outcome: 'done', why: null, passiveOutcome: null, ease: 'easy', note: 'the numbers stuck' } as const
  const ask = { id: 4, aimId: 1, kind: 'setup', revision: 'r', day: '2026-09-10', at: '2026-09-10T12:00:00.000Z', claude: true, decision: 'used', decidedAt: '2026-09-10T22:00:00.000Z' } as const
  const suggestion = { skill: 'Everyday listening', method: 'A phrasebook', how: 'One page, read aloud.', minutes: 30, rhythm: { perWeek: 3, restDays: 0 }, why: 'The ear first.', physical: false, safety: null, likelyNext: 'Short spoken answers' }
  const proposal = { id: 'ask:4', askId: 4, aimId: 1, kind: 'setup', revision: 'r', day: '2026-09-10', at: '2026-09-10T21:00:00.000Z', model: 'claude-opus-5-5', askedModel: 'opus', suggestion } as const
  const aims = { aims: [aim], skills, marks: [], intentions: [], coachAsks: [ask], coachProposals: [proposal] } as unknown as AimsData
  const records = { offers: [offer], outcomes: [outcome], cards: [], declarations: [] } as unknown as RecordsData

  it('carries the goal, its current skill, rhythm and fixed days; every skill with its practice and dates; a session’s ease and note; and the coach’s asks, your decisions and its proposals', () => {
    const bundle = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, aims, records)
    const out = JSON.parse(bundle.json)
    expect(out.aims.commitments[0]).toMatchObject({ name: 'Learn a language', about: 'I can read a little', method: 'A phrasebook', currentSkill: 3, rhythm: { perWeek: 3, restDays: 0 }, schedule: [1, 3], finishedAt: null })
    expect(out.aims.skills).toEqual([
      expect.objectContaining({ id: 2, aim: 1, name: 'Numbers', source: 'you', startedAt: '2026-09-01T12:00:00.000Z', endedAt: '2026-09-10T12:00:00.000Z' }),
      expect.objectContaining({ id: 3, aim: 1, name: 'Everyday listening', how: 'One page, read aloud.', minutes: 30, source: 'claude', likelyNext: 'Short spoken answers', safety: null, endedAt: null }),
    ])
    expect(out.offers[0]).toMatchObject({ move: 'skill:3', outcome: 'done', ease: 'easy', note: 'the numbers stuck' })
    expect(out.aims.coach.asks).toEqual([expect.objectContaining({ id: 4, aim: 1, kind: 'setup', claudeAsked: true, decision: 'used' })])
    expect(out.aims.coach.proposals).toEqual([expect.objectContaining({ ask: 4, aim: 1, model: 'claude-opus-5-5', suggestion })])
    const [head, row] = bundle.offersCsv.split(String.fromCharCode(10))
    expect(head.endsWith(',ease,note')).toBe(true)
    expect(row.endsWith(',easy,the numbers stuck')).toBe(true)
  })

  it('adds no coach section while nothing was ever asked', () => {
    const out = JSON.parse(buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, { ...aims, coachAsks: [], coachProposals: [] }, records).json)
    expect(out.aims).not.toHaveProperty('coach')
  })
})

describe('stage 3, item 5, in your own file', () => {
  const day = '2026-09-12'
  const evening: CheckIn = { day, block: 'evening', answers: allAt(blockReadings('evening'), 3), startedAt: '', completedAt: `${day}T22:00:00.000Z`, updatedAt: '', activeMs: 1000, extras: { outside: true, sweet: true, caffeineIntake: { band: 1, at: `${day}T21:00:00.000Z`, since: null, last: 'oneToThree' }, chipsShown: { outside: true, sweet: true, caffeineLast: true } } }
  const base = { kind: 'block', day, block: 'afternoon', at: `${day}T15:00:00.000Z`, situationKey: 'afternoon:mood', target: 'mood', stance: '', band: '', reading: 0, cardId: null, coinFlip: false, passiveId: null, whyNot: null, closedAt: null } as const
  const asideOffer = { ...base, id: 1, moveId: 'walk-ten', candidates: ['walk-ten'], skippedAt: `${day}T15:05:00.000Z`, skipReason: 'dayChanged' } as const
  const redrawn = { ...base, id: 2, moveId: 'nap-ten', candidates: ['nap-ten'], skippedAt: null, redrawn: true } as const
  const records = { offers: [asideOffer, redrawn], outcomes: [], cards: [], declarations: [], days: [{ day, weekday: 6, withHer: true, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: true, createdAt: '', amongPeople: true }] } as unknown as RecordsData

  it('carries time in nature as its own mark beside the older Outside a while today (item 2 of 4)', () => {
    const later: CheckIn = { ...evening, day: '2026-10-22', completedAt: '2026-10-22T22:00:00.000Z', extras: { nature: true, chipsShown: { nature: true } } }
    const bundle = buildExport([evening, later], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, records)
    const out = JSON.parse(bundle.json)
    const byDay = (d: string) => out.checkins.find((c: { day: string }) => c.day === d).extras
    expect(byDay('2026-10-22')).toMatchObject({ natureToday: true, outsideToday: false, chipsShown: ['nature'] })
    expect(byDay(day)).toMatchObject({ natureToday: false, outsideToday: true })
    expect(out.key.events).toEqual(expect.arrayContaining(['outsideToday', 'natureToday']))
    expect(out.key.nature).toContain('never read as time in nature')
    const [head, ...rows] = bundle.csv.split('\n')
    const at = head.split(',').indexOf('nature_today')
    expect(rows.map((r) => r.split(',')[at])).toEqual(expect.arrayContaining(['yes', '']))
  })

  it('carries the new chips, when the last caffeine was, which chips were shown, and the days among people', () => {
    const bundle = buildExport([evening], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, records)
    const out = JSON.parse(bundle.json)
    // An evening from before time in nature (2026-10-21) keeps its Outside a while today as recorded, and is no nature day.
    expect(out.checkins[0].extras).toMatchObject({ outsideToday: true, natureToday: false, sweetSinceLastCheckIn: true, caffeineLast: 'oneToThree', chipsShown: ['outside', 'sweet', 'caffeineLast'] })
    expect(out.key.events).toEqual(expect.arrayContaining(['outsideToday', 'sweetSinceLastCheckIn']))
    expect(out.key.chipsShown).toContain('not shown says nothing')
    expect(out.amongPeopleDays).toEqual([day])
    const [head, row] = bundle.csv.split('\n')
    const cell = (name: string) => row.split(',')[head.split(',').indexOf(name)]
    expect([cell('outside_today'), cell('nature_today'), cell('sweet_since_last_check_in'), cell('caffeine_last'), cell('chips_shown')]).toEqual(['yes', '', 'yes', 'oneToThree', 'outside; sweet; caffeineLast'])
  })

  it('carries your own chips by their labels, a removed one with its taps, and names them where they were shown', () => {
    const settings = { ...DEFAULT_SETTINGS, ownChips: [{ id: 'a1', label: 'Stand-in one', createdAt: '2026-09-01T00:00:00.000Z', removedAt: null }, { id: 'b2', label: 'Stand-in two', createdAt: '2026-09-01T00:00:00.000Z', removedAt: '2026-09-10T00:00:00.000Z' }] }
    const tapped: CheckIn = { ...evening, extras: { own: { a1: true, b2: true }, chipsShown: { 'own:a1': true } } }
    const bundle = buildExport([tapped], [], [], settings, { includePrivate: false })
    const out = JSON.parse(bundle.json)
    expect(out.ownChips).toEqual([
      { label: 'Stand-in one', createdAt: '2026-09-01T00:00:00.000Z', removedAt: null },
      { label: 'Stand-in two', createdAt: '2026-09-01T00:00:00.000Z', removedAt: '2026-09-10T00:00:00.000Z' },
    ])
    expect(out.checkins[0].extras).toMatchObject({ ownChips: ['Stand-in one', 'Stand-in two'], chipsShown: ['own: Stand-in one'] })
    const [head, row] = bundle.csv.split('\n')
    const cell = (name: string) => row.split(',')[head.split(',').indexOf(name)]
    expect([cell('own: Stand-in one'), cell('own: Stand-in two')]).toEqual(['yes', 'yes'])
  })

  it('shows a move set aside when the day changed as the app’s, never a skip, and the one drawn again as such', () => {
    const bundle = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, records)
    const out = JSON.parse(bundle.json)
    expect(out.offers[0]).toMatchObject({ skipped: false, setAside: 'the day changed' })
    expect(out.offers[1]).toMatchObject({ skipped: false, redrawn: true })
    expect(out.offers[1]).not.toHaveProperty('setAside')
    const [head, aside, again] = bundle.offersCsv.trim().split('\n').map((l) => l.split(','))
    const col = (r: string[], name: string) => r[head.indexOf(name)]
    // The file writes yes, or leaves the cell empty.
    expect([col(aside, 'skipped'), col(aside, 'set_aside')]).toEqual(['', 'yes'])
    expect([col(again, 'skipped'), col(again, 'set_aside')]).toEqual(['', ''])
  })
})

describe('stage 3, item 6, the weather in your own file', () => {
  const rec = (day: string, weather?: object) => ({ day, weekday: 1, withHer: true, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '', ...(weather ? { weather } : {}) })
  const records = {
    offers: [],
    outcomes: [],
    cards: [],
    declarations: [],
    days: [rec('2026-10-18', { rain: 2.3, sun: 5.1, high: 15.5, at: '2026-10-18T08:00:00.000Z', hours: Array.from({ length: 24 }, () => 0) }), rec('2026-10-16'), rec('2026-10-17', { rain: 0, sun: 9.4, high: 18.2, at: '2026-10-18T08:00:00.000Z' })],
  } as unknown as RecordsData
  const evening = (day: string): CheckIn => ({ day, block: 'evening', answers: allAt(blockReadings('evening'), 3), startedAt: '', completedAt: `${day}T22:00:00.000Z`, updatedAt: '', activeMs: 1000 })

  it('lists each day with weather, values only and in order, says what they are and whose, and leaves a day without it out', () => {
    const out = JSON.parse(buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, records).json)
    expect(out.weatherDays).toEqual([
      { day: '2026-10-17', rainMm: 0, sunHours: 9.4, highC: 18.2, readAt: '2026-10-18T08:00:00.000Z' },
      { day: '2026-10-18', rainMm: 2.3, sunHours: 5.1, highC: 15.5, readAt: '2026-10-18T08:00:00.000Z' },
    ])
    expect(out.key.weather).toContain('Weather data by Open-Meteo.com')
    expect(out.key.weather).toContain('A day not listed is unknown, never dry.')
  })

  it('gives each check-in row its day’s weather, and leaves the cells empty on a day without it', () => {
    const bundle = buildExport([evening('2026-10-16'), evening('2026-10-17')], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, records)
    const [head, unknown, dry] = bundle.csv.trim().split('\n')
    const cells = (row: string) => ['day_rain_mm', 'day_sun_hours', 'day_high_c'].map((n) => row.split(',')[head.split(',').indexOf(n)])
    expect(cells(unknown)).toEqual(['', '', ''])
    expect(cells(dry)).toEqual(['0', '9.4', '18.2'])
  })
})
