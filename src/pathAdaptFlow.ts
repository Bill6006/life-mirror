import { blockAt } from './blocks'
import { findPath, hasMove, moveById, ONE_STRAND, pathReps, strandsOf, type Path, type PathId, type SettingKind } from './catalogue'
import { copy } from './copy'
import { db, type Offer, type Outcome } from './db'
import { fill, formatDayShort } from './format'
import { keyOf, proposalsOf, type AdaptKind, type AdaptRep, type Origin, type PathAdaptation, type Proposal } from './pathAdapt'
import { measuredReps, strandReader } from './pathMeasure'
import { contentHash } from './pathVersions'
import { defaultSetting, offerable, placeOn, setAsideBy, type PathToday } from './pathStage'

// The fast loop on the phone (P6 of the AI-generated Paths design, 2026-11-07): your taps and the record's proposals made
// rows of the adaptation log, each with its origin and why in plain words, and undone in place, never deleted. Only your
// tap writes a row, save one: a rep you said felt unsafe or harmful is set aside at once, and shown.

/** A Path's name for a stage of one of its strands: "Speaking to several people, stage 2"; on a Path of one strand, "stage 2". */
function stageName(path: Path, strand: string, stage: number): string {
  const s = strand === ONE_STRAND ? null : strandsOf(path).find((x) => x.id === strand)
  return s ? fill(copy.path.adapt.strandStage, { strand: s.name, n: String(stage) }) : fill(copy.path.adapt.stage, { n: String(stage) })
}

function repName(id: string | undefined): string {
  return id && hasMove(id) ? moveById(id).name : (id ?? '')
}

function settingName(k: SettingKind | undefined): string {
  return k ? copy.catalogue.paths.settingNames[k] : ''
}

/** What a change does, in words. */
export function changeWords(path: Path, c: Pick<PathAdaptation, 'kind' | 'rep' | 'strand' | 'stage' | 'setting' | 'every' | 'lever' | 'choice'>): string {
  const w = copy.path.adapt.what
  const at = c.stage !== undefined ? stageName(path, c.strand ?? ONE_STRAND, c.stage) : ''
  switch (c.kind) {
    case 'setAside':
      return fill(w.setAside, { rep: repName(c.rep) })
    case 'prefer':
      return fill(w.prefer, { rep: repName(c.rep) })
    case 'noSetting':
      return fill(w.noSetting, { setting: settingName(c.setting) })
    case 'stepDown':
      return fill(w.stepDown, { stage: at })
    case 'smallerFirst':
      return fill(w.smallerFirst, { stage: at })
    case 'spacing':
      return fill(w.spacing, { stage: at, every: String(c.every ?? '') })
    case 'adopt':
      return fill(w.adopt, { lever: c.lever ?? '', choice: c.choice ?? '' })
  }
}

/** Why a proposal is made, in words with its counts. */
export function proposalWhy(path: Path, p: Proposal): string {
  const w = copy.path.adapt.why
  const n = (k: string) => String(p.counts[k] ?? 0)
  switch (p.kind) {
    case 'setAside':
      return fill(w.noChance, { n: n('noChance'), of: n('of') })
    case 'stepDown':
      return fill(w.cantYet, { n: n('cantYet') })
    case 'smallerFirst':
      return p.counts.hard !== undefined ? fill(w.hard, { n: n('hard'), of: n('of') }) : fill(w.noTime, { n: n('noTime'), of: n('of') })
    case 'spacing':
      return fill(p.counts.passed ? w.checkPassed : w.checkMissed, { stage: stageName(path, p.strand ?? ONE_STRAND, p.stage ?? 0), day: p.after ? formatDayShort(p.after) : '', next: n('next'), every: n('every') })
    default:
      return ''
  }
}

