import { describe, expect, it } from 'vitest'
import { checkReview, checkSuggestion, coachTextRefusal, HARD_RUN, isPhysical, MAX_SETUP_RUNS_A_DAY, REVIEW_DAYS, REVIEW_MIN_CALENDAR_DAYS, reviewDue, revisionOf, SKILL_COACH, type CoachContext, type ReviewInput } from './coachShared'

// Parts 40 and 41's shared rules: the gate, the checks every answer from Claude passes before the
// phone may show it, the revision a proposal is written for, and when a progression review is due.

const ctx = (extra: Partial<CoachContext> = {}): CoachContext => ({ goal: 'Learn Italian', physical: false, faithHidden: false, names: [], numbers: new Set(['5', '6', '4', '12', '20']), ...extra })
const italian = { skill: 'Understand everyday spoken Italian', method: 'An audio course', how: 'One lesson a session, answering aloud before the speaker does.', minutes: 30, rhythm: { perWeek: 5, restDays: 0 }, why: 'Listening first builds the ear the rest of the course leans on.', physical: false, safety: null, likelyNext: 'Short spoken answers' }

describe('the gate', () => {
  it('stays closed until the monitoring completes and the owner approves (2026-09-25)', () => {
    expect(SKILL_COACH).toBe('gated')
    expect(MAX_SETUP_RUNS_A_DAY).toBe(2)
    expect([REVIEW_DAYS, REVIEW_MIN_CALENDAR_DAYS, HARD_RUN]).toEqual([6, 7, 3])
  })
})

describe('what makes a goal physical', () => {
  it('knows a headstand, yoga and a 10k, and not Italian, shell scripts that run, the cello or watercolour', () => {
    expect(isPhysical(['Learn a headstand'])).toBe(true)
    expect(isPhysical(['Yoga at home'])).toBe(true)
    expect(isPhysical(['Run a 10k'])).toBe(true)
    for (const g of ['Learn Italian', 'Shell scripting: run scripts on a schedule', 'Cello', 'Watercolour faces']) expect(isPhysical([g])).toBe(false)
    // Claude may say so of a goal the words miss.
    expect(isPhysical(['Ride a unicycle'])).toBe(false)
    expect(isPhysical(['Ride a unicycle'], true)).toBe(true)
  })
})

