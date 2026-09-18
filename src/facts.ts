import { addDays, BLOCKS, blockIndex, daysBetween, type Block } from './blocks'
import { associationFor, associationTier, privateAssociations, type Association } from './associations'
import { becoming, blockedBy, cueCounts, followThrough, keysOf, lastDoneDay, lastMovedDay, planFor, stepFor, studyOfferBelongs } from './aims'
import { hasMove, moveById } from './catalogue'
import { copy } from './copy'
import type { Aim, BrainBrief, BriefFeedback, BriefLog, CheckIn, DayContext, Intention, Offer, Outcome, OutsideDay, PrivateItem, RungMark, Skill, StudyNight, Win } from './db'
import { fill, formatDayLong } from './format'
import type { Brief } from './forecastFlow'
import { currentRung, ladderOf, rungName, skillsOf, TOP_RUNG } from './ladder'
import type { Evidence } from './learningFlow'
import { NOTHING } from './offers'
import { anchorFor, headword, readingById, type ReadingId } from './readings'
import { bandOf, CONTEXT_IDS, INGREDIENT_IDS, readingOf } from './score'
import { keptCount } from './studyNight'

// The fact sheet: everything the app knows about the day, as facts with ids and values, built by
// the same deterministic code that draws every screen. The brain, on the phone or in the Worker,
// may only speak from these; a number not on the sheet is refused. Each fact says how much
// stands behind it (a count, a tier) and that never merges with any card's grade.

import type { Fact, FactSheet, SaidEntry } from './factTypes'
export type { Fact, FactSheet, SaidEntry } from './factTypes'

export interface FactInput {
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
}

/** A like-for-like difference worth calling promising for a chip: ten points on the reading out of 100. */
export const CHIP_WORTHWHILE = 10
const TREND_WINDOW = 6

function fact(id: string, tags: string[], text: string, values: Record<string, number | string | null> = {}, extra: { n?: number; tier?: string } = {}): Fact {
  return { id, tags, text, values, ...extra }
}

function nameOfMove(id: string, label?: string): string {
  if (id === NOTHING) return copy.move.nothing
  return hasMove(id) ? moveById(id).name : (label ?? id)
}

