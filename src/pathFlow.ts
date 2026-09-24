import { addDays, blockAt, dayKey, type Block } from './blocks'
import { moveById, type PathId } from './catalogue'
import { db, MONTHLY_PARTS, VALUES_PARTS, type Aim, type CoachPick, type MonthlyCheck, type MonthlyPart, type Offer, type PartnerStep, type PathMark, type Reflection, type ReflectionKind, type ValuesPart } from './db'
import { keysOf, planFor } from './aims'
import { coachPickFor, pathById, pathKey, pathsHolding, peopleRow, seeded, type PathToday, type PeopleRow, type RepPick } from './pathStage'
import type { CoachBlock } from './factTypes'

// The path commitment on the phone (Part 24): added once per path, converted from A person with
// its record kept, paused and resumed, a rep picked by you through Change, and Resume, which
// records the step as an offer saying who chose it, where it was meant to happen and why.

/** A path, once: a second tap, or a path already on the list, changes nothing. */
export function addPathAim(path: PathId): Promise<void> {
  return db.transaction('rw', db.aims, async () => {
    const live = await db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === path).toArray()
    if (live.length) return
    await db.aims.add({ kind: 'path', path, stepMoveId: null, pausedAt: null, createdAt: new Date().toISOString(), archivedAt: null })
  })
}

/**
 * A person becomes the Social path: the same commitment, so its plans, its steps and their
 * answers stay its record. Nothing changes when a Social path is already on the list.
 */
export function convertToSocial(aimId: number): Promise<void> {
  return db.transaction('rw', db.aims, async () => {
    const aim = await db.aims.get(aimId)
    if (!aim || aim.kind !== 'person' || aim.archivedAt !== null) return
    const social = await db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === 'social').count()
    if (social) return
    await db.aims.update(aimId, { kind: 'path', path: 'social', convertedFrom: 'person', convertedAt: new Date().toISOString(), pausedAt: null })
  })
}

/** Pause, or take up again. A paused path has no row on Now and no step; its record is kept. */
export async function pausePath(aimId: number, paused: boolean): Promise<void> {
  await db.aims.update(aimId, { pausedAt: paused ? new Date().toISOString() : null })
}

/** Your pick through Change: today's rep, offered whatever the shape says, until the day ends or it is done. With two paths on, the later pick is the row's. */
export async function setPathPick(aimId: number, moveId: string, day: string, now: Date = new Date()): Promise<void> {
  await db.aims.update(aimId, { pick: { day, moveId, at: now.toISOString() } })
}

/** Whether a path is on: on the list and not paused. */
export function pathOn(a: Aim): boolean {
  return a.kind === 'path' && a.archivedAt === null && !a.pausedAt
}

/**
 * The one People row across the paths on (Part 27), the same on Now, on Aims and in the brain: a
 * step already started holds it until it is answered; otherwise the slot rule decides.
 */
export function peopleRowOf(views: readonly PathToday[], open: readonly Offer[], today: string, block: Block, coach: CoachPick | null = null): PeopleRow | null {
  for (const v of views) {
    const keys = keysOf(v.aim, [])
    const started = open.find((o) => keys.includes(o.situationKey))
    if (started) return { view: v, pick: v.pick, paths: [...(started.paths ?? [v.path.id])] }
  }
  const row = peopleRow(views.find((v) => v.path.id === 'social') ?? null, views.find((v) => v.path.id === 'partner') ?? null, today, seeded(`people|${today}|${block}`))
  // The coach chooses within the row's own candidates, never around them (Part 32).
  const pick = row ? coachPickFor(row, coach, today) : null
  return row && pick ? { ...row, pick, paths: pathsHolding(pick.moveId, views.map((v) => v.path.id)) } : row
}

/**
 * The coach's pick as the row may use it (Part 32): none on the Partner path while this month's
 * check shows its help. The coach defers to that help at the tap too, even over a pick it made
 * before the help showed.
 */
export function coachAllowed(pick: CoachPick | null, checks: readonly MonthlyCheck[], today: string): CoachPick | null {
  if (!pick) return null
  const check = checkThisMonth(checks, today)
  return pick.path === 'partner' && check !== null && checkShowsHelp(check.answers) ? null : pick
}

/**
 * The People row as the coach may choose for it (Part 32): the path its slot rule gave the row and
 * the reps it may offer this block; no candidates while a step is started or the pick is yours.
 */
export function coachRow(views: readonly PathToday[], open: readonly Offer[], today: string, block: Block): CoachBlock['row'] {
  const started = views.some((v) => open.some((o) => keysOf(v.aim, []).includes(o.situationKey)))
  const row = peopleRowOf(views, open, today, block)
  if (!row) return null
  return { path: row.view.path.id, candidates: started || !row.pick || row.pick.chosenBy === 'you' ? [] : [...row.pick.candidates] }
}

/**
 * Resume on a path, one tap: the rep as a step offer, started now and asked about at the next
 * check-in, carrying who chose it, the paths it counts for, where it was meant to happen, the rule
 * that picked it, the stage, and the reps it was picked among with each one's chance.
 */
