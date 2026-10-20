import type { Block } from './blocks'
import { hasMove, moveById } from './catalogue'
import { copy } from './copy'
import type { Fact } from './factTypes'
import { formatDayShort } from './format'
import { readingById } from './readings'
import type { BestDays, Difference, FamilyHealth, Gap, Lasts, Moved, Scorecard } from './weekly'
import type { HonestyChecks } from './honesty/checks'
import type { MissCandidate } from './honesty/misses'
import { leanOf, missingLines, missLine, missLines, togetherLine } from './honesty/words'

// The weekly view's analyses as facts, for the Sunday review (stage 3, group 1): the scorecard,
// best days, the gap as numbers, what moved this week, what lasts, and catalogue health, each with
// what it rests on, in the view's own words and numbers; nothing grades. They are computed over the
// steps the sheet may count, so the Partner path's own reps never reach them (Part 27). What names a
// faith practice goes in a fact of its own, read only under Faith, and a Social path rep in one read
// only under the Social path; the Worker files each by its id. No tags, so the library's cards are
// drawn as before. Claude's alone, and the review's alone: the line and the free chain never read them.

export interface WeeklyAnalyses {
  scorecard: Scorecard
  best: BestDays
  gap: Gap
  moved: { reading: { thisWeek: number | null; lastWeek: number | null; delta: number | null }; ingredients: Moved[] }
  lasts: Lasts
  health: FamilyHealth[]
  /** The honesty checks the record runs on itself (stage R7). */
  checks: HonestyChecks
}

type Kind = 'general' | 'faith' | 'social' | 'partner'

/** Which switch a move named in an analysis is read under: the Partner path's reps never reach the sheet (Part 27). */
function kindOf(moveId: string | undefined): Kind {
  if (!moveId || !hasMove(moveId)) return 'general'
  const m = moveById(moveId)
  if (m.path?.partner && !m.path.social) return 'partner'
  if (m.family === 'faith' || m.hiddenWith === 'faith') return 'faith'
  return m.path?.social ? 'social' : 'general'
}

const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`
const ago = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`)
const blocker = (b: string) => copy.move.whyNotReasons[b as keyof typeof copy.move.whyNotReasons] ?? b
const SUFFIX: Readonly<Record<'faith' | 'social', string>> = { faith: 'faith practices', social: 'Social path reps' }

function scorecardFact(s: Scorecard): Fact {
  const pct = s.hitRate === null ? null : Math.round(s.hitRate * 100)
  const miss = s.averageMiss === null ? null : r1(s.averageMiss)
  const secs = (b: Block) => (s.medianAnswerMs[b] === null ? null : Math.round((s.medianAnswerMs[b] as number) / 1000))
  const [m, a, e] = (['morning', 'afternoon', 'evening'] as const).map(secs)
  const said = (v: number | null) => (v === null ? 'none yet' : `${v} s`)
  const hit = s.scored ? `forecast hit rate ${pct} percent against a target of 60, over ${s.scored} day-ahead forecasts${miss === null ? '' : `; average miss ${miss} points`}` : 'no day-ahead forecast scored yet'
  return {
    id: 'weekly.scorecard',
    tags: [],
    // The learning engine's own count (stage R7), or that it could not read the record: never an older engine's count.
    text: `The scorecard, from the weekly view: ${hit}; ${s.repair ? `the learning repair's tests under way ${s.repair.underWay}, calls resolved ${s.repair.resolved}, held ${s.repair.held}` : 'the learning engine could not read the record'}; check-ins that gave something back: ${s.gaveBack} of ${s.checkins}; median answering time: morning ${said(m)}, afternoon ${said(a)}, evening ${said(e)}.`,
    values: { scored: s.scored, hitRate: pct, target: 60, averageMiss: miss, ...(s.repair ? { testsUnderWay: s.repair.underWay, callsResolved: s.repair.resolved, callsHeld: s.repair.held } : { engineFailed: 1 }), gaveBack: s.gaveBack, checkins: s.checkins, morningSeconds: m, afternoonSeconds: a, eveningSeconds: e },
  }
}

