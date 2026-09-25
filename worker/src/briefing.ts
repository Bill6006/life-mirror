import { isLocationFact, isWriterModel, WRITER_MODELS, type WriterModel } from '../../src/brainShared'
import type { FirmnessPref } from '../../src/firmness'
import { isUsageFact } from '../../src/useShared'
import type { FactSheet, RankedLine } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import { addDays } from './time'

// The briefing (Part 28): the one module every writer's prompt is built from. No other path to a
// prompt exists. It holds the permission check every read passes, the task profiles, and the
// payloads, each named: `lineBriefing`, for the writer that describes the record (the free model
// chain now; Claude's line and review from Part 30), and the `coachBriefing` contract for Part 32.
//
// Order of authority, closed by default (section 0, item 6 of the execution plan): the governing
// rules, then the owner's switches, then the task's profile. A category no profile names is
// never read, an invented one included.

export type Task = 'line' | 'review' | 'coach' | 'skill' | 'progress'
export type Writer = 'free' | 'claude'

/**
 * The only values the writer-model setting may take (Part 30), in the order of its chips, starting
 * on Opus: the four the Agent tool's `model` parameter accepts, read from its own refusal in the
 * bridge proof (Part 29). `best` is not one.
 */
export { isWriterModel, WRITER_MODELS, type WriterModel }

/** The record's categories a task may read. Closed: a name outside this list is never read. */
export const CATEGORIES = [
  'factSheet',
  'dayRecord',
  'notes',
  'privateItems',
  'commitments',
  'socialPath',
  'partnerPath',
  'reflections',
  'monthlyCheck',
  'her',
  'faith',
  'brainHistory',
  'coachCore',
  'tier2',
  // Follow-up F1: how Life Mirror is used, as counts; and, for the weekly review alone, a short slice of its events in order.
  'usage',
  'usageEvents',
  // Part 43: where the day's parts were spent, as kinds of place, from the day's sheet.
  'location',
] as const
export type Category = (typeof CATEGORIES)[number]

/**
 * What each task names, per writer. The free chain reads the fact sheet alone, as its approval of
 * 2026-09-18 covers. Claude's lists are the contracts Parts 30 to 32 build to; nothing past the
 * fact sheet reaches Claude until the Rule 21 amendment names Anthropic.
 */
export const PROFILES: Readonly<Record<Task, Readonly<Record<Writer, readonly Category[]>>>> = {
  line: {
    free: ['factSheet'],
    claude: ['factSheet', 'dayRecord', 'notes', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'her', 'faith', 'brainHistory', 'tier2', 'usage', 'location'],
  },
  review: {
    free: ['factSheet'],
    claude: ['factSheet', 'dayRecord', 'notes', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'her', 'faith', 'brainHistory', 'tier2', 'usage', 'usageEvents', 'location'],
  },
  coach: {
    free: [],
    claude: ['coachCore', 'dayRecord', 'notes', 'privateItems', 'socialPath', 'partnerPath', 'reflections', 'monthlyCheck', 'faith', 'usage'],
  },
  // Parts 40 and 41: the skill coach reads one commitment whole (its words, skills, sessions with how they went, and what it proposed before with your decisions), the day's record for a physical skill's load, and your recent check-in notes. Nothing of the paths, people or faith practices.
  skill: { free: [], claude: ['commitments', 'dayRecord', 'notes'] },
  progress: { free: [], claude: ['commitments', 'dayRecord', 'notes'] },
}

/** The governing rules that sit above every switch. */
export interface Gates {
  /** Rule 10: the faith family is hidden. */
  faithHidden: boolean
  /** Rule 11: "Use private items to pick moves" is on. */
  privateInSelection: boolean
  /** The Rule 21 amendment names Anthropic (the owner's decision 6): until then Claude reads the fact sheet alone. */
  claudeMayRead: boolean
  /** Follow-up F1: Claude may be given how Life Mirror is used. Gated while the reliability monitoring runs; absent is closed. */
  usageOpen?: boolean
  /** Part 43: Claude may be given where the day's parts were spent. Gated while the reliability monitoring runs; absent is closed. */
  locationOpen?: boolean
}

export const CLOSED_GATES: Gates = { faithHidden: true, privateInSelection: false, claudeMayRead: false, usageOpen: false, locationOpen: false }

/** The owner's category switches (Settings → Brain, Part 30). Absent means on, once the gates allow it. */
export type Switches = Partial<Record<Category, boolean>>

