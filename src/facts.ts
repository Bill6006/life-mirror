import { addDays, BLOCKS, blockAt, blockIndex, dayKey, daysBetween, type Block } from './blocks'
import { doneBySetting, pathName, pathToday, stageWords } from './pathStage'
import { associationFor, associationTier, morningAssociation, privateAssociations, type Association } from './associations'
import { becoming, blockedBy, cueCounts, currentSkillOf, followThrough, keysOf, lastDoneDay, lastPracticeDay, planFor, practiceDaysOf, practiceOn, sessionsToday, skillsOfAim, stepFor, studyOfferBelongs } from './aims'
import { dueOf, isFaithPractice, rhythmOf, scheduleOf } from './rhythm'
import { hasMove, isParked, isPathOnly, isProposed, moveById, OBSERVED_ONLY, PASSIVE, type SettingKind } from './catalogue'
import { library } from './library'
import { copy } from './copy'
import { heldBedtime, heldPickup } from './dayShape'
import { carriedByContext, contextWords, type DayKind } from './people'
import { bandsLabel, dayCaffeine, HABIT_DAYS, lateCaffeine, lower, windowsLabel, type CaffeineEvidence, type SleepComparison } from './caffeineRecord'
import type { Aim, BrainBrief, BriefFeedback, BriefLog, CaffeineBand, CheckIn, CoachPick, DayContext, Intention, Offer, Outcome, OutsideDay, PathMark, PrivateItem, RungMark, Skill, StudyNight, UseRow, Win } from './db'
import { fill, formatDayLong } from './format'
import type { Brief } from './forecastFlow'
import { sittingOf } from './ladder'
import type { Evidence } from './learningFlow'
import { NOTHING } from './offers'
import { anchorFor, headword, readingById, type ReadingId } from './readings'
import { bandOf, CONTEXT_IDS, INGREDIENT_IDS, INGREDIENTS, readingOf } from './score'
import { usageFacts } from './usageFacts'
import type { Where } from './location'
import { HARD_MEASURES, isHard, lastWorkout, sessionSlot, type HardMeasure } from './workouts'

// The fact sheet: everything the app knows about the day, as facts with ids and values, built by
// the same deterministic code that draws every screen. The brain, on the phone or in the Worker,
// may only speak from these; a number not on the sheet is refused. Each fact says how much
// stands behind it (a count, a tier) and that never merges with any card's grade.

import type { Fact, FactSheet, SaidEntry } from './factTypes'
export type { Fact, FactSheet, SaidEntry } from './factTypes'

export interface FactInput {
  /** Tomorrow's shape from the week in Settings (or the day's own record if one exists), for a line written overnight. */
  tomorrow?: DayContext | null
  /** "Show private items by name outside this screen" (Rule 11), carried on the sheet's header. */
  showPrivate?: boolean
  day: string
  now: Date
  checkins: CheckIn[]
  contexts: DayContext[]
  brief: Brief
  evidence: Evidence
  aims: Aim[]
  skills: Skill[]
  marks: RungMark[]
  offers: Offer[]
  outcomes: Outcome[]
  nights: StudyNight[]
  intentions: Intention[]
  wins: Win[]
  outside: OutsideDay[]
  items: PrivateItem[]
  direction: string | null
  usual: Record<Block, { point: number; lo: number; hi: number } | null>
  log: BriefLog[]
  feedback: BriefFeedback[]
  brainBriefs: BrainBrief[]
  /** The check-in's depth and whether low-demand mode is on: what a lighter check-in could still change. */
  depth: string
  lowDemand: boolean
  /** Part 27: the paths' declarations, for the one Partner fact the sheet carries, the date day. */
  pathMarks?: PathMark[]
  /** Follow-up F1: how Life Mirror is used, and what its counts are set against. Absent, no usage fact is written. */
  use?: { rows: UseRow[]; coachPicks: CoachPick[]; allAims: Aim[] }
  /** Parts 40 and 41, once their gate is open: the progression review open on a learning commitment's current skill, by commitment. Absent, the sheet is as it was. */
  reviews?: ReadonlyMap<number, { days: number; reason: 'ordinary' | 'struggle' }>
}

/**
 * A step the sheet may count: every offer but the Partner path's own. A rep both paths hold,
 * offered through the Social path, is Social's too and stays (Part 27).
 */
export function onTheSheet(o: Pick<Offer, 'paths'>): boolean {
  return !o.paths?.includes('partner') || o.paths.includes('social')
}

/** A like-for-like difference worth calling promising for a chip: ten points on the reading out of 100. */
export const CHIP_WORTHWHILE = 10
const TREND_WINDOW = 6
/** Sleep hours at or under this position is a short night: under five hours, or five to six. */
export const SHORT_SLEEP = 2
const NOTE_DAYS = 14
const NOTES_KEPT = 5

/** How many of these days fall in each of the last four weeks ending today, oldest week first. Rolling weeks, so today is always in the last. */
export function weekBuckets(days: readonly string[], today: string): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (const d of days) {
    const ago = daysBetween(d, today)
    if (ago < 0 || ago >= 28) continue
    out[3 - Math.floor(ago / 7)]++
  }
  return out
}

function fact(id: string, tags: string[], text: string, values: Record<string, number | string | null> = {}, extra: { n?: number; tier?: string } = {}): Fact {
  return { id, tags, text, values, ...extra }
}

function nameOfMove(id: string, label?: string): string {
  if (id === NOTHING) return copy.move.nothing
  return hasMove(id) ? moveById(id).name : (label ?? id)
}

/** How a kind of place is said (Part 43): a kind, never a coordinate or an address. */
const WHERE_WORDS: Record<Where, string> = { home: 'at Home', work: 'at Work', church: 'at Church', regular: 'at a regular place', out: 'out, at no place you named', away: 'away from home, in a different area' }

/**
 * Where a day's parts were spent, as Location Context saw them while Life Mirror was open, in order:
 * "the morning at Home; the afternoon at Work, then at Home". Null for a day it saw nothing of.
 */
export function whereWords(where: DayContext['where']): { text: string; values: Record<string, string> } | null {
  const parts: string[] = []
  const values: Record<string, string> = {}
  for (const b of BLOCKS) {
    const list = where?.[b] ?? []
    if (!list.length) continue
    parts.push(`the ${b} ${list.map((w) => WHERE_WORDS[w]).join(', then ')}`)
    values[b] = list.join(',')
  }
  return parts.length ? { text: parts.join('; '), values } : null
}

/** A reading by name, with what it measures where it is easily misread (Part 42): Loneliness is missing closeness, not a wish for company. */
function named(r: { name: string; meaning?: string }): string {
  return r.meaning ? `${r.name} (${r.meaning})` : r.name
}

