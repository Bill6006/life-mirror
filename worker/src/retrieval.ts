import type { BrainPrefsBody } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import { readingById } from '../../src/readings'
import { CATEGORIES, permitted, type Category, type Gates } from './briefing'
import { addDays } from './time'
import type { ReadRow, RecordRow, Store } from './turso'

// The private retrieval layer (Part 30; Rule 21 as amended 2026-09-23): the only path from the
// record to Claude. Every read passes one check, `permitted`, in order: the governing rules, the
// owner's switches in Settings → Brain, then the task's profile. The record is rendered as short
// dated lines, never handed over as a raw row or table. Every read is logged by task, category,
// count and size, never content. There is no person to query by, so no request can gather
// several people.

export type ReadTask = 'line' | 'review'

/** A line of the record as Claude reads it: its day, and the words. */
export interface Item {
  day: string | null
  text: string
}

/** What the catalogue says about a move: enough to name a rep and to know faith's. */
export interface MoveInfo {
  name: string
  family: string
  hiddenWith?: string
}
export type Catalogue = ReadonlyMap<string, MoveInfo>

/** The catalogue as the app ships it, from the public repository, like the library. */
export async function loadCatalogue(url: string, fetcher: typeof fetch = fetch): Promise<Catalogue> {
  const r = await fetcher(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`catalogue: ${r.status}`)
  const data = (await r.json()) as { moves?: { id: string; name: string; family: string; hiddenWith?: string }[] }
  return new Map((data.moves ?? []).map((m) => [m.id, { name: m.name, family: m.family, ...(m.hiddenWith ? { hiddenWith: m.hiddenWith } : {}) }]))
}

/**
 * Words that make a line of free text about faith (Rule 10). While faith may not be read, a note
 * or reflection holding one is left out whole: the owner's own words are never rewritten.
 */
export const FAITH_WORDS = /\b(faith|church|god|pray(?:s|ed|ing|er|ers)?|bible|scripture|worship|sermon|jesus|christ|lord|spiritual|devotions?|devotional|congregation|ministry|pastor)\b/i

/**
 * The governing rules as the owner's own settings row states them; with no settings row, closed.
 * Rule 21's amendment names Anthropic (2026-09-23), so Claude may read what the rest allows.
 */
export function gatesFrom(settings: unknown): Gates {
  if (!settings || typeof settings !== 'object') return { faithHidden: true, privateInSelection: false, claudeMayRead: true }
  const s = settings as Record<string, unknown>
  return { faithHidden: s.hideFaith === true, privateInSelection: s.privateInSelection === true, claudeMayRead: true }
}

/** What one Claude task may read: the one check, fixed for the run. */
export interface Access {
  task: ReadTask
  gates: Gates
  prefs: BrainPrefsBody
  allowed(c: Category): boolean
}

export function accessFor(task: ReadTask, gates: Gates, prefs: BrainPrefsBody): Access {
  return { task, gates, prefs, allowed: (c) => permitted(task, 'claude', c, gates, prefs.switches) }
}

/**
 * The categories a fact on the sheet belongs to: all of them must be readable for Claude to see
 * it. The day's shape and the sheet's frame belong to the sheet itself; everything drawn from the
 * record belongs to what it was drawn from.
 */
export function factCategories(f: Fact, pathOfAim: ReadonlyMap<string, string>): Category[] {
  const [head, rest] = [f.id.split('.')[0], f.id.split('.')[1]]
  const own: Category[] =
    head === 'note'
      ? ['notes']
      : head === 'private'
        ? ['privateItems']
        : head === 'path'
          ? [f.values.path === 'partner' ? 'partnerPath' : 'socialPath']
          : head === 'partner'
            ? ['partnerPath']
            : head === 'aim' || head === 'trajectory'
              ? [pathOfAim.get(rest) === 'partner' ? 'partnerPath' : pathOfAim.get(rest) === 'social' ? 'socialPath' : 'commitments']
              : f.id === 'study.nights'
                ? ['commitments']
                : f.id === 'followup'
                  ? ['brainHistory']
                  : f.id === 'becoming'
                    ? ['commitments', 'faith', 'her']
                    : f.id === 'people.seen'
                      ? ['tier2']
                      : head === 'week' || f.id === 'direction' || f.id === 'record' || f.id === 'untested' || head === 'test'
                        ? ['factSheet']
                        : ['dayRecord']
  return f.tags.includes('faith') && !own.includes('faith') ? [...own, 'faith'] : own
}

