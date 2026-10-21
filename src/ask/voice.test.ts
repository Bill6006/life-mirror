import { describe, expect, it } from 'vitest'
import { askParagraphs, askVoiceRefusal, numberCount, validateAsk, validateOutput } from '../brainShared'
import type { Fact, FactSheet } from '../factTypes'

// Ask's coaching voice (the owner's request of 2026-10-21, after using Ask on the phone: the answers read as a report). Six
// questions of the kinds asked, each with an answer a coach would give, which passes, and the failures seen, which are
// refused with their reasons: a count dump opening it, the evidence listed rather than interpreted, the coaching buried under
// it, and warmth that overstates a tentative finding. The evidence rules are as strict as before; a stand-in record throughout.

const DAY = '2026-10-06'
const WALK: Fact = { id: 'ladder.walk-ten.stress', tags: ['monitoring'], text: 'Test: A ten-minute walk, now, for Stress over the next block: Likely: helps; offered 12 times and held back 11, each with the reading after it, over 14 days; pooled with research, +0.40 steps when done; research alone +0.40; being tested now.', values: { move: 'A ten-minute walk, now', moveId: 'walk-ten', reading: 'Stress', window: 'nextBlock', level: 'likely', direction: 'helps', revised: 0, running: 1, offered: 12, heldBack: 11, days: 14, theta: 0.5, belief: 0.4, research: 0.4 }, n: 23, tier: 'Likely: helps' }
const NAP: Fact = { id: 'ladder.nap-ten.energy', tags: ['monitoring'], text: 'Test: A ten-minute nap, alarm set, for Energy over the next block: No call yet; offered 5 times and held back 6, each with the reading after it, over 9 days; pooled with research, +0.30 steps when done; research alone +0.40.', values: { move: 'A ten-minute nap, alarm set', moveId: 'nap-ten', reading: 'Energy', window: 'nextBlock', level: 'none', direction: null, revised: 0, running: 0, offered: 5, heldBack: 6, days: 9, theta: null, belief: 0.3, research: 0.4 }, n: 11, tier: 'No call yet' }
/** A move whose own name holds a number, as one in the catalogue does. */
const BLOCK: Fact = { id: 'ladder.focused-block.focus', tags: ['monitoring'], text: 'Test: One 25-minute block, phone in another room, for Focus over the next block: Likely: helps; offered 7 times and held back 6, each with the reading after it, over 10 days; being tested now.', values: { move: 'One 25-minute block, phone in another room', moveId: 'focused-block', reading: 'Focus', window: 'nextBlock', level: 'likely', direction: 'helps', revised: 0, running: 1, offered: 7, heldBack: 6, days: 10 }, n: 13, tier: 'Likely: helps' }

function sheet(): FactSheet {
  return {
    version: 1,
    day: DAY,
    builtAt: `${DAY}T11:41:00.000Z`,
    hour: 7,
    weeks: 6,
    days: 41,
    direction: null,
    said: [],
    checkedIn: { morning: `${DAY}T11:40:00.000Z` },
    facts: [
      { id: 'record', tags: [], text: '41 days of record, 6 weeks, 98 check-ins.', values: { days: 41, weeks: 6, checkins: 98 } },
      { id: 'follow', tags: ['monitoring'], text: 'Follow-through: moves 30 started 26 finished; steps 12 started 5 finished; minimum wins 9 written 8 done.', values: { movesStarted: 30, movesFinished: 26, stepsStarted: 12, stepsFinished: 5, winsStarted: 9, winsFinished: 8 } },
      { id: 'steady', tags: ['mood'], text: '9 of the last 12 logged blocks read inside their usual range.', values: { inside: 9, of: 12 }, n: 12 },
      { id: 'stretch', tags: ['mood', 'necessities'], text: '5 of the last 7 logged blocks read under their usual low; 3 evening chips and 2 necessities missed in three days.', values: { under: 5, of: 7, chips: 3, necessities: 2 }, n: 7 },
      { id: 'cadence', tags: ['monitoring', 'habit'], text: 'Check-ins completed per week over the last four weeks, oldest first: 18, 17, 12, 9; the check-in depth is full.', values: { w3: 18, w2: 17, w1: 12, w0: 9, depth: 'full', lowDemand: 0 }, n: 56 },
      { id: 'trend.sleep', tags: ['mood'], text: 'Sleep: the 7 days to yesterday average 3.9 of 5 over 7 answers, against 3.1 over 7 answers the 7 days before.', values: { recent: 3.9, prior: 3.1, recentAnswers: 7, priorAnswers: 7, days: 7 }, n: 7 },
      WALK,
      NAP,
      BLOCK,
    ],
  }
}

