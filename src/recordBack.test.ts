import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { keyFor, lastSessionNote } from './aims'
import { db, type Aim, type CheckIn, type Offer, type Outcome } from './db'
import { momentsSince, rungHistory, skillCounts } from './her'
import { addHerSkill, addMoment, allMoments, setHerRung } from './herFlow'
import { buildExport } from './export'
import { readSoFar } from './outsideRow'
import { DEFAULT_SETTINGS } from './settings'
import { WORDS_SHOWN, yourWords } from './yourWords'

// Stage 3, group 4, the owner's record shown back: Your words, a session's note at the next start,
// Her counted from the current rung with each change dated, and the workouts read.

const note = (day: string, block: CheckIn['block'], text: string | undefined, answers: CheckIn['answers'] = {}): CheckIn => ({ day, block, answers, startedAt: `${day}T12:00:00.000Z`, completedAt: `${day}T12:01:00.000Z`, updatedAt: `${day}T12:01:00.000Z`, activeMs: 1, ...(text === undefined ? {} : { extras: { note: text } }) })

describe('Your words', () => {
  it('lists every line typed at a check-in, newest first, each beside that check-in’s reading and band', () => {
    const rows = yourWords([
      note('2026-10-01', 'evening', 'long week', { mood: 2, energy: 2, focus: 2, stress: 4, overwhelm: 4, irritation: 4 }),
      note('2026-10-02', 'morning', '  slept badly  '),
      note('2026-10-02', 'evening', 'a good talk', { mood: 5, energy: 5, focus: 5, stress: 1, overwhelm: 1, irritation: 1 }),
      note('2026-10-03', 'evening', '   '),
      note('2026-10-03', 'morning', undefined),
    ])
    expect(rows.map((r) => [r.day, r.block, r.note])).toEqual([
      ['2026-10-02', 'evening', 'a good talk'],
      ['2026-10-02', 'morning', 'slept badly'],
      ['2026-10-01', 'evening', 'long week'],
    ])
    // A check-in with no reading of its own shows its words alone.
    expect(rows[1]).toMatchObject({ value: null, band: null })
    expect(rows[0].value).toBeGreaterThan(rows[2].value as number)
    expect(rows[0].band).toBe('firing')
    expect(WORDS_SHOWN).toBe(60)
  })
})

describe('a session’s note at the next start', () => {
  const aim = { id: 1, kind: 'practice', stepMoveId: 'walk-ten', createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null } as Aim
  const step = (id: number, day: string, at: string): Offer => ({ id, kind: 'step', day, block: 'evening', at, situationKey: keyFor(aim), target: 'mood', stance: '', band: '', reading: 0, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: at })
  const answer = (offerId: number, text?: string): Outcome => ({ offerId, moveId: 'walk-ten', day: '2026-10-01', block: 'evening', at: '2026-10-01T22:00:00.000Z', outcome: 'done', why: null, passiveOutcome: null, ...(text ? { note: text } : {}) })

  it('is the note left after the last answered session, and nothing when that one has none', () => {
    const offers = [step(1, '2026-10-01', '2026-10-01T20:00:00.000Z'), step(2, '2026-10-02', '2026-10-02T20:00:00.000Z'), step(3, '2026-10-03', '2026-10-03T20:00:00.000Z')]
    // The third is the one now started, with no answer yet.
    expect(lastSessionNote(aim, offers, [answer(1, 'start at the hill'), answer(2, ' turn left at the park ')])).toBe('turn left at the park')
    expect(lastSessionNote(aim, offers, [answer(1, 'start at the hill'), answer(2)])).toBeNull()
    expect(lastSessionNote(aim, [], [])).toBeNull()
  })
})