/**
 * The sheet as Claude may read it: each fact whose categories are all readable, a note about faith
 * only while faith is, the brain's own past lines only while its history is, and the phone's
 * ranking only where every fact it cites stayed. The validator then holds a line to this sheet,
 * so Claude can cite only what it was given.
 */
export function sheetForClaude(sheet: FactSheet, a: Access): FactSheet {
  const pathOfAim = new Map(sheet.facts.filter((f) => f.id.startsWith('path.')).map((f) => [f.id.slice(5), String(f.values.path ?? '')]))
  const faith = a.allowed('faith')
  const facts = sheet.facts.filter((f) => factCategories(f, pathOfAim).every((c) => a.allowed(c)) && (faith || !(f.id.startsWith('note.') && FAITH_WORDS.test(f.text))))
  const kept = new Set(facts.map((f) => f.id))
  return {
    ...sheet,
    facts,
    said: a.allowed('brainHistory') ? sheet.said : [],
    shortlist: (sheet.shortlist ?? []).filter((r) => r.factIds.every((id) => kept.has(id))),
  }
}

/** A query of the record: a date range, and optionally a path, a stage, a keyword and whether only acts done count. */
export interface Query {
  from: string
  to: string
  path?: 'social' | 'partner'
  stage?: number
  q?: string
  limit: number
  /** Only acts done or partly done: how the review reads the Partner path (Part 31), never a shortfall. */
  doneOnly?: boolean
}

