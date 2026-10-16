import { describe, expect, it } from 'vitest'
import { journalDaysOf, journalRefusal, withoutNightDates } from './journalCheck'

// Let it out's never-evidence rule (agreed 2026-10-15, adjustment 3), held by the check itself.

const FOR = '2026-10-16'
const served = [
  { day: '2026-10-14', text: 'Work ran late again and I felt like I was letting everyone down at home.' },
  { day: '2026-10-15', text: 'A better day. The walk after dinner cleared my head.' },
]

describe('the journal’s rule', () => {
  it('lets a line speak of what was written: the night named, framed as yours, no number, level or cause', () => {
    expect(journalRefusal('On October 14 you wrote that work ran late; tonight may be a lighter one.', ['2026-10-14'], served, FOR)).toBeNull()
    expect(journalRefusal('Last night you wrote that the walk cleared your head.', ['2026-10-15'], served, FOR)).toBeNull()
    expect(journalRefusal('On Wednesday you wrote about feeling stretched thin.', ['2026-10-14'], served, FOR)).toBeNull()
    expect(journalRefusal('In your journal on 14 October: work again.', ['2026-10-14'], served, FOR)).toBeNull()
    // Nothing drawn from it, nothing to hold.
    expect(journalRefusal('Ten minutes of the current skill, whenever it suits.', [], served, FOR)).toBeNull()
  })

  it('refuses a night never given, a statement not framed as written, and one that names no night', () => {
    expect(journalRefusal('On October 2 you wrote something.', ['2026-10-02'], served, FOR)).toMatch('was not among the entries')
    expect(journalRefusal('Work has been running late; ease into today.', ['2026-10-14'], served, FOR)).toMatch('framed as what was written')
    expect(journalRefusal('You wrote that work ran late.', ['2026-10-14'], served, FOR)).toMatch('names the night of 2026-10-14')
  })

  it('refuses a number, a level or a cause in what was written', () => {
    expect(journalRefusal('On October 14 you wrote that work ran late 3 times.', ['2026-10-14'], served, FOR)).toMatch('no number')
    expect(journalRefusal('Last night you wrote about the walk: an early sign it works.', ['2026-10-15'], served, FOR)).toMatch('no level')
    expect(journalRefusal('Last night you wrote that the walk is what helped your mood.', ['2026-10-15'], served, FOR)).toMatch('no cause')
  })

  it('refuses words lifted from an entry without naming its night', () => {
    expect(journalRefusal('The walk after dinner cleared my head, so take it again.', [], served, FOR)).toMatch('draws on the journal of 2026-10-15 without saying so')
    // Named, the same words stand.
    expect(journalRefusal('Last night you wrote: the walk after dinner cleared my head.', ['2026-10-15'], served, FOR)).toBeNull()
  })

  it('reads the nights an answer names: days only, each once', () => {
    expect(journalDaysOf(['2026-10-14', '2026-10-14', 'Tuesday', 7, '2026-10-15'])).toEqual(['2026-10-14', '2026-10-15'])
    expect(journalDaysOf(undefined)).toEqual([])
  })

  it('knows a night by its date in any common form, with its year or without, and by its weekday only within the week', () => {
    for (const s of ['On Oct 14 you wrote about work.', 'On Oct. 14th you wrote about work.', 'On 14th of October you wrote about work.', 'On October 14, 2026 you wrote about work.', 'On 2026-10-14 you wrote about work.']) expect(journalRefusal(s, ['2026-10-14'], served, FOR)).toBeNull()
    // A night more than six days back has no weekday that names it alone.
    const old = [{ day: '2026-10-05', text: 'A quiet Monday.' }]
    expect(journalRefusal('On Monday you wrote about a quiet day.', ['2026-10-05'], old, FOR)).toMatch('names the night of 2026-10-05')
    expect(journalRefusal('On 5 October you wrote about a quiet day.', ['2026-10-05'], old, FOR)).toBeNull()
  })

  it('refuses a number written as a word and a cause however it is said, and leaves "one" and the night’s own date alone', () => {
    expect(journalRefusal('Last night you wrote that you slept five hours.', ['2026-10-15'], served, FOR)).toMatch('no number')
    expect(journalRefusal('Last night you wrote that the day went better because of the walk.', ['2026-10-15'], served, FOR)).toMatch('no cause')
    expect(journalRefusal('Last night you wrote that the day was better because you walked.', ['2026-10-15'], served, FOR)).toMatch('no cause')
    expect(journalRefusal('Last night you wrote that the day went better because the walk came first.', ['2026-10-15'], served, FOR)).toMatch('no cause')
    expect(journalRefusal('Last night you wrote that the day went better thanks to the walk.', ['2026-10-15'], served, FOR)).toMatch('no cause')
    expect(journalRefusal('On 14 October 2026 you wrote that no one at home was let down; one evening at a time.', ['2026-10-14'], served, FOR)).toBeNull()
  })

  it('keeps a quotation whole inside the sentence that quotes it, and holds the sentence after it to the rule on its own', () => {
    expect(journalRefusal('Last night you wrote: “A better day. The walk after dinner cleared my head.” Take it again tonight.', ['2026-10-15'], served, FOR)).toBeNull()
    expect(journalRefusal('Last night you wrote: “A better day. The walk after dinner cleared my head.” The walk after dinner cleared my head, so walk again.', ['2026-10-15'], served, FOR)).toMatch('draws on the journal of 2026-10-15 without saying so')
  })

  it('lifts nothing from a stock phrase, and checks every part of a review', () => {
    const stock = [{ day: '2026-10-15', text: 'At the end of the day it is what it is.' }]
    expect(journalRefusal('At the end of the day it is what it is: a plan helps.', [], stock, FOR)).toBeNull()
    expect(journalRefusal(['Veltish held.', 'Last night you wrote that the walk is what helped your mood.', 'One change.'], ['2026-10-15'], served, FOR)).toMatch('no cause')
    expect(journalRefusal(['Veltish held.', 'Most plans did not start.', 'Last night you wrote about the walk; what made it easy?'], ['2026-10-15'], served, FOR)).toBeNull()
  })

  it('sets a listed night’s dated names aside for the checks that read every figure as a count, and nothing else', () => {
    expect(withoutNightDates('On 14 October 2026 you wrote about work; 3 of 4 plans held.', ['2026-10-14'], FOR)).toBe('On then you wrote about work; 3 of 4 plans held.')
    expect(withoutNightDates('Last night and on 2026-10-15 you wrote.', ['2026-10-15'], FOR)).toBe('Last night and on then you wrote.')
    expect(withoutNightDates('On 14 October you wrote about work.', [], FOR)).toBe('On 14 October you wrote about work.')
  })
})