function round(v: number | null): number | null {
  return v === null ? null : Math.round(v)
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

/** Words quoted inside a sentence, closed with a stop only when they end without one (Part 36). */
function quoted(words: string): string {
  return `“${words}”${/[.!?]$/.test(words.trim()) ? '' : '.'}`
}

/** Your rating after a session, in words. */
const EFFORT_WORDS: Record<NonNullable<OutsideDay['effort']>, string> = { 'too-easy': 'too easy', right: 'about right', 'too-hard': 'too hard' }

/** A reading moving by this many anchor steps is worth a second look (ten points of a hundred). */
const HARD_WORTHWHILE_STEPS = 0.4

/**
 * Part 35: the mornings after a hard session, against the mornings after other days that ended
 * the same, like for like, each reading in anchor steps in its own direction (stress up is more
 * stress); each tier read in that reading's good direction. An association, never a cause.
 */
function hardFact(h: { times: number; measures: Record<HardMeasure, Association> }): Fact {
  const parts: string[] = []
  const values: Record<string, number | string | null> = { times: h.times }
  for (const id of HARD_MEASURES) {
    const a = h.measures[id]
    const diff = a.diff === null ? null : Math.round(a.diff * 10) / 10
    const good = INGREDIENTS[id] === 'down' ? -1 : 1
    const tier = associationTier({ ...a, diff: diff === null ? null : good * diff }, HARD_WORTHWHILE_STEPS)
    values[id] = diff
    values[`${id}Tier`] = tier
    parts.push(`${readingById(id).name.toLowerCase()} ${diff === null ? 'not comparable yet' : `${diff > 0 ? '+' : ''}${diff} steps (${tier})`}`)
  }
  return fact('assoc.hardWorkout', ['workout', 'energy', 'mood', 'stress'], `The mornings after a hard session (rated too hard, or working sets close to failure), against mornings after other days that ended the same, like for like, ${h.times === 1 ? 'once' : `${h.times} times`}: ${parts.join(', ')}. An association, not a cause.`, values, { n: h.times })
}

function assocFact(id: string, tags: string[], event: string, a: Association, after: string): Fact | null {
  if (a.times < 1) return null
  const tier = associationTier(a, CHIP_WORTHWHILE)
  const diff = round(a.diff)
  const text =
    diff === null
      ? `${event} has ${a.times} ${a.times === 1 ? 'day' : 'days'} behind it; nothing can be compared yet.`
      : `${after} ${event} read ${signed(diff)} against ${after.toLowerCase()} without it, like for like, ${a.times} times (${tier}).`
  return fact(id, tags, text, { diff, with: round(a.withEvent.mean), without: round(a.without.mean), times: a.times, bands: a.bands }, { n: a.times, tier })
}

/**
 * Caffeine (Part 22): today's windows, the habit, a late window, and the comparisons, each
 * naming what was reported and what was seen and left untapped. None reported is never a zero,
 * and every comparison is an association with its counts.
 */
export function caffeineFacts(checkins: readonly CheckIn[], ev: CaffeineEvidence, today: string): Fact[] {
  const out: Fact[] = []
  const band = (b: CaffeineBand) => lower(copy.caffeine.bands[b])
  const d = dayCaffeine(checkins, today)
  if (d.windows.length || d.untapped.length) {
    const values: Record<string, number | string | null> = { reported: d.windows.length, untapped: d.untapped.length, atLeast: d.floor }
    const parts: string[] = []
    for (const b of BLOCKS) {
      const w = d.windows.find((x) => x.block === b)
      values[b] = w ? band(w.band) : d.untapped.includes(b) ? 'none reported' : null
      if (values[b]) parts.push(`${b} ${values[b]}`)
    }
    const total = !d.windows.length ? '' : d.floor > 0 ? `; at least ${d.floor} mg reported in all` : '; under 100 mg in each window that reported'
    out.push(fact('today.caffeine', ['caffeine'], `Caffeine by check-in window today: ${parts.join('; ')}${total}. None reported is not a confirmed none.`, values, { n: d.windows.length }))
  }
  const h = ev.habit
  if (h.reportedDays || h.untapped) {
    const usual = h.usualMorning ? `, most often ${band(h.usualMorning)} in the morning` : ''
    const habitual = h.habitual ? ' Reported on most days, so an untapped morning is more likely forgotten than empty.' : ''
    out.push(fact('caffeine.habit', ['caffeine', 'habit'], `Caffeine was reported on ${h.reportedDays} of the last ${HABIT_DAYS} days${usual}; ${h.untapped} ${h.untapped === 1 ? 'window' : 'windows'} where the item was shown went untapped, which is no caffeine reported, never a confirmed none.${habitual}`, { reported: h.reportedDays, days: HABIT_DAYS, usualMorning: h.usualMorning ? band(h.usualMorning) : null, untapped: h.untapped, habitual: h.habitual ? 1 : 0 }, { n: h.reportedDays }))
  }
  // Fired only by a reported band of 100 mg or more; no bedtime is assumed: the cut-off, counted from the check-in, runs past midnight.
  const late = lateCaffeine(checkins, today) ?? lateCaffeine(checkins, addDays(today, -1))
  if (late) {
    out.push(fact('caffeine.late', ['caffeine', 'sleep', 'evening'], `On ${late.day}, ${band(late.band)} was reported at the ${late.block} check-in at ${late.time}. A meta-analysis put the point where about ${late.mg} mg stops shortening sleep at ${late.hours} hours before bed; counted from ${late.time}, that runs past midnight.`, { day: late.day, when: late.day === today ? 'today' : 'yesterday', block: late.block, band: band(late.band), time: late.time, mg: late.mg, hours: late.hours }))
  }
  const sleep = <K,>(id: string, by: string, c: SleepComparison<K>, label: (keys: K[]) => string, unit: [string, string]) => {
    if (!c.groups.length) return
    const low = lower(label(c.groups[0].keys))
    const high = lower(label(c.groups[c.groups.length - 1].keys))
    const groups = c.groups.map((g) => `${lower(label(g.keys))} ${g.n} ${g.n === 1 ? unit[0] : unit[1]}`).join(', ')
    const minutes = c.hoursDiff === null ? null : Math.round(c.hoursDiff * 60)
    const quality = c.qualityDiff === null ? null : Math.round(c.qualityDiff * 10) / 10
    const read = [minutes === null ? null : `sleep ${signed(minutes)} minutes`, quality === null ? null : `quality ${signed(quality)} of a step`].filter(Boolean).join(' and ')
    const body =
      c.groups.length < 2
        ? 'one group so far, and comparing needs two groups of five'
        : c.unmatched
          ? 'no day in one group began on the same sleep as a day in the other, so nothing is compared like for like yet'
          : c.none
            ? 'no difference is showing, and self-reported sleep is known to miss caffeine’s effect'
            : `after ${high} ${unit[1]} the next night read ${read} against ${low} ${unit[1]}`
    out.push(fact(id, ['caffeine', 'sleep'], `The next night's sleep ${by}, like for like on the sleep the day began with: ${groups}; ${body} (${c.standing}). Untapped windows (${h.untapped}) and days with nothing known are in no group.`, { low, high, n: c.groups[0].n, m: c.groups[c.groups.length - 1].n, groups: c.groups.length, minutes, quality, none: c.none ? 1 : 0, untapped: h.untapped }, { n: c.groups.reduce((t, g) => t + g.n, 0), tier: c.standing }))
  }
  sleep('assoc.caffeine.bands', 'by the day’s reported caffeine', ev.byDayBand, bandsLabel, ['day', 'days'])
  sleep('assoc.caffeine.latest', 'by the last window with 100 mg or more', ev.byLatestWindow, windowsLabel, ['day', 'days'])
  const m = ev.byMorningBand
  if (m.groups.length) {
    const low = lower(bandsLabel(m.groups[0].keys))
    const high = lower(bandsLabel(m.groups[m.groups.length - 1].keys))
    const groups = m.groups.map((g) => `${lower(bandsLabel(g.keys))} ${g.n} ${g.n === 1 ? 'morning' : 'mornings'}`).join(', ')
    const diff = m.diff === null ? null : Math.round(m.diff)
    const body =
      m.groups.length < 2
        ? 'one group so far, and comparing needs two groups of five'
        : diff === null
          ? 'no morning in one group began on the same sleep as one in the other, so nothing is compared like for like yet'
          : m.none
            ? 'no difference is showing'
            : `after ${high} mornings the afternoon read ${signed(diff)} against ${low} mornings`
    out.push(fact('assoc.caffeine.morning', ['caffeine', 'afternoon'], `That afternoon's reading by the morning's reported caffeine, like for like on the sleep the morning began with: ${groups}; ${body} (${m.standing}).`, { low, high, n: m.groups[0].n, m: m.groups[m.groups.length - 1].n, groups: m.groups.length, diff, none: m.none ? 1 : 0 }, { n: m.groups.reduce((t, g) => t + g.n, 0), tier: m.standing }))
  }
  const r = ev.reported
  if (r.groups.length) {
    const count = (k: 'reported' | 'untapped') => r.groups.filter((g) => g.keys.includes(k)).reduce((t, g) => t + g.n, 0)
    const diff = r.diff === null ? null : Math.round(r.diff)
    const body =
      r.groups.length < 2
        ? 'one group so far, and comparing needs two groups of five'
        : diff === null
          ? 'the two groups share no time of day, so nothing is compared like for like yet'
          : r.none
            ? 'no difference is showing'
            : `where it was reported the check-in read ${signed(diff)}`
    const dropped = r.droppedMornings ? ` Untapped mornings left out: ${r.droppedMornings}, because caffeine was reported on most of the last ${HABIT_DAYS} days.` : ''
    const withdrawal = r.habitual ? ' Reported on most days, part of a same-check-in difference may be withdrawal on the check-ins without it, not a lift on the ones with it.' : ''
    out.push(fact('assoc.caffeine.reported', ['caffeine', 'energy'], `The same check-in's reading where caffeine was reported, against where the item was shown and none reported, like for like by time of day: reported ${count('reported')}, none reported ${count('untapped')}; ${body} (${r.standing}).${dropped}${withdrawal}`, { reported: count('reported'), untapped: count('untapped'), groups: r.groups.length, diff, none: r.none ? 1 : 0, dropped: r.droppedMornings, habitual: r.habitual ? 1 : 0 }, { n: count('reported') + count('untapped'), tier: r.standing }))
  }
  return out
}

/** The positions answered for one reading, oldest first. */
function positionsOf(checkins: readonly CheckIn[], id: ReadingId): number[] {
  return [...checkins]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : blockIndex(a.block) - blockIndex(b.block)))
    .map((c) => c.answers[id])
    .filter((p): p is 1 | 2 | 3 | 4 | 5 => p !== undefined)
}

