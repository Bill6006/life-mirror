import { addDays } from './blocks'
import type { SettingKind } from './catalogue'

// The fast loop (P6 of the AI-generated Paths design, 2026-11-07), the pure part. Population evidence sets a Path; your
// own record changes how it runs only through rows of the adaptation log, each with its origin and why, and the runtime
// reads nothing else. Your own tap applies at once (a preference, a correction), safety applies at once and is shown, and
// what the record suggests is a proposal, applied only on your tap. Every applied change can be undone and is kept as
// undone, never deleted. Browser-free, so the Worker's checks can share it.

/** What a change does to how a Path runs: the closed list. */
export const ADAPT_KINDS = ['prefer', 'setAside', 'noSetting', 'stepDown', 'smallerFirst', 'spacing', 'adopt'] as const
export type AdaptKind = (typeof ADAPT_KINDS)[number]

/** Why a change happened: the owner's closed list. */
export const ORIGINS = ['population', 'personalCausal', 'longitudinal', 'preference', 'feasibility', 'safety', 'newEvidence', 'correction', 'designChange'] as const
export type Origin = (typeof ORIGINS)[number]

export type AdaptState = 'applied' | 'declined' | 'undone'

/** A Path rep's own reason after a No, beside the engine's why, which stays as it is. */
export const PATH_WHYS = ['noChance', 'cantYet', 'wrong', 'unsafe'] as const
export type PathWhy = (typeof PATH_WHYS)[number]

/** One change to how a Path runs for you, as your record keeps it. */
export interface PathAdaptation {
  id?: number
  at: string
  day: string
  path: string
  /** The Path's version, and its content's hash, when the change was made. */
  version: string
  hash: string
  kind: AdaptKind
  rep?: string
  strand?: string
  stage?: number
  setting?: SettingKind
  /** Spacing: the check it follows, and the days to the next and to each after it. */
  after?: string
  every?: number
  /** A tested version adopted: the lever and its version. */
  lever?: string
  choice?: string
  origin: Origin
  /** Why, in plain words with the counts, as it was when the change was made. */
  why: string
  /** Applied, or a proposal you declined, or a change undone. */
  state: AdaptState
  stateAt: string
  /** A proposal's identity: its kind and target, so a declined one comes back only on newer evidence. */
  key: string
}

/** A change as the runtime reads it: the applied rows of one Path, and nothing else. */
export interface Adapted {
  setAside: ReadonlySet<string>
  prefer: ReadonlySet<string>
  noSettings: ReadonlySet<SettingKind>
  stepDown: readonly { strand: string; stage: number }[]
  smallerFirst: readonly { strand: string; stage: number; at: string }[]
  spacing: readonly { strand: string; stage: number; after: string; every: number }[]
  adopted: ReadonlyMap<string, string>
}

export const UNADAPTED: Adapted = { setAside: new Set(), prefer: new Set(), noSettings: new Set(), stepDown: [], smallerFirst: [], spacing: [], adopted: new Map() }

/** One Path's applied changes. A row of another Path, or one declined or undone, changes nothing. */
export function adaptedOf(path: string, rows: readonly PathAdaptation[] | undefined): Adapted {
  const mine = (rows ?? []).filter((r) => r.path === path && r.state === 'applied').sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  if (!mine.length) return UNADAPTED
  const reps = (k: AdaptKind) => new Set(mine.filter((r) => r.kind === k && r.rep).map((r) => r.rep as string))
  const placed = (k: AdaptKind) => mine.filter((r) => r.kind === k && r.strand !== undefined && r.stage !== undefined)
  const prefer = reps('prefer')
  const setAside = reps('setAside')
  for (const id of setAside) prefer.delete(id)
  return {
    setAside,
    prefer,
    noSettings: new Set(mine.filter((r) => r.kind === 'noSetting' && r.setting).map((r) => r.setting as SettingKind)),
    stepDown: placed('stepDown').map((r) => ({ strand: r.strand as string, stage: r.stage as number })),
    smallerFirst: placed('smallerFirst').map((r) => ({ strand: r.strand as string, stage: r.stage as number, at: r.at })),
    spacing: placed('spacing').filter((r) => r.after && r.every).map((r) => ({ strand: r.strand as string, stage: r.stage as number, after: r.after as string, every: r.every as number })),
    adopted: new Map(mine.filter((r) => r.kind === 'adopt' && r.lever && r.choice).map((r) => [r.lever as string, r.choice as string])),
  }
}