describe('Her, counted from the current rung', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('keeps each rung change with its moment, and the rung it already stands at changes nothing', async () => {
    await addHerSkill('counts-to-ten')
    await setHerRung('counts-to-ten', 'practicingWithDaddy', new Date('2026-10-05T15:00:00.000Z'))
    await setHerRung('counts-to-ten', 'practicingWithDaddy', new Date('2026-10-06T15:00:00.000Z'))
    await setHerRung('counts-to-ten', 'needsSupport', new Date('2026-10-09T15:00:00.000Z'))
    const s = await db.herSkills.get('counts-to-ten')
    const h = rungHistory(s!)
    expect(h.changes.map((c) => c.rung)).toEqual(['notIntroduced', 'practicingWithDaddy', 'needsSupport'])
    expect(h.changes.slice(1).map((c) => c.at)).toEqual(['2026-10-05T15:00:00.000Z', '2026-10-09T15:00:00.000Z'])
    expect(h.earlierUnknown).toBe(false)
    expect(s?.rungAt).toBe('2026-10-09T15:00:00.000Z')
  })

  it('starts a skill kept before the history from its rung at that time, its earlier changes unknown', async () => {
    await db.herSkills.add({ skillId: 'pretend-play', rung: 'doingSometimes', addedAt: '2026-09-01T12:00:00.000Z', rungAt: '2026-09-20T12:00:00.000Z', archivedAt: null })
    expect(rungHistory((await db.herSkills.get('pretend-play'))!)).toEqual({ changes: [{ rung: 'doingSometimes', at: '2026-09-20T12:00:00.000Z' }], earlierUnknown: true })
    await setHerRung('pretend-play', 'doingOften', new Date('2026-10-10T12:00:00.000Z'))
    const h = rungHistory((await db.herSkills.get('pretend-play'))!)
    expect(h.changes.map((c) => c.rung)).toEqual(['doingSometimes', 'doingOften'])
    expect(h.earlierUnknown).toBe(true)
    // One never changed is whole: it was added at the rung it stands at.
    expect(rungHistory({ rung: 'notIntroduced', addedAt: '2026-09-01T12:00:00.000Z', rungAt: '2026-09-01T12:00:00.000Z' }).earlierUnknown).toBe(false)
  })

  it('goes into the export with each skill, dated', () => {
    const rungs = [{ rung: 'notIntroduced' as const, at: '2026-10-01T12:00:00.000Z' }, { rung: 'needsSupport' as const, at: '2026-10-09T12:00:00.000Z' }]
    const out = buildExport([], [], [], DEFAULT_SETTINGS, { includePrivate: false }, undefined, { offers: [], outcomes: [], cards: [], declarations: [], herSkills: [{ skillId: 'counts-to-ten', rung: 'needsSupport', addedAt: rungs[0].at, rungAt: rungs[1].at, archivedAt: null, rungs }] })
    // The export's own JSON: find the skill wherever the bundle files it.
    const find = (v: unknown): unknown => (Array.isArray(v) ? v.map(find).find(Boolean) : v && typeof v === 'object' ? ((v as Record<string, unknown>).skill === 'counts-to-ten' ? v : Object.values(v).map(find).find(Boolean)) : undefined)
    expect(find(JSON.parse(out.json))).toMatchObject({ skill: 'counts-to-ten', rung: 'needsSupport', rungs })
  })

  it('counts the moments since the rung was set, apart from every count of the skill', async () => {
    await addHerSkill('counts-to-ten')
    await addMoment('2026-10-01', 'counts-to-ten', 'own')
    await setHerRung('counts-to-ten', 'practicingWithDaddy', new Date(Date.now() + 60_000))
    const s = await db.herSkills.get('counts-to-ten')
    await db.moments.add({ day: '2026-10-02', at: new Date(Date.now() + 120_000).toISOString(), skillId: 'counts-to-ten', help: 'some' })
    const moments = await allMoments()
    expect(skillCounts(momentsSince(moments, s!.rungAt), 'counts-to-ten')).toMatchObject({ did: 1, own: 0, some: 1 })
    expect(skillCounts(moments, 'counts-to-ten')).toMatchObject({ did: 2, own: 1, some: 1 })
  })
})

describe('the workouts read, on Cloud', () => {
  it('counts what was read: the workouts, the days they fell on, and the latest', () => {
    expect(readSoFar([])).toEqual({ n: 0, days: 0, last: null })
    expect(readSoFar([{ day: '2026-10-02' }, { day: '2026-10-05' }, { day: '2026-10-02' }])).toEqual({ n: 3, days: 2, last: '2026-10-05' })
  })
})
