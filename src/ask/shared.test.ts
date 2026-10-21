import { describe, expect, it } from 'vitest'
import { allowanceUsed, askQueue, askTaskIds, askWaitOf, deepTaskId, handTaskIds, roomFor, triesOf, type AskRun } from './shared'

// Where a question for Claude stands, as the phone says it (Ask Life Mirror, stage A2; the agreed design's point 17), and the
// day's allowance as the phone and the Worker both count it: each run that reached Claude counts one, the deep tier two
// (its measured cost over a standard answer's, rounded up, 2026-10-21).

const DAY = '2026-10-20'
const run = (over: Partial<AskRun>): AskRun => ({ id: askTaskIds(DAY)[0], task: 'ask', day: DAY, at: `${DAY}T15:00:00.000Z`, status: 'fired', firedAt: `${DAY}T15:00:00.000Z`, turns: [1], ...over })
const ready = { cloud: true, queued: false, reachable: true }

describe('the day’s allowance', () => {
  it('counts each run that reached Claude once and the deep tier twice; a refused fire counts nothing', () => {
    expect(allowanceUsed([run({}), run({ id: askTaskIds(DAY)[1], firedAt: undefined, status: 'fallback' }), run({ id: deepTaskId(DAY), task: 'deep' })])).toBe(3)
    expect(roomFor('ask', [run({}), run({ id: askTaskIds(DAY)[1] })])).toBe(true)
    expect(roomFor('ask', [run({}), run({ id: askTaskIds(DAY)[1] }), run({ id: askTaskIds(DAY)[2] })])).toBe(false)
    expect(roomFor('deep', [])).toBe(true)
    expect(roomFor('deep', [run({})])).toBe(true)
    expect(roomFor('deep', [run({}), run({ id: askTaskIds(DAY)[1] })])).toBe(false)
  })

  it('counts a turn’s tries: the runs that carried it and reached Claude with no checked answer', () => {
    expect(triesOf(1, [run({ status: 'fallback' }), run({ id: askTaskIds(DAY)[1], status: 'written' }), run({ id: askTaskIds(DAY)[2], turns: [2], status: 'refused' })])).toBe(1)
  })
})

describe('where a question for Claude stands', () => {
  const turn = { id: 1, tier: 'standard' }

  it('says plainly when the phone keeps no cloud copy, or the question has not gone yet', () => {
    expect(askWaitOf(turn, [], { ...ready, cloud: false })).toEqual({ kind: 'cloud' })
    expect(askWaitOf(turn, [], { ...ready, queued: true, reachable: false })).toEqual({ kind: 'unsent' })
    // Queued but the phone can reach the cloud: it goes with the next sync.
    expect(askWaitOf(turn, [], { ...ready, queued: true })).toEqual({ kind: 'soon' })
  })

  it('follows its run: at work, refused and tried again at a time, or two runs reached Claude with no checked answer', () => {
    expect(askWaitOf(turn, [run({ status: 'firing', firedAt: undefined })], ready)).toEqual({ kind: 'soon' })
    expect(askWaitOf(turn, [run({})], ready)).toEqual({ kind: 'soon' })
    expect(askWaitOf(turn, [run({ status: 'fallback', firedAt: undefined, at: `${DAY}T15:00:00.000Z` })], ready)).toEqual({ kind: 'refused', retryAt: `${DAY}T15:15:00.000Z` })
    expect(askWaitOf(turn, [run({ status: 'fallback' }), run({ id: askTaskIds(DAY)[1], status: 'refused', at: `${DAY}T15:30:00.000Z` })], ready)).toEqual({ kind: 'failed' })
  })

  it('waits for tomorrow once the day’s answers are used, and never for the day’s line (item 1 of 2026-10-21)', () => {
    const used = [run({ turns: [7] }), run({ id: askTaskIds(DAY)[1], turns: [8], status: 'written' }), run({ id: askTaskIds(DAY)[2], turns: [9], status: 'written' })]
    expect(askWaitOf(turn, used, ready)).toEqual({ kind: 'tomorrow' })
    // No line written yet, no run today: it is next.
    // The deep tier needs two answers free.
    expect(askWaitOf({ id: 1, tier: 'deep' }, [run({ turns: [7], status: 'written' }), run({ id: askTaskIds(DAY)[1], turns: [8], status: 'written' })], ready)).toEqual({ kind: 'tomorrow' })
    expect(askWaitOf({ id: 1, tier: 'deep' }, [run({ turns: [7], status: 'written' })], ready)).not.toEqual({ kind: 'tomorrow' })
    expect(askWaitOf(turn, [], ready)).toEqual({ kind: 'soon' })
  })
})

