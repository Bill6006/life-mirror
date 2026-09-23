import { createClient } from '@libsql/client/web'
import type { LineAction } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'

// The same database the phone syncs to, through the same generic `records` table. The Worker
// reads the phone's rows (facts, plans, feedback) and writes only rows of its own app: a line
// per day, and a mark per reminder sent. It never touches the phone's rows.

export const APP = 'life-mirror'
export const BRAIN_APP = 'life-mirror-brain'
export const DEVICE = 'worker'

export interface PlanRow {
  id: string
  aimId: number
  cue: string
  time: string
  setAt: string
  offerId: number | null
  step?: string
}

export interface BriefRow {
  id: string
  day: string
  /** The day's line, or on Sunday the week's review beside it. */
  kind: 'brief' | 'review'
  text: string
  mode: string
  factIds: string[]
  cardIds: string[]
  model: string
  at: string
  /** The day the facts described. */
  factsDay: string
  /** The day the line was written for; when it differs from factsDay the prompt named both and the guard held the line to this day's shape. */
  forDay?: string
  /** The one tap the line offers, checked against the sheet before it was written; the phone checks again at the tap. */
  action?: LineAction | null
  /** The review's three parts, on a row of kind review. */
  parts?: { held: string; didNot: string; change: string }
  /** What set it off (Part 28): the morning check-in, the fallback hour, Sunday's hour, or a run by hand. */
  trigger?: 'checkin' | 'fallback' | 'sunday' | 'forced'
  /** The target day's shape as the briefing named it. */
  shape?: string
  /** Every refusal on the way, by model and reason, in order: the validator's, the day guard's and the repeat check's. */
  refusals?: string[]
  /** How many candidates passed every check. */
  candidates?: number
  /** Neurons spent, as Workers AI reported them, and the calls made. */
  neurons?: number
  calls?: number
  /** From the trigger to the stored row. */
  latencyMs?: number
}

/** One record of the bridge proof (Part 29): a fire of the routine, or a nonce issued and answered. Test data only. */
export interface BridgeRow {
  id: string
  kind: 'fire' | 'ping'
  at: string
  /** The model the fire asked the run's subagent to write with. */
  model?: string | null
  status?: number
  sessionId?: string | null
  sessionUrl?: string | null
  retryAfter?: string | null
  error?: string | null
  nonce?: string
  fireId?: string | null
  fireAt?: string | null
  answeredAt?: string
  roundTripMs?: number | null
  reply?: string | null
  askedModel?: string | null
  subagentModel?: string | null
  runnerModel?: string | null
  subagentError?: string | null
}

export interface SaidRow {
  id: string
  day: string
  text: string
}

export interface FeedbackRow {
  briefKey: string
  answer: string
}

export interface Store {
  readFacts(day: string): Promise<{ sheet: FactSheet; updatedAt: string } | null>
  readIntentions(day: string): Promise<PlanRow[]>
  hasBrief(id: string): Promise<boolean>
  writeBrief(row: BriefRow, now: string): Promise<void>
  readSaid(limit: number): Promise<SaidRow[]>
  /** The newest rows of lines and reviews, whole, for the report. */
  readBriefs(limit: number): Promise<BriefRow[]>
  readFeedback(): Promise<FeedbackRow[]>
  writeBridge(row: BridgeRow): Promise<void>
  readBridgeRow(id: string): Promise<BridgeRow | null>
  /** The newest bridge rows, newest first. */
  readBridge(limit: number): Promise<BridgeRow[]>
  isPushed(id: string): Promise<boolean>
  markPushed(id: string, now: string): Promise<void>
}

