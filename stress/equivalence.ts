import { BLOCKS } from '../src/blocks'
import { moveById, NOTHING, type Strength } from '../src/catalogue'
import type { CheckIn, DayContext as AppDay, Offer, Outcome } from '../src/db'
import { blockReadings } from '../src/readings'
import { buildEngine, contextOf } from '../src/repair/record'
import { EngineB as AppEngine, IN_APP, REPAIR, type OfferMadeB } from '../src/repair/engine'
import type { Response as AppResponse } from '../src/repair/world'
import { EngineB as JudgedEngine } from './engineB'
import { scenarioById, type Scenario } from './scenarios'
import { stream, type Rng } from './stats'
import { DAYS, World, type Answered, type DayContext, type Response } from './world'

// The learning repair's equivalence check: the engine the app runs (src/repair/engine.ts) against the engine the stress
// test judged (stress/engineB.ts), on the same simulated people, with the passing design (REPAIR), or with DESIGN=app the
// design as the app runs it (IN_APP: the passing design with requirement 15's threshold rule on, in both engines).
//
//   live:   the app's engine drawing for itself, side by side with the judged one on identical worlds: the same offers,
//           the same chances, and the same calls on every day;
//   replay: a fresh app engine rebuilt from the live run's record alone (each check-in, each offer with its candidates,
//           its chances and its week fits, each response, each answer to a week's invitation), as the app rebuilds from
//           its own record: the same calls on every day;
//   record: the live run written as the app's own records (check-ins, day contexts, offers, outcomes) and rebuilt by
//           src/repair/record.ts, the code the app runs, against a direct replay fed the same contexts the app reads: the
//           same calls on every day. (The app knows short sleep only from an answered morning, so its contexts can differ
//           from the simulated world's on a missed morning, by design; the two are compared like for like.)
//
// Each path's track record of its own calls (requirement 15) is compared too.
//
// [DESIGN=app] node stress/.out/equivalence.mjs [people per scenario] [perturb]   — exits 1 on the first difference.
// "perturb" is the check's own break: the app's engine runs with the research prior's vague part 0.01 wider, and every
// scenario must then come out DIFFERENT.

const people = Number(process.argv[2] ?? 20)
const BASE = process.env.DESIGN === 'app' ? IN_APP : REPAIR
const APP_CFG = process.argv[3] === 'perturb' ? { ...BASE, vague: BASE.vague + 0.01 } : BASE
const SCENARIOS = ['large', 'null', 'mixed', 'moderate', 'sparse-large', 'multi-day', 'change', 'with-her-only', 'prior-zero', 'next-morning', 'missing-large', 'pool-split']

function withPriors<T>(s: Scenario, f: () => T): T {
  const saved: [string, number, Strength][] = []
  for (const [id, p] of Object.entries(s.priors ?? {})) {
    const m = moveById(id)
    saved.push([id, m.prior.effect, m.source.strength])
    ;(m.prior as { effect: number }).effect = p.effect
    ;(m.source as { strength: Strength }).strength = p.strength
  }
  try {
    return f()
  } finally {
    for (const [id, e, st] of saved) {
      ;(moveById(id).prior as { effect: number }).effect = e
      ;(moveById(id).source as { strength: Strength }).strength = st
    }
  }
}

interface Logged {
  d: number
  block: (typeof BLOCKS)[number]
  offer: OfferMadeB | null
  response: Response | null
  answered: Answered
  context: DayContext
}

/** The stress test's calendar: day 0 is a Monday far from any real date. */
const dayOf = (d: number) => new Date(Date.UTC(2031, 0, 6 + d)).toISOString().slice(0, 10)

let failures = 0
const fail = (what: string) => {
  failures++
  console.log(`DIFFERENT ${what}`)
}

