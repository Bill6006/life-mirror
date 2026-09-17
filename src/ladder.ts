import type { Effort, Move } from './catalogue'
import { copy } from './copy'
import type { LadderKind, RungMark, Skill } from './db'

// The proof ladder for the certification: each skill climbs watched or read → practiced →
// built once → broke and fixed → explained from memory → resume bullet. Counts only, never a
// proportion, and a skill moves only by your tap. The skills themselves are typed once on the
// phone, never shipped as content, so nothing about the certification enters the repository.

/** One sitting: a thing to start now, sized to one sitting. A catalogue move, or a rung of the ladder. */
export interface Sitting {
  id: string
  name: string
  /** The name without its subject, for a card that says the subject elsewhere. */
  title: string
  /** The subject the step belongs to, when its skill has one. */
  subject?: string
  what: string
  minutes: number
  effort: Effort
  kind: 'move' | 'rung'
}

export const TOP_RUNG = 6

/** Minutes for the step that proves each rung, indexed by rung 1 to 6; one sitting each. */
export const RUNG_MINUTES: readonly number[] = [0, 20, 25, 25, 25, 10, 5]
/** A word or a rule climbs in shorter sittings. */
export const LANGUAGE_RUNG_MINUTES: readonly number[] = [0, 10, 10, 10, 10, 10, 10]

/** The ladder a skill climbs; older skills, and those without a subject, climb the technical one. */
export function ladderOf(skill: Pick<Skill, 'ladder'>): LadderKind {
  return skill.ladder ?? 'technical'
}

function wording(kind: LadderKind): { rungs: readonly string[]; steps: readonly string[]; what: readonly string[] } {
  return kind === 'language' ? copy.ladder.language : copy.ladder
}

export function sittingOf(move: Move): Sitting {
  return { id: move.id, name: move.name, title: move.name, what: move.what, minutes: move.minutes, effort: move.effort, kind: 'move' }
}

export function rungId(skillId: number, rung: number): string {
  return `rung:${skillId}:${rung}`
}

export function parseRungId(id: string): { skillId: number; rung: number } | null {
  const m = /^rung:(\d+):([1-6])$/.exec(id)
  return m ? { skillId: Number(m[1]), rung: Number(m[2]) } : null
}

function later(a: RungMark, b: RungMark | null): boolean {
  if (!b) return true
  if (a.at !== b.at) return a.at > b.at
  return (a.id ?? 0) > (b.id ?? 0)
}

function latestMark(marks: readonly RungMark[], skillId: number): RungMark | null {
  let latest: RungMark | null = null
  for (const m of marks) if (m.skillId === skillId && later(m, latest)) latest = m
  return latest
}

/** The rung a skill stands on: its latest mark, or 0 before any. A later mark can be lower; that is a correction, recorded. */
export function currentRung(marks: readonly RungMark[], skillId: number): number {
  return latestMark(marks, skillId)?.rung ?? 0
}

export function rungName(rung: number, kind: LadderKind = 'technical'): string {
  return wording(kind).rungs[Math.max(0, Math.min(TOP_RUNG, rung))]
}

/** The step that proves a skill's next rung, sized to one sitting. */
export function rungStep(skill: Skill, rung: number): Sitting {
  const r = Math.max(1, Math.min(TOP_RUNG, rung))
  const subject = skill.subject?.trim()
  const kind = ladderOf(skill)
  const words = wording(kind)
  const title = `${skill.name} · ${words.steps[r - 1]}`
  return {
    id: rungId(skill.id as number, r),
    name: subject ? `${subject} · ${title}` : title,
    title,
    ...(subject ? { subject } : {}),
    what: words.what[r - 1],
    minutes: (kind === 'language' ? LANGUAGE_RUNG_MINUTES : RUNG_MINUTES)[r],
    effort: r === 3 || r === 4 ? 'medium' : 'low',
    kind: 'rung',
  }
}

export function liveSkillsOf(skills: readonly Skill[]): Skill[] {
  return skills.filter((s) => s.archivedAt === null).sort((a, b) => a.order - b.order)
}

/**
 * Where the ladder's next step is. Returning beats starting something new: the skill you moved
 * most recently that is not yet at the top; before any mark, the first skill in your order.
 */
export function nextStep(skills: readonly Skill[], marks: readonly RungMark[]): { skill: Skill; rung: number } | null {
  const live = liveSkillsOf(skills)
  let pick: Skill | null = null
  let pickAt = ''
  for (const s of live) {
    if (currentRung(marks, s.id as number) >= TOP_RUNG) continue
    const at = latestMark(marks, s.id as number)?.at ?? ''
    if (at && at > pickAt) {
      pick = s
      pickAt = at
    }
  }
  if (!pick) pick = live.find((s) => currentRung(marks, s.id as number) < TOP_RUNG) ?? null
  if (!pick) return null
  return { skill: pick, rung: currentRung(marks, pick.id as number) + 1 }
}

/** Skills by subject: the ones without a subject first, then each subject in the order it was first typed, skills in your order within each. */
export function groupBySubject(skills: readonly Skill[]): { subject: string | null; kind: LadderKind; skills: Skill[] }[] {
  const groups = new Map<string | null, Skill[]>()
  for (const s of liveSkillsOf(skills)) {
    const key = s.subject?.trim() ? s.subject.trim() : null
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const out = [...groups.entries()].map(([subject, list]) => ({ subject, kind: ladderOf(list[0]), skills: list }))
  return out.sort((a, b) => (a.subject === null ? -1 : b.subject === null ? 1 : 0))
}

/** How many skills stand on each rung, 0 to 6, on one ladder or on both. Counts only. */
export function ladderCounts(skills: readonly Skill[], marks: readonly RungMark[], kind?: LadderKind): number[] {
  const counts = Array.from({ length: TOP_RUNG + 1 }, () => 0)
  for (const s of liveSkillsOf(skills)) if (kind === undefined || ladderOf(s) === kind) counts[currentRung(marks, s.id as number)]++
  return counts
}

/** The smaller sitting of a rung's step: the same proof in fewer minutes, never an easier rung. Null under five minutes. */
export function smallerRung(s: Sitting): Sitting | null {
  if (s.kind !== 'rung') return null
  const minutes = s.minutes >= 20 ? 10 : s.minutes >= 10 ? 5 : 0
  return minutes ? { ...s, minutes } : null
}
