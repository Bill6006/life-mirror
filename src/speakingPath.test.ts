import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import type { Aim, Offer, Outcome } from './db'
import { pathKey, pathToday } from './pathStage'

// The speaking Path's measurement through the day's view (P2 and P4, 2026-11-06): a stage with a gate moves on
// only when its floor is met and its behaviours are shown, one of them from outside the moment; stuck at the
// attempt cap, the stage below's reps come back beside it; a stage shown whose check again was missed past its
// grace brings its reps back; and practice is counted apart from what is shown.

const DAY = '2026-11-23'
const aim: Aim = { id: 7, kind: 'path', path: 'speaking', stepMoveId: null, createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null, strands: ['speaking'] }
const FIRST = ['sp-record-point', 'story-recording', 'read-aloud']
const SECOND = ['sp-point-to-few', 'sp-explain-to-few', 'sp-story-to-few']
const THREE = ['opening', 'pauses', 'example']

let seq = 100
function rep(moveId: string, day: string, setting: Offer['setting'], checks: Partial<Outcome>): [Offer, Outcome] {
  const id = ++seq
  const offer: Offer = { id, kind: 'step', day, block: 'morning', at: `${day}T14:00:00.000Z`, situationKey: pathKey('speaking'), target: 'mood', stance: '', band: '', reading: 0, moveId, minutes: 5, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { [moveId]: 1 }, chosenBy: 'app', paths: ['speaking'], setting, rule: 'only', stage: 1, skippedAt: null, closedAt: `${day}T14:10:00.000Z` }
  const outcome: Outcome = { id: id + 5000, offerId: id, moveId, day, block: 'morning', at: `${day}T14:10:00.000Z`, outcome: 'done', why: null, passiveOutcome: null, ...checks }
  return [offer, outcome]
}

/** Six recorded reps of the first stage over three weeks, each with three behaviours checked right after; one recording checked too when asked. */
function firstStage(end: string, confirmed: boolean): [Offer, Outcome][] {
  return [20, 17, 13, 10, 6, 3].map((back, k) => rep(FIRST[k % 3], addDays(end, -back), 'solo', { checks: THREE, ...(confirmed && k === 4 ? { recordingChecks: THREE } : {}) }))
}

function view(pairs: [Offer, Outcome][], day = DAY) {
  return pathToday({ aim, offers: pairs.map((p) => p[0]), outcomes: pairs.map((p) => p[1]), ctx: null, day, block: 'morning' })
}
const speakingOf = (v: ReturnType<typeof view>) => v.strands.find((s) => s.strand.id === 'speaking')!

describe('the speaking Path’s gate, through the day’s view', () => {
  it('holds the first stage while its floor is met on your own checks alone, and moves on once one is confirmed from outside the moment', () => {
    const own = speakingOf(view(firstStage(DAY, false)))
    expect(own.state.stage).toBe(1)
    expect(own.measure).toMatchObject({ practised: 6, shownIn: 1, of: 1 })
    expect(own.measure?.reading).toMatchObject({ metOn: null, confirmed: 0 })
    const shown = speakingOf(view(firstStage(DAY, true)))
    expect(shown.state.stage).toBe(2)
    expect(shown.elig.stageReps.map((m) => m.id).sort()).toEqual([...SECOND].sort())
  })

  it('brings the first stage’s reps back beside the second after the attempt cap without its behaviours shown', () => {
    const base = firstStage(addDays(DAY, -21), true)
    const tries = (n: number) => Array.from({ length: n }, (_, k) => rep(SECOND[k % 3], addDays(DAY, -(n - k)), k % 2 ? 'group' : 'recurring', { checks: ['opening'] }))
    const seven = speakingOf(view([...base, ...tries(7)]))
    expect(seven.state.stage).toBe(2)
    expect(seven.measure?.stuck).toBe(false)
    expect(seven.elig.stageReps.some((m) => FIRST.includes(m.id))).toBe(false)
    const eight = speakingOf(view([...base, ...tries(8)]))
    expect(eight.measure?.stuck).toBe(true)
    expect(eight.measure?.reading?.attempts).toBe(8)
    expect(eight.elig.stageReps.map((m) => m.id).sort()).toEqual([...FIRST, ...SECOND].sort())
  })

  it('brings a stage shown back when its check a month later was missed past the grace, and holds it while the check waits', () => {
    // The first stage shown 50 days ago; its check fell due 20 days ago, and no rep of it since.
    const shownEnd = addDays(DAY, -50)
    const base = firstStage(shownEnd, true)
    const lately = [5, 3, 1].map((back, k) => rep(SECOND[k], addDays(DAY, -back), 'recurring', { checks: ['opening'] }))
    const missed = speakingOf(view([...base, ...lately]))
    expect(missed.state.stage).toBe(2)
    expect(missed.measure?.refresh).toEqual([1])
    expect(missed.elig.stageReps.some((m) => FIRST.includes(m.id))).toBe(true)
    // A week after it fell due, within the grace: it holds, and nothing comes back.
    const waiting = speakingOf(view([...base, ...lately.map(([o, x]) => rep(o.moveId, addDays(o.day, -16), 'recurring', { checks: x.checks }))], addDays(DAY, -16)))
    expect(waiting.measure?.refresh).toEqual([])
    expect(waiting.elig.stageReps.some((m) => FIRST.includes(m.id))).toBe(false)
  })
})