function mean(xs: readonly number[]): number {
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
}

/** From this moment the phone marks its own line when it is on screen; lines logged before then are judged by the rule below (Part 33). */
const SHOWN_MARKED_FROM = '2026-09-25T00:00:00.000Z'

/**
 * Whether the phone's own line was on screen, and so was said: marked when shown; before the mark
 * existed, a line logged while the brain's own line already stood that day was never shown, since
 * the brain's line takes the card.
 */
export function wasShown(l: Pick<BriefLog, 'day' | 'at' | 'shownAt'>, briefs: readonly Pick<BrainBrief, 'day' | 'at' | 'kind'>[]): boolean {
  if (l.shownAt) return true
  if (l.at >= SHOWN_MARKED_FROM) return false
  return !briefs.some((w) => w.kind === 'brief' && w.day === l.day && w.at <= l.at)
}

export function buildFactSheet(i: FactInput): FactSheet {
  const facts: Fact[] = []
  const today = i.day
  const yesterday = addDays(today, -1)
  const first = i.checkins.reduce<string | null>((f, c) => (f === null || c.day < f ? c.day : f), null)
  const days = first ? daysBetween(first, today) + 1 : 0
  const weeks = Math.floor(days / 7)
  const ctx = i.contexts.find((c) => c.day === today) ?? null
  const hour = i.now.getHours()
  const b = copy.bands as Record<string, string>

  facts.push(fact('record', [], `${days} days of record, ${weeks} weeks, ${i.checkins.length} check-ins.`, { days, weeks, checkins: i.checkins.length }))

  if (ctx) {
    const weekday = formatDayLong(today).split(',')[0]
    // While she is away (the chip), the day holds no drop-off, pickup or bedtime, whatever the week's shape wrote.
    const pickup = heldPickup(ctx)
    const bedtime = heldBedtime(ctx)
    const parts = [`Today is ${weekday}`, ctx.withHer ? null : 'she is away today', pickup ? `a daycare day with pickup at ${pickup}` : 'not a daycare day', ctx.atOffice ? 'at the office' : 'at home', ctx.churchDay ? 'a church day' : null, ctx.studyNight ? 'a preferred study day' : null, bedtime ? `her bedtime ${bedtime}` : null, `the hour is ${hour}`]
    facts.push(
      fact('week.today', ['cue', 'evening'], parts.filter(Boolean).join('; ') + '.', {
        weekday,
        away: ctx.withHer ? 0 : 1,
        daycare: pickup ? 1 : 0,
        pickup,
        office: ctx.atOffice ? 1 : 0,
        church: ctx.churchDay ? 1 : 0,
        studyNight: ctx.studyNight ? 1 : 0,
        bedtime,
        hour,
      }),
    )
  }
  // Tomorrow's shape, so a line written overnight for tomorrow is written for the right day (Part 19). No record is written for it.
  const tctx = i.tomorrow ?? null
  if (tctx) {
    const tday = addDays(today, 1)
    const tweekday = formatDayLong(tday).split(',')[0]
    const tpickup = heldPickup(tctx)
    const tbedtime = heldBedtime(tctx)
    const tparts = [`Tomorrow is ${tweekday}`, tctx.withHer ? null : 'she is not with you', tpickup ? `a daycare day with pickup at ${tpickup}` : 'not a daycare day', tctx.atOffice ? 'at the office' : 'at home', tctx.churchDay ? 'a church day' : null, tctx.studyNight ? 'a preferred study day' : null, tbedtime ? `her bedtime ${tbedtime}` : null]
    facts.push(
      fact('week.tomorrow', ['cue'], tparts.filter(Boolean).join('; ') + '.', {
        day: tday,
        weekday: tweekday,
        away: tctx.withHer ? 0 : 1,
        daycare: tpickup ? 1 : 0,
        pickup: tpickup,
        office: tctx.atOffice ? 1 : 0,
        church: tctx.churchDay ? 1 : 0,
        studyNight: tctx.studyNight ? 1 : 0,
        bedtime: tbedtime,
      }),
    )
  }
  const yctx = i.contexts.find((c) => c.day === yesterday)
  if (yctx) facts.push(fact('week.yesterday', ['recovery'], `Yesterday was ${yctx.churchDay ? 'a church day' : 'not a church day'}, ${yctx.withHer ? 'with her' : 'without her'}${yctx.studyNight ? ', a preferred study day' : ''}.`, { church: yctx.churchDay ? 1 : 0, studyNight: yctx.studyNight ? 1 : 0, withHer: yctx.withHer ? 1 : 0 }))

  // Readings: yesterday's blocks and today's logged ones, out of 100 with the band.
  for (const day of [yesterday, today]) {
    for (const block of BLOCKS) {
      const c = i.checkins.find((x) => x.day === day && x.block === block)
      const r = c ? readingOf(c) : null
      if (!c || !r) continue
      const band = bandOf(r.value)
      const when = day === today ? 'This' : 'Yesterday'
      facts.push(fact(`reading.${day}.${block}`, ['mood', block], `${when} ${block} read ${r.value}, ${b[band]}, ${r.used} of ${r.total} ingredients.`, { day, block, value: r.value, band: b[band], used: r.used, total: r.total }))
    }
  }

  // Context readings at their latest answer, and each reading's recent drift.
  for (const id of [...INGREDIENT_IDS, ...CONTEXT_IDS]) {
    const reading = readingById(id)
    const latest = [...i.checkins].filter((c) => c.answers[id] !== undefined).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : blockIndex(b.block) - blockIndex(a.block)))[0]
    if (latest && CONTEXT_IDS.includes(id)) {
      const p = latest.answers[id] as 1 | 2 | 3 | 4 | 5
      const word = headword(anchorFor(id, p))
      facts.push(fact(`context.${id}`, [id === 'loneliness' ? 'loneliness' : id === 'sleepHours' || id === 'sleepQuality' ? 'sleep' : id === 'hunger' ? 'hunger' : id === 'motivation' ? 'mood' : 'social'], `${named(reading)} read “${word}” (${p} of 5) at the ${latest.block} check-in on ${latest.day}.`, { position: p, word, day: latest.day, block: latest.block }))
    }
    const ps = positionsOf(i.checkins, id)
    if (ps.length >= TREND_WINDOW * 2) {
      const recent = mean(ps.slice(-TREND_WINDOW))
      const prior = mean(ps.slice(-TREND_WINDOW * 2, -TREND_WINDOW))
      facts.push(fact(`trend.${id}`, [id === 'loneliness' ? 'loneliness' : 'mood'], `${named(reading)}: the last ${TREND_WINDOW} answers average ${recent} of 5 against ${prior} for the ${TREND_WINDOW} before.`, { recent, prior, window: TREND_WINDOW }, { n: TREND_WINDOW }))
    }
  }

  for (const block of BLOCKS) {
    const u = i.usual[block]
    if (u) facts.push(fact(`usual.${block}`, ['forecast', block], `The ${block} usually reads ${Math.round(u.point)}, ${Math.round(u.lo)} to ${Math.round(u.hi)}.`, { block, point: Math.round(u.point), lo: Math.round(u.lo), hi: Math.round(u.hi) }))
  }
  for (const t of i.brief.today) {
    if (!t.forecast) continue
    facts.push(fact(`forecast.${t.block}`, ['forecast', t.block], `Today's ${t.block} is forecast at ${Math.round(t.forecast.point)}, ${Math.round(t.forecast.lo)} to ${Math.round(t.forecast.hi)}${t.actual !== null ? `; it read ${t.actual}` : ''}.`, { block: t.block, point: Math.round(t.forecast.point), lo: Math.round(t.forecast.lo), hi: Math.round(t.forecast.hi), actual: t.actual, width: Math.round(t.forecast.hi - t.forecast.lo) }))
  }
  if (i.brief.whatIf !== null) facts.push(fact('whatIf', ['forecast', 'evening'], `Tonight's what-if: with nothing extra done, the evening usually reads about ${Math.round(i.brief.whatIf)}, the average over recent days with no move marked done in the evening; an assumption, never verified.`, { value: Math.round(i.brief.whatIf) }))

  if (i.brief.lastNight) {
    const ln = i.brief.lastNight
    const event = copy.brief.lastNightEvents[ln.key]
    facts.push(
      fact('lastNight', ['evening', 'recovery', ln.key === 'churchDay' ? 'church' : ln.key === 'bigSocial' ? 'social-event' : ln.key === 'napped' ? 'nap' : ln.key === 'workout' ? 'workout' : ln.key === 'caffeine' ? 'caffeine' : 'evening'], ln.with === null || ln.without === null ? `Last night carried ${event}; ${ln.n} evenings like it so far, nothing to compare yet.` : `Last night carried ${event}; the mornings after evenings like it read ${round(ln.with)} against ${round(ln.without)} without, ${ln.n} evenings.`, { key: ln.key, with: round(ln.with), without: round(ln.without), n: ln.n }, { n: ln.n }),
    )
  }
  if (i.brief.warning?.warning) {
    const w = i.brief.warning
    facts.push(fact('stretch', ['mood', 'necessities'], `${w.under} of the last ${w.of} logged blocks read under their usual low; ${w.chips} evening chips and ${w.necessities} necessities missed in three days.`, { under: w.under, of: w.of, chips: w.chips, necessities: w.necessities }, { n: w.of }))
  } else if (i.brief.steady) {
    facts.push(fact('steady', ['mood'], `${i.brief.steady.inside} of the last ${i.brief.steady.of} logged blocks read inside their usual range.`, { inside: i.brief.steady.inside, of: i.brief.steady.of }, { n: i.brief.steady.of }))
  }
  if (i.brief.move) {
    const m = i.brief.move
    const steps = Math.round(Math.abs(m.effect) * 10) / 10
    facts.push(fact('move.yesterday', ['mood'], `Yesterday's move, ${nameOfMove(m.moveId)} (${m.arm}), read ${steps} anchor steps ${m.effect >= 0 ? 'above' : 'under'} usual on ${readingById(m.target).name}: one reading, not a finding.`, { move: nameOfMove(m.moveId), arm: m.arm, steps, direction: m.effect >= 0 ? 'above' : 'under', target: readingById(m.target).name }, { n: 1 }))
  }

  // Offers over the last seven days, and the null offer over the record.
  const since = addDays(today, -6)
  const outcomeOf = new Map(i.outcomes.map((x) => [x.offerId, x]))
  const recent = i.offers.filter((o) => o.day >= since && o.day <= today && (o.kind === 'block' || o.kind === 'pickup'))
  const tally = { offered: recent.length, done: 0, partly: 0, no: 0, skipped: 0, unanswered: 0 }
  for (const o of recent) {
    const x = o.id === undefined ? undefined : outcomeOf.get(o.id)
    if (o.skippedAt) tally.skipped++
    else if (x?.outcome === 'done') tally.done++
    else if (x?.outcome === 'partly') tally.partly++
    else if (x?.outcome === 'no') tally.no++
    else tally.unanswered++
  }
  if (recent.length) facts.push(fact('offers.7d', ['small-step', 'lapse'], `Moves offered in the last seven days: ${tally.offered}; done ${tally.done}, partly ${tally.partly}, no ${tally.no}, skipped ${tally.skipped}, unanswered ${tally.unanswered}.`, tally, { n: tally.offered }))
  const nothing = i.evidence.nothing
  if (nothing.offered) facts.push(fact('nothing', ['nothing', 'break'], `Nothing extra was offered ${nothing.offered} times, kept to ${nothing.done} times, skipped ${nothing.skipped}.`, nothing, { n: nothing.offered }))

  // Like-for-like associations: the chips, the other app's workouts, and the private items.
  const chip = (id: string, tags: string[], event: string, a: Association | null, after: string) => {
    const f = a ? assocFact(id, tags, event, a, after) : null
    if (f) facts.push(f)
  }
  chip('assoc.coolingOff', ['cooling-off', 'stress'], 'a cooling-off event', i.evidence.coolingOff?.association ?? null, 'Mornings after')
  chip('assoc.bigSocial', ['social-event', 'recovery'], 'a big social event', i.evidence.bigSocial, 'Mornings after')
  chip('assoc.heavyCaffeine', ['caffeine', 'afternoon'], 'a morning marked heavy caffeine, before amounts were recorded', i.evidence.heavyCaffeine, 'Afternoons after')
  chip('assoc.workouts', ['workout', 'evening'], 'a workout day', i.evidence.workouts, 'Evenings of')
  // Part 35: an evening session against the night and the morning after; a hard session against the next morning's four readings.
  chip('assoc.eveningWorkout', ['workout', 'evening', 'sleep'], 'an evening workout', i.evidence.eveningWorkout?.morning ?? null, 'Mornings after')
  chip('assoc.eveningWorkout.sleep', ['workout', 'sleep'], 'an evening workout', i.evidence.eveningWorkout?.sleep ?? null, 'Sleep quality the mornings after')
  if (i.evidence.hardWorkout) facts.push(hardFact(i.evidence.hardWorkout))
  chip('assoc.napped', ['nap', 'sleep'], 'a nap', associationFor(i.checkins, today, (c) => Boolean(c.extras?.napped)), 'Mornings after')
  // Sleep is answered every full morning and is the largest lever on the day: short nights set against the afternoons that follow, like for like.
  chip('assoc.shortSleep', ['sleep', 'afternoon', 'energy'], 'a short night (under six hours)', morningAssociation(i.checkins, today, (c) => (c.answers.sleepHours ?? 9) <= SHORT_SLEEP), 'Afternoons after')
  for (const p of privateAssociations(true, i.items, i.checkins, today)) {
    const f = assocFact(`private.${p.itemId}`, ['evening', 'sleep'], p.name, p.association, 'Mornings after')
    if (f) facts.push({ ...f, values: { ...f.values, name: p.name, alternative: nameOfMove(p.alternativeId) } })
  }

  // Cards: what is being tested, and where each stands.
  for (const c of i.evidence.cards) {
    const move = nameOfMove(c.card.moveId)
    const alt = nameOfMove(c.card.alternativeId)
    const n = c.stats.n.done + c.stats.n.alternative
    facts.push(fact(`test.${c.card.id}`, ['monitoring'], `Card: ${move} against ${alt} on ${readingById(c.card.target).name} in ${c.card.situationKey}: ${c.stats.tier}, ${n} observations.`, { move, moveId: c.card.moveId, alternative: alt, target: readingById(c.card.target).name, tier: c.stats.tier, n, situation: c.card.situationKey }, { n, tier: c.stats.tier }))
  }

  // What the library backs and the record has never tested: a test the brain may propose, one tap to set.
  const tested = new Set(i.evidence.cards.map((c) => c.card.moveId))
  const backed: string[] = []
  for (const card of library) {
    if (card.status !== 'admitted') continue
    for (const m of card.moves ?? []) {
      if (!hasMove(m) || tested.has(m) || backed.includes(m)) continue
      const move = moveById(m)
      // A path's own reps are offered through its row alone, so no test is proposed for them (Part 24).
      if (isParked(move) || isProposed(move) || isPathOnly(move) || PASSIVE.has(m) || OBSERVED_ONLY.has(m)) continue
      backed.push(m)
    }
  }
  if (days >= 14 && backed.length) facts.push(fact('untested', ['monitoring'], `Moves the library backs that the record has never tested: ${backed.map((m) => `${moveById(m).name} (${m})`).join(', ')}.`, { moves: backed.join(','), count: backed.length }))

  // Commitments: the step, the last fact, what blocked it, today's plan, the cues' record, the ladder's shape.
  const studyAims = i.aims.filter((a) => a.kind === 'certification')
  const openOffers = i.offers.filter((o) => (o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study') && o.closedAt === null && o.skippedAt === null)
  const records = { offers: i.offers.filter((o) => o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study'), outcomes: i.outcomes, nights: i.nights }
  const doneIds = new Set(i.outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  const perAim = new Map<number, { name: string; sittings: Offer[]; skills: Skill[] }>()
  const pathOffers = i.offers.filter(onTheSheet)
  const block = blockAt(i.now).block
  for (const aim of i.aims) {
    // A paused path says nothing; it has no row and no step (Part 24). The Partner path writes no
    // commitment fact at all: the sheet carries it only as the date-day fact (Part 27).
    if (aim.kind === 'path' && (aim.pausedAt || aim.path === 'partner')) continue
    // A paused commitment says nothing either: nothing surfaces it and its paused weeks are never read as fading (Workstream 6).
    if (aim.pausedAt) continue
    const id = aim.id as number
    const study = aim.kind === 'certification'
    // The sheet the free models read never takes in the Partner path (Part 27): a Partner-only rep done today changes nothing here, though the People row and the coach know it (D4).
    const pt = aim.kind === 'path' ? pathToday({ aim, offers: pathOffers, outcomes: i.outcomes, ctx, day: today, block }) : null
    const name = pt ? pathName(pt.path) : (aim.name ?? copy.aims.kinds[aim.kind])
    const step = pt?.pick ? sittingOf(moveById(pt.pick.moveId)) : stepFor(aim, i.skills, i.marks, studyAims)
    // Something to learn (Workstream 6): its current skill and the practice on it; the retired ladder is history, not a fact of today.
    const own = study ? skillsOfAim(aim, i.skills, studyAims) : []
    const current = study ? currentSkillOf(aim, i.skills, i.marks, studyAims) : null
    const practice = current ? practiceOn(current, i.offers, i.outcomes) : null
    const todaySessions = sessionsToday(aim, records.offers, records.outcomes, today, i.skills, studyAims)
    const doneToday = todaySessions.done !== null
    const lastDay = study ? lastPracticeDay(aim, records.offers, records.outcomes, i.skills, studyAims) : lastDoneDay(aim, records.offers, records.outcomes, studyAims)
    const gap = lastDay ? daysBetween(lastDay, today) : null
    const blocked = blockedBy(aim, records.offers, records.outcomes, records.nights, i.skills, studyAims)
    const plan = planFor(i.intentions, id, today)
    const keys = keysOf(aim, studyAims)
    const open = openOffers.some((o) => keys.includes(o.situationKey) || studyOfferBelongs(o, aim, i.skills, studyAims))
    const counts = cueCounts(i.intentions, id)
    // Part 39: its own rhythm or fixed days, and what they make of today; a faith practice is never counted by the days between (Rule 10).
    const rhythm = rhythmOf(aim.rhythm)
    const schedule = scheduleOf(aim.schedule)
    const faith = isFaithPractice(aim)
    const due = pt ? null : dueOf({ rhythm, schedule, paused: false, started: open, doneToday, partlyToday: todaySessions.partly, planned: plan !== null && plan.offerId === null, faith, practiceDays: practiceDaysOf(aim, records.offers, records.outcomes, i.skills, studyAims), today })
    const values: Record<string, number | string | null> = {
      kind: aim.kind,
      name,
      step: step.title,
      minutes: step.minutes,
      gapDays: gap,
      blocked: blocked ?? null,
      plan: plan?.cue ?? null,
      planTime: plan?.time ?? null,
      planStarted: plan && plan.offerId !== null ? 1 : 0,
      open: open ? 1 : 0,
      doneToday: doneToday ? 1 : 0,
      due: due?.state ?? null,
      perWeek: rhythm?.perWeek ?? null,
      restDays: rhythm?.restDays ?? null,
      fixed: schedule.length ? schedule.map((d) => copy.week.days[d]).join(', ') : null,
      faith: faith ? 1 : 0,
      ...(study
        ? {
            skill: current?.name ?? null,
            method: current?.method ?? null,
            skills: own.length,
            sessions: practice?.sessions ?? 0,
            practiceDays: practice?.days ?? 0,
            since: practice?.since ?? null,
            hard: practice?.ease.hard ?? 0,
            right: practice?.ease.right ?? 0,
            easy: practice?.ease.easy ?? 0,
          }
        : {}),
    }
    for (const c of counts) {
      values[`cue_${c.cue}_n`] = c.n
      values[`cue_${c.cue}_started`] = c.started
    }
    const gapText = gap === null ? (study ? 'not practised yet' : 'not done yet') : gap === 0 ? (study ? 'practised today' : 'done today') : `last ${study ? 'practised' : 'done'} ${gap} days ago`
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
    const cadenceText = pt
      ? ''
      : schedule.length
        ? `; fixed days ${schedule.map((d) => copy.week.days[d]).join(', ')}${due?.state === 'due' ? ', today among them' : due?.next !== undefined ? `, next on ${copy.week.days[due.next]}` : ''}`
        : faith
          ? ''
          : rhythm
            ? `; rhythm ${rhythm.perWeek} a week${rhythm.restDays ? ` with ${plural(rhythm.restDays, 'rest day', 'rest days')} between` : ''}${due?.week !== undefined ? `, ${plural(due.week, 'practice day', 'practice days')} in the seven before today` : ''}${due?.state === 'resting' ? ', so today is a rest day' : due?.state === 'due' ? ', so it is due today' : due?.state === 'notDue' ? ', so this week’s are in' : ''}`
            : '; no rhythm set, so no count makes it due'
    const practiceText = practice && practice.sessions > 0 ? `${plural(practice.sessions, 'session', 'sessions')} on it on ${plural(practice.days, 'day', 'different days')}${practice.since ? ` since ${practice.since}` : ''}` : 'no session on it yet'
    const planText = plan ? `; planned today ${copy.aims.cues[plan.cue].toLowerCase()} at ${plan.time}${plan.offerId !== null ? ', started' : ', not started'}` : '; no plan today'
    const cueText = counts.length ? `; cues: ${counts.map((c) => `${copy.aims.cues[c.cue].toLowerCase()} started ${c.started} of ${c.n}`).join(', ')}` : ''
    const stepText = study
      ? current
        ? `the current skill is “${current.name}”${current.method ? ` with ${current.method}` : ''}${current.minutes ? `, ${current.minutes} min a session` : ''}; ${practiceText}`
        : 'no current skill named yet'
      : pt?.repDone
        ? `today’s People rep is done: “${moveById(pt.repDone.moveId).name}”`
        : pt && !pt.pick
          ? `no rep of its stage fits this ${block} by today’s shape`
          : `the step is “${step.title}”, ${step.minutes} min`
    // Part 41: a progression review waiting for your answer, once its gate is open; never a verdict, only that it waits.
    const review = study && current ? i.reviews?.get(id) : undefined
    if (review) Object.assign(values, { review: 'open', reviewDays: review.days, reviewReason: review.reason })
    const reviewText = review ? (review.reason === 'struggle' ? '; after three hard sessions in a row, a progression review waits for your answer' : `; after ${review.days} practice days on it, a progression review waits for your answer`) : ''
    facts.push(fact(`aim.${id}`, study ? ['study', 'cue', 'plan'] : ['plan', 'cue', aim.kind === 'person' || aim.kind === 'path' ? 'social' : 'faith'], `${name} (${study ? 'learning' : aim.kind}): ${stepText}; ${gapText}${doneToday ? '; a session is done today' : ''}${blocked ? `; last time ended in ${copy.aims.blockedWhy[blocked]}` : ''}${open ? '; started, not yet answered' : ''}${cadenceText}${planText}${cueText}${reviewText}.`, values))

    // A path (Part 24): the stage in words, the reps done by setting within the rule's weeks, and the reps that fit this block by tier 1 alone.
    if (pt) {
      const bySetting = doneBySetting(pt.path, pt.entries, today)
      const done = Object.values(bySetting).reduce<number>((a, b) => a + (b ?? 0), 0)
      const settingsText = (Object.entries(bySetting) as [SettingKind, number][]).map(([k, n]) => `${copy.catalogue.paths.settingNames[k].toLowerCase()} ${n}`).join(', ')
      const fitting = pt.repDone ? [] : pt.elig.eligible.map((m) => m.name)
      const stageName = pt.path.stages.find((s) => s.n === pt.state.stage)?.name ?? ''
      facts.push(
        fact(
          `path.${id}`,
          ['social', 'people'],
          `${pathName(pt.path)}: ${stageWords(pt.path, pt.state.stage)}${pt.state.reentry ? ', with reps from the stage below after a quiet stretch' : ''}; reps done in the last ${pt.path.rule.withinWeeks} weeks by setting: ${settingsText || 'none yet'}; ${pt.repDone ? 'today’s one People rep is done, so none is offered again today' : `fitting this ${block}: ${fitting.length ? fitting.join(', ') : pt.elig.nobodyAround ? 'none, nobody around by today’s shape' : 'none'}`}.`,
          { path: pt.path.id, stage: pt.state.stage, stages: pt.path.stages.length, stageName, reentry: pt.state.reentry ? 1 : 0, done, ...Object.fromEntries(Object.entries(bySetting)), eligible: pt.repDone ? '' : pt.elig.eligible.map((m) => m.id).join(','), nobodyAround: pt.elig.nobodyAround ? 1 : 0, repDone: pt.repDone ? 1 : 0 },
          { n: done },
        ),
      )
    }

    // The trajectory: steps started and marked done per week over four weeks. A commitment fading shows here before anywhere else.
    const sittings = records.offers.filter((o) => (o.kind === 'step' || o.kind === 'study') && o.skippedAt === null && (keys.includes(o.situationKey) || studyOfferBelongs(o, aim, i.skills, studyAims)))
    const started = weekBuckets(sittings.map((o) => o.day), today)
    const finished = weekBuckets(sittings.filter((o) => doneIds.has(o.id as number)).map((o) => o.day), today)
    const born = new Date(aim.createdAt)
    const ageDays = Number.isNaN(born.getTime()) ? 0 : Math.max(0, daysBetween(dayKey(born), today))
    facts.push(
      fact(
        `trajectory.${id}`,
        study ? ['study', 'habit', 'lapse'] : ['habit', 'lapse'],
        `${name}: steps started per week over the last four weeks, oldest first: ${started.join(', ')}; marked done: ${finished.join(', ')}; the commitment is ${ageDays} days old.`,
        { name, aimId: id, w3: started[0], w2: started[1], w1: started[2], w0: started[3], d3: finished[0], d2: finished[1], d1: finished[2], d0: finished[3], ageDays },
        { n: started.reduce((a, b) => a + b, 0) },
      ),
    )
    perAim.set(id, { name, sittings, skills: own })
  }

  // Part 27: the Partner path's one fact, and only on a declared date day while the path is on.
  const partnerOn = i.aims.some((a) => a.kind === 'path' && a.path === 'partner' && !a.pausedAt && a.archivedAt === null)
  if (partnerOn && (i.pathMarks ?? []).some((m) => m.path === 'partner' && m.kind === 'date' && m.day === today)) {
    facts.push(fact('partner.dateDay', ['dating'], 'Today is a declared date day.', { dateDay: 1 }))
  }

  // The counts the sheet carries leave the Partner path's own steps out (Part 27).
  const sheetOffers = i.offers.filter(onTheSheet)
  const ft = followThrough(sheetOffers, i.outcomes, i.wins)
  facts.push(fact('follow', ['monitoring'], `Follow-through: moves ${ft.moves.started} started ${ft.moves.finished} finished; steps ${ft.steps.started} started ${ft.steps.finished} finished; minimum wins ${ft.wins.started} written ${ft.wins.finished} done.`, { movesStarted: ft.moves.started, movesFinished: ft.moves.finished, stepsStarted: ft.steps.started, stepsFinished: ft.steps.finished, winsStarted: ft.wins.started, winsFinished: ft.wins.finished }))
  const bc = becoming(sheetOffers, i.outcomes)
  facts.push(fact('becoming', ['monitoring'], `Under the direction: ${bc.study.n} study sessions, ${bc.conversations.n} conversations started, ${bc.faith.n} faith practices, ${bc.timeWithHer.n} times with her.`, { study: bc.study.n, conversations: bc.conversations.n, faith: bc.faith.n, her: bc.timeWithHer.n }))

  // Part 35: the last session, as the other app kept it, told as it was.
  const lastSession = lastWorkout(i.outside)
  const slot = lastSession ? sessionSlot(lastSession) : null
  if (lastSession && slot) {
    const last = lastSession
    const weekday = formatDayLong(slot.day).split(',')[0]
    const parts = [`The last workout: ${weekday} ${slot.block} (${slot.day})`, last.title ?? null, last.minutes ? `${last.minutes} min` : null, last.workingSets !== undefined ? `${last.workingSets} working sets` : null, last.endedEarly ? 'ended early' : null, last.effort ? `rated ${EFFORT_WORDS[last.effort]}` : null, last.energyAfter !== undefined ? `energy afterwards ${last.energyAfter} of 5` : null, last.avgRir !== undefined ? `about ${last.avgRir} reps in reserve` : null, last.imported ? 'brought in by import' : null]
    facts.push(fact('workout.last', ['workout', slot.block], parts.filter(Boolean).join(', ') + '.', { day: slot.day, block: slot.block, title: last.title ?? null, minutes: last.minutes, workingSets: last.workingSets ?? null, endedEarly: last.endedEarly ? 1 : 0, effort: last.effort ?? null, energyAfter: last.energyAfter ?? null, avgRir: last.avgRir ?? null, hard: isHard(last) ? 1 : 0 }))
  }
  // Two workouts on one day are one workout day; each session is still its own.
  // Part 20's tier 2: where in-person reps were done, as counts. An observation for the line; never a reason to offer one.
  const carried = carriedByContext(sheetOffers, i.outcomes, i.contexts, today)
  if (carried.size) {
    const parts = [...carried.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => {
      const [kind, block] = key.split('|') as [DayKind, Block]
      return `${contextWords(kind, block)} ${n}`
    })
    facts.push(fact('people.seen', ['people', 'social'], `In the last eight weeks, in-person reps marked done have been carried by: ${parts.join('; ')}. A count of the past, not who is around today.`, Object.fromEntries(carried), { n: [...carried.values()].reduce((a, b) => a + b, 0) }))
  }
  const workouts = [...new Set(i.outside.filter((o) => o.day >= since && o.day <= today).map((o) => o.day))].sort()
  const sessions7 = i.outside.filter((o) => o.day >= since && o.day <= today).length
  facts.push(fact('outside.7d', ['workout'], `Workout days in the last seven: ${workouts.length}${workouts.length ? ` (${workouts.join(', ')})` : ''}${sessions7 > workouts.length ? `; ${sessions7} sessions` : ''}.`, { days: workouts.length, sessions: sessions7 }, { n: workouts.length }))

  const lastEvenings = [1, 2, 3].map((d) => i.checkins.find((c) => c.day === addDays(today, -d) && c.block === 'evening'))
  const misses = lastEvenings.reduce((n, c) => n + Object.values(c?.extras?.necessities ?? {}).filter(Boolean).length, 0)
  facts.push(fact('necessities.3d', ['necessities'], `Necessities marked missed over the last three evenings: ${misses}.`, { misses }, { n: 3 }))

  const morning = i.checkins.find((c) => c.day === today && c.block === 'morning')
  facts.push(...caffeineFacts(i.checkins, i.evidence.caffeine, today))
  const slept = morning?.answers.sleepHours
  if (slept !== undefined && slept <= SHORT_SLEEP) {
    const word = headword(anchorFor('sleepHours', slept))
    facts.push(fact('today.shortSleep', ['sleep', 'morning', 'mood'], `Sleep hours read “${word}” this morning.`, { position: slept, word }))
  }

  // The cadence of the record itself: check-ins completed per week. Logging less is the earliest sign of letting the whole thing go.
  if (days >= 14) {
    const w = weekBuckets(i.checkins.filter((c) => c.completedAt !== null).map((c) => c.day), today)
    facts.push(fact('cadence', ['monitoring', 'habit'], `Check-ins completed per week over the last four weeks, oldest first: ${w.join(', ')}; the check-in depth is ${i.depth}${i.lowDemand ? ', with low-demand mode on' : ''}.`, { w3: w[0], w2: w[1], w1: w[2], w0: w[3], depth: i.depth, lowDemand: i.lowDemand ? 1 : 0 }, { n: w.reduce((a, b) => a + b, 0) }))
  }

  // Your own words: the optional line typed at a check-in, the last few, as you wrote them. Only a model can read these; the phone's engine cannot.
  const noteSince = addDays(today, -(NOTE_DAYS - 1))
  const noted = i.checkins
    .filter((c) => typeof c.extras?.note === 'string' && c.extras.note.trim() && c.day >= noteSince && c.day <= today)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : blockIndex(b.block) - blockIndex(a.block)))
    .slice(0, NOTES_KEPT)
  for (const c of noted) {
    const note = (c.extras?.note ?? '').trim()
    facts.push(fact(`note.${c.day}.${c.block}`, ['writing', 'mood'], `On ${c.day}, at the ${c.block} check-in, you wrote: “${note}”.`, { day: c.day, block: c.block, note }))
  }

  if (i.direction) facts.push(fact('direction', ['monitoring'], `Your direction, in your words: “${i.direction}”.`, { direction: i.direction }))

  const said: SaidEntry[] = []
  const fb = (key: string) => i.feedback.find((f) => f.briefKey === key)?.answer ?? null
  for (const l of i.log) if (l.situationId !== null && wasShown(l, i.brainBriefs)) said.push({ day: l.day, source: 'phone', situationId: l.situationId, text: l.text, feedback: fb(`phone:${l.day}:${l.id}`) })
  for (const w of i.brainBriefs) said.push({ day: w.day, source: 'worker', situationId: null, text: w.text, feedback: fb(`worker:${w.id}`) })
  said.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))

  /** What the record shows for a commitment since a moment: plans made and missed, steps started and done, and a new current skill. */
  const sinceOn = (aimId: number, at: string) => {
    const about = perAim.get(aimId)
    if (!about) return null
    const plans = i.intentions.filter((p) => p.aimId === aimId && p.setAt > at)
    const since = about.sittings.filter((o) => o.at > at)
    const sinceIds = new Set(since.map((o) => o.id as number))
    return {
      name: about.name,
      planned: plans.length,
      // A plan whose day has passed with no step linked to it: its moment came and went.
      missed: plans.filter((p) => p.day < today && p.offerId === null).length,
      started: since.length,
      done: i.outcomes.filter((x) => x.outcome === 'done' && sinceIds.has(x.offerId)).length,
      // A new current skill since: the one thing that now changes a learning commitment's step (Workstream 6).
      changed: about.skills.filter((sk) => typeof sk.startedAt === 'string' && sk.startedAt > at).length,
    }
  }

  // Closing the loop: the last line said before today, and what the record shows since it was said.
  const lines = [
    ...i.log.filter((l) => l.situationId !== null && wasShown(l, i.brainBriefs)).map((l) => ({ day: l.day, at: l.at, text: l.text, factIds: l.factIds, key: `phone:${l.day}:${l.id}`, worker: false })),
    ...i.brainBriefs.filter((w) => w.kind === 'brief').map((w) => ({ day: w.day, at: w.at, text: w.text, factIds: w.factIds, key: `worker:${w.id}`, worker: true })),
  ]
    .filter((l) => l.day < today)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : Number(b.worker) - Number(a.worker)))
  const last = lines[0]
  if (last) {
    const received = fb(last.key) ?? 'untapped'
    const ref = last.factIds.map((f) => /^aim\.(\d+)$/.exec(f)).find(Boolean)
    const s = ref ? sinceOn(Number(ref[1]), last.at) : null
    if (ref && s) {
      const aimId = Number(ref[1])
      facts.push(
        fact('followup', ['monitoring', 'plan'], `The last line, on ${last.day}, was about ${s.name}. Since then the record shows ${s.planned} plans made, ${s.missed} of them past their day with no step started, ${s.started} steps started, ${s.done} marked done, and the current skill changed ${s.changed} times. It was received as: ${received}.`, { day: last.day, about: s.name, aimId, planned: s.planned, missed: s.missed, started: s.started, done: s.done, changed: s.changed, received, text: last.text }),
      )
    } else {
      facts.push(fact('followup', ['monitoring'], `The last line, on ${last.day}, was: ${quoted(last.text)} It was received as: ${received}.`, { day: last.day, about: null, aimId: null, planned: 0, missed: 0, started: 0, done: 0, changed: 0, received, text: last.text }))
    }
  }

  // Part 36: the Sunday review closes its own loop: the last review's one change, and what the record shows since it was written.
  const review = i.brainBriefs.filter((b) => b.kind === 'review' && b.parts && b.day < today).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.at < b.at ? 1 : -1))[0]
  if (review?.parts) {
    const ref = review.factIds.map((f) => /^aim\.(\d+)$/.exec(f)).find(Boolean)
    const s = ref ? sinceOn(Number(ref[1]), review.at) : null
    const checkins = i.checkins.filter((c) => c.completedAt && c.completedAt > review.at).length
    const moves = i.outcomes.filter((x) => x.outcome === 'done' && x.at > review.at).length
    const since = s
      ? `Since then the record shows, for ${s.name}, ${s.planned} plans made, ${s.missed} of them past their day with no step started, ${s.started} steps started, ${s.done} marked done, and the current skill changed ${s.changed} times.`
      : `Since then ${checkins} check-ins were completed and ${moves} moves marked done.`
    facts.push(fact('review.change', ['monitoring'], `The last review, on ${review.day}, proposed one change: ${quoted(review.parts.change)} ${since}`, { day: review.day, change: review.parts.change, aimId: s && ref ? Number(ref[1]) : null, checkins, moves, planned: s?.planned ?? null, started: s?.started ?? null, done: s?.done ?? null, changed: s?.changed ?? null }))
  }

  // Part 43: where today and yesterday were spent, as kinds of place; context, never a cause, and Claude's to read only through its gate.
  for (const [id, d, head] of [
    ['location.today', today, 'Where today has been so far, as Life Mirror saw it while open'],
    ['location.yesterday', addDays(today, -1), 'Where yesterday was, as Life Mirror saw it while open'],
  ] as const) {
    const w = whereWords(i.contexts.find((c) => c.day === d)?.where)
    if (w) facts.push(fact(id, [], `${head}: ${w.text}.`, { day: d, ...w.values }))
  }

  // Follow-up F1: how Life Mirror is used, as counts over windows ending yesterday; observations, never reasons.
  if (i.use) facts.push(...usageFacts({ rows: i.use.rows, briefs: i.brainBriefs, log: i.log, picks: i.use.coachPicks, offers: i.offers, outcomes: i.outcomes, intentions: i.intentions, aims: i.use.allAims }, today))

  // When today's check-ins were completed (Part 28): the Worker writes once the morning's is on a sheet built after it.
  const checkedIn: NonNullable<FactSheet['checkedIn']> = {}
  for (const c of i.checkins) if (c.day === today && c.completedAt) checkedIn[c.block] = c.completedAt
  return { version: 1, day: today, builtAt: i.now.toISOString(), hour, weeks, days, direction: i.direction, facts, said: said.slice(0, 14), showPrivate: i.showPrivate === true, checkedIn }
}