function runOne(s: Scenario, seed: number): void {
  const away = new Set(s.params.away)
  const declared = s.declared ?? []
  const judged = new JudgedEngine(stream(seed, 'engineB'), BASE, away, declared, stream(seed, 'optin'))
  // The app's engine draws from its own copy of the same streams; its week answers are logged by day for the replay.
  const appOptIn = stream(seed, 'optin')
  let usedOn: number | null = null
  let lastAnswer: boolean | null = null
  const loggingOptIn: Rng = () => {
    const u = appOptIn()
    lastAnswer = u < (BASE.lw?.accept ?? 0)
    return u
  }
  const app = new AppEngine(stream(seed, 'engineB'), APP_CFG, away, declared, loggingOptIn)
  const worldJ = new World(seed, s.params, s.truth)
  const worldA = new World(seed, s.params, s.truth)
  const answers = new Map<number, boolean>()
  const callsByDay: string[] = []
  const log: Logged[] = []
  for (let d = 0; d < DAYS; d++) {
    lastAnswer = null
    const cj = JSON.stringify(judged.learn(d))
    const ca = JSON.stringify(app.learn(d))
    if (lastAnswer !== null) {
      answers.set(d, lastAnswer)
      usedOn = d
    }
    if (cj !== ca) {
      fail(`${s.id} seed ${seed} day ${d}: the live calls differ`)
      return
    }
    callsByDay.push(ca)
    for (const b of BLOCKS) {
      const aj = worldJ.checkin(d, b)
      const aa = worldA.checkin(d, b)
      if (!aj || !aa) {
        if (aj || aa) fail(`${s.id} seed ${seed} day ${d} ${b}: the worlds' check-ins differ`)
        continue
      }
      const oj = judged.checkIn(aj, d, worldJ.context(d))
      const oa = app.checkIn(aa, d, worldA.context(d))
      if ((oj === null) !== (oa === null) || (oj && oa && (oj.moveId !== oa.moveId || oj.propensity !== oa.propensity || oj.id !== oa.id))) {
        fail(`${s.id} seed ${seed} day ${d} ${b}: the live offers differ (${oj?.moveId} ${oj?.propensity} / ${oa?.moveId} ${oa?.propensity})`)
        return
      }
      if (!oj || !oa) {
        log.push({ d, block: b, offer: null, response: null, answered: aa, context: worldA.context(d) })
        continue
      }
      const rj = worldJ.respond(oj.moveId, d, b)
      const ra = worldA.respond(oa.moveId, d, b)
      worldJ.apply(oj.moveId, d, b, rj.did === 'done' ? 1 : rj.did === 'partly' ? 0.5 : 0)
      worldA.apply(oa.moveId, d, b, ra.did === 'done' ? 1 : ra.did === 'partly' ? 0.5 : 0)
      judged.respond(oj.id, rj)
      app.respond(oa.id, ra as AppResponse)
      log.push({ d, block: b, offer: oa, response: ra, answered: aa, context: worldA.context(d) })
    }
  }
  void usedOn
  const track = (e: { trackRecord(): readonly unknown[] }) => JSON.stringify(e.trackRecord())
  if (track(judged) !== track(app)) {
    fail(`${s.id} seed ${seed}: the live track records differ`)
    return
  }

  // The record: the live run as the app keeps it, rebuilt by the app's own code.
  const checkins: CheckIn[] = []
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  const days = new Map<string, AppDay>()
  for (const rec of log) {
    const day = dayOf(rec.d)
    const c = rec.context
    if (!days.has(day)) days.set(day, { day, weekday: c.weekday, withHer: c.withHer, studyNight: c.studyNight, churchDay: c.church, atOffice: c.office, pickupTime: c.daycare ? '17:30' : null, soloUntil: '', ...(away.has(rec.d) ? { awayFromHome: { held: {} } } : {}) } as AppDay)
    const answers = { ...rec.answered.answers, ...(rec.block === 'morning' ? { sleepHours: c.shortSleep ? 1 : 4 } : {}) }
    checkins.push({ id: checkins.length + 1, day, block: rec.block, asked: Object.keys(answers) as never, startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: answers as never, activeMs: 20000 })
    if (!rec.offer || !rec.response) continue
    const o = rec.offer
    const id = offers.length + 1
    offers.push({ id, kind: 'block', day, block: rec.block, at: 'x', situationKey: 'x', target: o.target, stance: '', band: '', reading: 0, moveId: o.moveId, cardId: null, candidates: o.candidates.includes(NOTHING) ? o.candidates : [...o.candidates, NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: o.propensity, propensities: o.chances, skippedAt: null, closedAt: null, ...(rec.response.seen ? { seenAt: 'x' } : {}), ...(o.fits.length ? { fits: o.fits } : {}), ...(o.week ? { week: true as const } : {}) })
    if (rec.response.answered) outcomes.push({ offerId: id, moveId: o.moveId, day, block: rec.block, at: 'x', outcome: rec.response.seen ? rec.response.did : null, why: rec.response.why, passiveOutcome: null, seen: rec.response.seen })
  }
  for (const [d] of answers) if (!days.has(dayOf(d))) days.set(dayOf(d), { day: dayOf(d), weekday: 0, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '' } as AppDay)
  const fromRecord: string[] = []
  const built = buildEngine({ checkins, offers, outcomes, days: [...days.values()], weekAnswers: new Map([...answers].map(([d, v]) => [dayOf(d), v])) }, dayOf(DAYS - 1), null, stream(seed, 'unused'), APP_CFG, (_d, calls) => fromRecord.push(JSON.stringify(calls)), dayOf(0), declared)
  const morningOf = new Map(checkins.filter((c) => c.block === 'morning').map((c) => [c.day, c]))
  const appCtx = (d: number) => contextOf(dayOf(d), days.get(dayOf(d)), morningOf.get(dayOf(d)))
  const direct = new AppEngine(stream(seed, 'unused'), APP_CFG, away, declared, null, (d) => answers.get(d) ?? null)
  let k = 0
  for (let d = 0; d < DAYS; d++) {
    if (JSON.stringify(direct.learn(d)) !== fromRecord[d]) {
      fail(`${s.id} seed ${seed} day ${d}: the calls rebuilt from the app's record differ from a direct replay of the same record`)
      return
    }
    while (k < log.length && log[k].d === d) {
      const rec = log[k++]
      direct.observe(rec.answered, d, appCtx(d))
      if (rec.offer && rec.response) {
        const o = rec.offer
        const id = direct.replayOffer(rec.answered, d, appCtx(d), o.target, o.candidates.includes(NOTHING) ? o.candidates : [...o.candidates, NOTHING], o.moveId, o.chances, o.fits, o.week)
        direct.respond(id, rec.response as AppResponse)
      }
    }
  }

  if (track(built.engine) !== track(direct)) {
    fail(`${s.id} seed ${seed}: the track record rebuilt from the app's record differs from a direct replay's`)
    return
  }

  // The replay: a fresh app engine fed only the record.
  const replay = new AppEngine(stream(seed, 'unused'), APP_CFG, away, declared, null, (d) => answers.get(d) ?? null)
  const worldR = new World(seed, s.params, s.truth)
  let i = 0
  for (let d = 0; d < DAYS; d++) {
    const cr = JSON.stringify(replay.learn(d))
    if (cr !== callsByDay[d]) {
      fail(`${s.id} seed ${seed} day ${d}: the replayed calls differ from the live ones`)
      return
    }
    for (const b of BLOCKS) {
      const a = worldR.checkin(d, b)
      if (!a) continue
      const rec = log[i++]
      if (!rec || rec.d !== d || rec.block !== b) {
        fail(`${s.id} seed ${seed} day ${d} ${b}: the replay lost its place in the record`)
        return
      }
      replay.observe(a, d, worldR.context(d))
      if (rec.offer && rec.response) {
        const id = replay.replayOffer(a, d, worldR.context(d), rec.offer.target, rec.offer.candidates, rec.offer.moveId, rec.offer.chances, rec.offer.fits, rec.offer.week)
        worldR.apply(rec.offer.moveId, d, b, rec.response.did === 'done' ? 1 : rec.response.did === 'partly' ? 0.5 : 0)
        replay.respond(id, rec.response as AppResponse)
      }
    }
  }
  // The week's own record must come back too: the invitations made, the weeks accepted and their days, which decide the
  // app's next live draw.
  const week = (e: AppEngine) => JSON.stringify({ invited: e.lwStats.invited, accepted: e.lwStats.accepted, days: e.lwStats.days })
  if (week(replay) !== week(app)) fail(`${s.id} seed ${seed}: the replayed week differs from the live one (${week(replay)} / ${week(app)})`)
  else if (track(replay) !== track(app)) fail(`${s.id} seed ${seed}: the replayed track record differs from the live one`)
}

for (const id of SCENARIOS) {
  const s = scenarioById(id)
  const before = failures
  for (let seed = 1; seed <= people && failures === before; seed++) withPriors(s, () => runOne(s, seed))
  console.log(`${failures === before ? 'SAME' : 'DIFFERENT'} ${id}: ${people} people, live and replayed`)
}
console.log(failures ? `${failures} difference(s)` : 'the app engine equals the judged engine, live and replayed')
process.exit(failures ? 1 : 0)
