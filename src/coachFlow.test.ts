import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addLearning, editSkill, logSession, pauseAim, resumeAim, setCurrentSkill, setEase, studyAims } from './aimFlow'
import { stepFor } from './aims'
import { setBrainSwitch } from './brainPrefs'
import { factSheet } from './brainFlow'
import { anotherSuggestion, answerReview, askSuggestion, coachMode, coachStates, editedSuggestion, ensureReviews, skillCoachOpen, takeLikelyNext, useSuggestion, writeOwnSkill } from './coachFlow'
import { proposalIdOf, revisionOf, type CoachProposal } from './coachShared'
import { db, updateSettings, type Aim } from './db'
import { factById } from './facts'
import { recordOutcome } from './offerFlow'
import { dueOf } from './rhythm'
import { phoneReview } from './situations'

// Parts 40 and 41 on the phone, against the real store: with the gate closed nothing is asked,
// shown or written and the commitment works by hand; opened, Claude is asked only when it may be,
// its answer replaces nothing until you choose, an answer written before an edit is dropped, and a
// review comes at six different practice days with a week behind the skill, or after three Hard
// sessions in a row, and changes nothing until you answer it.

const T = (d: number, h = 20, m = 0) => new Date(2026, 8, d, h, m)
const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}`

async function italian(skill = ''): Promise<Aim> {
  await addLearning('Learn Italian', 'A phrasebook', skill, 'I can read a little', T(20, 9))
  const [aim] = await studyAims()
  return aim
}
async function withCloud(): Promise<void> {
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: 'a token for the test' } }))
}
/** Claude's answer to an ask, as the pull would put it on the phone. */
async function answer(askId: number, p: Partial<CoachProposal>): Promise<void> {
  const ask = await db.coachAsks.get(askId)
  if (!ask) throw new Error('no ask')
  await db.coachProposals.put({ id: proposalIdOf(askId), askId, aimId: ask.aimId, kind: ask.kind, revision: ask.revision, day: ask.day, at: `${ask.day}T21:00:00.000Z`, model: 'claude-opus-5-5', askedModel: 'opus', ...p })
}
const suggestion = { skill: 'Understand everyday spoken Italian', method: 'A phrasebook', how: 'One page a session, read aloud.', minutes: 30, rhythm: { perWeek: 5, restDays: 0 }, why: 'Listening first builds the ear.', physical: false, safety: null, likelyNext: 'Short spoken answers' }

describe('who may see the skill coach', () => {
  afterEach(() => vi.unstubAllGlobals())
  const flag = (v: string | null) => vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'life-mirror.preview.skillCoach' ? v : null) })

  it('is closed as the build ships, and an ordinary browser cannot preview it, whatever it stores', () => {
    expect(coachMode()).toBe('gated')
    vi.stubGlobal('navigator', { webdriver: false })
    flag('1')
    expect(coachMode()).toBe('gated')
    expect(skillCoachOpen()).toBe(false)
  })

  it('previews only in an automated test browser that asks for it, and opens for everyone only with the gate', () => {
    vi.stubGlobal('navigator', { webdriver: true })
    flag(null)
    expect(coachMode()).toBe('gated')
    flag('1')
    expect(coachMode()).toBe('preview')
    expect(skillCoachOpen()).toBe(true)
    vi.stubGlobal('navigator', { webdriver: false })
    expect(coachMode('open')).toBe('open')
  })
})

describe('with the gate closed (as it stays until the owner turns it on)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('asks nothing, shows nothing and writes nothing, and the commitment is set by hand as before', async () => {
    const aim = await italian()
    await withCloud()
    expect(await coachStates(day(20))).toBeNull()
    expect(await askSuggestion(aim.id as number, T(20))).toBeNull()
    expect(await ensureReviews(day(20), T(20))).toBe(0)
    expect(await db.coachAsks.count()).toBe(0)
    expect(await setCurrentSkill(aim.id as number, { name: 'Ten words' }, T(20, 10))).not.toBeNull()
    expect((await db.skills.toArray())[0]).toMatchObject({ name: 'Ten words', source: 'you' })
  })
})

describe('a suggestion for the current skill (Part 40)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('asks a physical goal one safety question first, and carries the answer to another suggestion', async () => {
    await withCloud()
    await addLearning('Land a cartwheel', 'A video course', '', '', T(20, 9))
    const [aim] = await studyAims()
    const id = aim.id as number
    expect((await coachStates(day(20), 'open'))?.get(id)?.physical).toBe(true)
    // Not without its answer; an empty one is "nothing to add".
    expect(await askSuggestion(id, T(20), undefined, 'open')).toBeNull()
    const ask = (await askSuggestion(id, T(20), undefined, 'open', '  A sore left wrist  ')) as number
    expect(await db.coachAsks.get(ask)).toMatchObject({ care: 'A sore left wrist' })
    expect((await coachStates(day(20), 'open'))?.get(id)?.care).toBe('A sore left wrist')
    await answer(ask, { suggestion: { ...suggestion, skill: 'Cartwheels along a line', method: null, physical: true, safety: 'Warm the wrists first; stop at sharp pain.', rhythm: { perWeek: 3, restDays: 1 } } })
    const again = (await anotherSuggestion(ask, T(20, 21), 'open')) as number
    expect(await db.coachAsks.get(again)).toMatchObject({ care: 'A sore left wrist', after: proposalIdOf(ask) })
    // A goal that is not physical asks nothing of the kind, and keeps no answer.
    await italian()
    const fr = (await studyAims()).find((a) => a.name === 'Learn Italian') as Aim
    const plain = (await askSuggestion(fr.id as number, T(20), undefined, 'open', 'ignored')) as number
    expect((await coachStates(day(20), 'open'))?.get(fr.id as number)?.physical).toBe(false)
    expect(await db.coachAsks.get(plain)).not.toHaveProperty('care')
  })

  it('writes one ask for two taps at once', async () => {
    await withCloud()
    const aim = await italian()
    const [a, b] = await Promise.all([askSuggestion(aim.id as number, T(20), undefined, 'open'), askSuggestion(aim.id as number, T(20), undefined, 'open')])
    expect(a).not.toBeNull()
    expect(b).toBe(a)
    expect(await db.coachAsks.count()).toBe(1)
  })

  it('takes the likely next skill on your tap alone, as Claude’s, the one before kept in the history', async () => {
    await withCloud()
    const aim = await italian()
    const id = aim.id as number
    const ask = (await askSuggestion(id, T(20), undefined, 'open')) as number
    await answer(ask, { suggestion })
    expect(await useSuggestion(ask, T(20, 21))).toBe(true)
    const next = await takeLikelyNext(id, T(22, 9))
    const skills = await db.skills.toArray()
    expect(skills.find((s) => s.id === next)).toMatchObject({ name: 'Short spoken answers', method: 'A phrasebook', source: 'claude' })
    expect(skills.find((s) => s.name === 'Understand everyday spoken Italian')?.endedAt).toBeTruthy()
    // The new skill names no likely next of its own: nothing more to take.
    expect(await takeLikelyNext(id, T(22, 10))).toBeNull()
  })

  it('is asked only when Claude may be: never without a cloud copy, or with the Commitments switch off', async () => {
    const aim = await italian()
    const id = aim.id as number
    expect(await askSuggestion(id, T(20), undefined, 'open')).toBeNull()
    await withCloud()
    await setBrainSwitch('commitments', false)
    expect(await askSuggestion(id, T(20), undefined, 'open')).toBeNull()
    await setBrainSwitch('commitments', true)
    const ask = await askSuggestion(id, T(20), undefined, 'open')
    expect(ask).not.toBeNull()
    expect(await db.coachAsks.get(ask as number)).toMatchObject({ aimId: id, kind: 'setup', claude: true, day: day(20), revision: revisionOf(aim, null) })
    // One open ask at a time.
    expect(await askSuggestion(id, T(20, 21), undefined, 'open')).toBe(ask)
    expect(await db.coachAsks.count()).toBe(1)
    // A preview (a test browser's) needs no cloud copy: its asks go nowhere.
    await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: null } }))
    expect((await coachStates(day(20), 'preview'))?.get(id)?.mayAsk).toBe(true)
    expect((await coachStates(day(20), 'open'))?.get(id)?.mayAsk).toBe(false)
  })

  it('never asks about a goal in faith’s words while faith is hidden', async () => {
    await withCloud()
    await addLearning('Read the Bible in Greek', '', '', '', T(20, 9))
    const [aim] = await studyAims()
    await updateSettings((s) => ({ ...s, hideFaith: true }))
    expect((await coachStates(day(20), 'open'))?.get(aim.id as number)?.mayAsk).toBe(false)
  })

  it('Use this: the suggestion becomes the current skill, Claude’s, with its rhythm, safety line and likely next; the one before stays in the history', async () => {
    await withCloud()
    const aim = await italian('Numbers')
    const id = aim.id as number
    const ask = (await askSuggestion(id, T(21), undefined, 'open')) as number
    expect((await coachStates(day(21), 'open'))?.get(id)?.setup).toMatchObject({ proposal: null })
    await answer(ask, { suggestion })
    expect((await coachStates(day(21), 'open'))?.get(id)?.setup?.proposal?.suggestion?.skill).toBe(suggestion.skill)
    expect(await useSuggestion(ask, T(21, 22))).toBe(true)
    const now = (await db.aims.get(id)) as Aim
    const skills = await db.skills.toArray()
    const current = skills.find((s) => s.id === now.currentSkillId)
    expect(current).toMatchObject({ name: suggestion.skill, method: 'A phrasebook', how: suggestion.how, minutes: 30, source: 'claude', likelyNext: 'Short spoken answers' })
    expect(now.rhythm).toEqual({ perWeek: 5, restDays: 0 })
    expect(skills.find((s) => s.name === 'Numbers')?.endedAt).toBeTruthy()
    expect((await db.coachAsks.get(ask))?.decision).toBe('used')
    expect((await coachStates(day(21), 'open'))?.get(id)?.setup).toBeNull()
  })

  it('Edit first: your words become the current skill, still Claude’s if its name stands and yours if renamed, with the rhythm you leave', async () => {
    await withCloud()
    const aim = await italian()
    const ask = (await askSuggestion(aim.id as number, T(21), undefined, 'open')) as number
    await answer(ask, { suggestion })
    expect(await editedSuggestion(ask, { name: 'Understand spoken Italian at the café', method: 'A phrasebook', how: 'Half a page.', minutes: 15 }, null, T(21, 22))).toBe(true)
    const skill = (await db.skills.toArray())[0]
    expect(skill).toMatchObject({ name: 'Understand spoken Italian at the café', minutes: 15, source: 'you' })
    expect((await db.aims.get(aim.id as number))?.rhythm).toBeNull()
    expect((await db.coachAsks.get(ask))?.decision).toBe('edited')
  })

  it('Another suggestion sets this one aside and asks again; Write my own sets it aside for your words', async () => {
    await withCloud()
    const aim = await italian()
    const id = aim.id as number
    const first = (await askSuggestion(id, T(21), undefined, 'open')) as number
    await answer(first, { suggestion })
    const second = await anotherSuggestion(first, T(21, 22), 'open')
    expect(second).not.toBeNull()
    expect((await db.coachAsks.get(first))?.decision).toBe('another')
    expect(await db.coachAsks.get(second as number)).toMatchObject({ kind: 'setup', after: proposalIdOf(first) })
    await answer(second as number, { suggestion: { ...suggestion, skill: 'The numbers to twenty' } })
    await writeOwnSkill(second as number, T(21, 23))
    expect((await db.coachAsks.get(second as number))?.decision).toBe('own')
    expect((await db.aims.get(id))?.currentSkillId).toBeNull()
  })

  it('drops an answer written before you changed the commitment: it replaces nothing', async () => {
    await withCloud()
    const aim = await italian('Numbers')
    const id = aim.id as number
    const ask = (await askSuggestion(id, T(21), undefined, 'open')) as number
    await answer(ask, { suggestion })
    await setCurrentSkill(id, { name: 'Ten words' }, T(21, 21))
    expect((await coachStates(day(21), 'open'))?.get(id)?.setup).toBeNull()
    expect(await useSuggestion(ask, T(21, 22))).toBe(false)
    const holder = await db.aims.get(id)
    const current = (await db.skills.toArray()).find((s) => s.id === holder?.currentSkillId)
    expect(current?.name).toBe('Ten words')
  })

  it('lets an ask no run answered go after three days; the card is yours again', async () => {
    await withCloud()
    const aim = await italian()
    await askSuggestion(aim.id as number, T(20), undefined, 'open')
    expect((await coachStates(day(23), 'open'))?.get(aim.id as number)?.setup).not.toBeNull()
    expect((await coachStates(day(24), 'open'))?.get(aim.id as number)?.setup).toBeNull()
  })

  it('keeps the rest days a physical skill’s suggestion gave: the day after a session rests, and no second session that day', async () => {
    await withCloud()
    await addLearning('Learn a cartwheel', '', '', '', T(20, 9))
    const [aim] = await studyAims()
    const ask = (await askSuggestion(aim.id as number, T(20), undefined, 'open', '')) as number
    await answer(ask, { suggestion: { ...suggestion, skill: 'Cartwheels along a line', method: null, how: 'Kick over along a line, land with control.', minutes: 12, rhythm: { perWeek: 3, restDays: 1 }, physical: true, safety: 'Warm the wrists first; stop on any wrist or neck pain. Not medical advice.', likelyNext: 'Chest-to-wall holds' } })
    await useSuggestion(ask, T(20, 21))
    const now = (await db.aims.get(aim.id as number)) as Aim
    expect(now.rhythm).toEqual({ perWeek: 3, restDays: 1 })
    expect((await db.skills.toArray()).find((s) => s.id === now.currentSkillId)?.safety).toContain('Not medical advice')
    expect(dueOf({ rhythm: now.rhythm ?? null, schedule: [], paused: false, started: false, doneToday: false, partlyToday: false, planned: false, faith: false, practiceDays: [day(21)], today: day(22) }).state).toBe('resting')
  })
})

describe('a progression review (Part 41)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await withCloud()
  })

  /** Sessions of the current skill on these days of September, each done, with how it went. */
  async function practise(aim: Aim, days: readonly number[], ease: 'hard' | 'right' | 'easy' = 'right', hour = 20): Promise<void> {
    for (const d of days) {
      const skills = await db.skills.toArray()
      const current = (await db.aims.get(aim.id as number)) as Aim
      const id = await logSession(current, stepFor(current, skills, [], [current]), T(d, hour))
      await setEase(id, ease)
    }
  }

  it('comes at six different practice days with a week behind the skill, asks Claude when it may, and shows the question meanwhile', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24])
    expect(await ensureReviews(day(26), T(26), 'open')).toBe(0)
    await practise(aim, [25])
    expect(await ensureReviews(day(26), T(26), 'open')).toBe(0)
    expect(await ensureReviews(day(27), T(27), 'open')).toBe(1)
    const review = (await coachStates(day(27), 'open'))?.get(aim.id as number)?.review
    expect(review?.ask).toMatchObject({ kind: 'review', claude: true, days: 6, reason: 'ordinary', hardRun: false })
    expect(review?.proposal).toBeNull()
    // One open review at a time.
    expect(await ensureReviews(day(27), T(27, 21), 'open')).toBe(0)
  })

  it('counts several sessions on one day once, and never a refusal', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 20, 20, 21, 21, 22])
    const current = (await db.aims.get(aim.id as number)) as Aim
    const offer = await resumeAim(current, stepFor(current, await db.skills.toArray(), [], [current]), 'step', T(23))
    await recordOutcome(offer, 'no', 'noTime', null, { day: day(23), block: 'evening' })
    expect(await ensureReviews(day(30), T(30), 'open')).toBe(0)
  })

  it('comes forward after three Hard sessions in a row on three different days, and not while paused', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22], 'hard')
    await pauseAim(aim.id as number, true)
    expect(await ensureReviews(day(23), T(23), 'open')).toBe(0)
    await pauseAim(aim.id as number, false)
    expect(await ensureReviews(day(23), T(23), 'open')).toBe(1)
    expect((await coachStates(day(23), 'open'))?.get(aim.id as number)?.review?.ask).toMatchObject({ reason: 'struggle', hardRun: true, days: 3 })
  })

  it('is asked of the phone alone when Claude may not be, the same question, neutrally', async () => {
    await setBrainSwitch('commitments', false)
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25])
    expect(await ensureReviews(day(27), T(27), 'open')).toBe(1)
    expect((await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.ask.claude).toBe(false)
  })

  it('puts one review in place when two checks land together', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25])
    const added = await Promise.all([ensureReviews(day(27), T(27), 'open'), ensureReviews(day(27), T(27), 'open')])
    expect(added[0] + added[1]).toBe(1)
    expect(await db.coachAsks.where('kind').equals('review').count()).toBe(1)
  })

  it('changes nothing until answered: Keep restarts the count, and the next comes after six more days', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25])
    await ensureReviews(day(27), T(27), 'open')
    const ask = (await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.ask.id as number
    const before = await db.skills.toArray()
    expect(await answerReview(ask, { decision: 'kept' }, T(27, 21))).toBe(true)
    expect(await db.skills.toArray()).toEqual(before)
    expect((await coachStates(day(27), 'open'))?.get(aim.id as number)?.review).toBeNull()
    await practise(aim, [28, 29, 30])
    expect(await ensureReviews(day(30), T(30, 22), 'open')).toBe(0)
  })

  it('takes Claude’s change only on your tap: Progress names the next skill and keeps the goal, the one before in the history', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25], 'easy')
    await ensureReviews(day(27), T(27), 'open')
    const ask = (await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.ask.id as number
    await answer(ask, { review: { verdict: 'progress', evidence: ['6 of the last 6 sessions marked Easy.'], why: 'The ten words hold.', change: { skill: 'Short spoken answers', how: 'Answer each prompt aloud in a full sentence.' } } })
    expect((await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.proposal?.review?.verdict).toBe('progress')
    expect(await answerReview(ask, { decision: 'progressed', change: { skill: 'Short spoken answers', how: 'Answer each prompt aloud in a full sentence.' } }, T(27, 21))).toBe(true)
    const now = (await db.aims.get(aim.id as number)) as Aim
    expect(now.name).toBe('Learn Italian')
    const skills = await db.skills.toArray()
    expect(skills.find((s) => s.id === now.currentSkillId)).toMatchObject({ name: 'Short spoken answers', method: 'A phrasebook', source: 'claude' })
    expect(skills.find((s) => s.name === 'Ten words')?.endedAt).toBeTruthy()
  })

  it('adjusts the same skill’s practice, simplifies to a smaller skill, returns to an earlier one, or takes the one you write', async () => {
    const aim = await italian('Ten words')
    const id = aim.id as number
    const due = async (d: number) => {
      await ensureReviews(day(d), T(d), 'open')
      return (await coachStates(day(d), 'open'))?.get(id)?.review?.ask.id as number
    }
    await practise(aim, [20, 21, 22, 23, 24, 25])
    expect(await answerReview(await due(27), { decision: 'adjusted', change: { minutes: 15 } }, T(27, 21))).toBe(true)
    expect((await db.skills.toArray()).find((s) => s.name === 'Ten words')?.minutes).toBe(15)
    await practise(aim, [28, 29, 30])
    await practise(aim, [1, 2, 3].map((d) => d + 30))
    const simplify = await due(34)
    expect(simplify).toBeTruthy()
    expect(await answerReview(simplify, { decision: 'simplified', change: { skill: 'Five words' } }, T(34, 21))).toBe(true)
    const after = await db.aims.get(id)
    // No answer from Claude named it, so the name is yours.
    expect((await db.skills.toArray()).find((s) => s.id === after?.currentSkillId)).toMatchObject({ name: 'Five words', source: 'you' })
    expect((await db.aims.get(id))?.name).toBe('Learn Italian')
  })

  it('drops Claude’s view written before you changed the skill’s practice: the review stays open, asked neutrally', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25], 'easy')
    await ensureReviews(day(27), T(27), 'open')
    const ask = (await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.ask.id as number
    await answer(ask, { review: { verdict: 'adjust', evidence: ['6 of the last 6 sessions marked Easy.'], why: 'Longer sessions fit now.', change: { minutes: 40 } } })
    expect((await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.proposal?.review?.verdict).toBe('adjust')
    const skill = (await db.skills.toArray()).find((k) => k.name === 'Ten words')
    await editSkill(skill?.id as number, { name: 'Ten words', method: 'A phrasebook', minutes: 25 })
    const review = (await coachStates(day(27), 'open'))?.get(aim.id as number)?.review
    expect(review?.ask.id).toBe(ask)
    expect(review?.proposal).toBeNull()
  })

  it('names a skill Claude’s only when its answer named it: renamed in Edit first, it is yours', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25], 'easy')
    await ensureReviews(day(27), T(27), 'open')
    const ask = (await coachStates(day(27), 'open'))?.get(aim.id as number)?.review?.ask.id as number
    await answer(ask, { review: { verdict: 'progress', evidence: ['6 of the last 6 sessions marked Easy.'], why: 'The ten words hold.', change: { skill: 'Short spoken answers' } } })
    expect(await answerReview(ask, { decision: 'progressed', change: { skill: 'Twenty words' } }, T(27, 21))).toBe(true)
    const now = (await db.aims.get(aim.id as number)) as Aim
    expect((await db.skills.toArray()).find((s) => s.id === now.currentSkillId)).toMatchObject({ name: 'Twenty words', source: 'you' })
  })

  it('carries an open review onto the sheet and into Sunday’s review, once its gate is open; closed, the sheet says nothing of it', async () => {
    const aim = await italian('Ten words')
    await practise(aim, [20, 21, 22, 23, 24, 25])
    await ensureReviews(day(27), T(27), 'open')
    // Closed (as the build ships): the commitment's fact is as it was.
    const closed = await factSheet(day(27), T(27, 21))
    expect(factById(closed, `aim.${aim.id}`)?.values).not.toHaveProperty('review')
    expect(factById(closed, `aim.${aim.id}`)?.text).not.toContain('progression review')
    // Open: it says the review waits, never a verdict.
    const open = await factSheet(day(27), T(27, 21), 'open')
    expect(factById(open, `aim.${aim.id}`)?.values).toMatchObject({ review: 'open', reviewDays: 6, reviewReason: 'ordinary' })
    expect(factById(open, `aim.${aim.id}`)?.text).toContain('after 6 practice days on it, a progression review waits for your answer')
  })
})

describe('the phone’s weekly review, once a progression review is open', () => {
  it('makes it the week’s change to decide', () => {
    const sheet = { version: 1, day: '2026-09-27', builtAt: '', hour: 9, weeks: 1, days: 7, direction: null, said: [], checkedIn: {}, facts: [{ id: 'aim.1', tags: ['study'], text: 'x', values: { name: 'Learn Italian', skill: 'Ten words', review: 'open' } }, { id: 'trajectory.1', tags: ['study'], text: 'x', values: { name: 'Learn Italian', w0: 3, d0: 3, ageDays: 10 } }] } as unknown as Parameters<typeof phoneReview>[0]
    expect(phoneReview(sheet, []).change).toBe('Learn Italian: the review of “Ten words” waits for your answer, on its card.')
  })
})