describe('a suggestion for the current skill (Part 40)', () => {
  it('passes whole: the skill, method, how, minutes, rhythm, why and a likely next, with no safety line for a skill that needs none', () => {
    const r = checkSuggestion(italian, ctx())
    expect(r).toEqual({ ok: true, value: { ...italian, physical: false } })
  })

  it('always carries a safety line for a physical skill, whatever Claude calls it', () => {
    const hand = { ...italian, skill: 'Wall-supported headstand holds', method: null, how: 'Kick up facing the wall, hold, come down with control.', minutes: 12, rhythm: { perWeek: 3, restDays: 1 }, why: 'Holding against the wall builds the shoulders and the line first.', physical: false, safety: null, likelyNext: 'Chest-to-wall headstand' }
    expect(checkSuggestion(hand, ctx({ goal: 'Learn a headstand', numbers: new Set() }))).toEqual({ ok: false, reason: 'a physical skill needs its safety line' })
    const safe = checkSuggestion({ ...hand, safety: 'Warm up the wrists first; stop if a wrist or the neck hurts; skip inversions with raised blood pressure. Not medical advice.' }, ctx({ goal: 'Learn a headstand', numbers: new Set() }))
    expect(safe.ok && safe.value.physical).toBe(true)
  })

  it('refuses a wrong shape: too long, a session out of range, a rhythm that cannot keep its rest days', () => {
    expect(checkSuggestion({ ...italian, skill: 'x'.repeat(81) }, ctx())).toMatchObject({ ok: false, reason: 'skill is 81 characters; at most 80' })
    expect(checkSuggestion({ ...italian, minutes: 0 }, ctx())).toMatchObject({ ok: false, reason: 'a session is one to 240 minutes' })
    expect(checkSuggestion({ ...italian, rhythm: { perWeek: 8, restDays: 0 } }, ctx())).toMatchObject({ ok: false })
    expect(checkSuggestion({ ...italian, rhythm: { perWeek: 4, restDays: 1 } }, ctx())).toMatchObject({ ok: false, reason: 'that many sessions a week cannot keep that many rest days between them' })
    expect(checkSuggestion({ ...italian, how: '' }, ctx())).toMatchObject({ ok: false, reason: 'no how' })
  })

  it('refuses percentages, levels, points and readiness: counts in words', () => {
    for (const why of ['You will be 80% fluent.', 'This will level up your Italian.', 'Aim for mastery of the numbers.', 'Your readiness is high.', 'Rate yourself 7/10 each time.']) expect(checkSuggestion({ ...italian, why }, ctx({ numbers: new Set(['80', '7']) }))).toMatchObject({ ok: false, reason: 'gives a percentage, level, score or readiness; say counts in words' })
  })

  it('never reads silence or a refusal as a shortfall, and never passes a verdict on or explains the person', () => {
    expect(checkSuggestion({ ...italian, why: 'You missed four days, so start smaller.' }, ctx())).toMatchObject({ ok: false, reason: 'reads silence or a refusal as a shortfall; say what the record holds' })
    expect(checkSuggestion({ ...italian, why: 'Because you lack discipline, keep it short.' }, ctx())).toMatchObject({ ok: false })
    expect(checkSuggestion({ ...italian, why: 'You are not ready for grammar yet.' }, ctx())).toMatchObject({ ok: false, reason: 'passes a verdict on the person or explains them; speak of the practice' })
  })

  it('leaves people, dating and a particular person to the paths', () => {
    for (const how of ['Practise small talk with a stranger each day.', 'Ask someone out in Italian.', 'Use it on a date.']) expect(checkSuggestion({ ...italian, how }, ctx())).toMatchObject({ ok: false, reason: 'belongs to the Social or Partner path, never a commitment' })
    // Performing in front of people stays a commitment.
    expect(checkSuggestion({ ...italian, likelyNext: 'Read a short passage aloud to a class' }, ctx())).toMatchObject({ ok: true })
  })

  it('speaks of faith only while shown, and names a private item only while its name may be shown', () => {
    const prayer = { ...italian, how: 'Read one Bible verse in Italian, aloud.' }
    expect(checkSuggestion(prayer, ctx({ faithHidden: true }))).toMatchObject({ ok: false, reason: 'speaks of faith while faith is hidden' })
    expect(checkSuggestion(prayer, ctx())).toMatchObject({ ok: true })
    expect(checkSuggestion({ ...italian, why: 'Less time on Late-night scrolling leaves room for it.' }, ctx({ names: ['Late-night scrolling'] }))).toMatchObject({ ok: false, reason: 'names a private item while its name may not be shown' })
  })

  it('takes every number from the briefing or its own fields', () => {
    expect(checkSuggestion({ ...italian, how: 'Learn 50 words a session.' }, ctx())).toMatchObject({ ok: false, reason: 'the number 50 is not in the briefing' })
    // Its own minutes and rhythm may be said.
    expect(checkSuggestion({ ...italian, how: 'One 30-minute lesson, 5 times a week.' }, ctx({ numbers: new Set() }))).toMatchObject({ ok: true })
  })
})

