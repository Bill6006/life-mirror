import { describe, expect, it } from 'vitest'
import { EVIDENCE_WORDING, evidenceWordingRefusal, isAssociationFact, validateOutput, validateReview } from './brainShared'
import { moves } from './catalogue'
import { copy } from './copy'
import type { Fact, FactSheet } from './factTypes'
import { deliver, FIRMNESS_PREFS, FIRMNESSES } from './firmness'
import { admitted, cardById } from './library'
import type { ClaimCard } from './libraryTypes'
import { rankLines, SITUATIONS } from './situations'
import { SITUATION_SHEETS } from './situationFixtures'

// Pass 4: how big a line says an effect is may not outrun its cards, and the record's own
// comparisons are never said to have caused what happened. Legitimate experimental evidence keeps
// its causal words: a card from trials may say what a thing does, and the owner's own test cards
// were randomised. The check on the monitored lines is gated until the owner's word after the
// 2026-10-04 report; what the app writes itself is held to it now.

const card = (id: string, extra: Partial<ClaimCard> = {}): ClaimCard => ({ id, claim: 'A claim long enough to be a claim of its own.', domain: 'sleep', tags: ['sleep'], grade: 'B', replication: 'replicated', effect: 'an effect', population: 'adults', sources: [], caveats: 'none', app: 'a use', reviewed: '2026-09-25', status: 'admitted', ...extra })
const small = card('small-card')
const medium = card('medium-card', { size: 'medium' })
const large = card('large-card', { size: 'large' })

describe('size words stay within the cited cards’ sizes, and the record’s comparisons are never causes (Pass 4)', () => {
  it('stays gated while the monitoring runs', () => {
    expect(EVIDENCE_WORDING).toBe('gated')
  })

  it('lets a large word stand only on a large card, a medium word on a medium or large one, and small words on any', () => {
    for (const text of ['Naps greatly help the afternoon.', 'Spacing doubles what is remembered.', 'It lifts mood far more than rest.', 'A large effect in trials.', 'It strongly predicts the next day.']) {
      expect(evidenceWordingRefusal(text, [], [small]), text).toMatch(/needs a cited card whose effect is large/)
      expect(evidenceWordingRefusal(text, [], [medium]), text).toMatch(/needs a cited card whose effect is large/)
      expect(evidenceWordingRefusal(text, [], [small, large]), text).toBeNull()
    }
    for (const text of ['Breaks considerably lift energy.', 'A marked difference in trials.', 'It substantially lowers stress.']) {
      expect(evidenceWordingRefusal(text, [], []), text).toMatch(/at least medium/)
      expect(evidenceWordingRefusal(text, [], [medium]), text).toBeNull()
      expect(evidenceWordingRefusal(text, [], [large]), text).toBeNull()
    }
    for (const text of ['A small effect, and a reliable one.', 'Plans are kept a little more often.', 'No clear difference yet.', 'The evidence is strong: strong evidence.', 'Regularity predicted it more strongly than length did.', 'About as strongly as work and health together.']) expect(evidenceWordingRefusal(text, [], []), text).toBeNull()
  })

  it('never says the record’s own comparisons caused what happened, and lets trials and the owner’s test cards speak of what a thing does', () => {
    expect(isAssociationFact('assoc.napped')).toBe(true)
    expect(isAssociationFact('private.3')).toBe(true)
    expect(isAssociationFact('test.walk-vs-nothing')).toBe(false)
    for (const text of ['The nap improved your morning.', 'The late coffee cost you sleep.', 'That’s why your evenings read higher.', 'Mornings read higher because you napped.', 'The workouts lifted your evenings.'])
      expect(evidenceWordingRefusal(text, ['assoc.napped'], [large]), text).toMatch(/never said to have caused it/)
    // An association said as one; a finding from trials in its own words; the owner's randomised test.
    for (const text of ['Mornings after a nap read 6 higher: an association, not a cause.', 'Short naps improve alertness afterwards, in trials.'])
      expect(evidenceWordingRefusal(text, ['assoc.napped'], [small]), text).toBeNull()
    expect(evidenceWordingRefusal('The walk lifted your mood in your own test.', ['test.walk'], [])).toBeNull()
  })

  it('refuses nothing new on the monitored lines while gated, and refuses the outrun words once open', () => {
    const sheet: FactSheet = { day: '2026-09-25', builtAt: '2026-09-25T08:00:00.000Z', facts: [{ id: 'assoc.napped', tags: ['nap'], text: 'Mornings after a nap read 6 higher, 5 naps.', values: { diff: 6, times: 5 } } as Fact], said: [], shortlist: [], showPrivate: false } as unknown as FactSheet
    const line = { mode: 'observation', text: 'The nap improved your morning.', factIds: ['assoc.napped'], cardIds: [] }
    expect(validateOutput(line, sheet, []).ok).toBe(true)
    expect(validateOutput(line, sheet, [], 60, undefined, undefined, true)).toMatchObject({ ok: false, reason: expect.stringContaining('never said to have caused it') })
    const review = { held: 'Naps greatly helped.', didNot: 'Nothing stalled.', change: 'Keep the naps short.', factIds: ['assoc.napped'], cardIds: [] }
    expect(validateReview(review, sheet, []).ok).toBe(true)
    expect(validateReview(review, sheet, [], undefined, undefined, true)).toMatchObject({ ok: false, reason: expect.stringContaining('held: says "greatly"') })
  })
})