function parse<T>(body: unknown): T | null {
  if (typeof body !== 'string' || !body) return null
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

const COLUMNS = 'app, store, id, day, body, updated_at, deleted, device_id, synced_at'

export function tursoStore(url: string, token: string): Store {
  const client = createClient({ url, authToken: token, intMode: 'number' })
  const rows = async (sql: string, args: (string | number)[]) => (await client.execute({ sql, args })).rows
  return {
    async readFacts(day) {
      const r = await rows(`SELECT body, updated_at FROM records WHERE app = ? AND store = 'facts' AND id = ? AND deleted = 0`, [APP, day])
      const body = r[0] ? parse<{ sheet: FactSheet; updatedAt?: string }>(r[0].body) : null
      return body?.sheet ? { sheet: body.sheet, updatedAt: body.updatedAt ?? String(r[0].updated_at) } : null
    },
    async readIntentions(day) {
      const r = await rows(`SELECT id, body FROM records WHERE app = ? AND store = 'intentions' AND day = ? AND deleted = 0`, [APP, day])
      return r.map((row) => ({ id: String(row.id), ...(parse<Omit<PlanRow, 'id'>>(row.body) ?? { aimId: 0, cue: '', time: '', setAt: '', offerId: null }) })).filter((p) => p.time)
    },
    async hasBrief(id) {
      const r = await rows(`SELECT id FROM records WHERE app = ? AND store = 'briefs' AND id = ? AND deleted = 0`, [BRAIN_APP, id])
      return r.length > 0
    },
    async writeBrief(row, now) {
      await client.execute({ sql: `INSERT OR REPLACE INTO records (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`, args: [BRAIN_APP, 'briefs', row.id, row.day, JSON.stringify(row), now, DEVICE, now] })
    },
    async readSaid(limit) {
      const r = await rows(`SELECT id, body FROM records WHERE app = ? AND store = 'briefs' AND deleted = 0 ORDER BY synced_at DESC LIMIT ?`, [BRAIN_APP, limit])
      return r.map((row) => ({ id: String(row.id), ...(parse<{ day: string; text: string }>(row.body) ?? { day: '', text: '' }) })).filter((s) => s.text)
    },
    async readBriefs(limit) {
      const r = await rows(`SELECT body FROM records WHERE app = ? AND store = 'briefs' AND deleted = 0 ORDER BY synced_at DESC LIMIT ?`, [BRAIN_APP, limit])
      return r.map((row) => parse<BriefRow>(row.body)).filter((b): b is BriefRow => b !== null && typeof b.id === 'string')
    },
    async readFeedback() {
      const r = await rows(`SELECT body FROM records WHERE app = ? AND store = 'briefFeedback' AND deleted = 0`, [APP])
      return r.map((row) => parse<FeedbackRow>(row.body)).filter((f): f is FeedbackRow => f !== null && typeof f.briefKey === 'string')
    },
    async writeBridge(row) {
      const now = new Date().toISOString()
      await client.execute({ sql: `INSERT OR REPLACE INTO records (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`, args: [BRAIN_APP, 'bridge', row.id, row.at.slice(0, 10), JSON.stringify(row), now, DEVICE, now] })
    },
    async readBridgeRow(id) {
      const r = await rows(`SELECT body FROM records WHERE app = ? AND store = 'bridge' AND id = ? AND deleted = 0`, [BRAIN_APP, id])
      return r[0] ? parse<BridgeRow>(r[0].body) : null
    },
    async readBridge(limit) {
      const r = await rows(`SELECT body FROM records WHERE app = ? AND store = 'bridge' AND deleted = 0 ORDER BY synced_at DESC LIMIT ?`, [BRAIN_APP, limit])
      return r.map((row) => parse<BridgeRow>(row.body)).filter((b): b is BridgeRow => b !== null)
    },
    async isPushed(id) {
      const r = await rows(`SELECT id FROM records WHERE app = ? AND store = 'pushes' AND id = ? AND deleted = 0`, [BRAIN_APP, id])
      return r.length > 0
    },
    async markPushed(id, now) {
      await client.execute({ sql: `INSERT OR REPLACE INTO records (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`, args: [BRAIN_APP, 'pushes', id, now.slice(0, 10), JSON.stringify({ at: now }), now, DEVICE, now] })
    },
  }
}

export interface MemoryRow {
  app: string
  store: string
  id: string
  day: string | null
  body: string | null
  updated_at: string
  deleted: 0 | 1
  synced_at: string
}

/** The same contract in memory, for the tests. */
export function memoryStore(): Store & { rows: Map<string, MemoryRow>; put(row: MemoryRow): void } {
  const rows = new Map<string, MemoryRow>()
  const key = (app: string, store: string, id: string) => `${app}|${store}|${id}`
  const live = (app: string, store: string) => [...rows.values()].filter((r) => r.app === app && r.store === store && r.deleted === 0)
  return {
    rows,
    put(row) {
      rows.set(key(row.app, row.store, row.id), row)
    },
    async readFacts(day) {
      const r = rows.get(key(APP, 'facts', day))
      const body = r && !r.deleted ? parse<{ sheet: FactSheet; updatedAt?: string }>(r.body) : null
      return body?.sheet ? { sheet: body.sheet, updatedAt: body.updatedAt ?? (r as MemoryRow).updated_at } : null
    },
    async readIntentions(day) {
      return live(APP, 'intentions')
        .filter((r) => r.day === day)
        .map((r) => ({ id: r.id, ...(parse<Omit<PlanRow, 'id'>>(r.body) ?? { aimId: 0, cue: '', time: '', setAt: '', offerId: null }) }))
        .filter((p) => p.time)
    },
    async hasBrief(id) {
      const r = rows.get(key(BRAIN_APP, 'briefs', id))
      return Boolean(r && !r.deleted)
    },
    async writeBrief(row, now) {
      rows.set(key(BRAIN_APP, 'briefs', row.id), { app: BRAIN_APP, store: 'briefs', id: row.id, day: row.day, body: JSON.stringify(row), updated_at: now, deleted: 0, synced_at: now })
    },
    async readSaid(limit) {
      return live(BRAIN_APP, 'briefs')
        .sort((a, b) => (a.synced_at < b.synced_at ? 1 : -1))
        .slice(0, limit)
        .map((r) => ({ id: r.id, ...(parse<{ day: string; text: string }>(r.body) ?? { day: '', text: '' }) }))
    },
    async readBriefs(limit) {
      return live(BRAIN_APP, 'briefs')
        .sort((a, b) => (a.synced_at < b.synced_at ? 1 : -1))
        .slice(0, limit)
        .map((r) => parse<BriefRow>(r.body))
        .filter((b): b is BriefRow => b !== null && typeof b.id === 'string')
    },
    async readFeedback() {
      return live(APP, 'briefFeedback')
        .map((r) => parse<FeedbackRow>(r.body))
        .filter((f): f is FeedbackRow => f !== null)
    },
    async writeBridge(row) {
      const now = new Date(Date.parse(row.answeredAt ?? row.at) + rows.size).toISOString()
      rows.set(key(BRAIN_APP, 'bridge', row.id), { app: BRAIN_APP, store: 'bridge', id: row.id, day: row.at.slice(0, 10), body: JSON.stringify(row), updated_at: now, deleted: 0, synced_at: now })
    },
    async readBridgeRow(id) {
      const r = rows.get(key(BRAIN_APP, 'bridge', id))
      return r && !r.deleted ? parse<BridgeRow>(r.body) : null
    },
    async readBridge(limit) {
      return live(BRAIN_APP, 'bridge')
        .sort((a, b) => (a.synced_at < b.synced_at ? 1 : -1))
        .slice(0, limit)
        .map((r) => parse<BridgeRow>(r.body))
        .filter((b): b is BridgeRow => b !== null)
    },
    async isPushed(id) {
      const r = rows.get(key(BRAIN_APP, 'pushes', id))
      return Boolean(r && !r.deleted)
    },
    async markPushed(id, now) {
      rows.set(key(BRAIN_APP, 'pushes', id), { app: BRAIN_APP, store: 'pushes', id, day: now.slice(0, 10), body: JSON.stringify({ at: now }), updated_at: now, deleted: 0, synced_at: now })
    },
  }
}
