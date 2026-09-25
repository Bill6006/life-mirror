import { addDays, daysBetween } from './blocks'
import { hasMove, moveById } from './catalogue'
import type { Aim, BrainBrief, BriefLog, CoachPick, Intention, Offer, Outcome, UseKind, UseRow } from './db'
import type { Fact } from './factTypes'
import { isFaithPractice } from './rhythm'
import { USE_FAMILIES, USE_SECTIONS, useScreenName } from './useShared'

// How Life Mirror is used, counted (Follow-up F1, 2026-09-24): the one counting rule the Data and
// privacy summary and the usage facts share, and the facts themselves. Pure, so the sheet builder and
// the tests use it without the phone's store. A fact says what was observed and never why.

/** The windows the usage facts count over, each ending yesterday so a day's facts hold still. */
export const USAGE_DAYS = { short: 7, long: 28, never: 56 } as const

/** Everything the two readings are counted from, read together in one go. */
export interface UseInput {
  rows: readonly UseRow[]
  briefs: readonly BrainBrief[]
  log: readonly BriefLog[]
  picks: readonly CoachPick[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  intentions: readonly Intention[]
  aims: readonly Aim[]
}

export interface UseSummary {
  from: string
  to: string
  /** Each screen and how often it was opened, most first. */
  screens: { what: string; n: number }[]
  checkins: { opened: number; left: number }
  /** Days whose line offered one tap, the days that tap was taken, and how often Why was opened. */
  line: { withAction: number; taken: number; why: number }
  /** Days the coach picked a rep, and the days its pick was not taken. */
  coach: { picked: number; notTaken: number }
  notifications: number
  /** The People row's Change: opened, and a rep picked there. */
  change: { opened: number; picked: number }
  /** Life Mirror opened, and on how many days. */
  opened: { times: number; days: number }
}

/**
 * The one counting rule both readings use, over a window of days: screens, check-ins, the line's
 * tap against the days it offered one, the coach's picks against the reps started, notifications,
 * Change and the app's own opening. A coach's pick is taken when a rep it chose was started that
 * day; the day still running (`today`) is left out of the coach's count.
 */
export function summarizeUse(i: UseInput, from: string, to: string, today: string = to): UseSummary {
  const inWindow = (d: string) => d >= from && d <= to
  const rows = i.rows.filter((r) => inWindow(r.day))
  const of = (kind: UseKind) => rows.filter((r) => r.kind === kind)
  const screens = new Map<string, number>()
  for (const r of of('screen')) if (r.what) screens.set(r.what, (screens.get(r.what) ?? 0) + 1)
  // A day's line offered one tap when the line on screen that day carried one: the brain's own, else the phone's once shown.
  const withAction = new Set<string>()
  for (const b of i.briefs) if (b.kind === 'brief' && b.action && inWindow(b.day)) withAction.add(b.day)
  for (const l of i.log) if (l.action && l.shownAt && inWindow(l.day)) withAction.add(l.day)
  const takenDays = new Set(of('lineAction').map((r) => r.day))
  const picked = i.picks.filter((p) => inWindow(p.day) && p.day < today)
  const coachDays = new Set(i.offers.filter((o) => o.chosenBy === 'coach').map((o) => o.day))
  const opens = of('appOpened')
  return {
    from,
    to,
    screens: [...screens].map(([what, n]) => ({ what, n })).sort((a, b) => b.n - a.n || (a.what < b.what ? -1 : 1)),
    checkins: { opened: of('checkinOpened').length, left: of('checkinLeft').length },
    line: { withAction: withAction.size, taken: [...takenDays].filter((d) => withAction.has(d)).length, why: of('lineWhy').length },
    coach: { picked: picked.length, notTaken: picked.filter((p) => !coachDays.has(p.day)).length },
    notifications: of('notification').length,
    change: { opened: screens.get('pathChange') ?? 0, picked: of('changePicked').length },
    opened: { times: opens.length, days: new Set(opens.map((r) => r.day)).size },
  }
}

/** A window of whole days ending yesterday, cut to when counting began; null when nothing of it is counted yet. */
export interface UseWindow {
  from: string
  to: string
  days: number
  /** Counting began inside the window: it covers only the days counted so far. */
  clipped: boolean
}

function windowOf(today: string, days: number, began: string | null): UseWindow | null {
  if (began === null) return null
  const to = addDays(today, -1)
  const nominal = addDays(today, -days)
  const from = began > nominal ? began : nominal
  if (from > to) return null
  return { from, to, days: daysBetween(from, to) + 1, clipped: from !== nominal }
}

/** How a fact names its window: "the 7 days to yesterday", or "the 3 days counted so far, to yesterday". */
export function windowWords(w: UseWindow): string {
  const days = `${w.days} ${w.days === 1 ? 'day' : 'days'}`
  return w.clipped ? `the ${days} counted so far, to yesterday` : `the ${days} to yesterday`
}

function openedWords(n: number): string {
  return n === 0 ? 'not opened' : n === 1 ? 'opened once' : `opened ${n} times`
}

function timesWords(n: number): string {
  return n === 1 ? 'once' : `${n} times`
}

const usageFact = (id: string, text: string, values: Record<string, number | string | null>): Fact => ({ id, tags: [], text, values })

/**
 * The usage facts for the day's sheet: derived counts over windows ending yesterday, each saying
 * what was observed and never why. No timestamp, no content, no screen or kind of move another
 * switch governs (the Partner path, her record, private items, faith). A window reaches back only
 * to when counting began, and says so. Record-based counts (the coach's picks, plans, skips) reach
 * back to their own first day. No tags: the facts retrieve no claim card and weigh on no line.
 */
export function usageFacts(i: UseInput, today: string): Fact[] {
  const facts: Fact[] = []
  const firstDay = (days: readonly string[]) => days.reduce<string | null>((m, d) => (m === null || d < m ? d : m), null)
  const logBegan = firstDay(i.rows.map((r) => r.day))
  const opensBegan = firstDay(i.rows.filter((r) => r.kind === 'appOpened').map((r) => r.day))
  const count = (w: UseWindow) => summarizeUse(i, w.from, w.to, today)

  // Life Mirror itself: counted from F1, when opening the app began to be recorded.
  const o7 = windowOf(today, USAGE_DAYS.short, opensBegan)
  if (o7) {
    const s = count(o7).opened
    const o28 = windowOf(today, USAGE_DAYS.long, opensBegan)
    const l = o28 && o28.days > o7.days ? { w: o28, s: count(o28).opened } : null
    facts.push(
      usageFact(
        'usage.opened',
        `Life Mirror itself: opened on ${s.days} of ${windowWords(o7)}, ${timesWords(s.times)} in all${l ? `; on ${l.s.days} of ${windowWords(l.w)}, ${timesWords(l.s.times)}` : ''}.`,
        { days: o7.days, openDays: s.days, opens: s.times, ...(l ? { longDays: l.w.days, longOpenDays: l.s.days, longOpens: l.s.times } : {}) },
      ),
    )
  }

  const w7 = windowOf(today, USAGE_DAYS.short, logBegan)
  const w28 = windowOf(today, USAGE_DAYS.long, logBegan)
  const w56 = windowOf(today, USAGE_DAYS.never, logBegan)

  if (w28 && w56) {
    const s28 = count(w28)
    const s56 = count(w56)
    const named = new Map<string, number>()
    for (const s of s28.screens) {
      const name = useScreenName(s.what)
      if (name) named.set(name, (named.get(name) ?? 0) + s.n)
    }
    const often = [...named].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5)
    const shown = new Set(often.map(([n]) => n))
    const sectionCount = (u: UseSummary, id: string) => u.screens.find((s) => s.what === id)?.n ?? 0
    const rarely = USE_SECTIONS.map((id) => [useScreenName(id) as string, sectionCount(s28, id)] as const).filter(([name, n]) => n >= 1 && n <= 2 && !shown.has(name))
    const never = USE_SECTIONS.filter((id) => sectionCount(s56, id) === 0).map((id) => useScreenName(id) as string)
    const list = (xs: readonly (readonly [string, number])[]) => xs.map(([name, n]) => `${name} ${n}`).join(', ')
    const parts = [often.length ? `opened most, ${list(often)}` : 'no screen opened', rarely.length ? `opened once or twice, ${list(rarely)}` : null, never.length ? `not opened in ${w56.days === w28.days ? 'that time' : windowWords(w56)}, ${never.join(', ')}` : null].filter(Boolean)
    facts.push(usageFact('usage.screens', `Screens in ${windowWords(w28)}: ${parts.join('; ')}.`, { days: w28.days, often: list(often), rarely: list(rarely), never: never.join(', '), neverDays: w56.days }))
  }