/** The one permission check every read passes: the governing rules, then his switches, then the task's profile. */
export function permitted(task: Task, writer: Writer, category: string, gates: Gates, switches: Switches = {}): boolean {
  if (!(CATEGORIES as readonly string[]).includes(category)) return false
  const cat = category as Category
  // 1. The governing rules.
  if (cat === 'faith' && gates.faithHidden) return false
  if (cat === 'tier2' && task === 'coach') return false
  if (cat === 'privateItems' && task === 'coach' && !gates.privateInSelection) return false
  if (writer === 'free' && cat !== 'factSheet') return false
  if (writer === 'claude' && cat !== 'factSheet' && !gates.claudeMayRead) return false
  // Follow-up F1: how the app is used opens to Claude only when its gate does.
  if ((cat === 'usage' || cat === 'usageEvents') && gates.usageOpen !== true) return false
  // Part 43: and where the day was spent, only when its own gate does.
  if (cat === 'location' && gates.locationOpen !== true) return false
  // 2. His switches. One switch governs how the app is used, its counts and its events alike.
  if (switches[cat === 'usageEvents' ? 'usage' : cat] === false) return false
  // 3. The task's profile.
  return PROFILES[task][writer].includes(cat)
}

/** What was said on a recent day, by whom it was written aside, and how it landed. */
export interface Said {
  day: string
  text: string
  feedback: string | null
}

/**
 * A fact as the writer should read it when the sheet was built on another day than the one
 * written for (Part 19). Applied here and nowhere else, so no prompt can skip it.
 */
function relabel(f: FactSheet['facts'][number], sheet: FactSheet, forDay: string): string {
  if (forDay === sheet.day) return f.text
  if (f.id === 'week.today') return f.text.replace(/^Today is /, `The facts' own day, ${sheet.day}, was `)
  if (f.id === 'week.tomorrow') return f.text.replace(/^Tomorrow is /, `The day you are writing for, ${forDay}, is `)
  if (f.id.startsWith('today.')) return `On ${sheet.day}: ${f.text}`
  return f.text
}

/** The sheet as the writer reads it: a head naming both days when they differ, then every fact by id. */
export function sheetLines(sheet: FactSheet, forDay: string = sheet.day): string {
  const head =
    forDay === sheet.day
      ? [`Day ${sheet.day}; ${sheet.days} days of record; local hour ${sheet.hour}.`]
      : [
          `These facts were built on ${sheet.day} at local hour ${sheet.hour}; ${sheet.days} days of record.`,
          `You are writing for ${forDay}, the day after. Facts named week.today and today.* describe ${sheet.day}, not ${forDay}; the shape of ${forDay} is the fact week.tomorrow, and it alone says what that day holds.`,
        ]
  if (sheet.direction) head.push(`Direction, in the person's own words: ${sheet.direction}`)
  const lines = sheet.facts.map((f) => `[${f.id}] ${relabel(f, sheet, forDay)}${f.n !== undefined ? ` (n=${f.n})` : ''}`)
  return [...head, ...lines].join('\n')
}

/**
 * The sheet without how Life Mirror is used (Follow-up F1): what the free chain always reads, and
 * what Claude reads while that category's gate is closed, so its prompts stay as they were. The
 * phone's ranking never rests on a usage fact; one that did would go with it.
 */
export function withoutUsage(sheet: FactSheet): FactSheet {
  return without(sheet, isUsageFact)
}

/** The sheet without the facts `drop` names, and without any ranked line that rests on one. */
export function without(sheet: FactSheet, drop: (id: string) => boolean): FactSheet {
  if (!sheet.facts.some((f) => drop(f.id))) return sheet
  return { ...sheet, facts: sheet.facts.filter((f) => !drop(f.id)), ...(sheet.shortlist ? { shortlist: sheet.shortlist.filter((r) => !r.factIds.some(drop)) } : {}) }
}

/** What the free chain reads: the fact sheet approved on 2026-09-18, never how Life Mirror is used (F1) or where the day was spent (Part 43). */
export function forFreeChain(sheet: FactSheet): FactSheet {
  return without(sheet, (id) => isUsageFact(id) || isLocationFact(id))
}

/** The payload for the writer that describes the record: a decision core, plus (for Claude, from Part 30) permitted private context. */
export interface LineBriefing {
  task: 'line' | 'review'
  writer: Writer
  /** The day written for, and the day the facts describe. */
  forDay: string
  factsDay: string
  /** The target day's shape in words, from the sheet's own week fact for that day. */
  shape: string
  /** The sheet itself, for the validator: every number and id a line uses must be on it. */
  sheet: FactSheet
  /** The facts as the writer reads them, relabelled for the day written for. */
  facts: string
  /** The phone engine's true situations, best first. */
  shortlist: RankedLine[]
  cards: ClaimCard[]
  said: Said[]
  /** The routing field outside the facts (Part 30): an alias, never free text; null for the free chain. */
  writerModel: WriterModel | null
  /** Claude's private context from the retrieval layer (Part 30), as dated lines; empty for the free chain, which reads the fact sheet alone. */
  context: string
  /** How firm (Pass 2): the person's setting, only once its gate is open; absent while it is closed, and nothing about it is said or checked. */
  firm?: FirmnessPref
}