function gapFact(g: Gap): Fact {
  if (g.typical === null) return { id: 'weekly.gap', tags: [], text: `The gap, from the weekly view, appears after seven days with two logged blocks: ${g.days} so far.`, values: { days: g.days } }
  const often = g.howOften === null ? null : Math.round(g.howOften * 100)
  return {
    id: 'weekly.gap',
    tags: [],
    text: `The gap, from the weekly view, over ${g.days} days with two logged blocks: typical ${g.typical} (the median day), good ${g.good} (the top quarter’s floor), best ${g.best} (the top tenth’s average); good days ${often} percent of them${g.lastGoodDaysAgo === null ? '' : `, the last one ${ago(g.lastGoodDaysAgo)}`}.`,
    values: { days: g.days, typical: g.typical, good: g.good, best: g.best, goodPercent: often, lastGoodDaysAgo: g.lastGoodDaysAgo },
  }
}

function movedFact(w: WeeklyAnalyses['moved']): Fact {
  const { thisWeek, lastWeek, delta } = w.reading
  if (thisWeek === null || lastWeek === null || delta === null) return { id: 'weekly.moved', tags: [], text: 'What moved this week, from the weekly view, needs two weeks of record.', values: {} }
  const values: Fact['values'] = { thisWeek: r1(thisWeek), lastWeek: r1(lastWeek), delta: r1(delta) }
  const parts = w.ingredients.map((m) => {
    const name = readingById(m.reading).name
    const raw = r2((m.thisWeek ?? 0) - (m.lastWeek ?? 0))
    values[`${m.reading}Steps`] = raw
    if (raw === 0) return `${name} no change`
    // Each reading in its own direction (stage 1, item a): the words say which way it went and whether that is better.
    return `${name} ${raw > 0 ? 'up' : 'down'} ${Math.abs(raw)} steps, ${(m.delta ?? 0) > 0 ? 'better' : 'worse'}`
  })
  return {
    id: 'weekly.moved',
    tags: [],
    text: `What moved this week, from the weekly view, the last seven days against the seven before: the reading ${r1(thisWeek)} against ${r1(lastWeek)} (${signed(r1(delta))} points)${parts.length ? `; ${parts.join('; ')}` : ''}.`,
    values,
  }
}

/** A list of differences as the view writes them, with each number in the values under its own key. */
function differences(list: readonly Difference[], prefix: string, values: Fact['values']): string {
  return list
    .map((d, k) => {
      const key = `${prefix}${k + 1}`
      Object.assign(values, { [key]: d.label, [`${key}Best`]: d.onBest, [`${key}BestOf`]: d.ofBest, [`${key}Others`]: d.onOthers, [`${key}OthersOf`]: d.ofOthers })
      return `${d.label}: ${d.onBest} of ${d.ofBest} best days, ${d.onOthers} of ${d.ofOthers} others`
    })
    .join('; ')
}

function bestFacts(b: BestDays): Fact[] {
  if (b.silent) return [{ id: 'weekly.best', tags: [], text: `Best-days, from the weekly view, stays silent until twenty days with two logged blocks: ${b.days} so far.`, values: { days: b.days, threshold: b.threshold } }]
  const by = (k: Kind) => b.controlled.filter((d) => kindOf(d.moveId) === k)
  const values: Fact['values'] = { days: b.days, top: b.top.length }
  const control = differences(by('general'), 'c', values)
  const other = differences(b.uncontrolled, 'u', values)
  const out: Fact[] = [
    {
      id: 'weekly.best',
      tags: [],
      text: `Best-days, from the weekly view: the top tenth of days, ${b.top.length} of ${b.days}, against the others. What you control: ${control || 'nothing differs yet'}. What you don’t: ${other || 'nothing differs yet'}.`,
      values,
    },
  ]
  for (const k of ['faith', 'social'] as const) {
    const list = by(k)
    if (!list.length) continue
    const v: Fact['values'] = { days: b.days, top: b.top.length }
    out.push({ id: `weekly.best.${k}`, tags: [], text: `Best-days, from the weekly view, the ${SUFFIX[k]} among what you control, over the same ${b.top.length} best days of ${b.days}: ${differences(list, 'c', v)}.`, values: v })
  }
  return out
}

