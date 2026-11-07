import { addDays, daysBetween } from './blocks'
import { ONE_STRAND, type Move, type Path, type PathPlace, type SettingKind } from './catalogue'

// The measurement layer (P2 of the AI-generated Paths design, 2026-11-06), the pure part. A Path that
// declares it checks your own behaviours, never anyone's reaction (the Paths' rule since Part 23): what
// you check you did right after a rep, what a recording of yourself shows when you check it the next day
// or later, and what someone who was there noticed. A stage with a gate moves on when its rule's floor is
// met and its gate too; a stage shown is checked again about a month and three months later, then about
// every six months; after the attempt cap without the gate, the stage below's reps come back beside it.
// Everything is read from the record and nothing is stored. Social and Partner declare none of it.

/** One behaviour a strand's reps check: in your words, and as it is asked of someone who was there. */
export interface Behaviour {
  id: string
  words: string
  theirs: string
}

/** What a strand checks, and whether its reps can be recorded (yourself alone) or handed over. */
export interface StrandMeasure {
  strand: string
  behaviours: readonly Behaviour[]
  record?: boolean
  handOver?: boolean
}

/** What a stage needs shown, beyond its rule's floor. */
export interface StageGate {
  strand: string
  stage: number
  /** Behaviours a rep must meet. */
  met: number
  /** Separate weeks with such a rep. */
  weeks: number
  /** Of them, confirmed from outside the moment: a recording checked later, or someone who was there. */
  confirmed: number
  /** Kinds of setting with such a rep. */
  kinds: number
}

/** A Path's measurement: its strands' behaviours, its stages' gates, the attempt cap, and when a stage shown is checked again. */
export interface PathMeasurement {
  strands: readonly StrandMeasure[]
  gates: readonly StageGate[]
  cap: number
  /** When a stage shown is checked again: days after it was shown, then every so many days after the last. */
  maintenance: { at: readonly number[]; every: number }
}

/** What a rep's record says about the behaviours, as far as the measurement reads it. */
export interface RepChecks {
  /** Checked by you, right after. */
  checks?: readonly string[]
  /** Checked by you on the recording, the next day or later. */
  recordingChecks?: readonly string[]
  /** Noticed by someone who was there. */
  otherChecks?: readonly string[]
}

/** One done rep of a Path, as the measurement reads it. */
export interface MeasuredRep extends RepChecks {
  offerId: number
  moveId: string
  day: string
  setting: SettingKind
  outcome: 'done' | 'partly' | 'no' | null
}

/** Days a missed check of a stage shown may wait before the stage's reps come back. */
export const CHECK_GRACE_DAYS = 14

/** The strand and stage a rep sits on, on this Path. */
export function placeIn(path: Pick<Path, 'id'>, rep: Pick<Move, 'path'> | undefined): { strand: string; place: PathPlace } | null {
  const place = rep?.path?.[path.id]
  return place ? { strand: place.strand ?? ONE_STRAND, place } : null
}

/** A rep's best view of the behaviours: from outside the moment when there is one, else your own right after. */
export function viewOf(r: RepChecks, behaviours: readonly Behaviour[]): { met: number; outside: boolean } {
  const ids = new Set(behaviours.map((b) => b.id))
  const count = (xs: readonly string[] | undefined) => (xs ?? []).filter((x) => ids.has(x)).length
  const outside = Math.max(count(r.recordingChecks), count(r.otherChecks))
  const own = count(r.checks)
  return outside >= own && (r.recordingChecks || r.otherChecks) ? { met: outside, outside: true } : { met: own, outside: false }
}

/** The Monday a day's week begins on, so two reps in one week count as one week. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  const back = (d.getDay() + 6) % 7
  return addDays(day, -back)
}

export interface GateReading {
  /** The day the gate first held, or null. */
  metOn: string | null
  weeks: number
  confirmed: number
  kinds: number
  /** Reps of the stage with the behaviours checked at all: the attempts. */
  attempts: number
}

/**
 * Whether a stage's gate holds, read from its done reps on or after `since`, day by day: reps that meet
 * the behaviours, on enough separate weeks, enough of them confirmed from outside the moment, in enough
 * kinds of setting. The day all of it first holds is the gate's.
 */