/** A Path's answered reps, as the fast loop reads them: each step with its answer's reasons and how hard it was. */
export function adaptReps(pt: Pick<PathToday, 'path' | 'entries'>, outcomes: readonly Outcome[]): AdaptRep[] {
  const by = new Map(outcomes.map((x) => [x.offerId, x]))
  return pt.entries.flatMap((e) => {
    const place = placeOn(pt.path.id, e.moveId)
    const x = by.get(e.offerId)
    if (!place || !x) return []
    return [{ offerId: e.offerId, moveId: e.moveId, day: e.day, at: x.at, strand: place.strand ?? ONE_STRAND, stage: place.stage, outcome: e.outcome, why: x.why, ...(x.pathWhy ? { pathWhy: x.pathWhy } : {}), ...(x.chance !== undefined ? { chance: x.chance } : {}), ...(x.effort ? { effort: x.effort } : {}) }]
  })
}

/**
 * Whether setting a rep aside would leave its stage short of its floor: fewer different stage-moving reps than its rule
 * asks, or fewer kinds of setting among them, once it and every rep you set aside already are left out.
 */
export function floorLostWithout(pt: Pick<PathToday, 'path' | 'adapted'>, moveId: string): boolean {
  const place = placeOn(pt.path.id, moveId)
  if (!place?.advances) return false
  const strand = place.strand ?? ONE_STRAND
  const rule = (strand === ONE_STRAND ? null : strandsOf(pt.path).find((s) => s.id === strand)?.rule) ?? pt.path.rule
  const left = pathReps(pt.path.id, place.stage, pt.path.strands?.length ? strand : undefined).filter((m) => m.id !== moveId && offerable(m) && m.path?.[pt.path.id]?.advances && !setAsideBy(pt.adapted, m))
  const kinds = new Set(left.flatMap((m) => (m.settings?.length ? m.settings : [defaultSetting(m)])))
  return left.length < rule.distinctReps || (rule.settingKinds > 1 && kinds.size < rule.settingKinds)
}

/** The strands on whose stage your changes leave too few different stage-moving reps to move on: what the sheet says beside the kinds you don't have. */
export function stagesShort(pt: Pick<PathToday, 'path' | 'adapted' | 'strands'>): string[] {
  return pt.strands
    .filter((t) => {
      const rule = (pt.path.strands?.length ? t.strand.rule : null) ?? pt.path.rule
      const left = pathReps(pt.path.id, t.state.stage, pt.path.strands?.length ? t.strand.id : undefined).filter((m) => offerable(m) && m.path?.[pt.path.id]?.advances && !setAsideBy(pt.adapted, m))
      return t.state.stage < (pt.path.strands?.length ? t.strand.stages.length : pt.path.stages.length) && left.length < rule.distinctReps
    })
    .map((t) => stageName(pt.path, pt.path.strands?.length ? t.strand.id : ONE_STRAND, t.state.stage))
}

/** What the record suggests for this Path now, each with its why in words. */
export function proposalsFor(pt: PathToday, outcomes: readonly Outcome[], rows: readonly PathAdaptation[], today: string): Proposal[] {
  const mine = rows.filter((r) => r.path === pt.path.id)
  const measured = pt.path.measurement ? measuredReps(pt.entries, outcomes) : []
  const checks = pt.path.measurement
    ? pt.strands.flatMap((t) => strandReader(pt.path, t.strand.id, measured, (id) => placeOn(pt.path.id, id), today, pt.adapted.spacing.filter((s) => s.strand === t.strand.id)).checks(t.state))
    : []
  const found = proposalsOf({
    path: pt.path.id,
    reps: adaptReps(pt, outcomes),
    rows: mine,
    today,
    strands: pt.strands.map((t) => ({ strand: t.strand.id, stage: t.state.stage })),
    floorLost: (id) => floorLostWithout(pt, id),
    belowBack: (s) => pt.strands.find((t) => t.strand.id === s.strand)?.elig.stageReps.some((m) => placeOn(pt.path.id, m.id)?.stage === s.stage - 1) ?? false,
    checks,
  })
  return found.map((p) => ({ ...p, why: proposalWhy(pt.path, p) }))
}

/** A row of the log for this Path as it stands now. */
function rowOf(path: Path, c: Omit<PathAdaptation, 'id' | 'at' | 'day' | 'path' | 'version' | 'hash' | 'stateAt' | 'key' | 'state'> & { state?: PathAdaptation['state'] }, now: Date): PathAdaptation {
  const at = now.toISOString()
  const { state, ...rest } = c
  return { ...rest, at, day: blockAt(now).day, path: path.id, version: path.version ?? '1', hash: contentHash(path), state: state ?? 'applied', stateAt: at, key: keyOf(c) }
}