  if (w7) {
    const s = count(w7)
    const line = s.line.withAction ? `offered on ${s.line.withAction} of ${windowWords(w7)}, taken on ${s.line.taken} of them` : `not offered in ${windowWords(w7)}`
    facts.push(usageFact('usage.line', `The line’s one tap: ${line}. Why under the line: ${openedWords(s.line.why)}.`, { days: w7.days, offered: s.line.withAction, taken: s.line.taken, why: s.line.why }))
    const left = s.checkins.left
    facts.push(usageFact('usage.checkins', `Check-ins in ${windowWords(w7)}: ${openedWords(s.checkins.opened)}${s.checkins.opened ? `, ${left} of them left before the end` : ''}.`, { days: w7.days, opened: s.checkins.opened, left }))
    facts.push(usageFact('usage.notifications', `Notifications in ${windowWords(w7)}: ${openedWords(s.notifications)}.`, { days: w7.days, opened: s.notifications }))
  }

  const pathOn = i.aims.some((a) => a.kind === 'path' && a.archivedAt === null)
  if (w28) {
    const s = count(w28)
    if (pathOn || s.change.opened) {
      const without = Math.max(0, s.change.opened - s.change.picked)
      facts.push(
        usageFact(
          'usage.change',
          `Change on the People row in ${windowWords(w28)}: ${openedWords(s.change.opened)}${s.change.opened ? `, ${s.change.picked === 0 ? 'no rep chosen there' : `a rep chosen there ${timesWords(s.change.picked)}`}; ${without} ${without === 1 ? 'opening' : 'openings'} ended without one` : ''}.`,
          { days: w28.days, opened: s.change.opened, chosen: s.change.picked, without },
        ),
      )
    }
    const addOpened = s.screens.find((x) => x.what === 'addAim')?.n ?? 0
    if (addOpened) {
      const added = i.aims.filter((a) => a.createdAt.slice(0, 10) >= w28.from && a.createdAt.slice(0, 10) <= w28.to).length
      facts.push(usageFact('usage.setup', `Add a commitment in ${windowWords(w28)}: ${openedWords(addOpened)}, ${added} ${added === 1 ? 'commitment' : 'commitments'} added.`, { days: w28.days, opened: addOpened, added }))
    }
  }