/** A proposal's identity: the same kind on the same target is one proposal. */
export function keyOf(p: Pick<PathAdaptation, 'kind' | 'rep' | 'strand' | 'stage' | 'setting' | 'after' | 'lever'>): string {
  return [p.kind, p.rep ?? '', p.strand ?? '', p.stage ?? '', p.setting ?? '', p.after ?? '', p.lever ?? ''].join('|')
}

/** What the record suggests, before your tap: a change, with its origin and why. */
export interface Proposal {
  key: string
  kind: AdaptKind
  rep?: string
  strand?: string
  stage?: number
  after?: string
  every?: number
  lever?: string
  choice?: string
  origin: Origin
  why: string
  /** The counts the why rests on. */
  counts: Readonly<Record<string, number>>
}

/** One answered rep of a Path, as the fast loop reads it. */
export interface AdaptRep {
  offerId: number
  moveId: string
  day: string
  at: string
  strand: string
  stage: number
  outcome: 'done' | 'partly' | 'no' | null
  /** The engine's why after a No. */
  why?: 'noTime' | 'didntWant' | null
  pathWhy?: PathWhy
  /** After Partly or No on a measured Path, whether the chance came up. */
  chance?: boolean
  effort?: 1 | 2 | 3 | 4 | 5
}

/** Hard, on the one-to-five question: four or five. */
export const HARD_EFFORT = 4
/** Feasibility: no chance on this many of a rep's last offers answered. */
export const NO_CHANCE = { of: 4, at: 3 } as const
/** Step-down: can't do it yet this many times on a stage's reps within these days. */
export const CANT_YET = { times: 2, days: 21 } as const
/** The smaller version first: hard, or a No for no time, on this many of a stage's last reps. */
export const TOO_MUCH = { of: 4, at: 3 } as const
/** Check-again spacing: half as late again after a pass, up to a year; half as soon after a miss, at least three weeks. */
export const SPACING = { longer: 1.5, most: 365, shorter: 0.5, least: 21 } as const

/** Whether a rep's answer says no chance came up: the Path's own reason, or the measured Path's chance question. */
export function noChance(r: Pick<AdaptRep, 'pathWhy' | 'chance'>): boolean {
  return r.pathWhy === 'noChance' || r.chance === false
}

/** A stage's place on a strand: its reps and its stage. */
export interface StrandStage {
  strand: string
  stage: number
}

/** The evidence a declined proposal comes back on: only answers after you said Not now. */
function since(rows: readonly PathAdaptation[], key: string): string {
  return rows.filter((r) => r.key === key && r.state === 'declined').reduce((s, r) => (r.stateAt > s ? r.stateAt : s), '')
}

function appliedKey(rows: readonly PathAdaptation[], key: string): boolean {
  return rows.some((r) => r.key === key && r.state === 'applied')
}

export interface ProposalInput {
  path: string
  reps: readonly AdaptRep[]
  rows: readonly PathAdaptation[]
  today: string
  /** Each strand on, with the stage it stands on. */
  strands: readonly StrandStage[]
  /** Whether setting a rep aside would leave its stage short of its floor. */
  floorLost: (moveId: string) => boolean
  /** Whether the stage below's reps already come back beside this one. */
  belowBack: (s: StrandStage) => boolean
  /** The checks of stages shown, each resolved: passed or not, with the interval that led to the next. */
  checks?: readonly { strand: string; stage: number; day: string; passed: boolean; next: number }[]
}