interface Ctx {
  store: Store
  catalogue: Catalogue
  a: Access
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const CUES: Record<string, string> = { afterPickup: 'after pickup', afterBedtime: 'after her bedtime', nextCheckIn: 'at the next check-in' }
const OUTCOMES: Record<string, string> = { done: 'done', partly: 'partly done', no: 'not done' }
const STEPS: Record<string, string> = { exclusive: 'becoming exclusive', families: 'meeting each other’s families', child: 'introducing them to your child', movingIn: 'moving in', engagement: 'an engagement' }
const PARTS: Record<string, string> = { nonNegotiables: 'a few true non-negotiables', preferences: 'preferences, held loosely', partnerIWantToBe: 'the partner you want to be', understood: 'a moment you felt understood or appreciated, or didn’t', disagreement: 'your last disagreement, and how it ended', ownPart: 'your own part, and whether it feels chosen by both of you' }
const EXTRAS: Record<string, string> = { dinner: 'a late or heavy dinner', napped: 'a nap', coolingOff: 'something rattled you', bigSocial: 'a big social event', nothingLanded: 'nothing landed', hardToSeePoint: 'hard to see the point', heavyCaffeine: 'heavy caffeine' }
/** The four caffeine bands of the extras item (Part 21), by their stored number. */
const CAFFEINE: Record<number, string> = { 1: 'under 100 mg', 2: '100 to 199 mg', 3: '200 to 299 mg', 4: '300 mg or more' }

function isFaithMove(c: Catalogue, moveId: string): boolean {
  const m = c.get(moveId)
  return m !== undefined && (m.family === 'faith' || m.hiddenWith === 'faith')
}

const nameOf = (c: Catalogue, moveId: string) => c.get(moveId)?.name ?? moveId

/** Check-ins in the range, for notes and the day's record. */
async function checkins(x: Ctx, q: Query): Promise<RecordRow[]> {
  return x.store.readRecords('checkins', { from: q.from, to: q.to })
}

/** A path's own category, so a reflection or a mark is read only when its path is. */
const pathCategory = (path: string): Category => (path === 'partner' ? 'partnerPath' : 'socialPath')

/** Offers on a path in the range, each with its answer, faith's left out unless faith may be read. */
async function pathReps(x: Ctx, q: Query, path: 'social' | 'partner'): Promise<Item[]> {
  const [offers, outcomes] = await Promise.all([x.store.readRecords('offers', { from: q.from, to: q.to }), x.store.readRecords('outcomes', { from: q.from, to: q.to })])
  const answer = new Map<number, string>()
  for (const o of outcomes) {
    const b = obj(o.body)
    if (typeof b.offerId === 'number' && typeof b.outcome === 'string') answer.set(b.offerId, b.outcome)
  }
  const out: Item[] = []
  for (const o of offers) {
    const b = obj(o.body)
    const paths = Array.isArray(b.paths) ? b.paths : []
    if (!paths.includes(path)) continue
    const moveId = str(b.moveId)
    if (isFaithMove(x.catalogue, moveId) && !x.a.allowed('faith')) continue
    if (q.stage !== undefined && b.stage !== q.stage) continue
    const said = typeof b.id === 'number' ? answer.get(b.id) : undefined
    if (q.doneOnly && said !== 'done' && said !== 'partly') continue
    if (b.skippedAt) continue
    out.push({ day: o.day, text: `${nameOf(x.catalogue, moveId)}${said ? `, ${OUTCOMES[said] ?? said}` : ', not answered yet'}${b.chosenBy === 'you' ? ' (your pick)' : ''}` })
  }
  return out
}

/** A path's own declarations: stages declared, dates by their day, milestones with their details. */
async function pathMarks(x: Ctx, q: Query, path: 'social' | 'partner'): Promise<Item[]> {
  const rows = await x.store.readRecords('pathMarks', { from: q.from, to: q.to })
  const out: Item[] = []
  for (const r of rows) {
    const b = obj(r.body)
    if (b.path !== path) continue
    if (b.kind === 'stage') out.push({ day: r.day, text: `declared stage ${String(b.stage)}` })
    else if (b.kind === 'date') out.push({ day: r.day, text: 'a date, declared for this day' })
    else if (b.kind === 'milestone') out.push({ day: r.day, text: `a milestone: ${str(b.note)}` })
  }
  return out
}

/** Every category that has a reader. The others (the fact sheet, which the briefing carries, the monthly check, the coach's core, tier 2) are never served here. */
export const READABLE: readonly Category[] = ['dayRecord', 'notes', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'her', 'faith', 'brainHistory']

/** One category's lines for a query, newest first, or null when it has no reader. The caller has already passed the check. */
export async function readCategory(x: Ctx, category: Category, q: Query): Promise<Item[] | null> {
  const faith = x.a.allowed('faith')
  let items: Item[]
  switch (category) {
    case 'notes': {
      items = (await checkins(x, q))
        .map((r) => {
          const b = obj(r.body)
          const note = str(obj(b.extras).note).trim()
          return note ? { day: r.day, text: `at the ${str(b.block)} check-in you wrote: “${note}”` } : null
        })
        .filter((i): i is Item => i !== null && (faith || !FAITH_WORDS.test(i.text)))
      break
    }
    case 'dayRecord': {
      const [cs, days] = await Promise.all([checkins(x, q), x.store.readRecords('days', { from: q.from, to: q.to })])
      items = []
      for (const d of days) {
        const b = obj(d.body)
        const parts = [b.atOffice ? 'at the office' : 'at home', b.pickupTime ? `a daycare day, pickup at ${str(b.pickupTime)}` : null, b.churchDay ? 'a church day' : null, b.studyNight ? 'a study night' : null, b.withHer === false ? 'she was away' : null].filter(Boolean)
        items.push({ day: d.day, text: `the day: ${parts.join('; ')}` })
      }
      for (const c of cs) {
        const b = obj(c.body)
        const answers = obj(b.answers)
        const readings = Object.entries(answers)
          .map(([id, pos]) => {
            try {
              const r = readingById(id)
              return typeof pos === 'number' ? `${r.name.toLowerCase()} “${r.anchors[pos - 1] ?? pos}”` : null
            } catch {
              return null
            }
          })
          .filter(Boolean)
        const ex = obj(b.extras)
        const extras = Object.keys(EXTRAS)
          .filter((k) => ex[k] === true)
          .map((k) => EXTRAS[k])
        const band = obj(ex.caffeineIntake).band
        if (typeof band === 'number' && CAFFEINE[band]) extras.push(`caffeine ${CAFFEINE[band]}`)
        if (ex.closeToGod === true && faith) extras.push('felt close to God')
        items.push({ day: c.day, text: `the ${str(b.block)} check-in: ${readings.join(', ') || 'no readings'}${extras.length ? `; also ${extras.join(', ')}` : ''}` })
      }
      break
    }
    case 'privateItems': {
      items = (await x.store.readRecords('privateItems'))
        .map((r) => obj(r.body))
        .filter((b) => b.archived !== 1 && str(b.name))
        .map((b) => ({ day: null, text: `a private item: ${str(b.name)}` }))
      break
    }
    case 'commitments': {
      const [aims, plans] = await Promise.all([x.store.readRecords('aims'), x.store.readRecords('intentions', { from: q.from, to: q.to })])
      const faithAim = new Set<number>()
      items = []
      for (const r of aims) {
        const b = obj(r.body)
        if (b.kind === 'path' || b.archivedAt) continue
        const move = str(b.stepMoveId)
        if (move && isFaithMove(x.catalogue, move)) {
          if (typeof b.id === 'number') faithAim.add(b.id)
          if (!faith) continue
        }
        items.push({ day: null, text: `a commitment: ${str(b.name) || nameOf(x.catalogue, move)} (${str(b.kind)})` })
      }
      for (const r of plans) {
        const b = obj(r.body)
        if (typeof b.aimId === 'number' && faithAim.has(b.aimId) && !faith) continue
        items.push({ day: r.day, text: `planned ${str(b.step) || 'a step'} ${CUES[str(b.cue)] ?? str(b.cue)} at ${str(b.time)}${b.offerId !== null && b.offerId !== undefined ? ', started' : ''}` })
      }
      break
    }
    case 'socialPath':
    case 'partnerPath': {
      const path = category === 'partnerPath' ? 'partner' : 'social'
      if (q.path && q.path !== path) return []
      const [reps, marks] = await Promise.all([pathReps(x, q, path), pathMarks(x, q, path)])
      items = [...marks, ...reps]
      break
    }
    case 'reflections': {
      const rows = await x.store.readRecords('reflections', { from: q.from, to: q.to })
      items = []
      for (const r of rows) {
        const b = obj(r.body)
        const path = str(b.path)
        if (q.path && path !== q.path) continue
        // A reflection is on a path: read only while that path may be.
        if (!x.a.allowed(pathCategory(path))) continue
        const text = str(b.text).trim()
        if (!text || (!faith && FAITH_WORDS.test(text))) continue
        const kind = str(b.kind)
        const label = kind === 'values' ? `your values, ${PARTS[str(b.part)] ?? 'a note'}` : kind === 'decide' ? `a note before ${STEPS[str(b.step)] ?? 'a step'}` : kind === 'monthly' ? `the monthly reflection, ${PARTS[str(b.part)] ?? 'a part'}` : 'a note you kept'
        items.push({ day: r.day, text: `${label}: “${text}”` })
      }
      break
    }
    case 'her': {
      const rows = await x.store.readRecords('moments', { from: q.from, to: q.to })
      const perDay = new Map<string, number>()
      for (const r of rows) if (r.day) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1)
      items = [...perDay.entries()].map(([day, n]) => ({ day, text: `${n} ${n === 1 ? 'moment' : 'moments'} of her skills counted` }))
      break
    }
    case 'faith': {
      const [offers, outcomes] = await Promise.all([x.store.readRecords('offers', { from: q.from, to: q.to }), x.store.readRecords('outcomes', { from: q.from, to: q.to })])
      const answer = new Map<number, string>()
      for (const o of outcomes) {
        const b = obj(o.body)
        if (typeof b.offerId === 'number' && typeof b.outcome === 'string') answer.set(b.offerId, b.outcome)
      }
      items = offers
        .map((o) => ({ o, b: obj(o.body) }))
        .filter(({ b }) => isFaithMove(x.catalogue, str(b.moveId)) && !b.skippedAt)
        .map(({ o, b }) => {
          const said = typeof b.id === 'number' ? answer.get(b.id) : undefined
          return { day: o.day, text: `${nameOf(x.catalogue, str(b.moveId))}${said ? `, ${OUTCOMES[said] ?? said}` : ''}` }
        })
      break
    }
    case 'brainHistory': {
      const [log, feedback] = await Promise.all([x.store.readRecords('briefLog', { from: q.from, to: q.to }), x.store.readRecords('briefFeedback', { from: q.from, to: q.to })])
      const landed = new Map<string, string>()
      for (const f of feedback) {
        const b = obj(f.body)
        if (typeof b.briefKey === 'string' && typeof b.answer === 'string') landed.set(b.briefKey, b.answer)
      }
      const worker = (await x.store.readBriefs(60)).filter((b) => b.kind === 'brief' && b.day >= q.from && b.day <= q.to)
      items = [
        ...worker.map((b) => ({ day: b.day, text: `the line said “${b.text}”${landed.get(`worker:${b.id}`) ? ` (${landed.get(`worker:${b.id}`)})` : ''}` })),
        ...log
          .map((r) => ({ r, b: obj(r.body) }))
          .filter(({ b }) => str(b.text) && !b.withdrawnAt)
          .map(({ r, b }) => ({ day: r.day, text: `the phone said “${str(b.text)}”${landed.get(`phone:${r.day}:${String(b.id)}`) ? ` (${landed.get(`phone:${r.day}:${String(b.id)}`)})` : ''}` })),
      ]
      break
    }
    default:
      return null
  }
  const needle = q.q?.trim().toLowerCase()
  return items
    .filter((i) => !needle || i.text.toLowerCase().includes(needle))
    .sort((a, b) => ((a.day ?? '') < (b.day ?? '') ? 1 : (a.day ?? '') > (b.day ?? '') ? -1 : 0))
    .slice(0, q.limit)
}