export function resumePath(aim: Aim, pick: RepPick, stage: number, now: Date = new Date(), paths: readonly PathId[] = [aim.path as PathId]): Promise<Offer> {
  return db.transaction('rw', [db.offers, db.intentions, db.aims], async () => {
    const { day, block } = blockAt(now)
    const move = moveById(pick.moveId)
    const offer: Offer = {
      kind: 'step',
      day,
      block,
      at: now.toISOString(),
      situationKey: pathKey(aim.path as PathId),
      target: 'mood',
      stance: '',
      band: '',
      reading: 0,
      moveId: move.id,
      minutes: move.minutes,
      cardId: null,
      candidates: pick.candidates,
      coinFlip: false,
      passiveId: null,
      whyNot: null,
      propensity: pick.propensities[move.id] ?? 1,
      propensities: pick.propensities,
      chosenBy: pick.chosenBy,
      paths: paths.length ? [...paths] : [aim.path as PathId],
      setting: pick.setting,
      rule: pick.rule,
      stage,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    // The step was planned for today and is now started: the plan is kept. The People row has one
    // plan, whichever path holds it (Part 27), so a plan on the other path is kept too.
    const plans = await db.intentions.where('day').equals(day).toArray()
    const others = (await db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.id !== aim.id).toArray()).map((a) => a.id as number)
    const plan = [aim.id as number, ...others].map((id) => planFor(plans, id, day)).find((p) => p !== null && p.offerId === null)
    if (plan) await db.intentions.update(plan.id as number, { offerId: offer.id })
    return offer
  })
}

// Part 27: the Partner path's own record. Each declaration is dated and undone by deleting it
// (Rule 13); a note is kept whole as you typed it; the monthly check is answered once a month and
// again in place. Nothing here holds a name, a place, a rating or anyone else's answer.

export function pathMarks(path?: PathId): Promise<PathMark[]> {
  return path ? db.pathMarks.where('path').equals(path).toArray() : db.pathMarks.toArray()
}

/** You say you have reached a stage: one tap, dated. */
export async function declareStage(path: PathId, stage: number, now: Date = new Date()): Promise<void> {
  await db.pathMarks.add({ path, kind: 'stage', stage, day: dayKey(now), at: now.toISOString() })
}

/** A date, declared with its day and nothing else: today or one of the next six. It moves the path to Dating at once. */
export async function declareDate(path: PathId, day: string, now: Date = new Date()): Promise<void> {
  const already = await db.pathMarks.where('path').equals(path).filter((m) => m.kind === 'date' && m.day === day).count()
  if (!already) await db.pathMarks.add({ path, kind: 'date', day, at: now.toISOString() })
}

/** A milestone, dated, with the details you write. */
export async function addMilestone(path: PathId, note: string, now: Date = new Date()): Promise<void> {
  const text = note.trim()
  if (text) await db.pathMarks.add({ path, kind: 'milestone', day: dayKey(now), note: text, at: now.toISOString() })
}

/** Undone: the declaration is deleted, and everything downstream is recomputed from what is left (Rule 13). */
export async function deleteMark(id: number): Promise<void> {
  await db.pathMarks.delete(id)
}

export function reflections(path?: PathId): Promise<Reflection[]> {
  return path ? db.reflections.where('path').equals(path).toArray() : db.reflections.toArray()
}

/** Where a note belongs: the step a decide-don't-slide note is written before, or the part of the values note or the monthly reflection. */
export interface NotePlace {
  step?: PartnerStep
  part?: ValuesPart | MonthlyPart
}

/**
 * A private note, kept whole. Each part of your values note is one note, rewritten in place; a
 * decide-don't-slide note is one per step; each part of the monthly reflection is one note a month,
 * rewritten in place within its month; a reflection is a new dated note each time. An empty note
 * removes the one it would have replaced.
 */
export function saveReflection(path: PathId, kind: ReflectionKind, text: string, place: NotePlace = {}, now: Date = new Date()): Promise<void> {
  return db.transaction('rw', db.reflections, async () => {
    const at = now.toISOString()
    const day = dayKey(now)
    const body = text.trim()
    const same = (r: Reflection) =>
      r.kind === kind &&
      (kind !== 'decide' || r.step === place.step) &&
      ((kind !== 'values' && kind !== 'monthly') || r.part === place.part) &&
      (kind !== 'monthly' || r.day.slice(0, 7) === day.slice(0, 7))
    const existing = kind === 'reflection' ? undefined : await db.reflections.where('path').equals(path).filter(same).first()
    if (!body) {
      if (existing?.id !== undefined) await db.reflections.delete(existing.id)
      return
    }
    if (existing?.id !== undefined) await db.reflections.update(existing.id, { text: body, updatedAt: at, day })
    else await db.reflections.add({ path, kind, ...(place.step ? { step: place.step } : {}), ...(place.part ? { part: place.part } : {}), day, text: body, createdAt: at, updatedAt: at })
  })
}