export interface LineBriefingInput {
  task: 'line' | 'review'
  writer: Writer
  sheet: FactSheet
  forDay: string
  cards: ClaimCard[]
  said: Said[]
  writerModel?: WriterModel | null
  gates?: Gates
  /** Claude's private context, read through the retrieval layer; refused for the free chain. */
  context?: string
  /** How firm (Pass 2), once its gate is open. */
  firm?: FirmnessPref | null
}

/**
 * The line briefing, or why none can be built. Refused when the sheet is neither the target day's
 * nor the day before it, when the sheet does not say what the target day holds, when the task may
 * not read the fact sheet, or when the writer model is not one of the four aliases.
 */
export function lineBriefing(i: LineBriefingInput): { ok: true; briefing: LineBriefing } | { ok: false; reason: string } {
  if (!permitted(i.task, i.writer, 'factSheet', i.gates ?? CLOSED_GATES)) return { ok: false, reason: `the ${i.task} task may not read the fact sheet for the ${i.writer} writer` }
  const model = i.writerModel ?? null
  if (model !== null && !isWriterModel(model)) return { ok: false, reason: `writer model "${String(model)}" is not one of ${WRITER_MODELS.join(', ')}` }
  const sheetDay = i.sheet.day
  let shape: string | undefined
  if (i.forDay === sheetDay) shape = i.sheet.facts.find((f) => f.id === 'week.today')?.text
  else if (i.forDay === addDays(sheetDay, 1)) {
    const tomorrow = i.sheet.facts.find((f) => f.id === 'week.tomorrow')
    shape = tomorrow ? relabel(tomorrow, i.sheet, i.forDay) : undefined
  } else return { ok: false, reason: `the sheet is for ${sheetDay}, not ${i.forDay} or the day before it` }
  if (!shape) return { ok: false, reason: `the sheet for ${sheetDay} does not say what ${i.forDay} holds` }
  if (i.writer === 'free' && i.context) return { ok: false, reason: 'the free chain reads the fact sheet alone' }
  // Follow-up F1: usage facts reach Claude alone, only through an open gate; the retrieval layer has already applied the switch and the task's relevance.
  const claude = i.writer === 'claude'
  const sheet = without(i.sheet, (id) => (isUsageFact(id) && !(claude && i.gates?.usageOpen === true)) || (isLocationFact(id) && !(claude && i.gates?.locationOpen === true)))
  return {
    ok: true,
    briefing: {
      task: i.task,
      writer: i.writer,
      forDay: i.forDay,
      factsDay: sheetDay,
      shape,
      sheet,
      facts: sheetLines(sheet, i.forDay),
      shortlist: sheet.shortlist ?? [],
      cards: i.cards,
      said: i.said,
      writerModel: model,
      context: i.context ?? '',
      ...(i.firm ? { firm: i.firm } : {}),
    },
  }
}

/**
 * The coach's decision core (Part 32), built by allowlist from the facts row's coach block, which
 * the path module writes (Parts 24 and 27): exactly these keys and nothing else, so tier 2 and
 * anything unnamed can never reach it. `row` is the People row's own path and candidates.
 */
export const COACH_CORE_KEYS = ['eligible', 'ineligibleReason', 'day', 'block', 'shape', 'stages', 'dateDay', 'perRep', 'row', 'requiresGoingOut'] as const
export type CoachCoreKey = (typeof COACH_CORE_KEYS)[number]

/** The decision core, as the coach may read it: the coach block's named keys and nothing else. */
export function coachCore(block: unknown): Partial<Record<CoachCoreKey, unknown>> {
  const b = block && typeof block === 'object' ? (block as Record<string, unknown>) : {}
  const core: Partial<Record<CoachCoreKey, unknown>> = {}
  for (const k of COACH_CORE_KEYS) if (k in b) core[k] = b[k]
  return core
}

export interface CoachBriefing {
  task: 'coach'
  writer: 'claude'
  forDay: string
  /** The decision core, allowlisted: tier-1 eligibility, the day's context, per-rep evidence. */
  core: Partial<Record<CoachCoreKey, unknown>>
  /** Private context from the retrieval layer under the coach task's profile (Part 30). */
  context: Record<string, unknown>
  writerModel: WriterModel
}