  // The record's own counts reach back to their own first day, not the log's.
  const picksBegan = firstDay(i.picks.map((p) => p.day))
  const c28 = windowOf(today, USAGE_DAYS.long, picksBegan)
  if (c28) {
    const s = count(c28).coach
    if (s.picked) facts.push(usageFact('usage.coach', `The coach’s pick in ${windowWords(c28)}: made on ${s.picked} ${s.picked === 1 ? 'day' : 'days'}, not taken on ${s.notTaken} of them.`, { days: c28.days, picked: s.picked, notTaken: s.notTaken }))
  }

  // Plans for your own commitments: a path's rep and a faith practice are their switches' to read.
  const own = new Map(i.aims.filter((a) => a.kind !== 'path' && !isFaithPractice(a)).map((a) => [a.id as number, a]))
  const plans = i.intentions.filter((p) => own.has(p.aimId))
  const p28 = windowOf(today, USAGE_DAYS.long, firstDay(plans.map((p) => p.day)))
  if (p28) {
    const inW = plans.filter((p) => p.day >= p28.from && p.day <= p28.to)
    const outcomeOf = new Map(i.outcomes.map((x) => [x.offerId, x.outcome]))
    const started = inW.filter((p) => p.offerId !== null)
    const done = started.filter((p) => outcomeOf.get(p.offerId as number) === 'done').length
    if (inW.length) facts.push(usageFact('usage.plans', `Plans in ${windowWords(p28)}: ${inW.length} made, ${started.length} of them started, ${done} done.`, { days: p28.days, planned: inW.length, started: started.length, done }))
  }

  // Suggestions skipped again and again: three skips or more, and at least half of those offered.
  // Her moves are her record's to read, whatever family they sit in.
  const drawn = i.offers.filter((o) => (o.kind === 'block' || o.kind === 'pickup') && hasMove(o.moveId) && USE_FAMILIES[moveById(o.moveId).family] && moveById(o.moveId).with !== 'her')
  const s28 = windowOf(today, USAGE_DAYS.long, firstDay(drawn.map((o) => o.day)))
  if (s28) {
    const per = new Map<string, { offered: number; skipped: number }>()
    for (const o of drawn) {
      if (o.day < s28.from || o.day > s28.to) continue
      const family = moveById(o.moveId).family
      const t = per.get(family) ?? { offered: 0, skipped: 0 }
      t.offered++
      if (o.skippedAt) t.skipped++
      per.set(family, t)
    }
    const again = [...per].filter(([, t]) => t.skipped >= 3 && t.skipped * 2 >= t.offered).sort((a, b) => b[1].skipped - a[1].skipped || (a[0] < b[0] ? -1 : 1))
    if (again.length) {
      const list = again.map(([f, t]) => `${USE_FAMILIES[f]} moves, ${t.skipped} of the ${t.offered} offered`).join('; ')
      facts.push(usageFact('usage.skips', `Suggestions skipped again and again in ${windowWords(s28)}: ${list}.`, { days: s28.days, list }))
    }
  }
  return facts
}