describe('a progression review (Part 41)', () => {
  const rc = (extra: Partial<Parameters<typeof checkReview>[1]> = {}) => ({ ...ctx(), currentSkill: 'Ten words', hardRun: false, ...extra })

  it('keeps with its evidence as facts and changes nothing', () => {
    const keep = { verdict: 'keep', evidence: ['5 of the last 6 sessions marked About right.'], why: 'The skill still fits the goal.', change: null }
    expect(checkReview(keep, rc())).toEqual({ ok: true, value: keep })
    expect(checkReview({ ...keep, change: { minutes: 20 } }, rc())).toEqual({ ok: false, reason: 'Keep changes nothing' })
  })

  it('adjusts the practice of the same skill, progresses to another, simplifies the skill or its practice, and never touches the goal', () => {
    const base = { evidence: ['4 of the last 6 sessions marked Easy.'], why: 'The sessions read easy.' }
    expect(checkReview({ ...base, verdict: 'adjust', change: { minutes: 20 } }, rc())).toMatchObject({ ok: true, value: { change: { minutes: 20 } } })
    expect(checkReview({ ...base, verdict: 'adjust', change: { skill: 'Twenty words' } }, rc())).toEqual({ ok: false, reason: 'Adjust keeps the skill and changes how it is practised' })
    expect(checkReview({ ...base, verdict: 'progress', change: { skill: 'Short spoken answers', how: 'Answer each prompt aloud in a full sentence.' } }, rc())).toMatchObject({ ok: true, value: { change: { skill: 'Short spoken answers' } } })
    expect(checkReview({ ...base, verdict: 'progress', change: { skill: 'ten words' } }, rc())).toEqual({ ok: false, reason: 'Progress names the next skill' })
    expect(checkReview({ ...base, verdict: 'simplify', change: { skill: 'Five words', minutes: 15 } }, rc())).toMatchObject({ ok: true })
    expect(checkReview({ ...base, verdict: 'simplify', change: { skill: 'Five words' }, why: 'Or drop Italian for now.' }, rc())).toEqual({ ok: false, reason: 'a review changes the skill or its practice, never the goal' })
    expect(checkReview({ ...base, verdict: 'simplify', change: { goal: 'Learn Spanish' } }, rc())).toMatchObject({ ok: false })
  })

  it('never proposes Progress when three Hard sessions brought the review forward', () => {
    const hard = { verdict: 'progress', evidence: ['The last three sessions were marked Hard.'], why: 'Moving on may help.', change: { skill: 'Short spoken answers' } }
    expect(checkReview(hard, rc({ hardRun: true }))).toEqual({ ok: false, reason: 'three Hard sessions in a row bring a review forward for Keep, Adjust or Simplify, never Progress' })
    expect(checkReview({ ...hard, verdict: 'simplify', change: { skill: 'Five words' } }, rc({ hardRun: true }))).toMatchObject({ ok: true })
  })

  it('holds one to three pieces of evidence, each number from the briefing, and a new physical skill to its safety line', () => {
    expect(checkReview({ verdict: 'keep', evidence: [], why: 'x', change: null }, rc())).toMatchObject({ ok: false, reason: 'one to three pieces of evidence' })
    expect(checkReview({ verdict: 'keep', evidence: ['a', 'b', 'c', 'd'], why: 'x', change: null }, rc())).toMatchObject({ ok: false })
    expect(checkReview({ verdict: 'keep', evidence: ['7 of the last 9 sessions marked Easy.'], why: 'x', change: null }, rc())).toMatchObject({ ok: false, reason: 'the number 7 is not in the briefing' })
    const hand = rc({ goal: 'Learn a headstand', currentSkill: 'Wall-supported holds', numbers: new Set(['6']) })
    expect(checkReview({ verdict: 'progress', evidence: ['6 practice days on wall holds.'], why: 'The holds read easy.', change: { skill: 'Chest-to-wall holds' } }, hand)).toEqual({ ok: false, reason: 'a new physical skill needs its safety line' })
    expect(checkReview({ verdict: 'progress', evidence: ['6 practice days on wall holds.'], why: 'The holds read easy.', change: { skill: 'Chest-to-wall holds', safety: 'Warm the wrists first; stop on any wrist or neck pain. Not medical advice.' } }, hand)).toMatchObject({ ok: true })
  })

  it('holds every text to the same checks as a suggestion', () => {
    expect(checkReview({ verdict: 'keep', evidence: ['You skipped the weekend.'], why: 'x', change: null }, rc())).toMatchObject({ ok: false, reason: 'reads silence or a refusal as a shortfall; say what the record holds' })
    expect(coachTextRefusal('Mastery in 6 weeks.', ctx())).toBe('gives a percentage, level, score or readiness; say counts in words')
  })
})

