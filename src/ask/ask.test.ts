import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASK, evidenceWordingRefusal } from '../brainShared'
import { copy } from '../copy'
import { formatDayShort } from '../format'
import type { RepairEvidence, TestShown, TrackLine } from '../repair/evidence'
import { changesOf, citeOf, evidenceVersion, threadState } from './evidence'
import { askMode, askOn } from './gate'
import { contextNamed, matchFindings } from './match'
import { aboutAnswer, changedAnswer, keysOfLine, knowAnswer, nextAnswer, soonerOf, startersShown, testContextLine } from './quick'
import type { AskTurn } from './types'

// Ask Life Mirror's quick tier (stage A1, 2026-10-19), on stand-in reads of the repair: the evidence version and what
// changed (point 8), each starter's layout and when it shows (point 3), "Ask about this", and a typed question's matches.

const test_ = (over: Partial<TestShown>): TestShown => ({ key: 'walk-ten|mood|nextBlock', moveId: 'walk-ten', target: 'mood', window: 'nextBlock', level: 'none', direction: null, revised: false, belief: 0.2, theta: null, lo: null, hi: null, offered: 6, heldBack: 5, days: 11, ctx: [], running: false, began: '2026-10-01', ...over })
const track = (over: Partial<TrackLine> = {}): TrackLine => ({ rung: 'early', resolved: 0, held: 0, open: 0, enough: false, tightened: false, tested: 2 / 3, ...over })
const read = (over: Partial<RepairEvidence> = {}): RepairEvidence => ({ shown: [], quiet: [], track: [track(), track({ rung: 'likely', tested: 0.8 }), track({ rung: 'established', tested: 0.95 })], helps: [], nearest: [], waiting: [], ...over })

const walkMood = test_({ level: 'likely', direction: 'helps', theta: 0.42, lo: 0.1, hi: 0.74, running: true })
const napEnergy = test_({ key: 'nap-ten|energy|nextBlock', moveId: 'nap-ten', target: 'energy', level: 'early', direction: 'little', running: false })
const friendMood = test_({ key: 'message-a-friend|mood|nextBlock', moveId: 'message-a-friend', target: 'mood', level: 'none', direction: null })
const lines = (a: { sections: { title: string | null; lines: string[] }[] }) => a.sections.flatMap((s) => [s.title ?? '', ...s.lines])

describe('the evidence version and what changed', () => {
  it('is the same for the same evidence, whatever drifts within a rung, and moves when a rung, a direction, a mark or the queue does', () => {
    const v = evidenceVersion(read({ shown: [walkMood, napEnergy] }))
    expect(evidenceVersion(read({ shown: [napEnergy, walkMood] }))).toBe(v)
    expect(evidenceVersion(read({ shown: [{ ...walkMood, theta: 0.5, lo: 0.2, hi: 0.8, belief: 0.3, offered: 9, days: 14 }, napEnergy] }))).toBe(v)
    expect(evidenceVersion(read({ shown: [{ ...walkMood, level: 'established' }, napEnergy] }))).not.toBe(v)
    expect(evidenceVersion(read({ shown: [{ ...walkMood, direction: 'little' }, napEnergy] }))).not.toBe(v)
    expect(evidenceVersion(read({ shown: [{ ...walkMood, revised: true }, napEnergy] }))).not.toBe(v)
    expect(evidenceVersion(read({ shown: [{ ...walkMood, running: false }, napEnergy] }))).not.toBe(v)
    expect(evidenceVersion(read({ shown: [walkMood] }))).not.toBe(v)
  })

  it('marks a cited finding whose rung or direction changed, that was revised, or that is no longer among the tests; never drift within a rung', () => {
    const cited = [citeOf(walkMood), citeOf(napEnergy), citeOf(friendMood)]
    expect(changesOf(cited, read({ shown: [{ ...walkMood, theta: 0.6, lo: 0.3, hi: 0.9 }, napEnergy], quiet: [friendMood] }))).toEqual([])
    const changed = changesOf(cited, read({ shown: [{ ...walkMood, level: 'established' }, { ...napEnergy, revised: true }] }))
    expect(changed.map((c) => [c.key, c.after?.level ?? 'gone', c.after?.revised ?? null])).toEqual([
      ['walk-ten|mood|nextBlock', 'established', false],
      ['nap-ten|energy|nextBlock', 'early', true],
      ['message-a-friend|mood|nextBlock', 'gone', null],
    ])
  })

  it('reads a thread’s state from its newest turn: asked again on today’s evidence, it is answered, whatever an older turn rested on', () => {
    const turn = (over: Partial<AskTurn>): AskTurn => ({ threadId: 1, day: '2026-10-12', at: '2026-10-12T13:00:00.000Z', question: 'What do you know about me so far?', tier: 'quick', state: 'answered', kind: 'know', version: 'v', cited: [citeOf(walkMood)], updatedAt: '', ...over })
    const now = read({ shown: [{ ...walkMood, level: 'established' }] })
    const old = turn({})
    const fresh = turn({ at: '2026-10-19T13:00:00.000Z', cited: [citeOf({ ...walkMood, level: 'established' })] })
    expect(threadState([old], now)).toBe('changed')
    expect(threadState([old, fresh], now)).toBe('answered')
    expect(threadState([old], read({ shown: [walkMood] }))).toBe('answered')
    expect(threadState([fresh, turn({ state: 'waiting', kind: 'typed', cited: [] })], now)).toBe('waiting')
    expect(threadState([turn({ state: 'cancelled', kind: 'typed', cited: [] })], now)).toBe('cancelled')
    // Before the read is in, nothing is marked changed.
    expect(threadState([old], undefined)).toBe('answered')
  })
})