function round(v: number | null): number | null {
  return v === null ? null : Math.round(v)
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v)
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
    const parts = [`Today is ${weekday}`, ctx.pickupTime ? `a daycare day with pickup at ${ctx.pickupTime}` : 'not a daycare day', ctx.atOffice ? 'at the office' : 'at home', ctx.churchDay ? 'a church day' : null, ctx.studyNight ? 'a study night' : 'not a study night', `her bedtime ${ctx.soloUntil}`, `the hour is ${hour}`]
    facts.push(
      fact('week.today', ['cue', 'evening'], parts.filter(Boolean).join('; ') + '.', {
        weekday,
        daycare: ctx.pickupTime ? 1 : 0,
        pickup: ctx.pickupTime,
        office: ctx.atOffice ? 1 : 0,
        church: ctx.churchDay ? 1 : 0,
        studyNight: ctx.studyNight ? 1 : 0,
        bedtime: ctx.soloUntil,
        hour,
      }),
    )
  }
  const yctx = i.contexts.find((c) => c.day === yesterday)
  if (yctx) facts.push(fact('week.yesterday', ['recovery'], `Yesterday was ${yctx.churchDay ? 'a church day' : 'not a church day'}, ${yctx.studyNight ? 'a study night' : 'not a study night'}, ${yctx.withHer ? 'with her' : 'without her'}.`, { church: yctx.churchDay ? 1 : 0, studyNight: yctx.studyNight ? 1 : 0, withHer: yctx.withHer ? 1 : 0 }))

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
      facts.push(fact(`context.${id}`, [id === 'loneliness' ? 'loneliness' : id === 'sleepHours' || id === 'sleepQuality' ? 'sleep' : id === 'hunger' ? 'hunger' : 'social'], `${reading.name} read “${word}” (${p} of 5) at the ${latest.block} check-in on ${latest.day}.`, { position: p, word, day: latest.day, block: latest.block }))
    }
    const ps = positionsOf(i.checkins, id)
    if (ps.length >= TREND_WINDOW * 2) {
      const recent = mean(ps.slice(-TREND_WINDOW))
      const prior = mean(ps.slice(-TREND_WINDOW * 2, -TREND_WINDOW))
      facts.push(fact(`trend.${id}`, [id === 'loneliness' ? 'loneliness' : 'mood'], `${reading.name}: the last ${TREND_WINDOW} answers average ${recent} of 5 against ${prior} for the ${TREND_WINDOW} before.`, { recent, prior, window: TREND_WINDOW }, { n: TREND_WINDOW }))
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
  if (i.brief.whatIf !== null) facts.push(fact('whatIf', ['forecast', 'evening'], `Tonight's what-if: the evening forecast with the day's move done reads ${Math.round(i.brief.whatIf)}.`, { value: Math.round(i.brief.whatIf) }))

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
  chip('assoc.heavyCaffeine', ['caffeine', 'afternoon'], 'a heavy-caffeine morning', i.evidence.heavyCaffeine, 'Afternoons after')
  chip('assoc.workouts', ['workout', 'evening'], 'a workout day', i.evidence.workouts, 'Evenings of')
  chip('assoc.napped', ['nap', 'sleep'], 'a nap', associationFor(i.checkins, today, (c) => Boolean(c.extras?.napped)), 'Mornings after')
  for (const p of privateAssociations(true, i.items, i.checkins, today)) {
    const f = assocFact(`private.${p.itemId}`, ['evening', 'sleep'], p.name, p.association, 'Mornings after')
    if (f) facts.push({ ...f, values: { ...f.values, name: p.name, alternative: nameOfMove(p.alternativeId) } })
  }

  // Cards: what is being tested, and where each stands.
  for (const c of i.evidence.cards) {
    const move = nameOfMove(c.card.moveId)
    const alt = nameOfMove(c.card.alternativeId)
    const n = c.stats.n.done + c.stats.n.alternative
    facts.push(fact(`test.${c.card.id}`, ['monitoring'], `Card: ${move} against ${alt} on ${readingById(c.card.target).name} in ${c.card.situationKey}: ${c.stats.tier}, ${n} observations.`, { move, alternative: alt, target: readingById(c.card.target).name, tier: c.stats.tier, n, situation: c.card.situationKey }, { n, tier: c.stats.tier }))
  }

  // Commitments: the step, the last fact, what blocked it, today's plan, the cues' record, the ladder's shape.
  const studyAims = i.aims.filter((a) => a.kind === 'certification')
  const openOffers = i.offers.filter((o) => (o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study') && o.closedAt === null && o.skippedAt === null)
  const records = { offers: i.offers.filter((o) => o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study'), outcomes: i.outcomes, nights: i.nights }
  for (const aim of i.aims) {
    const id = aim.id as number
    const study = aim.kind === 'certification'
    const name = aim.name ?? copy.aims.kinds[aim.kind]
    const step = stepFor(aim, i.skills, i.marks, studyAims)
    const own = study ? skillsOf(aim, i.skills, studyAims) : []
    const lastDay = study ? (own.length ? lastMovedDay(aim, i.skills, i.marks, studyAims) : null) : lastDoneDay(aim, records.offers, records.outcomes, studyAims)
    const gap = lastDay ? daysBetween(lastDay, today) : null
    const blocked = blockedBy(aim, records.offers, records.outcomes, records.nights, i.skills, studyAims)
    const plan = planFor(i.intentions, id, today)
    const keys = keysOf(aim, studyAims)
    const open = openOffers.some((o) => keys.includes(o.situationKey) || studyOfferBelongs(o, aim, i.skills, studyAims))
    const counts = cueCounts(i.intentions, id)
    const rungs = Array.from({ length: TOP_RUNG + 1 }, () => 0)
    for (const s of own) rungs[currentRung(i.marks, s.id as number)]++
    const kind = own[0] ? ladderOf(own[0]) : (aim.ladder ?? 'technical')
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
      skills: own.length,
      lowRungs: rungs[0] + rungs[1] + rungs[2],
      highRungs: rungs[3] + rungs[4] + rungs[5] + rungs[6],
      top: rungs[TOP_RUNG],
    }
    for (const c of counts) {
      values[`cue_${c.cue}_n`] = c.n
      values[`cue_${c.cue}_started`] = c.started
    }
    const gapText = gap === null ? (study ? (own.length ? 'the ladder has not moved yet' : 'no skill on its ladder yet') : 'not done yet') : gap === 0 ? (study ? 'moved today' : 'done today') : `last ${study ? 'moved' : 'done'} ${gap} days ago`
    const ladderText = study && own.length ? `; ${own.length} skills: ${rungs.map((n, r) => (n ? `${n} at ${rungName(r, kind)}` : null)).filter(Boolean).join(', ')}` : ''
    const planText = plan ? `; planned today ${copy.aims.cues[plan.cue].toLowerCase()} at ${plan.time}${plan.offerId !== null ? ', started' : ', not started'}` : '; no plan today'
    const cueText = counts.length ? `; cues: ${counts.map((c) => `${copy.aims.cues[c.cue].toLowerCase()} started ${c.started} of ${c.n}`).join(', ')}` : ''
    facts.push(fact(`aim.${id}`, study ? ['study', 'ladder', 'cue', 'plan'] : ['plan', 'cue', aim.kind === 'person' ? 'social' : 'faith'], `${name} (${study ? 'study' : aim.kind}): the step is “${step.title}”, ${step.minutes} min; ${gapText}${blocked ? `; last time ended in ${copy.aims.blockedWhy[blocked]}` : ''}${open ? '; started, not yet answered' : ''}${planText}${cueText}${ladderText}.`, values))
  }

  const kept = keptCount(i.nights)
  if (kept.total) {
    const lastTen = [...i.nights].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 10)
    const reasons = { tired: 0, noTime: 0, tooMuch: 0, didntWant: 0 }
    for (const n of lastTen) if (n.reason) reasons[n.reason]++
    facts.push(fact('study.nights', ['study', 'evening', 'energy'], `Study nights kept ${kept.kept} of ${kept.total}; of the last ${lastTen.length}, not now for tired ${reasons.tired}, no time ${reasons.noTime}, too much on ${reasons.tooMuch}, didn't want to ${reasons.didntWant}.`, { kept: kept.kept, total: kept.total, recent: lastTen.length, ...reasons }, { n: kept.total }))
  }

  const ft = followThrough(i.offers, i.outcomes, i.wins)
  facts.push(fact('follow', ['monitoring'], `Follow-through: moves ${ft.moves.started} started ${ft.moves.finished} finished; steps ${ft.steps.started} started ${ft.steps.finished} finished; minimum wins ${ft.wins.started} written ${ft.wins.finished} done.`, { movesStarted: ft.moves.started, movesFinished: ft.moves.finished, stepsStarted: ft.steps.started, stepsFinished: ft.steps.finished, winsStarted: ft.wins.started, winsFinished: ft.wins.finished }))
  const bc = becoming(i.offers, i.outcomes)
  facts.push(fact('becoming', ['monitoring'], `Under the direction: ${bc.study.n} study sessions, ${bc.conversations.n} conversations started, ${bc.faith.n} faith practices, ${bc.timeWithHer.n} times with her.`, { study: bc.study.n, conversations: bc.conversations.n, faith: bc.faith.n, her: bc.timeWithHer.n }))

  const workouts = i.outside.filter((o) => o.day >= since && o.day <= today)
  facts.push(fact('outside.7d', ['workout'], `Workout days in the last seven: ${workouts.length}${workouts.length ? ` (${workouts.map((w) => w.day).join(', ')})` : ''}.`, { days: workouts.length }, { n: workouts.length }))

  const lastEvenings = [1, 2, 3].map((d) => i.checkins.find((c) => c.day === addDays(today, -d) && c.block === 'evening'))
  const misses = lastEvenings.reduce((n, c) => n + Object.values(c?.extras?.necessities ?? {}).filter(Boolean).length, 0)
  facts.push(fact('necessities.3d', ['necessities'], `Necessities marked missed over the last three evenings: ${misses}.`, { misses }, { n: 3 }))

  const morning = i.checkins.find((c) => c.day === today && c.block === 'morning')
  if (morning?.extras?.heavyCaffeine) facts.push(fact('today.heavyCaffeine', ['caffeine', 'morning'], 'Heavy caffeine marked this morning.', { heavyCaffeine: 1 }))

  if (i.direction) facts.push(fact('direction', ['monitoring'], `Your direction, in your words: “${i.direction}”.`, { direction: i.direction }))

  const said: SaidEntry[] = []
  const fb = (key: string) => i.feedback.find((f) => f.briefKey === key)?.answer ?? null
  for (const l of i.log) said.push({ day: l.day, source: 'phone', situationId: l.situationId, text: l.text, feedback: fb(`phone:${l.day}:${l.id}`) })
  for (const w of i.brainBriefs) said.push({ day: w.day, source: 'worker', situationId: null, text: w.text, feedback: fb(`worker:${w.id}`) })
  said.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))

  return { version: 1, day: today, builtAt: i.now.toISOString(), hour, weeks, days, direction: i.direction, facts, said: said.slice(0, 14) }
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