describe('cards whose evidence only observed say what went with what (the audit of 2026-09-25)', () => {
  // Each of these rests on cohorts, diaries, surveys, experience sampling or before-and-after
  // measures, not on trials of the claim itself, and once said it as a cause.
  const OBSERVED = ['small-wins-progress', 'acting-extraverted-costs-later', 'green-exercise-dose', 'forgiveness-and-sacrifice', 'kind-reading-limits', 'fairness-and-appreciation']
  const CAUSE = /\b(lifts?|lowers|improves?|help(?:s|ed)?|cost|removes?|is what makes)\b/i
  it('says none of them as a cause', () => {
    for (const id of OBSERVED) {
      const c = cardById(id)
      expect(c, id).toBeDefined()
      expect(c?.claim, id).not.toMatch(CAUSE)
    }
    // The half of a card that did rest on experiments keeps its causal words.
    expect(cardById('compliments-underestimated')?.claim).toMatch(/land better than people expect/)
    expect(cardById('compliments-underestimated')?.claim).toMatch(/went with them feeling understood and loved/)
  })
})

describe('what the app writes itself keeps its size words within its evidence (Pass 4)', () => {
  it('every card’s claim and use, within its own size', () => {
    for (const c of admitted()) {
      expect(evidenceWordingRefusal(c.claim, [], [c]), `${c.id} claim`).toBeNull()
      expect(evidenceWordingRefusal(c.app, [], [c]), `${c.id} app`).toBeNull()
    }
  })

  it('every move’s evidence line and starting belief, within the cards that speak for it', () => {
    for (const m of moves) {
      const cards = admitted().filter((c) => (c.moves ?? []).includes(m.id))
      expect(evidenceWordingRefusal(m.source.what, [], cards), `${m.id} source`).toBeNull()
      expect(evidenceWordingRefusal(m.prior.note, [], cards), `${m.id} prior`).toBeNull()
    }
  })

  it('every one of the phone’s own lines, at every firmness, within the cards it cites, and never calling the record a cause', () => {
    for (const [id, t] of Object.entries(copy.brain.lines as Record<string, string>)) for (const f of FIRMNESSES) expect(evidenceWordingRefusal(deliver(t, f), [], [large]), `${id} ${f}: a template`).toBeNull()
    for (const s of SITUATIONS) {
      for (const pref of FIRMNESS_PREFS) {
        const c = rankLines(SITUATION_SHEETS[s.id](), [], [], undefined, pref).find((x) => x.situationId === s.id)
        if (!c) continue
        const cards = c.cardIds.map((cid) => cardById(cid)).filter((x): x is ClaimCard => x !== undefined)
        expect(evidenceWordingRefusal(c.text, c.factIds, cards), `${s.id} at ${pref}`).toBeNull()
      }
    }
  })
})