function lastsFacts(l: Lasts): Fact[] {
  const decays = (k: Kind, values: Fact['values']) =>
    l.decays
      .filter((d) => kindOf(d.moveId) === k)
      .map((d, i) => {
        const name = hasMove(d.moveId) ? moveById(d.moveId).name : d.moveId
        Object.assign(values, { [`d${i + 1}`]: name, [`d${i + 1}Days`]: d.daysHeld, [`d${i + 1}Runs`]: d.runs })
        return `${name} held about ${d.daysHeld} days after a run (${d.runs} runs)`
      })
  const values: Fact['values'] = {}
  const held = decays('general', values)
  const rewards = l.byReward.filter((r) => r.first || r.later).map((r) => {
    const name = copy.catalogue.tagNames[r.reward as keyof typeof copy.catalogue.tagNames] ?? r.reward
    const est = (e: { mean: number; n: number } | null, key: string) => {
      if (!e) return 'not enough record'
      Object.assign(values, { [key]: r2(e.mean), [`${key}N`]: e.n })
      return `${signed(r2(e.mean))} steps (${e.n})`
    }
    return `${name}: the first three ${est(r.first, `${r.reward}First`)}, later ${est(r.later, `${r.reward}Later`)}`
  })
  const out: Fact[] = [
    {
      id: 'weekly.lasts',
      tags: [],
      text: `What lasts, from the weekly view: ${held.length ? held.join('; ') : 'nothing yet, since it takes three runs of three days'}. ${rewards.length ? `Each reward’s first three times against its later ones: ${rewards.join('; ')}.` : 'No reward has the record yet to set its first three times against its later ones.'}`,
      values,
    },
  ]
  for (const k of ['faith', 'social'] as const) {
    const v: Fact['values'] = {}
    const list = decays(k, v)
    if (list.length) out.push({ id: `weekly.lasts.${k}`, tags: [], text: `What lasts, from the weekly view, the ${SUFFIX[k]}: ${list.join('; ')}.`, values: v })
  }
  return out
}

function healthLine(h: FamilyHealth, values: Fact['values']): string {
  Object.assign(values, { [`${h.family}Live`]: h.live, [`${h.family}Offered`]: h.offered, [`${h.family}Done`]: h.done })
  const dead = h.dead.length ? ` (never offerable: ${h.dead.map((d) => `${d.name}, since ${blocker(d.blocker)}`).join('; ')})` : ''
  const unreachable = h.reachable ? '' : ` (unreachable in the situations seen, since ${blocker(h.blocker ?? 'no situation fits')})`
  return `${h.name}: ${h.live} live, offered ${h.offered}, done ${h.done}${dead}${unreachable}`
}

function healthFacts(health: readonly FamilyHealth[]): Fact[] {
  const values: Fact['values'] = {}
  const general = health.filter((h) => h.family !== 'faith' && h.family !== 'partner')
  const out: Fact[] = [{ id: 'weekly.health', tags: [], text: `Catalogue health, from the weekly view, by family: ${general.map((h) => healthLine(h, values)).join('; ')}.`, values }]
  const faith = health.find((h) => h.family === 'faith')
  if (faith) {
    const v: Fact['values'] = {}
    out.push({ id: 'weekly.health.faith', tags: [], text: `Catalogue health, from the weekly view, the faith family: ${healthLine(faith, v)}.`, values: v })
  }
  return out
}

/**
 * The honesty checks as facts (stage R7), in the view's own words: the readings that moved together this month and the
 * owner's standing requests; where the forecast's misses clustered; whether missing follows how the owner was. Each says
 * how things moved and what that would mean, never a cause.
 */
