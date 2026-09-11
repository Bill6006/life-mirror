import type { Effort, Move } from './catalogue'
import { copy } from './copy'
import type { RungMark, Skill } from './db'

// The proof ladder for the certification: each skill climbs watched or read → practiced →
// built once → broke and fixed → explained from memory → resume bullet. Counts only, never a
// proportion, and a skill moves only by your tap. The skills themselves are typed once on the
// phone, never shipped as content, so nothing about the certification enters the repository.

/** One sitting: a thing to start now, sized to one sitting. A catalogue move, or a rung of the ladder. */
export interface Sitting {
  id: string
  name: string
  what: string
  minutes: number
  effort: Effort
  kind: 'move' | 'rung'
}

export const TOP_RUNG = 6

/** Minutes for the step that proves each rung, indexed by rung 1 to 6; one sitting each. */
export const RUNG_MINUTES: readonly number[] = [0, 20, 25, 25, 25, 10, 5]

export function sittingOf(move: Move): Sitting {
  return { id: move.id, name: move.name, what: move.what, minutes: move.minutes, effort: move.effort, kind: 'move' }
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

export function rungName(rung: number): string {
  return copy.ladder.rungs[Math.max(0, Math.min(TOP_RUNG, rung))]
}

/** The step that proves a skill's next rung, sized to one sitting. */
export function rungStep(skill: Skill, rung: number): Sitting {
  const r = Math.max(1, Math.min(TOP_RUNG, rung))
  return {
    id: rungId(skill.id as number, r),
    name: `${skill.name} · ${copy.ladder.steps[r - 1]}`,
    what: copy.ladder.what[r - 1],
    minutes: RUNG_MINUTES[r],
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

/** How many skills stand on each rung, 0 to 6. Counts only. */
export function ladderCounts(skills: readonly Skill[], marks: readonly RungMark[]): number[] {
  const counts = Array.from({ length: TOP_RUNG + 1 }, () => 0)
  for (const s of liveSkillsOf(skills)) counts[currentRung(marks, s.id as number)]++
  return counts
}

/** The smaller sitting of a rung's step: the same proof in fewer minutes, never an easier rung. Null under five minutes. */
export function smallerRung(s: Sitting): Sitting | null {
  if (s.kind !== 'rung') return null
  const minutes = s.minutes >= 20 ? 10 : s.minutes >= 10 ? 5 : 0
  return minutes ? { ...s, minutes } : null
}