const enc = new TextEncoder()
export const bytesOf = (s: string): number => enc.encode(s).length

/** Items as the writer reads them: one dated line each. */
export function itemLines(items: readonly Item[]): string {
  return items.map((i) => `- ${i.day ? `${i.day}: ` : ''}${i.text}`).join('\n')
}

/** Logs one read, never its content. */
async function logRead(store: Store, run: string, seq: number, task: ReadTask, day: string, category: Category, items: readonly Item[], text: string, via: ReadRow['via'], now: Date): Promise<void> {
  const at = now.toISOString()
  await store.writeRead({ id: `read:${run}:${at}:${seq}`, day, at, task, category, count: items.length, bytes: bytesOf(text), via })
}

/** How much private context each task's briefing may carry (engineering judgment). */
export const CONTEXT_BUDGET: Record<ReadTask, number> = { line: 12 * 1024, review: 24 * 1024 }

interface Section {
  category: Category
  title: string
  q: Query
}

/**
 * The private context a task's briefing carries: what bears on the day or the week, by recency,
 * path and the day's own declarations, within the task's budget. The daily line gets recent notes
 * and reflections, today's plans, the Social path's week, and from the Partner path only what
 * bears on today: a date declared for it, and this week's milestones and acts done. The review
 * gets the week, the Partner path as acts done and experiences written, never a shortfall; the
 * monthly check is in neither. Every category read is logged.
 */
