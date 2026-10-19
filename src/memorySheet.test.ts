import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addLearning, logSession, planAim, studyAims } from './aimFlow'
import { stepFor } from './aims'
import { addDays, BLOCKS } from './blocks'
import { factSheet } from './brainFlow'
import { onTheSheet } from './facts'
import { weeklyFacts } from './weeklyFacts'
import { db, ensureDayContext, getSettings, type Offer } from './db'
import { weeklyAnalyses, weeklyData } from './forecastFlow'
import { blockReadings, type Answers, type Position } from './readings'

// Stage 3, group 1, on the sheet the phone writes: the memory of a line seen, from the plan and the
// session the record holds; and the weekly view's analyses for the Sunday review, computed exactly as
// the view computes them but over the steps the sheet may count, so the Partner path's own reps never
// reach them (Part 27).

const DAY = '2026-10-20'
const NOW = new Date(2026, 9, 20, 7, 45)
const PARTNER_REP = 'low-pressure-conversation'

/** Every reading of a block at one level, the down readings mirrored. */
function answersAt(block: (typeof BLOCKS)[number], p: Position): Answers {
  return Object.fromEntries(blockReadings(block).map((id) => [id, (['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p) as Position]))
}

async function done(id: number, day: string, moveId: string, paths?: Offer['paths']): Promise<void> {
  const when = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 18).toISOString()
  await db.offers.add({ id, kind: paths ? 'step' : 'block', day, block: 'evening', at: when, situationKey: paths ? 'path:partner' : 'evening:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId, cardId: null, candidates: [moveId], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: when, ...(paths ? { paths } : {}) })
  await db.outcomes.add({ offerId: id, moveId, day, block: 'evening', at: when, outcome: 'done', why: null, passiveOutcome: null })
}

describe('the Brain’s memory and the weekly view on the day’s sheet', () => {
  beforeAll(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    // Twenty-four days of record, every fourth one good; the Partner path's rep done on each good day.
    for (let back = 24; back >= 1; back--) {
      const day = addDays(DAY, -back)
      const p = (back % 4 === 0 ? 5 : 3) as Position
      for (const [k, block] of (['morning', 'evening'] as const).entries()) {
        const h = block === 'morning' ? 8 : 20
        const start = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h).toISOString()
        await db.checkins.add({ day, block, startedAt: start, completedAt: start, updatedAt: start, answers: answersAt(block, p), activeMs: 30_000 + k })
      }
      if (p === 5) await done(1000 + back, day, PARTNER_REP, ['partner'])
      // Four moves of the day's draw, done on days of their own: enough to fill best-days' four places.
      for (const [base, every, move] of [[2000, 3, 'walk-ten'], [3000, 5, 'green-walk'], [4000, 2, 'after-dinner-walk'], [5000, 7, 'cyclic-sigh']] as const) if (back % every === 0) await done(base + back, day, move)
    }
    // A line seen on 2026-10-18 asking for a plan at the next check-in, the plan made, and a session that evening.
    await addLearning('Learn Veltish', 'A phrasebook', 'Ten words', 'I can read a little', new Date(2026, 8, 20, 9, 0))
    const [aim] = await studyAims()
    await db.briefLog.add({ day: '2026-10-18', situationId: 'say-when', mode: 'recommendation', text: 'A line.', factIds: [`aim.${aim.id}`], cardIds: [], action: { kind: 'plan', aimId: aim.id as number, cue: 'nextCheckIn' }, at: new Date(2026, 9, 18, 7, 30).toISOString(), shownAt: new Date(2026, 9, 18, 8, 0).toISOString() })
    await planAim(aim, 'nextCheckIn', '13:00', new Date(2026, 9, 18, 8, 5), 'Ten words')
    await logSession(aim, stepFor(aim, await db.skills.toArray(), [], [aim]), new Date(2026, 9, 18, 19, 0))
  })

  it('remembers the line: the plan made and kept, its step done, and how the line landed', async () => {
    const sheet = await factSheet(DAY, NOW)
    const memory = sheet.facts.filter((f) => f.id.startsWith('memory.'))
    expect(memory.map((f) => f.id)).toEqual(['memory.2026-10-18'])
    expect(memory[0].text).toBe('The line seen on 2026-10-18 asked for a plan for Learn Veltish at the next check-in: a plan was made that day, and a step was started that day and marked done. It was received as: untapped.')
    expect(memory[0].tags).toEqual([])
  })

  it('says the weekly view’s analyses over the steps the sheet may count, never the Partner path’s', async () => {
    const sheet = await factSheet(DAY, NOW)
    const weekly = sheet.facts.filter((f) => f.id.startsWith('weekly.'))
    expect(weekly.map((f) => f.id)).toEqual(['weekly.scorecard', 'weekly.gap', 'weekly.moved', 'weekly.best', 'weekly.lasts', 'weekly.health', 'weekly.health.faith', 'weekly.together', 'weekly.misses', 'weekly.missing'])
    expect(weekly.every((f) => f.tags.length === 0)).toBe(true)
    // The view itself counts every step, the Partner path's rep among them: a probe that could say yes.
    const view = await weeklyData(DAY)
    expect(view.best.silent).toBe(false)
    expect(view.best.controlled.map((d) => d.moveId)).toContain(PARTNER_REP)
    expect(weekly.map((f) => f.text).join(' ')).not.toContain('low-pressure')
    expect(sheet.facts.find((f) => f.id === 'weekly.best')?.text).toContain('A ten-minute walk, now:')
  })

  it('computes them over the steps the sheet may count, so a Partner path rep never takes a place from another', async () => {
    const [checkins, offers, outcomes, cards, declarations, contexts, scores, outside, swaps] = await Promise.all([db.checkins.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.cards.toArray(), db.declarations.toArray(), db.days.toArray(), db.forecastScores.toArray(), db.outside.toArray(), db.anchorSwaps.toArray()])
    const best = (over: readonly Offer[]) => weeklyFacts(weeklyAnalyses({ checkins, offers: over, outcomes, cards, declarations, contexts, scores, outside, hideFaith: false, swaps, frequency: 'three', togetherAnswers: undefined, repair: null }, DAY)).find((f) => f.id === 'weekly.best')
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.facts.find((f) => f.id === 'weekly.best')).toEqual(best(offers.filter(onTheSheet)))
    expect(Object.keys(best(offers.filter(onTheSheet))?.values ?? {}).filter((k) => /^c\d$/.test(k))).toHaveLength(4)
    // A probe that could say otherwise: over every step, the Partner path's rep takes one of the four places, and only three are said.
    expect(Object.keys(best(offers)?.values ?? {}).filter((k) => /^c\d$/.test(k))).toHaveLength(3)
  })

  it('computes each analysis exactly as the weekly view does, given the same steps', async () => {
    const [checkins, offers, outcomes, cards, declarations, contexts, scores, outside, settings, swaps] = await Promise.all([db.checkins.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.cards.toArray(), db.declarations.toArray(), db.days.toArray(), db.forecastScores.toArray(), db.outside.toArray(), getSettings(), db.anchorSwaps.toArray()])
    const view = await weeklyData(DAY)
    // The learning repair's count is read the one way both take it (stage R7); the view's is the one to match.
    const same = weeklyAnalyses({ checkins, offers, outcomes, cards, declarations, contexts, scores, outside, hideFaith: settings.hideFaith, swaps, frequency: settings.frequency, togetherAnswers: settings.togetherAnswers, repair: view.scorecard.repair }, DAY)
    expect(same.best.controlled.length).toBeGreaterThan(0)
    expect(same).toEqual({ scorecard: view.scorecard, best: view.best, gap: view.gap, moved: view.moved, lasts: view.lasts, health: view.health, checks: view.checks })
  })
})