describe('the starters, laid out by the app', () => {
  it('"What do you know" gives what helps, the other calls, the tests being run and the track record, and cites every call and running test', () => {
    const a = knowAnswer(read({ shown: [walkMood, napEnergy], quiet: [friendMood] }), null)
    expect(a.answer.sections.map((s) => s.title)).toEqual(['What helps you', 'Other calls', 'Being tested now', 'How the calls have held'])
    expect(lines(a.answer)).toContain('A ten-minute walk, now, for Mood over the next block: Likely: helps')
    expect(lines(a.answer)).toContain('A ten-minute nap, alarm set, for Energy over the next block: Early sign: little difference')
    expect(a.cited.map((c) => c.key).sort()).toEqual(['nap-ten|energy|nextBlock', 'walk-ten|mood|nextBlock'])
    // Nothing at a rung: "Not enough yet", plainly.
    const none = knowAnswer(read({ quiet: [friendMood] }), null)
    expect(lines(none.answer).some((l) => l.startsWith('Not enough yet'))).toBe(true)
    expect(none.cited).toEqual([])
  })

  it('lays out what helps per reading, in the readings’ order, best first; and the other calls by rung, then hurts before little difference', () => {
    const walkStress = test_({ key: 'walk-ten|stress|nextBlock', target: 'stress', level: 'established', direction: 'helps' })
    const napMood = test_({ key: 'nap-ten|mood|nextBlock', moveId: 'nap-ten', target: 'mood', level: 'established', direction: 'helps' })
    const hurtsLikely = test_({ key: 'message-a-friend|energy|nextBlock', moveId: 'message-a-friend', target: 'energy', level: 'likely', direction: 'hurts' })
    const littleLikely = test_({ key: 'nap-ten|stress|nextBlock', moveId: 'nap-ten', target: 'stress', level: 'likely', direction: 'little' })
    const littleEstablished = test_({ key: 'nap-ten|focus|nextBlock', moveId: 'nap-ten', target: 'focus', level: 'established', direction: 'little' })
    const a = knowAnswer(read({ shown: [walkStress, walkMood, napMood, napEnergy, littleLikely, hurtsLikely, littleEstablished] }), null)
    const order = (title: string) => (a.answer.sections.find((s) => s.title === title)?.lines ?? []).map((l) => /for (\w+) over the next block: (.+)$/.exec(l)?.slice(1).join(' '))
    expect(order('What helps you')).toEqual(['Mood Established: helps', 'Mood Likely: helps', 'Stress Established: helps'])
    expect(order('Other calls')).toEqual(['Focus Established: little difference', 'Energy Likely: hurts', 'Stress Likely: little difference', 'Energy Early sign: little difference'])
  })

  it('cites a test being run at no rung yet, so a later read does not count it as new', () => {
    const runningNone = test_({ key: 'message-a-friend|mood|nextBlock', moveId: 'message-a-friend', target: 'mood', running: true })
    const a = knowAnswer(read({ shown: [runningNone] }), null)
    expect(a.cited.map((c) => c.key)).toEqual(['message-a-friend|mood|nextBlock'])
    expect(a.answer.sections.find((s) => s.title === 'Being tested now')?.lines).toEqual(['Message one friend now, for Mood over the next block: No call yet'])
    const later = knowAnswer(read({ shown: [runningNone] }), { day: '2026-10-12', cited: a.cited, version: 'v' })
    expect(later.answer.sections[0].lines[0]).toMatch(/^Nothing has changed since your last read/)
  })

  it('opens with what changed since the last read, or says nothing has', () => {
    const last = { day: '2026-10-12', cited: [citeOf(walkMood)], version: 'v' }
    const now = read({ shown: [{ ...walkMood, level: 'established' }, napEnergy] })
    const a = knowAnswer(now, last)
    expect(a.answer.sections[0].title).toMatch(/^Since your last read, on /)
    expect(a.answer.sections[0].lines).toEqual(['A ten-minute walk, now, for Mood: Likely: helps → Established: helps'])
    expect(a.answer.sections[1]).toEqual({ title: 'New among the tests since then', lines: ['A ten-minute nap, alarm set, for Energy over the next block: Early sign: little difference'] })
    const same = changedAnswer(read({ shown: [walkMood] }), last)
    expect(same.answer.sections).toHaveLength(1)
    expect(same.answer.sections[0].lines[0]).toMatch(/^Nothing has changed since your last read, on /)
  })

  it('"What should we test next" gives each test being run whole, the next the queue would take, and what would settle a test, promising no speed', () => {
    const a = nextAnswer(read({ shown: [walkMood, napEnergy], waiting: [{ key: 'message-a-friend|mood|nextBlock', moveId: 'message-a-friend', target: 'mood', window: 'nextBlock' }] }))
    expect(a.answer.sections.map((s) => s.title)).toEqual(['A ten-minute walk, now, for Mood over the next block', null, 'Next in the queue'])
    expect(a.answer.sections[0].lines).toContain('Offered 6 times and held back 5, each with the reading after it, over 11 days.')
    expect(a.answer.sections[0].lines).toContain('Your record alone, when done: +0.42 steps, +0.10 to +0.74, at 95 percent.')
    expect(a.answer.sections[0].lines).toContain(`Began ${formatDayShort('2026-10-01')}.`)
    expect(a.answer.sections[1].lines[0]).toMatch(/^What would settle it: /)
    expect(a.answer.sections[2].lines).toEqual(['Message one friend now, for Mood over the next block: waiting for a place.'])
    expect(lines(a.answer).join(' ')).not.toMatch(/\b(days?|weeks?) (left|to go)\b|\bby (Monday|next)\b|\bsoon\b/i)
    expect(nextAnswer(read()).answer.sections).toEqual([{ title: 'Next in the queue', lines: ['Nothing waits for a place.'] }])
  })

  it('shows a starter only when it has something real to say', () => {
    expect(startersShown(read(), null)).toEqual([])
    expect(startersShown(read({ quiet: [friendMood] }), null)).toEqual(['know'])
    const ev = read({ shown: [walkMood] })
    expect(startersShown(ev, null)).toEqual(['know', 'next'])
    expect(startersShown(ev, { day: '2026-10-12', cited: [], version: evidenceVersion(ev) })).toEqual(['know', 'next'])
    expect(startersShown(ev, { day: '2026-10-12', cited: [], version: 'older' })).toEqual(['know', 'changed', 'next'])
    // A test waiting for a place is enough for "What should we test next", with none being run.
    expect(startersShown(read({ quiet: [friendMood], waiting: [{ key: 'nap-ten|energy|nextBlock', moveId: 'nap-ten', target: 'energy', window: 'nextBlock' }] }), null)).toEqual(['know', 'next'])
  })
})

