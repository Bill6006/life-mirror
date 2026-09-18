import { activeAims, aimRecords, allIntentions, liveSkills, rungMarks } from './aimFlow'
import { BLOCKS, type Block } from './blocks'
import { allCheckIns, allWins, db, ensureDayContext, getSettings, privateItems, type BriefFeedback, type BriefLog } from './db'
import { buildFactSheet, type FactSheet } from './facts'
import { briefData, usualFor } from './forecastFlow'
import { evidence } from './learningFlow'
import { chooseLine, SITUATIONS } from './situations'

// The brain on the phone: the fact sheet built from the record, written as a row the Worker
// reads; the phone's own line for the day, chosen once and logged; and the tap that says how
// it landed. The Worker's line, when there is one, is read from the rows it wrote.

export async function factSheet(day: string, now: Date = new Date()): Promise<FactSheet> {
  const [checkins, contexts, brief, ev, aims, skills, marks, records, intentions, wins, outside, items, settings, log, feedback, brainBriefs] = await Promise.all([
    allCheckIns(),
    db.days.toArray(),
    briefData(day),
    evidence(day),
    activeAims(),
    liveSkills(),
    rungMarks(),
    aimRecords(),
    allIntentions(),
    allWins(),
    db.outside.toArray(),
    privateItems(),
    getSettings(),
    db.briefLog.toArray(),
    db.briefFeedback.toArray(),
    db.brainBriefs.toArray(),
  ])
  const [offers, outcomes] = await Promise.all([db.offers.toArray(), db.outcomes.toArray()])
  const usual = Object.fromEntries(await Promise.all(BLOCKS.map(async (b) => [b, await usualFor(day, b)]))) as Record<Block, { point: number; lo: number; hi: number } | null>
  return buildFactSheet({ day, now, checkins, contexts, brief, evidence: ev, aims, skills, marks, offers, outcomes, nights: records.nights, intentions, wins, outside, items, direction: settings.direction, usual, log, feedback, brainBriefs })
}

/** The day's sheet as a record of its own, for the Worker to read; written only when its facts changed. */
export async function writeFactsRow(day: string, now: Date = new Date()): Promise<boolean> {
  await ensureDayContext(day, await getSettings())
  const sheet = await factSheet(day, now)
  const existing = await db.facts.get(day)
  if (existing && JSON.stringify(existing.sheet.facts) === JSON.stringify(sheet.facts) && JSON.stringify(existing.sheet.said) === JSON.stringify(sheet.said)) return false
  await db.facts.put({ day, builtAt: sheet.builtAt, updatedAt: now.toISOString(), sheet })
  return true
}

export interface BriefLine {
  /** What the tap is filed under: the Worker's row, or the phone's log entry. */
  key: string
  source: 'phone' | 'worker'
  text: string
  mode: string
  situationId: string | null
  model: string | null
  cardIds: string[]
}

/** Today's line: the Worker's when it wrote one, else the phone's own; null when neither has anything to say. */
export async function todaysLine(day: string): Promise<BriefLine | null> {
  const worker = (await db.brainBriefs.where('day').equals(day).toArray()).filter((b) => b.kind === 'brief').sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (worker) return { key: `worker:${worker.id}`, source: 'worker', text: worker.text, mode: worker.mode, situationId: null, model: worker.model, cardIds: worker.cardIds }
  const own = (await db.briefLog.where('day').equals(day).toArray()).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
  if (!own || own.situationId === null) return null
  return { key: `phone:${day}:${own.id}`, source: 'phone', text: own.text, mode: own.mode, situationId: own.situationId, model: null, cardIds: own.cardIds }
}

/**
 * Chooses the phone's own line for the day and logs it. A line is kept while its situation is
 * still true, so it does not flicker as the day is logged; once its facts no longer hold it is
 * withdrawn and the next true situation takes its place. A day with nothing to say is logged as
 * such and looked at again when the record changes.
 */
export async function chooseAndLog(day: string, now: Date = new Date()): Promise<void> {
  const existing = await db.briefLog.where('day').equals(day).toArray()
  await ensureDayContext(day, await getSettings())
  const sheet = await factSheet(day, now)
  const current = existing.find((e) => e.situationId !== null)
  if (current && SITUATIONS.find((s) => s.id === current.situationId)?.test(sheet)) return
  const said = (await db.briefLog.toArray()).map((l) => ({ day: l.day, situationId: l.situationId }))
  const feedback = (await db.briefFeedback.toArray()).map((f) => ({ situationId: f.situationId, answer: f.answer }))
  const choice = chooseLine(sheet, said, feedback)
  if (!choice && existing.length && !current) return
  const row: BriefLog = { day, situationId: choice?.situationId ?? null, mode: choice?.mode ?? 'observation', text: choice?.text ?? '', factIds: choice?.factIds ?? [], cardIds: choice?.cardIds ?? [], at: now.toISOString() }
  await db.transaction('rw', db.briefLog, async () => {
    for (const e of existing) await db.briefLog.delete(e.id as number)
    await db.briefLog.add(row)
  })
}

export async function feedbackFor(key: string | null): Promise<BriefFeedback | null> {
  if (!key) return null
  return (await db.briefFeedback.where('briefKey').equals(key).first()) ?? null
}

/** One tap under the line: useful, knew it, or not. Recorded once per line; it shapes what is said next. */
export async function recordFeedback(day: string, line: BriefLine, answer: 'useful' | 'knew' | 'not', now: Date = new Date()): Promise<void> {
  if (await db.briefFeedback.where('briefKey').equals(line.key).first()) return
  await db.briefFeedback.add({ day, briefKey: line.key, situationId: line.situationId, answer, at: now.toISOString() })
}

/** What the brain last wrote, for the Cloud screen. */
export async function brainStatus(): Promise<{ day: string; model: string; at: string } | null> {
  const rows = await db.brainBriefs.toArray()
  const latest = rows.sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  return latest ? { day: latest.day, model: latest.model, at: latest.at } : null
}