/** Your own record before a decide-don't-slide note: shown read-only, as you wrote it, never summarised or counted. */
export interface DecideRecord {
  /** Your values note, part by part, and a note written before the parts, if there is one. */
  values: Reflection[]
  /** Your monthly reflections of the last three months, the newest month first, each month's parts in the order they are asked. */
  monthly: Reflection[]
  /** Your reflections of the last three months, newest first, the latest ten. */
  notes: Reflection[]
  /** Your notes before the other steps, newest first. */
  decided: Reflection[]
}

/** How far back the record before a decision reaches, in days. */
export const RECORD_DAYS = 92

/** Notes in the order their act asks its parts; a note written before there were parts comes first. */
export function byPart(parts: readonly string[]): (a: Reflection, b: Reflection) => number {
  return (a, b) => parts.indexOf(a.part ?? '') - parts.indexOf(b.part ?? '')
}

/** The record shown before the note for a step: chosen by kind and date alone, never by what it says. */
export function recordBeforeDeciding(all: readonly Reflection[], step: PartnerStep, today: string): DecideRecord {
  const since = addDays(today, -RECORD_DAYS)
  const newest = (a: Reflection, b: Reflection) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.updatedAt < b.updatedAt ? 1 : -1)
  const monthThenPart = (a: Reflection, b: Reflection) => (a.day.slice(0, 7) === b.day.slice(0, 7) ? byPart(MONTHLY_PARTS)(a, b) : a.day < b.day ? 1 : -1)
  return {
    values: all.filter((r) => r.kind === 'values').sort(byPart(VALUES_PARTS)),
    monthly: all.filter((r) => r.kind === 'monthly' && r.day >= since).sort(monthThenPart),
    notes: all.filter((r) => r.kind === 'reflection' && r.day >= since).sort(newest).slice(0, 10),
    decided: all.filter((r) => r.kind === 'decide' && r.step !== step).sort(newest),
  }
}

export async function deleteReflection(id: number): Promise<void> {
  await db.reflections.delete(id)
}

/** This month's check, if you answered it. */
export function checkThisMonth(checks: readonly MonthlyCheck[], today: string): MonthlyCheck | null {
  return checks.find((c) => c.month === today.slice(0, 7)) ?? null
}

/** The check's answers, in the order of its questions. */
export const CHECK_KEYS = ['safety', 'conduct', 'doubt'] as const

/**
 * Whether the check shows its fixed help: a yes to a question the content marks (`helpOnYes`),
 * and on no other answer. The app decides it alone; no model writes, softens or decides it.
 */
export function checkShowsHelp(answers: MonthlyCheck['answers']): boolean {
  const questions = pathById('partner').acts?.find((a) => a.id === 'monthly-check')?.questions ?? []
  return CHECK_KEYS.some((k, i) => answers[k] === true && questions[i]?.helpOnYes === true)
}

/**
 * The stage from which one of the Partner path's notes or checks is yours, as the catalogue places
 * it: the values note from the start; a note before each step, the monthly reflection and the
 * monthly check from Dating (owner, 2026-09-23). Each stays through every later stage.
 */
export function actOpensAt(id: string): number {
  return pathById('partner').acts?.find((a) => a.id === id)?.stage ?? Number.POSITIVE_INFINITY
}

/**
 * Whether the Partner card says this month's check is open: from Dating on, not yet answered this
 * month, and never on a day the record reads high stress or overwhelm, when no evaluative prompt is
 * shown. The check itself stays on its screen, with its help, whatever the day.
 */
export function checkPromptShown(stage: number, lightOnly: boolean, checks: readonly MonthlyCheck[], today: string): boolean {
  return stage >= actOpensAt('monthly-check') && !lightOnly && checkThisMonth(checks, today) === null
}

/**
 * Whether the Partner card says this month's reflection is open: from the stage it opens at, none
 * of it written this month, and never on a hard day, when no evaluative prompt is shown.
 */
export function reflectionPromptShown(stage: number, lightOnly: boolean, notes: readonly Reflection[], today: string): boolean {
  return stage >= actOpensAt('monthly-reflection') && !lightOnly && !notes.some((r) => r.kind === 'monthly' && r.day.slice(0, 7) === today.slice(0, 7))
}

export function monthlyChecks(): Promise<MonthlyCheck[]> {
  return db.monthlyChecks.toArray()
}

/** The monthly check, answered: this month's record, answered again in place. */
export function saveMonthlyCheck(answers: MonthlyCheck['answers'], now: Date = new Date()): Promise<void> {
  return db.transaction('rw', db.monthlyChecks, async () => {
    const day = dayKey(now)
    const month = day.slice(0, 7)
    const existing = await db.monthlyChecks.where('month').equals(month).first()
    if (existing?.id !== undefined) await db.monthlyChecks.update(existing.id, { answers, day, at: now.toISOString() })
    else await db.monthlyChecks.add({ month, day, answers, at: now.toISOString() })
  })
}