describe('"Ask about this"', () => {
  it('gives each attached finding whole, says one no longer among the tests, and a line resting on none', () => {
    const ev = read({ shown: [walkMood], quiet: [friendMood] })
    const a = aboutAnswer(['walk-ten|mood|nextBlock', 'nap-ten|energy|nextBlock'], ev)
    expect(a.answer.sections[0].title).toBe('A ten-minute walk, now, for Mood over the next block')
    expect(a.answer.sections[0].lines).toContain('Being tested now.')
    expect(a.answer.sections[1].lines).toEqual(['A ten-minute nap, alarm set, for Energy over the next block: not among the tests now.'])
    expect(a.cited.map((c) => c.key)).toEqual(['walk-ten|mood|nextBlock'])
    expect(a.answer.sections[a.answer.sections.length - 1].lines[0]).toMatch(/^What would settle it: /)
    expect(aboutAnswer([], ev).answer.sections[0].lines[0]).toMatch(/^This line rests on no tested finding yet/)
  })

  it('names a finding the question already names only once, and says what would settle it only while it is not settled', () => {
    const question = 'About A ten-minute walk, now, for Mood over the next block'
    const one = aboutAnswer(['walk-ten|mood|nextBlock'], read({ shown: [walkMood] }), question)
    expect(one.answer.sections[0].title).toBeNull()
    expect(one.answer.sections[0].lines[0]).toBe('Likely: helps')
    expect(one.answer.sections[one.answer.sections.length - 1].lines[0]).toMatch(/^What would settle it: /)
    // Asked from the Brain card, the question names no finding: each keeps its own name.
    expect(aboutAnswer(['walk-ten|mood|nextBlock'], read({ shown: [walkMood] }), 'About the day’s line').answer.sections[0].title).toBe('A ten-minute walk, now, for Mood over the next block')
    // Established, it is settled: nothing to say of what would settle it, here or among the tests being run.
    const settled = { ...walkMood, level: 'established' as const }
    expect(lines(aboutAnswer(['walk-ten|mood|nextBlock'], read({ shown: [settled] }), question).answer).join(' ')).not.toMatch(/What would settle it/)
    expect(lines(nextAnswer(read({ shown: [settled] })).answer).join(' ')).not.toMatch(/What would settle it/)
  })

  it('finds the tests a line on the Brain card cites from its ladder facts', () => {
    const ev = read({ shown: [walkMood], quiet: [friendMood] })
    expect(keysOfLine(['week.today', 'ladder.walk-ten.mood', 'ladder.message-a-friend.mood', 'ladder.walk-ten.mood', 'ladder.nap-ten.energy'], ev)).toEqual(['walk-ten|mood|nextBlock', 'message-a-friend|mood|nextBlock'])
  })
})