describe('the revision a proposal is written for', () => {
  const aim = { id: 1, name: 'Learn Italian', about: 'I can read a little', rhythm: { perWeek: 3, restDays: 0 }, schedule: [], currentSkillId: 2 }
  const skill = { id: 2, name: 'Ten words', method: 'An audio course', how: 'One lesson', minutes: 30 }
  it('is the same for the same commitment, and changes with its skill, the skill’s practice, its rhythm, its fixed days or a pause', () => {
    const r = revisionOf(aim, skill)
    expect(revisionOf({ ...aim }, { ...skill })).toBe(r)
    expect(r).toMatch(/^[0-9a-f]{8}$/)
    for (const [a, s] of [[aim, { ...skill, name: 'Twelve words' }], [aim, { ...skill, minutes: 20 }], [{ ...aim, rhythm: { perWeek: 4, restDays: 0 } }, skill], [{ ...aim, schedule: [1, 3] }, skill], [{ ...aim, pausedAt: '2026-10-01T00:00:00.000Z' }, skill], [{ ...aim, currentSkillId: 3 }, { ...skill, id: 3 }]] as const) {
      expect(revisionOf(a, s)).not.toBe(r)
    }
  })
})

describe('when a progression review is due', () => {
  const at = (day: string, h = 20) => `${day}T${String(h).padStart(2, '0')}:00:00.000Z`
  const days = (list: string[]) => list
  const input = (d: string[], extra: Partial<ReviewInput> = {}): ReviewInput => ({ days: days(d), sessions: d.map((x) => ({ day: x, at: at(x), ease: 'right' as const })), since: '2026-09-28', today: '2026-10-06', last: null, paused: false, ...extra })
  const six = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']

  it('is due at six different practice days with a week behind the skill, and not at five', () => {
    expect(reviewDue(input(six.slice(0, 5)))).toMatchObject({ due: false, days: 5 })
    expect(reviewDue(input(six))).toEqual({ due: true, kind: 'ordinary', days: 6, hardRun: false })
  })

  it('waits for the seventh calendar day even with six practice days', () => {
    expect(reviewDue(input(six, { since: '2026-10-01', today: '2026-10-06' }))).toMatchObject({ due: false })
    expect(reviewDue(input(six, { since: '2026-09-29', today: '2026-10-06' }))).toMatchObject({ due: true })
  })

  it('counts several sessions on one day once: ten sessions over three days are three days', () => {
    const three = ['2026-09-28', '2026-09-29', '2026-09-30']
    const sessions = Array.from({ length: 10 }, (_, k) => ({ day: three[k % 3], at: at(three[k % 3], 8 + k), ease: 'right' as const }))
    expect(reviewDue({ ...input(three), days: sessions.map((s) => s.day), sessions })).toMatchObject({ due: false, days: 3 })
  })

  it('comes again after every six more days since the review you answered, not before', () => {
    const twelve = [...six, '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
    const last = { days: 6, at: at('2026-10-03', 21) }
    expect(reviewDue(input(twelve.slice(0, 11), { last, today: '2026-10-09' }))).toMatchObject({ due: false, days: 11 })
    expect(reviewDue(input(twelve, { last, today: '2026-10-10' }))).toMatchObject({ due: true, kind: 'ordinary', days: 12 })
  })

  it('comes forward after three Hard sessions in a row on three different days, and not for three in one sitting', () => {
    const three = ['2026-09-28', '2026-09-29', '2026-09-30']
    const hard = three.map((d) => ({ day: d, at: at(d), ease: 'hard' as const }))
    expect(reviewDue({ ...input(three, { today: '2026-10-01' }), sessions: hard })).toEqual({ due: true, kind: 'struggle', days: 3, hardRun: true })
    const sitting = [0, 1, 2].map((k) => ({ day: three[0], at: at(three[0], 18 + k), ease: 'hard' as const }))
    expect(reviewDue({ ...input([three[0]], { today: '2026-10-01' }), sessions: sitting })).toMatchObject({ due: false, hardRun: false })
    // A run answered in a review does not bring it forward again.
    expect(reviewDue({ ...input(three, { today: '2026-10-01', last: { days: 3, at: at('2026-09-30', 23) } }), sessions: hard })).toMatchObject({ due: false })
  })

  it('never while paused', () => {
    expect(reviewDue(input(six, { paused: true }))).toMatchObject({ due: false })
  })
})