/** Your own tap on a rep or a kind of setting, applied at once: a preference, or a correction to what your week holds. */
export function tapWhy(kind: AdaptKind, setting?: SettingKind): { origin: Origin; why: string } {
  const w = copy.path.adapt.why
  if (kind === 'prefer') return { origin: 'preference', why: w.prefer }
  if (kind === 'noSetting') return { origin: 'correction', why: fill(w.noSetting, { setting: settingName(setting) }) }
  return { origin: 'preference', why: w.notForMe }
}

/** Why a rep can't be set aside by your tap: it would leave its stage short of its floor. Null when it can. */
export function notForMeRefusal(pt: Pick<PathToday, 'path' | 'adapted'>, moveId: string): string | null {
  return floorLostWithout(pt, moveId) ? copy.path.adapt.floorKept : null
}

/** A tap on the sheet: on, a row applied at once; off, the change it made undone. Not for me is refused when the stage would lose its floor. */
export async function setTap(pt: PathToday, kind: 'prefer' | 'setAside' | 'noSetting', target: { rep?: string; setting?: SettingKind }, on: boolean, now: Date = new Date()): Promise<string | null> {
  if (on && kind === 'setAside' && target.rep) {
    const refused = notForMeRefusal(pt, target.rep)
    if (refused) return refused
  }
  const key = keyOf({ kind, ...target })
  await db.transaction('rw', db.pathAdaptations, async () => {
    const rows = await db.pathAdaptations.where('path').equals(pt.path.id).toArray()
    const live = rows.filter((r) => r.key === key && r.state === 'applied')
    if (on && !live.length) await db.pathAdaptations.add(rowOf(pt.path, { kind, ...target, ...tapWhy(kind, target.setting) }, now))
    // A rep set aside for safety comes back only by its own Undo, never by a tap on the sheet.
    if (!on) for (const r of live) if (r.origin !== 'safety') await db.pathAdaptations.update(r.id as number, { state: 'undone', stateAt: now.toISOString() })
  })
  return null
}

/** Use it: a proposal made a change, with its origin and why as they stand now. */
export async function useProposal(path: Path, p: Proposal, now: Date = new Date()): Promise<void> {
  const { key: _key, counts: _counts, origin, why, ...target } = p
  await db.transaction('rw', db.pathAdaptations, async () => {
    const live = await db.pathAdaptations.where('path').equals(path.id).filter((r) => r.key === p.key && r.state === 'applied').count()
    if (!live) await db.pathAdaptations.add(rowOf(path, { ...target, origin, why }, now))
  })
}

/** Not now: the proposal kept as declined, so it comes back only on answers after this. */
export async function declineProposal(path: Path, p: Proposal, now: Date = new Date()): Promise<void> {
  const { key: _key, counts: _counts, origin, why, ...target } = p
  await db.pathAdaptations.add(rowOf(path, { ...target, origin, why, state: 'declined' }, now))
}

/** Undo: the change kept, marked undone, and the Path runs as before it. */
export async function undoChange(id: number, now: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.pathAdaptations, async () => {
    const r = await db.pathAdaptations.get(id)
    if (r?.state === 'applied') await db.pathAdaptations.update(id, { state: 'undone', stateAt: now.toISOString() })
  })
}

/** A rep you said felt unsafe or harmful, on each Path its step counts for: set aside at once, origin safety. Never twice. */
export function safetyRows(offer: Pick<Offer, 'moveId' | 'paths' | 'day'>, existing: readonly PathAdaptation[], now: Date): PathAdaptation[] {
  const out: PathAdaptation[] = []
  for (const id of offer.paths ?? []) {
    const path = findPath(id as PathId)
    if (!path || !placeOn(path.id, offer.moveId)) continue
    const key = keyOf({ kind: 'setAside', rep: offer.moveId })
    if (existing.some((r) => r.path === path.id && r.key === key && r.state === 'applied')) continue
    out.push(rowOf(path, { kind: 'setAside', rep: offer.moveId, origin: 'safety', why: copy.path.adapt.why.unsafe }, now))
  }
  return out
}