export async function contextFor(store: Store, catalogue: Catalogue, a: Access, forDay: string, run: string, now: Date, noteIdsOnSheet: ReadonlySet<string> = new Set()): Promise<{ text: string; bytes: number }> {
  const week = { from: addDays(forDay, -7), to: forDay }
  const sections: Section[] =
    a.task === 'line'
      ? [
          { category: 'notes', title: 'Check-in notes of the last seven days', q: { ...week, limit: 10 } },
          { category: 'reflections', title: 'Notes and reflections you kept, the last fourteen days', q: { from: addDays(forDay, -14), to: forDay, limit: 8 } },
          { category: 'commitments', title: 'Plans for today', q: { from: forDay, to: forDay, limit: 5 } },
          { category: 'socialPath', title: 'The Social path this week', q: { ...week, limit: 8 } },
          { category: 'partnerPath', title: 'The Partner path: what bears on today', q: { ...week, limit: 8, doneOnly: true } },
          { category: 'her', title: 'Her record this week (counts only)', q: { ...week, limit: 7 } },
          { category: 'faith', title: 'Faith this week', q: { ...week, limit: 5 } },
        ]
      : [
          { category: 'notes', title: 'Check-in notes of the week', q: { ...week, limit: 21 } },
          { category: 'reflections', title: 'Notes and reflections you kept this week', q: { ...week, limit: 14 } },
          { category: 'commitments', title: 'Plans this week', q: { ...week, limit: 14 } },
          { category: 'socialPath', title: 'The Social path this week', q: { ...week, limit: 14 } },
          { category: 'partnerPath', title: 'The Partner path this week: acts done and what you wrote', q: { ...week, limit: 14, doneOnly: true } },
          { category: 'her', title: 'Her record this week (counts only)', q: { ...week, limit: 7 } },
          { category: 'faith', title: 'Faith this week', q: { ...week, limit: 7 } },
        ]
  const x: Ctx = { store, catalogue, a }
  const budget = CONTEXT_BUDGET[a.task]
  const parts: string[] = []
  let used = 0
  let seq = 0
  for (const s of sections) {
    if (!a.allowed(s.category)) continue
    let items = (await readCategory(x, s.category, s.q)) ?? []
    // The notes the sheet already carries are not repeated.
    if (s.category === 'notes') items = items.filter((i) => !noteIdsOnSheet.has(`note.${i.day}.${/at the (\w+) check-in/.exec(i.text)?.[1] ?? ''}`))
    // The daily line hears of the Partner path only what bears on today: a date declared for it, or this week's milestones and acts.
    if (s.category === 'partnerPath' && a.task === 'line' && !(await partnerBearsOn(store, forDay, a))) items = []
    const kept: Item[] = []
    for (const i of items) {
      const line = itemLines([i])
      if (used + bytesOf(line) + 1 > budget) break
      kept.push(i)
      used += bytesOf(line) + 1
    }
    const text = itemLines(kept)
    await logRead(store, run, seq++, a.task, forDay, s.category, kept, text, 'briefing', now)
    if (kept.length) parts.push(`[${s.category}] ${s.title}\n${text}`)
  }
  const text = parts.join('\n\n')
  return { text, bytes: bytesOf(text) }
}