function checksFacts(c: HonestyChecks): Fact[] {
  // Every number a fact says is in its values, and each date as the words it is said in, so the validator can ground it.
  const tv: Fact['values'] = { flagged: c.together.length, requests: c.requests.length, days: 30 }
  c.together.forEach((p, i) => Object.assign(tv, { [`p${i + 1}Rho`]: r2(p.rho), [`p${i + 1}N`]: p.n }))
  c.requests.forEach((r, i) => Object.assign(tv, { [`r${i + 1}Asked`]: r.day }))
  const together: Fact = {
    id: 'weekly.together',
    tags: [],
    text: `Readings that move together, from the weekly view: ${c.together.length ? c.together.map(togetherLine).join(' ') : 'no two readings moved together almost always over the last thirty days.'}${c.requests.length ? ` Standing requests: ${c.requests.map((r) => `${r.choice === 'reword' ? 'reword one of' : 'merge'} ${readingById(r.a).name} and ${readingById(r.b).name} (asked ${r.day})`).join('; ')}.` : ''}`,
    values: tv,
  }
  const clusterValues = (list: readonly MissCandidate[], v: Fact['values']) =>
    list.forEach((x, i) => {
      Object.assign(v, { [`c${i + 1}In`]: x.missesIn, [`c${i + 1}Of`]: x.slotsIn, [`c${i + 1}Out`]: x.missesOut, [`c${i + 1}OutOf`]: x.slotsOut })
      if (x.cause.kind === 'trend' || x.cause.kind === 'wording') Object.assign(v, { [`c${i + 1}Since`]: formatDayShort(x.cause.since) })
    })
  // A cluster after one move names it: a faith practice or a Social path rep goes in a fact of its own, as everywhere here.
  const ofKind = (k: Kind) => c.misses.clusters.filter((x) => (x.cause.kind === 'move' ? kindOf(x.cause.moveId) : 'general') === k)
  const general = ofKind('general')
  const mv: Fact['values'] = { days: 56, slots: c.misses.slots, misses: c.misses.misses, clusters: general.length }
  clusterValues(general, mv)
  const misses: Fact = { id: 'weekly.misses', tags: [], text: `Where the forecast misses, from the weekly view: ${missLines({ ...c.misses, clusters: general }).join(' ')}`, values: mv }
  const apart: Fact[] = (['faith', 'social'] as const)
    .filter((k) => ofKind(k).length > 0)
    .map((k) => {
      const v: Fact['values'] = { clusters: ofKind(k).length }
      clusterValues(ofKind(k), v)
      return { id: `weekly.misses.${k}`, tags: [], text: `Where the forecast misses, from the weekly view, after ${SUFFIX[k]}: ${ofKind(k).map(missLine).join(' ')}`, values: v }
    })
  const gv: Fact['values'] = { days: 56, slots: c.missing.slots, missed: c.missing.missed, started: c.missing.started, unanswered: c.missing.unanswered, relations: c.missing.relations.length, lean: leanOf(c.missing) ?? 'none' }
  c.missing.relations.forEach((x, i) => Object.assign(gv, { [`m${i + 1}In`]: x.missingIn, [`m${i + 1}Of`]: x.slotsIn, [`m${i + 1}Out`]: x.missingOut, [`m${i + 1}OutOf`]: x.slotsOut }))
  const missing: Fact = { id: 'weekly.missing', tags: [], text: `What goes missing, from the weekly view: ${missingLines(c.missing).join(' ')}`, values: gv }
  return [together, misses, ...apart, missing]
}

/** The weekly facts, in the view's order of reading: the scorecard, the gap, what moved, best days, what lasts, catalogue health, the checks on the record. */
export function weeklyFacts(w: WeeklyAnalyses): Fact[] {
  return [scorecardFact(w.scorecard), gapFact(w.gap), movedFact(w.moved), ...bestFacts(w.best), ...lastsFacts(w.lasts), ...healthFacts(w.health), ...checksFacts(w.checks)]
}