export function readGate(gate: StageGate, behaviours: readonly Behaviour[], reps: readonly MeasuredRep[], since: string | null, today: string): GateReading {
  const mine = reps.filter((r) => r.outcome === 'done' && r.day <= today && (since === null || r.day >= since)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  const attempts = mine.filter((r) => r.checks?.length || r.recordingChecks?.length || r.otherChecks?.length).length
  const meeting: MeasuredRep[] = []
  let metOn: string | null = null
  for (const r of mine) {
    const v = viewOf(r, behaviours)
    if (v.met >= gate.met) meeting.push(r)
    const weeks = new Set(meeting.map((m) => weekOf(m.day))).size
    const confirmed = meeting.filter((m) => viewOf(m, behaviours).outside).length
    const kinds = new Set(meeting.map((m) => m.setting)).size
    if (metOn === null && weeks >= gate.weeks && confirmed >= gate.confirmed && kinds >= gate.kinds) metOn = r.day
  }
  return { metOn, weeks: new Set(meeting.map((m) => weekOf(m.day))).size, confirmed: meeting.filter((m) => viewOf(m, behaviours).outside).length, kinds: new Set(meeting.map((m) => m.setting)).size, attempts }
}

/** The days a stage shown is checked again, from the day it was shown: each offset, then every so many days after the last; up to today and the next one after it. */
export function checksDue(shownOn: string, plan: PathMeasurement['maintenance'], today: string): string[] {
  const out: string[] = []
  if (!plan.at.length || plan.every <= 0) return out
  const last = plan.at[plan.at.length - 1]
  for (let k = 0; ; k++) {
    const day = addDays(shownOn, k < plan.at.length ? plan.at[k] : last + (k - plan.at.length + 1) * plan.every)
    out.push(day)
    if (day > today) break
  }
  return out
}

export type CheckState = { kind: 'holding'; next: string } | { kind: 'refresh'; since: string }

/**
 * A stage shown, checked again: each due day needs a done rep of the stage on or after it that meets the
 * behaviours; one that does not, or none within the grace, brings the stage's reps back until one does.
 */
export function maintenanceOf(shownOn: string, gate: StageGate, behaviours: readonly Behaviour[], reps: readonly MeasuredRep[], plan: PathMeasurement['maintenance'], today: string): CheckState {
  const due = checksDue(shownOn, plan, today)
  const done = reps.filter((r) => r.outcome === 'done' && r.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1))
  for (const day of due) {
    if (day > today) return { kind: 'holding', next: day }
    const first = done.find((r) => r.day >= day)
    if (!first) return daysBetween(day, today) > CHECK_GRACE_DAYS ? { kind: 'refresh', since: day } : { kind: 'holding', next: day }
    if (viewOf(first, behaviours).met < gate.met) {
      // Not met at the check: the stage's reps come back until a later rep of it meets the behaviours again.
      const again = done.find((r) => r.day > first.day && viewOf(r, behaviours).met >= gate.met)
      if (!again) return { kind: 'refresh', since: first.day }
    }
  }
  return { kind: 'holding', next: due[due.length - 1] }
}

/** Your own checks beside an outside view, on the reps that have both: counts only, side by side. */
export function calibration(reps: readonly RepChecks[], behaviours: readonly Behaviour[]): { reps: number; yours: number; outside: number } {
  const ids = new Set(behaviours.map((b) => b.id))
  const count = (xs: readonly string[] | undefined) => (xs ?? []).filter((x) => ids.has(x)).length
  let n = 0
  let yours = 0
  let outside = 0
  for (const r of reps) {
    if (!r.checks || !(r.recordingChecks || r.otherChecks)) continue
    n++
    yours += count(r.checks)
    outside += Math.max(count(r.recordingChecks), count(r.otherChecks))
  }
  return { reps: n, yours, outside }
}

/** The strands you have on: those you chose, else every strand but the one the Path's start opens on a yes. */
export function activeStrands(path: Pick<Path, 'strands' | 'start'>, aim: { strands?: readonly string[] }): string[] {
  const all = (path.strands ?? []).map((s) => s.id)
  const chosen = (aim.strands ?? []).filter((id) => all.includes(id))
  if (chosen.length) return chosen
  const off = path.start?.opens
  const rest = all.filter((id) => id !== off)
  return rest.length ? rest : all
}

/** A Path's done and answered reps as the measurement reads them: each step's answer with the behaviours its record holds. */
export function measuredReps(entries: readonly { offerId: number; moveId: string; day: string; setting: SettingKind; outcome: 'done' | 'partly' | 'no' | null }[], outcomes: readonly ({ offerId: number } & RepChecks)[]): MeasuredRep[] {
  const by = new Map(outcomes.map((o) => [o.offerId, o]))
  return entries.map((e) => {
    const o = by.get(e.offerId)
    return { offerId: e.offerId, moveId: e.moveId, day: e.day, setting: e.setting, outcome: e.outcome, ...(o?.checks ? { checks: o.checks } : {}), ...(o?.recordingChecks ? { recordingChecks: o.recordingChecks } : {}), ...(o?.otherChecks ? { otherChecks: o.otherChecks } : {}) }
  })
}

