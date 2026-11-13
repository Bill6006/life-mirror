import { describe, expect, it } from 'vitest'
import type { EventType } from '../../src/noteEvents/types'
import { MONTH_CAUSE } from './monthCheck'
import { MONTH_ANSWER, monthInstructions } from './monthPrompt'

// What the month's read is told (2026-11-13): each rule its answer is checked by, stated word for word.

const TYPES: EventType[] = [
  { id: 'raised-voice', label: 'Raised my voice', definition: 'The note says you raised your voice at someone.', was: ['yelled'] },
  { id: 'up-late', label: 'Up late', definition: 'The note says you stayed up later than you meant to.' },
]
const text = (over: Partial<Parameters<typeof monthInstructions>[0]> = {}) => monthInstructions({ month: '2026-10', parts: 3, types: TYPES, wrong: [], ...over })
const lines = (t: string) => t.split('\n')

describe('the month’s instructions', () => {
  it('name the month and say every part is read before anything is written', () => {
    const t = lines(text())
    expect(t[0]).toBe('You are reading one whole month of one person\'s own record, 2026-10, and writing down what stood out. Write to them as "you". Reply with JSON only, in the shape "answer" shows.')
    expect(t[1]).toBe('- Read every part before you write: lookup=month&part=1 to lookup=month&part=3. A write-up is kept only when every part was read; saying you read them is not enough.')
    expect(lines(text({ parts: 1 }))[1]).toContain('lookup=month&part=1 to lookup=month&part=1.')
  })

  it('say the rules the answer is checked by, each as a number', () => {
    const t = text()
    expect(t).toContain('- Each line has an id in brackets. The 3 days before the month and the 3 after are served with it and named as outside it: a line of theirs may be cited beside a line inside the month, never alone.')
    expect(t).toContain('- Each observation is its words and "factIds", the ids of every line it rests on, at least one of them inside the month, at most 40. An observation that cites no served line is refused.')
    expect(t).toContain('- Every number you write must be in a line you cite, or be the count of the days or of the lines you cite. Any other number is refused.')
    expect(t).toContain('- At most 10 observations under "recorded" and 8 under "noticed", each at most 50 words. Plain words. Leave a list empty rather than fill it.')
    expect(t).toContain('letter for letter, at most 300 characters.')
    expect(t).toContain('- Write no dates and no weekday counts of your own: the days are listed for the person from the lines you cite. Write "day" for a calendar day, never "date".')
  })

  it('say that what Claude noticed is a hypothesis and that no cause is claimed, in words the check itself would pass', () => {
    const t = text()
    expect(t).toContain('"noticed": connections you noticed that nobody has tested. Each of those is a hypothesis, never a fact.')
    expect(t).toContain('- No cause, anywhere: a month\'s read holds no test. Say what went with what ("the short nights came before the days you skipped a plan"), never "because", "caused", "led to" or "affected".')
    // The example it gives of what to write claims no cause by the check's own words.
    expect(MONTH_CAUSE.test('the short nights came before the days you skipped a plan')).toBe(false)
  })

  it('say how a pattern is followed: from the next day on, never under what was recorded', () => {
    expect(text()).toContain('It is then counted from the next day on, on what comes after alone. Leave "follow" out where no cell fits; never under "recorded".')
  })

  it('list each event type by its id, its label and its definition, and never an earlier id', () => {
    const t = lines(text())
    const at = t.indexOf('EVENT TYPES, each with what counts as one:')
    expect(at).toBeGreaterThan(0)
    expect(t.slice(at + 1, at + 3)).toEqual(['- raised-voice: Raised my voice. The note says you raised your voice at someone.', '- up-late: Up late. The note says you stayed up later than you meant to.'])
    expect(text()).not.toContain('yelled')
  })

  it('say to tag nothing while no type is listed', () => {
    const t = text({ types: [] })
    expect(t).toContain('EVENT TYPES: none is listed yet. Write "events": [].')
    expect(t).not.toContain('each with what counts as one')
  })

  it('hand back the events the person marked wrong, and say nothing of them when there are none', () => {
    const t = lines(text({ wrong: [{ type: 'raised-voice', day: '2026-10-03', quote: 'I raised my voice at the dog' }] }))
    const at = t.indexOf('MARKED WRONG by the person, never to be tagged again:')
    expect(at).toBeGreaterThan(0)
    expect(t[at + 1]).toBe('- raised-voice on 2026-10-03: “I raised my voice at the dog”')
    expect(text()).not.toContain('MARKED WRONG')
  })

  it('end with the written list: what the read covers, and what it leaves out with why', () => {
    const t = lines(text())
    expect(t.at(-2)).toMatch(/^WHAT THIS READ COVERS: the day’s own row: .*; finished workouts\.$/)
    expect(t.at(-1)).toMatch(/^WHAT IT LEAVES OUT: the journal \(it is never evidence\); .*; places and the weather \(they are never sent beyond the day’s sheet\)\.$/)
  })

  it('hold the surface rules: a private item as its lines name it, and dating never from what did not happen', () => {
    expect(text()).toContain('- A private item is named only as its own lines name it. Speak of dating, a date or a partner only where the month\'s lines do, never from what did not happen, never counting or rating anyone.')
  })
})

describe('the answer’s shape', () => {
  it('shows the two lists and the events, each observation with the lines it rests on', () => {
    expect(Object.keys(MONTH_ANSWER)).toEqual(['recorded', 'noticed', 'events'])
    expect(Object.keys(MONTH_ANSWER.recorded[0])).toEqual(['text', 'factIds'])
    expect(Object.keys(MONTH_ANSWER.noticed[0])).toEqual(['text', 'factIds', 'follow'])
    expect(Object.keys(MONTH_ANSWER.noticed[0].follow)).toEqual(['kind', 'split', 'cell'])
    expect(Object.keys(MONTH_ANSWER.events[0])).toEqual(['type', 'factId', 'quote'])
  })
})