/** An answer checked as the Worker checks it: Ask's word limits, 220 and 450 for the deep tier. */
const check = (text: string, factIds: string[], o: { deep?: boolean; question?: string } = {}) => validateAsk({ text, factIds, cardIds: [] }, sheet(), [], o.deep ? 450 : 220, undefined, o.question ?? '', o.deep === true)
const para = (...ps: string[]) => ps.join('\n\n')

describe('Ask’s coaching voice, on six questions of the kinds asked', () => {
  it('“So far, what do you know about me?”: what the record shows of them, never an inventory of its size', () => {
    const coach = para('You follow through best on short, concrete moves. Of the 30 moves you started, you finished 26.', 'The longer steps on your aims are where things stall, and that is worth more of your attention than any single day. Your days themselves look steady: 9 of your last 12 logged blocks sat inside their usual range.', 'What the record cannot say yet is what helps you most. A ten-minute walk likely helps your stress, but it is still being tested.')
    expect(check(coach, ['follow', 'steady', WALK.id], { question: 'So far, what do you know about me?' })).toMatchObject({ ok: true })
    // The answer seen on the phone: the record's size first, then every count.
    const dump = 'You have 41 days of record, 6 weeks and 98 check-ins. You started 30 moves and finished 26, started 12 steps and finished 5, and 9 of your last 12 logged blocks read inside their usual range.'
    const r = check(dump, ['record', 'follow', 'steady'])
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.reason).toBe('the first sentence gives 3 numbers; at most 1: open with what matters, in words, and let the numbers support it; and 9 numbers in the answer; at most 6: the cited findings are shown below it, so say the point they make; and a paragraph gives 9 numbers; at most 3: interpret the evidence rather than list it')
    // Even one number spent on the record's size opens nothing.
    expect(check('Over 41 days of record, you follow through best on short, concrete moves. Of the 30 moves you started, you finished 26.', ['record', 'follow'])).toEqual({ ok: false, reason: 'the first sentence counts the record itself: open with what it shows of them' })
    expect(check('You have made 98 check-ins, and short, concrete moves are where you follow through.', ['record'])).toEqual({ ok: false, reason: 'the first sentence counts the record itself: open with what it shows of them' })
    // A number of something else beside the word record is no size of it.
    expect(check('Your record says a ten-minute walk likely helps your stress, over 14 days.', [WALK.id])).toMatchObject({ ok: true })
  })

  it('“Coach me on everything”: a coaching read, each paragraph opening with its point, and the report seen refused', () => {
    const coach = para(
      'The clearest good news is how you finish what you start when it is short and concrete. You finished 26 of the 30 moves you began, and your days have mostly stayed inside their usual range.',
      'What is drifting is the record itself. Your check-ins have thinned week by week, from 18 to 9, and the longer steps on your aims are stalling with them.',
      'That is the one thing to put first this week. A thin record is how the rest quietly stops being learned, so the next step is simply the morning check-in, even a quick one, on the days that feel full.',
      'What is interesting but unsettled is what helps. A ten-minute walk likely helps your stress over the next block, and the nap has no call yet on your energy; more fair draws will tell.',
    )
    expect(check(coach, ['follow', 'steady', 'cadence', WALK.id, NAP.id], { deep: true, question: 'Coach me on everything' })).toMatchObject({ ok: true })
    // Statistics, more statistics, then the coaching at the end: every number grounded, and still refused for its shape.
    const report = para('Over 41 days you logged 98 check-ins. You started 30 moves and finished 26, started 12 steps and finished 5, and wrote 9 minimum wins with 8 done.', 'Check-ins per week went 18, 17, 12 and 9, and 9 of the last 12 logged blocks read inside their usual range. The walk is likely, helps, offered 12 times and held back 11 over 14 days; the nap has no call yet, offered 5 times and held back 6.', 'So the one thing to focus on is the morning check-in.')
    const r = check(report, ['record', 'follow', 'cadence', 'steady', WALK.id, NAP.id], { deep: true })
    expect(r).toEqual({ ok: false, reason: 'the first sentence gives 2 numbers; at most 1: open with what matters, in words, and let the numbers support it; and 19 numbers in the answer; at most 10: the cited findings are shown below it, so say the point they make; and a paragraph gives 8 numbers; at most 3: interpret the evidence rather than list it' })
  })

  it('a focused typed question: the answer first, its counts after', () => {
    const coach = para('A ten-minute walk likely helps your stress over the next block. Your own record has offered it 12 times and held it back 11, over 14 days.', 'It is still being tested, so keep taking it when it comes up; more fair draws are what would settle it.')
    expect(check(coach, [WALK.id], { question: 'Does a ten-minute walk help my stress?' })).toMatchObject({ ok: true })
    expect(check('Offered 12 times and held back 11 over 14 days, a ten-minute walk likely helps your stress by +0.40 steps, with research alone at +0.40.', [WALK.id])).toMatchObject({ ok: false, reason: expect.stringMatching(/^the first sentence gives 5 numbers/) })
  })

  it('weak evidence: said plainly as no call yet, and warmth that makes it more is refused', () => {
    const coach = para('There is no call yet on the nap and your energy. It has been offered 5 times and held back 6, too few fair draws to say either way.', 'Keep taking it when it is offered, alarm set; that is the only thing that will settle it.')
    expect(check(coach, [NAP.id], { question: 'Does the nap help my energy?' })).toMatchObject({ ok: true })
    expect(check('Good news: the nap is helping your energy, so keep it up.', [NAP.id])).toEqual({ ok: false, reason: 'says "helping" of a test with no call yet' })
    expect(check('The nap reliably lifts your energy.', [NAP.id])).toMatchObject({ ok: false, reason: expect.stringMatching(/^says "reliably" of a test below established/) })
    expect(check('The nap looks amazing for your energy so far.', [NAP.id])).toEqual({ ok: false, reason: 'says "amazing": warmth stays specific and true to the record, never hype' })
    // A word that is hype only as praise is free in its other sense.
    expect(check('The one outstanding question is the nap, which has no call yet on your energy after an incredibly full week.', [NAP.id])).toMatchObject({ ok: true })
  })

  it('genuinely good progress: warm and specific, and never hype or false comfort', () => {
    const coach = para('Your sleep has read better this past week. It averaged 3.9, against 3.1 the week before.', 'That is good news worth protecting. One week is not yet a pattern, and the record cannot say what changed it, so keep your evenings much as they have been.')
    expect(check(coach, ['trend.sleep'], { question: 'How is my sleep going?' })).toMatchObject({ ok: true })
    expect(check('Fantastic work on your sleep this week. It averaged 3.9, against 3.1 the week before.', ['trend.sleep'])).toEqual({ ok: false, reason: 'says "Fantastic": warmth stays specific and true to the record, never hype' })
    expect(check('You’re doing great: your sleep averaged 3.9 this past week.', ['trend.sleep'])).toMatchObject({ ok: false, reason: expect.stringMatching(/never false comfort/) })
  })

  it('a real pattern that warrants firmness: said straight, never softened into comfort, and never as a list', () => {
    const coach = para('No, not lately, and it deserves a straight answer: the record is thinning. Your check-ins have fallen week by week, from 18 to 9, and most of your recent blocks have read under their usual low.', 'That matters more than any one reading, because a thin record is how the whole thing quietly stops. The next step is the morning check-in, every day this week, even a short one.')
    expect(check(coach, ['cadence', 'stretch'], { question: 'Am I keeping up with things?' })).toMatchObject({ ok: true })
    expect(check('Don’t worry, a few quieter weeks are normal.', ['cadence'])).toMatchObject({ ok: false, reason: expect.stringMatching(/never false comfort/) })
    expect(check('Check-ins per week went 18, 17, 12 and 9, and 5 of the last 7 logged blocks read under their usual low, with 3 evening chips and 2 necessities missed in three days.', ['cadence', 'stretch'])).toMatchObject({ ok: false, reason: expect.stringMatching(/^the first sentence gives 9 numbers/) })
  })
})