describe('the day’s queue, one rule for the phone and the Worker (item 1 of 2026-10-21)', () => {
  const standard = (id: number) => ({ id, tier: 'standard', day: DAY })
  const deep = (id: number) => ({ id, tier: 'deep', day: DAY })

  it('takes the waiting questions in order within three units, the deep tier counting two, and says what is left', () => {
    expect(askQueue([standard(1), standard(2)], [], DAY)).toEqual({ taken: [1, 2], tomorrow: [], left: 1, deep: false })
    expect(askQueue([deep(1), standard(2)], [], DAY)).toEqual({ taken: [1, 2], tomorrow: [], left: 0, deep: false })
    expect(askQueue([standard(1), standard(2), standard(3), standard(4)], [], DAY)).toEqual({ taken: [1, 2, 3], tomorrow: [4], left: 0, deep: false })
    expect(askQueue([], [], DAY)).toEqual({ taken: [], tomorrow: [], left: 3, deep: true })
  })

  it('runs the deep tier once a day, and never lets a deep question that no longer fits hold a standard one behind it', () => {
    const deepRan = run({ id: deepTaskId(DAY), task: 'deep', turns: [5], status: 'written' })
    expect(askQueue([deep(1), standard(2)], [deepRan], DAY)).toEqual({ taken: [2], tomorrow: [1], left: 0, deep: false })
    const twoUsed = [run({ turns: [5], status: 'written' }), run({ id: askTaskIds(DAY)[1], turns: [6], status: 'written' })]
    expect(askQueue([deep(1), standard(2)], twoUsed, DAY)).toEqual({ taken: [2], tomorrow: [1], left: 0, deep: false })
  })

  it('counts a question a run is at the moment it is fired, and never takes it twice', () => {
    const firing = run({ turns: [1], status: 'firing', firedAt: undefined })
    expect(askQueue([standard(1), standard(2)], [firing], DAY)).toEqual({ taken: [2], tomorrow: [], left: 1, deep: false })
    const deepFiring = run({ id: deepTaskId(DAY), task: 'deep', turns: [1], status: 'firing', firedAt: undefined })
    expect(askQueue([deep(1), deep(2)], [deepFiring], DAY)).toEqual({ taken: [], tomorrow: [2], left: 1, deep: false })
  })

  it('counts nothing a run by hand did, its own ids or a row left in one of the owner’s slots, and never as the day’s deep', () => {
    expect(handTaskIds(DAY)).toHaveLength(9)
    expect(handTaskIds(DAY).some((id) => [...askTaskIds(DAY), deepTaskId(DAY)].includes(id))).toBe(false)
    const legacy = run({ id: deepTaskId(DAY), task: 'deep', turns: [], status: 'written', dry: true })
    const hand = run({ id: handTaskIds(DAY)[0], task: 'ask', turns: [], status: 'written', dry: true })
    expect(allowanceUsed([legacy, hand])).toBe(0)
    expect(roomFor('deep', [legacy, hand])).toBe(true)
    expect(askQueue([deep(1), standard(2)], [legacy, hand], DAY)).toEqual({ taken: [1, 2], tomorrow: [], left: 0, deep: false })
  })

  it('lets go a question past the days a question waits, or out of tries, taking nothing for it', () => {
    const old = { id: 1, tier: 'standard', day: '2026-10-17' }
    expect(askQueue([old, standard(2)], [], DAY)).toEqual({ taken: [2], tomorrow: [], left: 2, deep: true })
    const tried = [run({ turns: [1], status: 'fallback' }), run({ id: askTaskIds(DAY)[1], turns: [1], status: 'refused' })]
    expect(askQueue([standard(1)], tried, DAY).taken).toEqual([])
  })

  it('says each question’s state from the same queue: tomorrow exactly for the questions it leaves', () => {
    const turns = [deep(1), standard(2)]
    const runs = [run({ id: deepTaskId(DAY), task: 'deep', turns: [5], status: 'written' })]
    const queue = askQueue(turns, runs, DAY)
    expect(askWaitOf(turns[0], runs, ready, queue)).toEqual({ kind: 'tomorrow' })
    expect(askWaitOf(turns[1], runs, ready, queue)).toEqual({ kind: 'soon' })
  })
})
