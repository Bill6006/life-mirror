import data from './her.json'

// Phase F: her skills, from the CDC "Learn the Signs. Act Early." checklists for 4 and 5 years,
// and the moments with her. Counts only, on a ladder of five rungs that moves by your tap alone.
// Nothing here computes a percentage, a proportion, a grade or a comparison, and nothing ever will.

export type HerArea = 'social' | 'language' | 'thinking' | 'movement'

export interface HerSkillDef {
  id: string
  age: 4 | 5
  area: HerArea
  name: string
  /** The checklist's own example, when it gives one. */
  example: string | null
}

export interface HerAreaDef {
  id: HerArea
  name: string
}

export const HER_SOURCE: { who: string; what: string; year: number } = data.source
export const HER_AREAS: readonly HerAreaDef[] = data.areas as HerAreaDef[]
export const HER_SKILLS: readonly HerSkillDef[] = data.skills as HerSkillDef[]

/** The ladder: not introduced → practicing with Daddy → needs support → doing sometimes → doing often. */
export const HER_RUNGS = ['notIntroduced', 'practicingWithDaddy', 'needsSupport', 'doingSometimes', 'doingOften'] as const
export type HerRung = (typeof HER_RUNGS)[number]

/** How much help she needed when she did it. */
export const HELP_LEVELS = ['own', 'some', 'lots'] as const
export type HelpLevel = (typeof HELP_LEVELS)[number]

/** A moment with her, dated: on its own, or one skill she did and how much help she needed. */
export interface MomentLike {
  day: string
  skillId: string | null
  help: HelpLevel | null
}

export function herSkillById(id: string): HerSkillDef | null {
  return HER_SKILLS.find((s) => s.id === id) ?? null
}

export function herSkillsInArea(area: HerArea): HerSkillDef[] {
  return HER_SKILLS.filter((s) => s.area === area)
}

/** The list's own order, so the skills you watch read in the order the checklists give them. */
export function herSkillOrder(id: string): number {
  const at = HER_SKILLS.findIndex((s) => s.id === id)
  return at === -1 ? HER_SKILLS.length : at
}

export function rungIndex(rung: HerRung): number {
  return HER_RUNGS.indexOf(rung)
}

export interface SkillCounts {
  /** Times she did it, across the help levels. */
  did: number
  own: number
  some: number
  lots: number
  first: string | null
  last: string | null
}

/** Plain counts for one skill: what she did and how much help she needed. Never a share of anything. */
export function skillCounts(moments: readonly MomentLike[], skillId: string): SkillCounts {
  const c: SkillCounts = { did: 0, own: 0, some: 0, lots: 0, first: null, last: null }
  for (const m of moments) {
    if (m.skillId !== skillId) continue
    c.did++
    if (m.help === 'own') c.own++
    else if (m.help === 'some') c.some++
    else if (m.help === 'lots') c.lots++
    if (c.first === null || m.day < c.first) c.first = m.day
    if (c.last === null || m.day > c.last) c.last = m.day
  }
  return c
}

export interface MomentSummary {
  /** Every moment counted, with or without a skill. */
  n: number
  first: string | null
  last: string | null
}

/** The dated count of moments with her. */
export function momentSummary(moments: readonly MomentLike[]): MomentSummary {
  const s: MomentSummary = { n: 0, first: null, last: null }
  for (const m of moments) {
    s.n++
    if (s.first === null || m.day < s.first) s.first = m.day
    if (s.last === null || m.day > s.last) s.last = m.day
  }
  return s
}