export function factById(sheet: FactSheet, id: string): Fact | undefined {
  return sheet.facts.find((f) => f.id === id)
}

export function factsWhere(sheet: FactSheet, prefix: string): Fact[] {
  return sheet.facts.filter((f) => f.id.startsWith(prefix))
}

export function num(f: Fact | undefined, key: string): number | null {
  const v = f?.values[key]
  return typeof v === 'number' ? v : null
}

export function str(f: Fact | undefined, key: string): string | null {
  const v = f?.values[key]
  return typeof v === 'string' ? v : null
}

/** The sheet as lines for a prompt: one fact per line, id first, so a model can cite by id. */
export function sheetToLines(sheet: FactSheet): string {
  const head = [`day ${sheet.day}; ${sheet.days} days of record; hour ${sheet.hour}`, sheet.direction ? `direction: ${sheet.direction}` : null].filter(Boolean)
  const lines = sheet.facts.map((f) => `[${f.id}] ${f.text}${f.n !== undefined ? ` (n=${f.n})` : ''}`)
  const said = sheet.said.map((s) => `${s.day} (${s.source}${s.feedback ? `, ${s.feedback}` : ''}): ${s.text}`)
  return [...head, ...lines, said.length ? 'Said recently:' : null, ...said].filter(Boolean).join('\n')
}

export { fill }