describe('the voice check, as the grounding reads numbers', () => {
  it('counts a date or a clock time once, and a decimal once', () => {
    expect(numberCount('On 2026-10-05 at 21:30 you slept 7.5 hours.', sheet(), [])).toBe(3)
  })

  it('counts a number spelled out as the grounding counts it, so writing it in words neither hides it nor dodges the cap', () => {
    expect(numberCount('You finished twenty-six of thirty moves.', sheet(), ['follow'])).toBe(2)
    expect(check('You finished twenty-six of thirty moves.', ['follow'])).toMatchObject({ ok: false, reason: expect.stringMatching(/^the first sentence gives 2 numbers/) })
  })

  it('grounds a count before “out of”, in Ask and in the Brain’s line alike: an invented one is refused', () => {
    // Before 2026-10-21 "seven out of" was never read as a count, and the invented 7 passed on the grounded twelve.
    const made = 'You checked in on seven out of twelve mornings, which says you are steady.'
    expect(check(made, ['steady'])).toMatchObject({ ok: false, reason: expect.stringMatching(/^the count “seven” is not in the cited facts; and /) })
    expect(validateOutput({ mode: 'strategy', text: made, factIds: ['steady'], cardIds: [], action: null }, sheet(), [], 60)).toEqual({ ok: false, reason: 'the count “seven” is not in the cited facts' })
    expect(check('Your days have held steady. They read inside their usual range on nine out of twelve mornings.', ['steady'])).toMatchObject({ ok: true })
  })

  it('counts nothing in a cited move’s own name', () => {
    const text = 'One 25-minute block, phone in another room, likely helps your focus, offered 7 times.'
    expect(numberCount(text, sheet(), [BLOCK.id])).toBe(1)
    expect(numberCount(text, sheet(), [])).toBe(2)
    expect(check(text, [BLOCK.id])).toMatchObject({ ok: true })
  })

  it('reads paragraphs as the screen shows them, each line its own, and refuses a wall', () => {
    expect(askParagraphs('One.\nTwo.\n\n  Three. \n')).toEqual(['One.', 'Two.', 'Three.'])
    const sixty = 'The record so far reads as steady days and short moves finished. '.repeat(5).trim()
    expect(askVoiceRefusal(`${sixty}\n${sixty}`, false, sheet(), [])).toBeNull()
    expect(askVoiceRefusal(`${sixty} ${sixty}`, false, sheet(), [])).toBe('a paragraph of 120 words; at most 90: short paragraphs')
  })

  it('lets the deep tier carry more numbers than a standard answer, 10 against 6', () => {
    const eight = para('Short moves are where you follow through. You finished 26 of the 30 you started.', 'Your check-ins thinned from 18 to 9 a week.', 'Inside their usual range: 9 of your last 12 logged blocks.', 'The longer steps stall, with 5 of 12 finished.')
    expect(check(eight, ['follow', 'cadence', 'steady'], { deep: true })).toMatchObject({ ok: true })
    expect(check(eight, ['follow', 'cadence', 'steady'])).toEqual({ ok: false, reason: '8 numbers in the answer; at most 6: the cited findings are shown below it, so say the point they make' })
  })

  it('says the evidence’s reason and the voice’s together, so the one retry can mend both', () => {
    expect(check('Over 41 days of record the nap helped your energy.', ['record', NAP.id])).toEqual({ ok: false, reason: 'says "helped" of a test with no call yet; and the first sentence counts the record itself: open with what it shows of them' })
  })
})