/**
 * What the record suggests now (the fast loop's proposals): a rep with no chance on three of its last four answered
 * offers set aside; the stage below's reps back beside a stage you can't do yet twice in three weeks; the smaller version
 * first on a stage whose last four reps were mostly hard or a No for no time; and each check of a stage shown, passed
 * or missed, spacing the next. A proposal applied stands as a change; one declined comes back only on newer answers.
 */
export function proposalsOf(i: ProposalInput): Proposal[] {
  const out: Proposal[] = []
  const add = (p: Omit<Proposal, 'key'>) => {
    const key = keyOf(p)
    if (appliedKey(i.rows, key) || out.some((x) => x.key === key)) return
    out.push({ ...p, key })
  }
  const answered = i.reps.filter((r) => r.outcome !== null).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const setAside = new Set(i.rows.filter((r) => r.path === i.path && r.state === 'applied' && r.kind === 'setAside').map((r) => r.rep))
  // Feasibility: a rep the chance never came up for.
  for (const moveId of [...new Set(answered.map((r) => r.moveId))]) {
    if (setAside.has(moveId) || i.floorLost(moveId)) continue
    const key = keyOf({ kind: 'setAside', rep: moveId })
    const from = since(i.rows, key)
    const last = answered.filter((r) => r.moveId === moveId && r.at > from).slice(-NO_CHANCE.of)
    const none = last.filter(noChance).length
    if (last.length >= NO_CHANCE.of && none >= NO_CHANCE.at) add({ kind: 'setAside', rep: moveId, origin: 'feasibility', why: '', counts: { noChance: none, of: last.length } })
  }
  for (const s of i.strands) {
    const here = answered.filter((r) => r.strand === s.strand && r.stage === s.stage)
    // Step-down: can't do it yet, twice in three weeks, on the stage's reps.
    if (s.stage > 1 && !i.belowBack(s)) {
      const key = keyOf({ kind: 'stepDown', strand: s.strand, stage: s.stage })
      const from = since(i.rows, key)
      const recent = here.filter((r) => r.pathWhy === 'cantYet' && r.at > from && r.day >= addDays(i.today, -(CANT_YET.days - 1)) && r.day <= i.today)
      if (recent.length >= CANT_YET.times) add({ kind: 'stepDown', strand: s.strand, stage: s.stage, origin: 'longitudinal', why: '', counts: { cantYet: recent.length, days: CANT_YET.days } })
    }
    // The smaller version first: hard on three of the stage's last four done reps (difficulty), or a No for no time on
    // three of its last four answered (the burden).
    const key = keyOf({ kind: 'smallerFirst', strand: s.strand, stage: s.stage })
    const from = since(i.rows, key)
    const done = here.filter((r) => r.at > from && r.outcome === 'done').slice(-TOO_MUCH.of)
    const hard = done.filter((r) => (r.effort ?? 0) >= HARD_EFFORT).length
    const last = here.filter((r) => r.at > from).slice(-TOO_MUCH.of)
    const noTime = last.filter((r) => r.outcome === 'no' && r.why === 'noTime').length
    if (done.length >= TOO_MUCH.of && hard >= TOO_MUCH.at) add({ kind: 'smallerFirst', strand: s.strand, stage: s.stage, origin: 'longitudinal', why: '', counts: { hard, of: done.length } })
    else if (last.length >= TOO_MUCH.of && noTime >= TOO_MUCH.at) add({ kind: 'smallerFirst', strand: s.strand, stage: s.stage, origin: 'longitudinal', why: '', counts: { noTime, of: last.length } })
  }
  // Check-again spacing: each check of a stage shown below where its strand stands, passed or missed.
  for (const c of i.checks ?? []) {
    if (!i.strands.some((s) => s.strand === c.strand && s.stage > c.stage)) continue
    const every = c.passed ? Math.min(SPACING.most, Math.round(c.next * SPACING.longer)) : Math.max(SPACING.least, Math.round(c.next * SPACING.shorter))
    if (every === c.next) continue
    add({ kind: 'spacing', strand: c.strand, stage: c.stage, after: c.day, every, origin: 'longitudinal', why: '', counts: { passed: c.passed ? 1 : 0, next: c.next, every } })
  }
  return out
}