/**
 * Whether the Partner path bears on a day (Part 27's surface rule for Now): a date declared for
 * it, or a milestone within the week before it. Read only while the Partner path may be read;
 * otherwise nothing about it bears on anything Claude writes.
 */
export async function partnerBearsOn(store: Store, day: string, a: Access): Promise<boolean> {
  if (!a.allowed('partnerPath')) return false
  const marks = await store.readRecords('pathMarks', { from: addDays(day, -7), to: day })
  return marks.some((r) => {
    const b = obj(r.body)
    return b.path === 'partner' && ((b.kind === 'date' && r.day === day) || b.kind === 'milestone')
  })
}

/** The names of the owner's private items, for the guard that keeps them off Now while their names may not be shown. Read by the Worker's check, never sent to Claude. */
export async function privateNames(store: Store): Promise<string[]> {
  return (await store.readRecords('privateItems')).map((r) => str(obj(r.body).name).trim()).filter(Boolean)
}

/** The query parameters /claude/context accepts; any other is refused, so no request can ask for anything the layer does not name. */
export const CONTEXT_PARAMS = ['task', 'day', 'category', 'from', 'to', 'path', 'stage', 'q', 'limit'] as const
/** The per-run cap on on-demand reads (engineering judgment). */
export const CONTEXT_CALLS = 20
export const CONTEXT_BYTES = 64 * 1024
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A context query read from the URL, or why it is refused. */
export function parseContextQuery(url: URL, day: string): { ok: true; category: Category; q: Query } | { ok: false; reason: string } {
  for (const k of url.searchParams.keys()) if (!(CONTEXT_PARAMS as readonly string[]).includes(k)) return { ok: false, reason: `unknown parameter "${k}"` }
  const category = url.searchParams.get('category') ?? ''
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, reason: `category "${category}" is not one the layer names` }
  const from = url.searchParams.get('from') ?? addDays(day, -30)
  const to = url.searchParams.get('to') ?? day
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return { ok: false, reason: 'from and to must be days, from before to' }
  if (to > day) return { ok: false, reason: 'to may not be after the task’s day' }
  if (from < addDays(day, -366)) return { ok: false, reason: 'from may reach back a year at most' }
  const path = url.searchParams.get('path')
  if (path !== null && path !== 'social' && path !== 'partner') return { ok: false, reason: 'path must be social or partner' }
  const stageRaw = url.searchParams.get('stage')
  const stage = stageRaw === null ? undefined : Number(stageRaw)
  if (stage !== undefined && (!Number.isInteger(stage) || stage < 1 || stage > 9)) return { ok: false, reason: 'stage must be a whole number from 1 to 9' }
  const q = url.searchParams.get('q') ?? undefined
  if (q !== undefined && q.length > 60) return { ok: false, reason: 'q is at most 60 characters' }
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw === null ? 20 : Number(limitRaw)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { ok: false, reason: 'limit must be from 1 to 50' }
  return { ok: true, category: category as Category, q: { from, to, ...(path ? { path } : {}), ...(stage !== undefined ? { stage } : {}), ...(q ? { q } : {}), limit } }
}

/**
 * One on-demand read, after its checks: the lines, cut to what the run may still read, then logged;
 * or null when the category has no reader. The review reads the Partner path as acts done only.
 */
export async function readOnDemand(store: Store, catalogue: Catalogue, a: Access, category: Category, q: Query, day: string, run: string, seq: number, now: Date, maxBytes: number): Promise<{ items: Item[]; text: string; truncated: boolean } | null> {
  const all = await readCategory({ store, catalogue, a }, category, a.task === 'review' && category === 'partnerPath' ? { ...q, doneOnly: true } : q)
  if (all === null) return null
  let items = all
  let text = itemLines(items)
  while (items.length && bytesOf(text) > maxBytes) {
    items = items.slice(0, -1)
    text = itemLines(items)
  }
  await logRead(store, run, seq, a.task, day, category, items, text, 'context', now)
  return { items, text, truncated: items.length < all.length }
}