function* strings(v: unknown): Generator<string> {
  if (typeof v === 'string') yield v
  else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* strings(x)
}

describe('Ask’s words', () => {
  it('describe and never promise: no speed, no finish, no cause, no size beyond the cards', () => {
    const all = [...strings(copy.askMirror)]
    expect(all.length).toBeGreaterThan(40)
    const found: string[] = []
    for (const s of all) {
      if (/\b(will|soon|shortly|guarantee[sd]?|promise[sd]?|sure to|certain to|in (a|\d+) (days?|weeks?)|(days?|weeks?) (left|to go)|by (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|next|tomorrow))\b/i.test(s)) found.push(`promises: ${s}`)
      if (evidenceWordingRefusal(s, [], []) !== null) found.push(`wording: ${s}`)
    }
    expect(found).toEqual([])
  })
})

describe('a typed question, while it waits', () => {
  it('shows the findings its words name: move and reading first, then the move, then the reading; none for words that name nothing', () => {
    const ev = read({ shown: [walkMood, napEnergy], quiet: [friendMood] })
    expect(matchFindings('Does walking help my mood?', ev).map((t) => t.key)).toEqual(['walk-ten|mood|nextBlock', 'message-a-friend|mood|nextBlock'])
    expect(matchFindings('naps and energy', ev).map((t) => t.key)).toEqual(['nap-ten|energy|nextBlock'])
    // A short word of a move's own names it too: a nap, whatever the reading.
    expect(matchFindings('do naps help?', ev).map((t) => t.key)).toEqual(['nap-ten|energy|nextBlock'])
    expect(matchFindings('what about the weather', ev)).toEqual([])
    expect(matchFindings('   ', ev)).toEqual([])
    // A move named counts for more than a reading named.
    expect(matchFindings('walking or energy', ev).map((t) => t.key)).toEqual(['walk-ten|mood|nextBlock', 'nap-ten|energy|nextBlock'])
    // Words every name shares name nothing.
    expect(matchFindings('ten minutes now', ev)).toEqual([])
  })

  it('names one of the pre-declared contexts by its own words, and its other value apart; none for two (stage A3)', () => {
    expect(contextNamed('Does walking help my mood on office days?')).toEqual({ context: 'office', value: 1 })
    expect(contextNamed('Does walking help when I am not at the office?')).toEqual({ context: 'office', value: 0 })
    expect(contextNamed('Do naps help on days I work from home?')).toEqual({ context: 'office', value: 0 })
    expect(contextNamed('Does a nap help my energy after a short night?')).toEqual({ context: 'shortSleep', value: 1 })
    expect(contextNamed('What about weekends?')).toEqual({ context: 'weekend', value: 1 })
    expect(contextNamed('And on weekdays?')).toEqual({ context: 'weekend', value: 0 })
    expect(contextNamed('Is it different without her?')).toEqual({ context: 'withHer', value: 0 })
    expect(contextNamed('Is it different with her?')).toEqual({ context: 'withHer', value: 1 })
    // Two contexts, or both values of one, name no single context; nor do words naming none.
    expect(contextNamed('On weekends at the office?')).toBeNull()
    expect(contextNamed('Weekends or weekdays?')).toBeNull()
    expect(contextNamed('Does walking help my mood?')).toBeNull()
  })

  it('says when a test was last asked about and offers "Test it sooner" on any day it was not; of a test over seven days, why asking cannot bring it sooner (stage A3)', () => {
    const t = { window: 'nextBlock' as const }
    expect(soonerOf(t, null, '2026-10-20')).toEqual({ ownDays: null, asked: null, button: true })
    expect(soonerOf(t, '2026-10-20', '2026-10-20')).toEqual({ ownDays: null, asked: `Asked about on ${formatDayShort('2026-10-20')}: that lifts this test in the queue, fading over a few weeks unless you ask again. It changes no threshold and nothing already recorded.`, button: false })
    expect(soonerOf(t, '2026-10-19', '2026-10-20')).toMatchObject({ asked: expect.stringContaining(formatDayShort('2026-10-19')), button: true })
    expect(soonerOf({ window: 'sevenDays' }, '2026-10-19', '2026-10-20')).toEqual({ ownDays: 'A test over seven days never waits in the queue: it is drawn on its own days, so asking cannot bring it sooner.', asked: null, button: false })
  })

  it('gives "Test it" that context’s own call of the test, or says it has none of its own yet; nothing for no context (stage A3)', () => {
    const t = { ...walkMood, ctx: [{ context: 'office', value: 1 as const, level: 'likely' as const, direction: 'helps' as const }] }
    expect(testContextLine(t, 'Does walking help my mood on office days?')).toBe('At the office: Likely: helps. This is the same test, read on those days alone.')
    // The other value of that context has no call of its own here.
    expect(testContextLine(t, 'Does walking help my mood when I work from home?')).toBe('Not at the office: no call of its own yet. Those days count in this same test with all the others, and get a call of their own once the record shows they differ.')
    expect(testContextLine(t, 'Does walking help my mood after a short night?')).toMatch(/^After a short night: no call of its own yet\./)
    expect(testContextLine(t, 'Does walking help my mood?')).toBeNull()
  })
})

describe('Ask’s gate', () => {
  it('is closed while it is built: no Ask on the phone, and only an automated test browser with the key previews it', () => {
    expect(ASK).toBe('gated')
    expect(askMode()).toBe('gated')
    expect(askOn()).toBe(false)
    expect(askOn(askMode('open'))).toBe(true)
  })

  describe('its preview key', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    it('is read only in an automated test browser: the owner’s phone, holding the key or not, stays closed', () => {
      const store = new Map([['life-mirror.preview.ask', '1']])
      vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null })
      vi.stubGlobal('navigator', { webdriver: false })
      expect(askMode()).toBe('gated')
      vi.stubGlobal('navigator', { webdriver: true })
      expect(askMode()).toBe('preview')
      store.set('life-mirror.preview.ask', '0')
      expect(askMode()).toBe('gated')
    })
  })
})