/** One strand's reading today (P2): its current stage's gate, whether it is stuck, the stages shown whose reps came back, and the two numbers. */
export interface StrandMeasureToday {
  gate: StageGate | null
  reading: GateReading | null
  stuck: boolean
  refresh: number[]
  practised: number
  shownIn: number
  of: number
}

/** The measurement of one strand, read from its reps: what `stageOf` asks of a stage's gate, and what the card shows. */
export function strandReader(path: Pick<Path, 'id' | 'measurement'>, strand: string, reps: readonly MeasuredRep[], placeOf: (moveId: string) => PathPlace | undefined, today: string) {
  const m = path.measurement
  const behaviours = m?.strands.find((s) => s.strand === strand)?.behaviours ?? []
  const gateOf = (stage: number) => m?.gates.find((g) => g.strand === strand && g.stage === stage) ?? null
  const mine = reps.filter((r) => (placeOf(r.moveId)?.strand ?? ONE_STRAND) === strand)
  const at = (stage: number) => mine.filter((r) => placeOf(r.moveId)?.stage === stage)
  return {
    /** For `stageOf`: the day a gated stage's gate first held from `since`, null while it has not, undefined for a stage without one. */
    gate: (stage: number, since: string | null): string | null | undefined => {
      const g = gateOf(stage)
      return g ? readGate(g, behaviours, at(stage), since, today).metOn : undefined
    },
    /** The stages whose reps come back beside the current one: the stage below when stuck at the cap, and each stage shown whose check was missed or not met. */
    also: (state: { stage: number; reached: readonly { stage: number; day: string }[] }, last: number): number[] => {
      const out = new Set<number>()
      const g = gateOf(state.stage)
      const since = state.reached.find((r) => r.stage === state.stage)?.day ?? null
      if (m && g && state.stage > 1 && state.stage < last) {
        const r = readGate(g, behaviours, at(state.stage), since, today)
        if (r.metOn === null && r.attempts >= m.cap) out.add(state.stage - 1)
      }
      for (const r of state.reached) {
        const shown = r.stage - 1
        const gs = gateOf(shown)
        if (m && gs && maintenanceOf(r.day, gs, behaviours, at(shown), m.maintenance, today).kind === 'refresh') out.add(shown)
      }
      out.delete(state.stage)
      return [...out].sort((a, b) => a - b)
    },
    /** What the card shows for the current stage. */
    today: (state: { stage: number; reached: readonly { stage: number; day: string }[] }, last: number, also: readonly number[]): StrandMeasureToday => {
      const g = gateOf(state.stage)
      const since = state.reached.find((r) => r.stage === state.stage)?.day ?? null
      const reading = g ? readGate(g, behaviours, at(state.stage), since, today) : null
      const stuck = Boolean(m && g && reading && reading.metOn === null && reading.attempts >= m.cap && state.stage > 1 && state.stage < last)
      const n = twoNumbers(g ?? undefined, behaviours, mine, at(state.stage))
      return { gate: g, reading, stuck, refresh: also.filter((s) => s < state.stage && !(stuck && s === state.stage - 1)), practised: n.practised, shownIn: n.shownIn, of: n.of }
    },
  }
}

/** Practice apart from what is shown: reps done or partly done, and the kinds of setting the current stage has been shown in. */
export function twoNumbers(gate: StageGate | undefined, behaviours: readonly Behaviour[], reps: readonly MeasuredRep[], atStage: readonly MeasuredRep[]): { practised: number; shownIn: number; of: number } {
  const practised = reps.filter((r) => r.outcome === 'done' || r.outcome === 'partly').length
  const shown = gate ? new Set(atStage.filter((r) => r.outcome === 'done' && viewOf(r, behaviours).met >= gate.met).map((r) => r.setting)).size : 0
  return { practised, shownIn: shown, of: gate?.kinds ?? 0 }
}

/** The recordings waiting to be checked: made on a day before today, their rep answered done or partly, not checked yet; oldest first. */
export function recordingsDue<R extends { offerId: number; at: string }>(recs: readonly R[], outcomes: readonly { offerId: number; outcome: 'done' | 'partly' | 'no' | null; recordingCheckedAt?: string }[], today: string, dayOf: (at: string) => string): R[] {
  const by = new Map(outcomes.map((o) => [o.offerId, o]))
  return recs
    .filter((r) => {
      const o = by.get(r.offerId)
      return o !== undefined && (o.outcome === 'done' || o.outcome === 'partly') && !o.recordingCheckedAt && dayOf(r.at) < today
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1))
}
