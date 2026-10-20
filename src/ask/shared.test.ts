import { describe, expect, it } from 'vitest'
import { allowanceUsed, askTaskIds, askWaitOf, deepTaskId, roomFor, triesOf, type AskRun } from './shared'

// Where a question for Claude stands, as the phone says it (Ask Life Mirror, stage A2; the agreed design's point 17), and the
// day's allowance as the phone and the Worker both count it: each run that reached Claude counts one, the deep tier three.

const DAY = '2026-10-20'
const run = (over: Partial<AskRun>): AskRun => ({ id: askTaskIds(DAY)[0], task: 'ask', day: DAY, at: `${DAY}T15:00:00.000Z`, status: 'fired', firedAt: `${DAY}T15:00:00.000Z`, turns: [1], ...over })
const ready = { cloud: true, queued: false, reachable: true, lineIn: true }

describe('the day’s allowance', () => {
  it('counts each run that reached Claude once and the deep tier three times; a refused fire counts nothing', () => {
    expect(allowanceUsed([run({}), run({ id: askTaskIds(DAY)[1], firedAt: undefined, status: 'fallback' }), run({ id: deepTaskId(DAY), task: 'deep' })])).toBe(4)
    expect(roomFor('ask', [run({}), run({ id: askTaskIds(DAY)[1] })])).toBe(true)
    expect(roomFor('ask', [run({}), run({ id: askTaskIds(DAY)[1] }), run({ id: askTaskIds(DAY)[2] })])).toBe(false)
    expect(roomFor('deep', [])).toBe(true)
    expect(roomFor('deep', [run({})])).toBe(false)
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

  it('waits for tomorrow once the day’s answers are used, and for the day’s line before any run', () => {
    const used = [run({ turns: [7] }), run({ id: askTaskIds(DAY)[1], turns: [8], status: 'written' }), run({ id: askTaskIds(DAY)[2], turns: [9], status: 'written' })]
    expect(askWaitOf(turn, used, ready)).toEqual({ kind: 'tomorrow' })
    expect(askWaitOf(turn, [], { ...ready, lineIn: false })).toEqual({ kind: 'line' })
    // The deep tier needs three answers free.
    expect(askWaitOf({ id: 1, tier: 'deep' }, [run({ turns: [7], status: 'written' })], ready)).toEqual({ kind: 'tomorrow' })
    expect(askWaitOf(turn, [], ready)).toEqual({ kind: 'soon' })
  })
})
