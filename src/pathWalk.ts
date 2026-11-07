import { addDays } from './blocks'
import { moveById, ONE_STRAND, type Path } from './catalogue'
import type { Aim, DayContext, Offer, Outcome } from './db'
import { pathToday, stageForRep, type PathToday } from './pathStage'

// The walk-through (P5, the proof gate's third part): a Path run on the app's own engine through twelve realistic
// weeks by a stand-in who does every rep offered, checks every behaviour of its strand, and gives an outside check
// wherever the rep allows one. It shows whether each criterion can be met on a real week's shape: a stage that never
// moves for such a person is a criterion no one can meet. Nothing here is a record: the rows live in memory alone.

/** A realistic week: the office on weekdays, errands on Saturday, church on Sunday morning, home in the evenings. */
export function weekShape(day: string): Pick<DayContext, 'atOffice' | 'churchDay' | 'pickupTime' | 'withHer' | 'amongPeople' | 'officeDay' | 'church' | 'services'> {
  const weekday = new Date(`${day}T12:00:00`).getDay()
  const office = weekday >= 1 && weekday <= 5
  return { atOffice: office, officeDay: office, churchDay: weekday === 0, church: 'third', services: weekday === 0 ? ['morning'] : [], pickupTime: null, withHer: false, amongPeople: weekday === 6 }
}

export interface WalkStrand {
  strand: string
  stages: number
  /** The stage it stands on after the walk. */
  stage: number
  /** Each stage reached, with its day. */
  reached: { stage: number; day: string }[]
}

export interface WalkResult {
  days: number
  reps: number
  strands: WalkStrand[]
}

/**
 * Walks a Path the registry holds. `share` reads the People row as it binds: alone, a rep each day; beside
 * another Path, three days in seven. The stand-in starts the strands given, else the Path's own default.
 */
export function walkPath(path: Path, opts: { start: string; days: number; share: 'alone' | 'beside'; strands?: string[] }): WalkResult {
  const aim: Aim = { id: 1, kind: 'path', path: path.id, stepMoveId: null, createdAt: `${opts.start}T12:00:00.000Z`, archivedAt: null, ...(opts.strands ? { strands: opts.strands } : {}) } as Aim
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  let id = 1
  let view: PathToday | null = null
  for (let d = 0; d < opts.days; d++) {
    const day = addDays(opts.start, d)
    if (opts.share === 'beside' && ![0, 2, 4].includes(d % 7)) continue
    const weekday = new Date(`${day}T12:00:00`).getDay()
    const block = weekday === 0 ? 'morning' : weekday === 6 ? 'morning' : 'afternoon'
    view = pathToday({ aim, offers, outcomes, ctx: weekShape(day), day, block })
    const pick = view.pick
    if (!pick || view.repDone) continue
    const rep = moveById(pick.moveId)
    const place = rep.path?.[path.id]
    const strand = place?.strand ?? ONE_STRAND
    const behaviours = (path.measurement?.strands.find((s) => s.strand === strand)?.behaviours ?? []).map((b) => b.id)
    const at = `${day}T${block === 'morning' ? '14' : '19'}:00:00.000Z`
    const offerId = id++
    offers.push({ id: offerId, kind: 'step', day, block, at, situationKey: `aim:path:${path.id}`, target: 'mood', stance: '', band: '', reading: 0, moveId: pick.moveId, minutes: rep.minutes, cardId: null, candidates: pick.candidates, coinFlip: false, passiveId: null, whyNot: null, propensity: pick.propensities[pick.moveId] ?? 1, propensities: pick.propensities, chosenBy: pick.chosenBy, paths: [path.id], setting: pick.setting, rule: pick.rule, stage: stageForRep(view, pick.moveId), skippedAt: null, closedAt: at } as unknown as Offer)
    outcomes.push({ id: offerId + 100_000, offerId, moveId: pick.moveId, day, block, at, outcome: 'done', why: null, passiveOutcome: null, reason: 'done', seen: true, checks: behaviours, ...(rep.record ? { recordingChecks: behaviours, recordingCheckedAt: `${addDays(day, 1)}T14:00:00.000Z` } : {}), ...(rep.handOver ? { otherChecks: behaviours } : {}) } as unknown as Outcome)
  }
  const last = addDays(opts.start, opts.days - 1)
  view = pathToday({ aim, offers, outcomes, ctx: weekShape(last), day: last, block: 'evening' })
  return {
    days: opts.days,
    reps: outcomes.length,
    strands: view.strands.map((s) => ({ strand: s.strand.id, stages: s.strand.stages.length, stage: s.state.stage, reached: s.state.reached.map((r) => ({ stage: r.stage, day: r.day })) })),
  }
}
