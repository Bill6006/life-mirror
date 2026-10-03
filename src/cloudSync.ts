import { lackedOf } from './brainShared'
import type { CoachProposal } from './coachShared'
import { isFirmness } from './firmness'
import type { BrainBrief, BrainRead, CoachPick } from './db'
import { useEffect, useState } from 'preact/hooks'
import { APP, dayOf, markSilent, onOutboxChange, outboxDelete, SYNCED_STORES, type CloudMeta, type OutboxRow } from './cloudOutbox'
import { captureFloors, maxIds } from './idFloors'
import { unlinkLost } from './lostLinks'
import { forgetPending, keepQueued, pendingRows } from './pendingCopy'
import { inStep, markInStep } from './freshIds'
import { libsqlStore, type CloudRow, type CloudStore, type StoreFactory } from './cloudStore'
import { OUTSIDE_APP, OUTSIDE_STORE, outsideDayOf } from './outsideRow'
import { copy } from './copy'
import { fill } from './format'
import { db, getSettings, updateSettings } from './db'
import { useLive } from './live'
import { withDefaults, type Settings } from './settings'
import { appendLog, clearMark, clearMirror, latestNotice, raiseFloors, readDeviceMirror, readMark, readMirror, tokenStorage, writeDeviceMirror, writeMark, writeMirror, type TokenEvent, type TokenMark } from './tokenVault'

// The sync worker. Pull first (rows newer than the watermark, applied only where the remote is
// newer, silently, never re-queued), then push (the outbox, latest change per row, in batches).
// It never blocks the screen, retries with backoff, waits quietly offline, and does nothing at
// all without a token.

export const PAGE = 500
export const BATCH = 100
const PULL_EVERY_MS = 15 * 60_000
const PUSH_DEBOUNCE_MS = 2_000
const BACKOFF_BASE_MS = 5_000
const BACKOFF_MAX_MS = 15 * 60_000
const DEVICE_LABEL = 'phone'

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error'
export type SyncOutcome = 'noToken' | 'offline' | 'done' | 'failed'

export interface SyncStatus {
  state: SyncState
  hasToken: boolean
  lastSyncAt: string | null
  lastError: string | null
  pending: number
  /** The latest thing that happened to the token when it was a loss: a copy written again, or both gone. */
  notice: TokenEvent | null
  /** Whether the browser keeps this app's storage when space runs low (sync safety, 2026-10-02). */
  persisted: boolean | null
  /** How many waiting changes the cloud refused on the last attempt; they stay queued, and the rest went through. */
  refused: number
}

let factory: StoreFactory = libsqlStore
let isOnline: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
let running: Promise<SyncOutcome> | null = null
let again = false
let attempts = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let live: SyncState = 'idle'
const watchers = new Set<() => void>()

/** The tests hand in a fake store; the app uses the libsql client. */
export function setStoreFactory(f: StoreFactory | null): void {
  factory = f ?? libsqlStore
}

export function setOnlineCheck(fn: (() => boolean) | null): void {
  isOnline = fn ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
}

export function resetCloudForTests(): void {
  running = null
  again = false
  attempts = 0
  if (retryTimer) clearTimeout(retryTimer)
  if (pushTimer) clearTimeout(pushTimer)
  retryTimer = null
  pushTimer = null
  live = 'idle'
}

function setLive(s: SyncState): void {
  live = s
  for (const w of watchers) w()
}

const DEFAULT_META: CloudMeta = { key: 'state', watermark: '', lastSyncAt: null, lastError: null }

export { OUTSIDE_APP }
const DEFAULT_OUTSIDE: CloudMeta = { key: 'outside', watermark: '', lastSyncAt: null, lastError: null }

export async function getOutsideMeta(): Promise<CloudMeta> {
  return (await db.cloudMeta.get('outside')) ?? DEFAULT_OUTSIDE
}

/** The brain under your own account: the Worker that writes the day's line to the same database. This app reads its rows and writes none. */
export const BRAIN_APP = 'life-mirror-brain'
const BRAIN_STORE = 'briefs'
/** What Claude read (Part 30): the brain's log of reads, never their content. */
const READS_STORE = 'reads'
/** The coach's pick for the day (Part 32). */
const COACH_STORE = 'coach'
/** The skill coach's proposals (Parts 40 and 41): one per ask. None is written while their gate is closed. */
const PROPOSALS_STORE = 'proposals'

const texts = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const rhythmIn = (v: unknown): { perWeek: number; restDays: number } | null => {
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  return r && Number.isInteger(r.perWeek) && Number.isInteger(r.restDays ?? 0) ? { perWeek: r.perWeek as number, restDays: (r.restDays ?? 0) as number } : null
}

/**
 * What a proposal row says, or null for one that is not a whole proposal: its ask, its commitment and
 * the revision it was written for, and either a suggestion for the current skill or a review. The
 * Worker checked it before storing it; the phone reads only the fields it shows.
 */
export function coachProposalOf(id: string, body: string): CoachProposal | null {
  try {
    const r = JSON.parse(body) as Record<string, unknown>
    if (typeof r.askId !== 'number' || typeof r.aimId !== 'number' || typeof r.revision !== 'string' || typeof r.day !== 'string' || (r.kind !== 'setup' && r.kind !== 'review')) return null
    const base = { id, askId: r.askId, aimId: r.aimId, kind: r.kind, revision: r.revision, day: r.day, at: typeof r.at === 'string' ? r.at : '', model: typeof r.model === 'string' ? r.model : '', askedModel: typeof r.askedModel === 'string' ? r.askedModel : '' } as const
    if (r.kind === 'setup') {
      const s = r.suggestion && typeof r.suggestion === 'object' ? (r.suggestion as Record<string, unknown>) : null
      const skill = texts(s?.skill, 80)
      const how = texts(s?.how, 240)
      const why = texts(s?.why, 200)
      if (!s || !skill || !how || !why) return null
      const minutes = Number.isInteger(s.minutes) && (s.minutes as number) >= 1 && (s.minutes as number) <= 240 ? (s.minutes as number) : null
      return { ...base, suggestion: { skill, method: texts(s.method, 60), how, minutes, rhythm: rhythmIn(s.rhythm), why, physical: s.physical === true, safety: texts(s.safety, 240), likelyNext: texts(s.likelyNext, 80) } }
    }
    const v = r.review && typeof r.review === 'object' ? (r.review as Record<string, unknown>) : null
    const verdict = v?.verdict
    const why = texts(v?.why, 200)
    const evidence = Array.isArray(v?.evidence) ? (v.evidence as unknown[]).map((e) => texts(e, 160)).filter((e): e is string => e !== null).slice(0, 3) : []
    if (!v || (verdict !== 'keep' && verdict !== 'adjust' && verdict !== 'progress' && verdict !== 'simplify') || !why || !evidence.length) return null
    const c = v.change && typeof v.change === 'object' ? (v.change as Record<string, unknown>) : null
    const change = c
      ? {
          ...(texts(c.skill, 80) ? { skill: texts(c.skill, 80) as string } : {}),
          ...(texts(c.method, 60) ? { method: texts(c.method, 60) as string } : {}),
          ...(texts(c.how, 240) ? { how: texts(c.how, 240) as string } : {}),
          ...(Number.isInteger(c.minutes) ? { minutes: c.minutes as number } : {}),
          ...('rhythm' in c ? { rhythm: rhythmIn(c.rhythm) } : {}),
          ...(texts(c.safety, 240) ? { safety: texts(c.safety, 240) as string } : {}),
        }
      : null
    if (verdict !== 'keep' && (!change || !Object.keys(change).length)) return null
    return { ...base, review: { verdict, evidence, why, change: verdict === 'keep' ? null : change } }
  } catch {
    return null
  }
}

/** What a coach row says, or null for one that is not a whole pick: up to two reps, a path, a block and one line. */
export function coachPickOf(id: string, body: string): CoachPick | null {
  try {
    const r = JSON.parse(body) as Partial<CoachPick>
    const ids = Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === 'string') : []
    if (typeof r.day !== 'string' || (r.block !== 'morning' && r.block !== 'afternoon' && r.block !== 'evening') || (r.path !== 'social' && r.path !== 'partner') || ids.length < 1 || ids.length > 2) return null
    const raw = r.versions && typeof r.versions === 'object' ? (r.versions as Record<string, unknown>) : {}
    const versions: Record<string, string> = {}
    for (const id of ids) if (typeof raw[id] === 'string') versions[id] = (raw[id] as string).slice(0, 400)
    return { id, day: r.day, block: r.block, path: r.path, ids, versions, model: typeof r.model === 'string' ? r.model : '', at: typeof r.at === 'string' ? r.at : '' }
  } catch {
    return null
  }
}
const DEFAULT_BRAIN: CloudMeta = { key: 'brain', watermark: '', lastSyncAt: null, lastError: null }

export async function getBrainMeta(): Promise<CloudMeta> {
  return (await db.cloudMeta.get('brain')) ?? DEFAULT_BRAIN
}

/** What a brain row says, or null for one that is not a line. */
export function brainBriefOf(id: string, body: string): BrainBrief | null {
  try {
    const r = JSON.parse(body) as Partial<BrainBrief>
    if (typeof r.day !== 'string' || typeof r.text !== 'string' || !r.text) return null
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    return { id, day: r.day, kind: r.kind === 'review' ? 'review' : 'brief', text: r.text, mode: typeof r.mode === 'string' ? r.mode : 'observation', factIds: strings(r.factIds), cardIds: strings(r.cardIds), model: typeof r.model === 'string' ? r.model : '', at: typeof r.at === 'string' ? r.at : '', ...(r.action && typeof r.action === 'object' ? { action: r.action } : {}), ...(typeof r.factsDay === 'string' ? { factsDay: r.factsDay } : {}), ...(typeof r.forDay === 'string' ? { forDay: r.forDay } : {}), ...(r.parts && typeof r.parts === 'object' ? { parts: r.parts } : {}), ...(r.writer === 'claude' || r.writer === 'free' ? { writer: r.writer } : {}), ...(typeof r.askedModel === 'string' ? { askedModel: r.askedModel } : {}), ...(typeof r.fallback === 'string' ? { fallback: r.fallback } : {}), ...(lackedOf(r.lacked).length ? { lacked: lackedOf(r.lacked) } : {}) , ...(isFirmness(r.firmness) ? { firmness: r.firmness, ...(r.adaptive === true ? { adaptive: true as const } : {}) } : {}) }
  } catch {
    return null
  }
}

/** What a read row says, or null for one that is not a read. Counts and sizes only; a row carrying anything else keeps only these. */
export function brainReadOf(id: string, body: string): BrainRead | null {
  try {
    const r = JSON.parse(body) as Partial<BrainRead>
    if (typeof r.day !== 'string' || typeof r.at !== 'string' || typeof r.category !== 'string' || (r.task !== 'line' && r.task !== 'review' && r.task !== 'coach' && r.task !== 'skill' && r.task !== 'progress')) return null
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    return { id, day: r.day, at: r.at, task: r.task, category: r.category, count: n(r.count), bytes: n(r.bytes), via: r.via === 'context' ? 'context' : 'briefing', ...(r.dry === true ? { dry: true } : {}) }
  } catch {
    return null
  }
}

/** Which reading of the other app's rows this app keeps: 2 adds each session's detail (Part 35). */
export const OUTSIDE_DETAIL = 2

// The row reader moved to outsideRow.ts, shared with the Worker's sanity report (the final checklist, item 4).
export { outsideDayOf } from './outsideRow'

export async function getMeta(): Promise<CloudMeta> {
  return (await db.cloudMeta.get('state')) ?? DEFAULT_META
}

async function patchMeta(patch: Partial<CloudMeta>): Promise<void> {
  const current = await getMeta()
  await db.cloudMeta.put({ ...current, ...patch, key: 'state' })
}

/** This phone's id: generated once, kept in settings with a second copy on the phone, registered in `devices`. */
export async function ensureDeviceId(): Promise<string> {
  const s = await getSettings()
  if (s.cloud.deviceId) {
    if (readDeviceMirror() !== s.cloud.deviceId) writeDeviceMirror(s.cloud.deviceId)
    return s.cloud.deviceId
  }
  // A phone that lost its settings takes its id back from the second copy before a new one is minted,
  // so it stays the same device in the cloud.
  const id = readDeviceMirror() ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  await updateSettings((cur) => ({ ...cur, cloud: { ...cur.cloud, deviceId: id } }))
  writeDeviceMirror(id)
  return id
}

/** Sends the next pull back to the beginning, so it restores whatever this phone has lost. Rows the phone still holds are kept where they are newer. */
export function restartPull(): Promise<void> {
  return patchMeta({ watermark: '' })
}

/**
 * Keeps the token in both of its homes, reads each back, and sends the next pull to the beginning:
 * a phone pasting a token again has lost something, or is a new phone with an old token, and either
 * way the whole history comes back before anything is pushed.
 */
export async function saveToken(raw: string): Promise<void> {
  const token = raw.trim()
  if (!token) return
  const now = new Date().toISOString()
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token, tokenSavedAt: now } }))
  if ((await getSettings()).cloud.token !== token) throw new Error(copy.cloud.notKept)
  const mirrored = writeMirror(token)
  writeMark({ savedAt: now, lastSeenAt: now })
  appendLog({ at: now, kind: 'saved', detail: mirrored || tokenStorage() === null ? copy.cloud.logSaved : copy.cloud.logSavedNoMirror })
  await restartPull()
}

/** Removes both copies and the marks; the log keeps the removal. Nothing leaves the phone after this. */
export async function removeToken(): Promise<void> {
  await updateSettings((s) => ({ ...s, cloud: { ...s.cloud, token: null, tokenSavedAt: null } }))
  clearMirror()
  clearMark()
  appendLog({ at: new Date().toISOString(), kind: 'removed', detail: copy.cloud.logRemoved })
}

export interface TokenResolution {
  token: string | null
  /** True when the next pull was sent to the beginning: the database copy had gone, or this is the first run with two copies. */
  recover: boolean
  notice: TokenEvent | null
}

/**
 * Finds the token in either home, heals the other, and says what it found. Runs before every sync.
 * Without local storage at all (Node, or a browser that blocks it) there is one home and nothing to heal.
 */
export async function resolveToken(): Promise<TokenResolution> {
  const now = new Date().toISOString()
  const s = await getSettings()
  const database = s.cloud.token
  if (tokenStorage() === null) return { token: database, recover: false, notice: null }
  const local = readMirror()
  const localMark = readMark()
  const mark: TokenMark | null = s.cloud.tokenSavedAt ? { savedAt: s.cloud.tokenSavedAt, lastSeenAt: localMark?.lastSeenAt ?? s.cloud.tokenSavedAt } : localMark
  const keepMark = async (savedAt: string) => {
    writeMark({ savedAt, lastSeenAt: now })
    if (s.cloud.tokenSavedAt !== savedAt) await updateSettings((cur) => ({ ...cur, cloud: { ...cur.cloud, tokenSavedAt: savedAt } }))
  }

  if (database && local) {
    if (database !== local) {
      // Two different tokens: a later save reached only one home. The later mark wins.
      const preferLocal = localMark !== null && s.cloud.tokenSavedAt !== null && localMark.savedAt > s.cloud.tokenSavedAt
      const token = preferLocal ? local : database
      if (preferLocal) await updateSettings((cur) => ({ ...cur, cloud: { ...cur.cloud, token } }))
      else writeMirror(token)
      await keepMark(mark?.savedAt ?? now)
      const notice = appendLog({ at: now, kind: 'restored', detail: copy.cloud.logDisagreed })
      if (preferLocal) await restartPull()
      return { token, recover: preferLocal, notice }
    }
    await keepMark(mark?.savedAt ?? now)
    return { token: database, recover: false, notice: latestNotice() }
  }

  if (database) {
    writeMirror(database)
    const firstRun = mark === null
    await keepMark(mark?.savedAt ?? now)
    const event = appendLog(firstRun ? { at: now, kind: 'saved', detail: copy.cloud.logSecondCopy } : { at: now, kind: 'restored', detail: copy.cloud.logLocalRestored })
    if (firstRun) await restartPull()
    return { token: database, recover: firstRun, notice: firstRun ? null : event }
  }

  if (local) {
    await updateSettings((cur) => ({ ...cur, cloud: { ...cur.cloud, token: local } }))
    await keepMark(mark?.savedAt ?? now)
    const notice = appendLog({ at: now, kind: 'restored', detail: copy.cloud.logDatabaseRestored })
    await restartPull()
    return { token: local, recover: true, notice }
  }

  if (!mark) return { token: null, recover: false, notice: null }
  // Both homes empty after a token was saved here. Say so once, not on every open.
  const last = latestNotice()
  const notice = last?.kind === 'missing' ? last : appendLog({ at: now, kind: 'missing', detail: copy.cloud.logMissing, lastSeenAt: mark.lastSeenAt })
  return { token: null, recover: false, notice }
}

function keyFor(store: string, id: string): string | number {
  return store === 'days' || store === 'herSkills' || store === 'facts' ? id : Number(id)
}

/**
 * Sync safety (2026-10-02): the stores whose records have an identity beyond their id, the index that
 * holds it, and whether the app derives them. A record held twice under two ids (a cleared phone
 * re-derives a forecast before the cloud's original is back, or a check-in is entered again) is made
 * one again on a pull, never refused: a refusal (a ConstraintError) stops every later row from
 * coming back.
 */
const LOGICAL: Record<string, { index: string; fields: readonly string[]; derived: boolean }> = {
  checkins: { index: '[day+block]', fields: ['day', 'block'], derived: false },
  wins: { index: 'forDay', fields: ['forDay'], derived: false },
  monthlyChecks: { index: 'month', fields: ['month'], derived: false },
  forecasts: { index: '[day+block+horizon]', fields: ['day', 'block', 'horizon'], derived: true },
  forecastScores: { index: '[day+block+horizon]', fields: ['day', 'block', 'horizon'], derived: true },
}

/** Of two copies of one record, whether the first stays: what the app derives keeps the first made; what you entered keeps the latest. */
export function firstStays(store: string, a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const id = (r: Record<string, unknown>) => Number(r.id) || 0
  if (LOGICAL[store]?.derived) {
    const made = (r: Record<string, unknown>) => String(r.madeOn ?? r.scoredOn ?? '')
    return made(a) < made(b) || (made(a) === made(b) && id(a) <= id(b))
  }
  const stamp = (r: Record<string, unknown>) => String(r.updatedAt ?? r.completedAt ?? r.at ?? '')
  return stamp(a) > stamp(b) || (stamp(a) === stamp(b) && id(a) >= id(b))
}

/** The copy that gives way: its id tombstoned in the cloud; when it is yours, its whole record kept aside first in a store nothing reads. */
async function retire(store: string, id: string, body: Record<string, unknown>, derived: boolean, cloudHasIt: boolean, now: string): Promise<void> {
  if (!derived) await db.outbox.add({ store: 'superseded', key: `${store}:${id}`, op: 'put', body: JSON.stringify({ store, id, body, at: now }), day: dayOf(body), updatedAt: now, at: now })
  if (cloudHasIt) await db.outbox.add(outboxDelete(store, id, now))
}

/**
 * The stores keyed by a name or a day rather than a counted id, and whether a record this phone made
 * before it ever read the cloud is worth keeping aside when the cloud holds its key: the day as you
 * changed it, her skills and the Brain settings, yes; the day's fact sheet, made again from the record, no.
 * The settings record has its own rule (its token must never leave the phone).
 */
const FIRST_READ: Record<string, (local: Record<string, unknown>) => boolean> = {
  days: (local) => local.changed === true,
  herSkills: () => true,
  brainPrefs: () => true,
  facts: () => false,
}

/** A record of a fixed key that gave way on this storage's first read of the cloud: kept whole in the store nothing reads, under a key of its own. */
async function setAside(store: string, id: string, body: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString()
  await db.outbox.add({ store: 'superseded', key: `${store}:${id}@${now}`, op: 'put', body: JSON.stringify({ store, id, body, at: now }), day: dayOf(body), updatedAt: now, at: now })
}

/** Applies one pulled row when the remote is newer than what this phone holds; silently, never queued. `first`: this storage's first read of the cloud. */
async function applyRow(row: CloudRow, tx: { cloudRows: typeof db.cloudRows; first?: boolean }): Promise<void> {
  if (!SYNCED_STORES.includes(row.store)) return
  const table = db.table(row.store)
  const key = keyFor(row.store, row.id)
  const known = await tx.cloudRows.get([row.store, row.id])
  const local = (await table.get(key)) as Record<string, unknown> | undefined
  if (local !== undefined && tx.first && !known && row.store in FIRST_READ) {
    // A new install made this record before it read the cloud (2026-10-03): the cloud's stands, and is
    // never written over; this phone's is kept aside whole when it holds what you entered.
    if (FIRST_READ[row.store](local)) await setAside(row.store, row.id, local)
  } else if (local !== undefined) {
    const localStamp = typeof local.updatedAt === 'string' && local.updatedAt ? local.updatedAt : null
    // The settings record exists on every phone from the first tap; on a fresh install, before the
    // cloud has seen this phone's copy, the cloud's is the one to restore.
    const restoringSettings = row.store === 'settings' && !known
    const stamps = [known?.updatedAt, localStamp].filter((s): s is string => Boolean(s)).sort()
    const basis = restoringSettings ? null : (stamps.pop() ?? null)
    // A row the cloud has never seen and that carries no timestamp is the phone's to keep.
    if (basis === null && !restoringSettings) return
    if (basis !== null && !(row.updated_at > basis)) return
  } else {
    // Not on this phone. Deleted here and the deletion still queued: the cloud's copy from before it
    // never brings the record back. A pull right after a push reads the phone's own rows again, and
    // once undid a deletion made in between (2026-10-02). A record lost with no deletion still comes back.
    const deletion = (await db.outbox.where('[store+key]').equals([row.store, row.id]).toArray()).filter((r) => r.op === 'delete').pop()
    if (deletion && !(row.updated_at > deletion.updatedAt)) return
  }
  const result = await applyChange(row, local, true)
  await tx.cloudRows.put({ store: row.store, key: row.id, updatedAt: row.updated_at, syncedAt: row.synced_at })
  if (result === 'gaveWay') return
  // The remote won: any change still queued for this row is older than what the phone now holds.
  await db.outbox.where('[store+key]').equals([row.store, row.id]).delete()
}

/**
 * One row's change on this phone, as a pull makes it: a tombstone deletes; the settings record keeps
 * what belongs to this phone alone; a record held twice is made one by the twin rule. 'gaveWay' when
 * the copy already here stayed and this row was set aside. `cloudHasIt`: whether the cloud holds this
 * row's id, so a row set aside is tombstoned there.
 */
async function applyChange(row: CloudRow, local: Record<string, unknown> | undefined, cloudHasIt: boolean): Promise<'applied' | 'gaveWay'> {
  const table = db.table(row.store)
  const key = keyFor(row.store, row.id)
  if (row.deleted) {
    if (local !== undefined) await table.delete(key)
  } else if (row.body) {
    const body = JSON.parse(row.body) as Record<string, unknown>
    if (row.store === 'settings') {
      // The settings record comes back without what belongs to this phone alone; this phone keeps its own.
      const mine = local as Settings | undefined
      const merged: Settings = { ...withDefaults(body as Partial<Settings>), id: 1, cloud: mine?.cloud ?? withDefaults(undefined).cloud, push: mine?.push ?? withDefaults(undefined).push, reminded: mine?.reminded ?? {}, location: mine?.location ?? withDefaults(undefined).location }
      await db.settings.put(merged)
    } else {
      const spec = LOGICAL[row.store]
      const values = spec ? spec.fields.map((f) => body[f]) : []
      const twin = spec && values.every((v) => v !== undefined && v !== null) ? ((await table.where(spec.index).equals(values.length === 1 ? (values[0] as string) : (values as string[])).first()) as Record<string, unknown> | undefined) : undefined
      if (spec && twin && twin.id !== key) {
        const now = new Date().toISOString()
        const twinKey = String(twin.id)
        const twinKnown = Boolean(await db.cloudRows.get([row.store, twinKey]))
        // A derived copy only this phone has came after the cloud's: the cloud's stays. Otherwise the rule decides, the same from either side.
        const twinStays = spec.derived && !twinKnown ? false : firstStays(row.store, twin, body)
        const meta = await getMeta()
        await db.cloudMeta.put({ ...meta, key: 'state', merged: (meta.merged ?? 0) + 1 })
        if (twinStays) {
          await retire(row.store, row.id, body, spec.derived, cloudHasIt, now)
          return 'gaveWay'
        }
        await table.delete(twin.id as never)
        await db.outbox.where('[store+key]').equals([row.store, twinKey]).delete()
        await retire(row.store, twinKey, twin, spec.derived, twinKnown, now)
      }
      await table.put(body)
    }
  }
  return 'applied'
}

/**
 * Sync safety (2026-10-02, second part): the changes this phone queued that the cloud never received,
 * put back after the browser cleared the database, from the second copy kept beside the token
 * (pendingCopy.ts). Run once the whole history is pulled. A kept change comes back only when nothing
 * for its record is queued now and the cloud holds nothing of it as new; it is applied as a pulled row
 * is, the twin rule included, and queued again as it was. Only what this phone itself queued comes
 * back: nothing is made up. Returns how many came back.
 */
export async function putBackPending(): Promise<number> {
  const kept = pendingRows()
  if (!kept.length) return 0
  let back = 0
  const held: string[] = []
  await db.transaction('rw', ALL_TABLES(), async () => {
    markSilent()
    const queued = new Set((await db.outbox.toArray()).map((r) => `${r.store}|${r.key}`))
    for (const row of kept) {
      const k = `${row.store}|${row.key}`
      if (queued.has(k)) continue
      const known = await db.cloudRows.get([row.store, row.key])
      // The cloud has it, or something newer: the copy had only missed its leaving the queue.
      if (known && known.updatedAt >= row.updatedAt) {
        held.push(k)
        continue
      }
      const { id: _id, ...change } = row
      if (SYNCED_STORES.includes(row.store)) {
        const local = (await db.table(row.store).get(keyFor(row.store, row.key))) as Record<string, unknown> | undefined
        const asPulled: CloudRow = { app: APP, store: row.store, id: row.key, day: row.day, body: row.body, updated_at: row.updatedAt, deleted: row.op === 'delete' ? 1 : 0, device_id: '', synced_at: '' }
        // Set aside by the twin rule: kept in the superseded store, queued there by the merge.
        if ((await applyChange(asPulled, local, Boolean(known))) === 'applied') await db.outbox.add(change)
      } else if (row.store === 'superseded') {
        await db.outbox.add(change)
      } else {
        held.push(k)
        continue
      }
      back++
    }
  })
  forgetPending(held)
  return back
}

const ALL_TABLES = () => [...SYNCED_STORES.map((s) => db.table(s)), db.cloudRows, db.cloudMeta, db.outbox]

/** Pulls rows newer than the watermark, page by page, and applies each page in one silent transaction. */
async function pull(store: CloudStore): Promise<number> {
  let applied = 0
  // Read once: the whole of this storage's first read of the cloud runs under the first-read rule.
  const first = !inStep()
  for (;;) {
    const meta = await getMeta()
    const rows = await store.pull(APP, meta.watermark, PAGE)
    if (!rows.length) break
    await db.transaction('rw', ALL_TABLES(), async () => {
      markSilent()
      for (const row of rows) await applyRow(row, { cloudRows: db.cloudRows, first })
      await patchMeta({ watermark: rows[rows.length - 1].synced_at })
    })
    // Every id the cloud holds is one this phone must never hand out again (sync safety, 2026-10-02).
    raiseFloors(maxIds(rows))
    applied += rows.length
    if (rows.length < PAGE) break
  }
  return applied
}

/**
 * A full page may end inside a run of rows written with one timestamp: the other app stamps a
 * whole batch alike, and the next page asks only for what is newer, so the rest of the run
 * would never be read. Hold the last run back; the next page reads it whole. A page that is
 * one run from end to end has nothing to hold back and is taken as it is.
 */
export function wholeRuns<T extends { synced_at: string }>(rows: T[], page: number): T[] {
  if (rows.length < page) return rows
  const cut = rows.findIndex((r) => r.synced_at === rows[rows.length - 1].synced_at)
  return cut > 0 ? rows.slice(0, cut) : rows
}

/**
 * The other app's finished workouts, read from the same database: the plan lets this app read
 * other apps' rows, and it writes none of them. A row of its workouts store with a completion
 * time becomes an outside day here; a deleted row takes its day back. Its own watermark, so a
 * wipe or a fresh install starts again from the beginning.
 */
async function pullOutside(store: CloudStore): Promise<number> {
  let applied = 0
  // A richer reading of the rows re-reads them all once from the start, so every session already kept gains its detail (Part 35).
  const first = await getOutsideMeta()
  if ((first.detail ?? 1) < OUTSIDE_DETAIL) await db.cloudMeta.put({ ...first, key: 'outside', watermark: '', detail: OUTSIDE_DETAIL })
  for (;;) {
    const meta = await getOutsideMeta()
    const page = await store.pull(OUTSIDE_APP, meta.watermark, PAGE)
    if (!page.length) break
    const rows = wholeRuns(page, PAGE)
    await db.transaction('rw', [db.outside, db.cloudMeta], async () => {
      for (const row of rows) {
        if (row.store !== OUTSIDE_STORE) continue
        const day = row.deleted || !row.body ? null : outsideDayOf(row.body)
        if (day) await db.outside.put({ id: row.id, ...day })
        else await db.outside.delete(row.id)
      }
      await db.cloudMeta.put({ ...meta, key: 'outside', watermark: rows[rows.length - 1].synced_at, detail: OUTSIDE_DETAIL })
    })
    applied += rows.length
    if (page.length < PAGE) break
  }
  return applied
}

/**
 * The Worker's lines, read from the same database the way the other app's workouts are: a row of
 * its briefs store becomes a line here, a deleted row takes it back, its own watermark.
 */
async function pullBrain(store: CloudStore): Promise<number> {
  let applied = 0
  for (;;) {
    const meta = await getBrainMeta()
    const rows = await store.pull(BRAIN_APP, meta.watermark, PAGE)
    if (!rows.length) break
    await db.transaction('rw', [db.brainBriefs, db.brainReads, db.coachPicks, db.coachProposals, db.cloudMeta], async () => {
      for (const row of rows) {
        if (row.store === PROPOSALS_STORE) {
          const p = row.deleted || !row.body ? null : coachProposalOf(row.id, row.body)
          if (p) await db.coachProposals.put(p)
          else await db.coachProposals.delete(row.id)
          continue
        }
        if (row.store === COACH_STORE) {
          const pick = row.deleted || !row.body ? null : coachPickOf(row.id, row.body)
          if (pick) await db.coachPicks.put(pick)
          else await db.coachPicks.delete(row.id)
          continue
        }
        if (row.store === READS_STORE) {
          const read = row.deleted || !row.body ? null : brainReadOf(row.id, row.body)
          if (read) await db.brainReads.put(read)
          else await db.brainReads.delete(row.id)
          continue
        }
        if (row.store !== BRAIN_STORE) continue
        const line = row.deleted || !row.body ? null : brainBriefOf(row.id, row.body)
        if (line) await db.brainBriefs.put(line)
        else await db.brainBriefs.delete(row.id)
      }
      await db.cloudMeta.put({ ...meta, key: 'brain', watermark: rows[rows.length - 1].synced_at })
    })
    applied += rows.length
    if (rows.length < PAGE) break
  }
  return applied
}

/** The latest queued change per row, in queue order, so one push carries one row per record. */
export function latestPerRow(rows: readonly OutboxRow[]): OutboxRow[] {
  const latest = new Map<string, OutboxRow>()
  for (const r of rows) latest.set(`${r.store}|${r.key}`, r)
  return [...latest.values()]
}

/**
 * A tombstone's body (2026-10-02): the cloud's records table refuses a NULL body ("NOT NULL constraint
 * failed: records.body"), and a refused row once held back every upload behind it. Empty JSON carries
 * nothing of the record, and every reader skips a row marked deleted.
 */
export const TOMBSTONE_BODY = '{}'

export function toCloudRow(r: OutboxRow, deviceId: string, syncedAt: string): CloudRow {
  return { app: APP, store: r.store, id: r.key, day: r.day, body: r.op === 'delete' ? TOMBSTONE_BODY : r.body, updated_at: r.updatedAt, deleted: r.op === 'delete' ? 1 : 0, device_id: deviceId, synced_at: syncedAt }
}

/** A row the database itself will not take (an SQLite error), as against a network that is down. */
export function refusedByCloud(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code
  const message = e instanceof Error ? e.message : String(e)
  return (typeof code === 'string' && code.startsWith('SQLITE_')) || /\bSQLITE_[A-Z]+/.test(message)
}

/** What a push did: how many rows went through, how many the cloud refused (kept queued), and the first refusal's words. */
export interface PushResult {
  pushed: number
  refused: number
  reason: string | null
}

/**
 * Drains the outbox in batches. Each pushed row gets its own synced_at, a millisecond apart, so paging
 * never skips one. The cloud takes a batch whole or not at all, so a batch it refuses is sent again
 * one row at a time: a row it refuses stays queued with every change to its record, and never holds
 * back the rest (2026-10-02). A network that goes down stops the push, as before.
 */
async function push(store: CloudStore, deviceId: string): Promise<PushResult> {
  let pushed = 0
  const refused = new Map<string, string>()
  const settle = async (batch: readonly OutboxRow[], rows: readonly CloudRow[]) => {
    if (!rows.length) return
    raiseFloors(maxIds(rows))
    const carried = new Set(rows.map((r) => `${r.store}|${r.id}`))
    await db.transaction('rw', [db.outbox, db.cloudRows], async () => {
      const ids = batch.filter((r) => carried.has(`${r.store}|${r.key}`)).map((r) => r.id as number)
      await db.outbox.bulkDelete(ids)
      await db.cloudRows.bulkPut(rows.map((r) => ({ store: r.store, key: r.id, updatedAt: r.updated_at, syncedAt: r.synced_at })))
    })
    pushed += rows.length
  }
  for (;;) {
    const batch = await db.outbox
      .orderBy('id')
      .filter((r) => !refused.has(`${r.store}|${r.key}`))
      .limit(BATCH * 4)
      .toArray()
    if (!batch.length) break
    const latest = latestPerRow(batch).slice(0, BATCH)
    const base = Date.now()
    const rows = latest.map((r, i) => toCloudRow(r, deviceId, new Date(base + i).toISOString()))
    try {
      await store.upsert(rows)
      await settle(batch, rows)
      continue
    } catch (e) {
      if (!refusedByCloud(e)) throw e
    }
    const taken: CloudRow[] = []
    for (const row of rows) {
      try {
        await store.upsert([row])
        taken.push(row)
      } catch (e) {
        if (!refusedByCloud(e)) {
          await settle(batch, taken)
          throw e
        }
        refused.set(`${row.store}|${row.id}`, e instanceof Error ? e.message : String(e))
      }
    }
    await settle(batch, taken)
  }
  return { pushed, refused: refused.size, reason: refused.size ? [...refused.values()][0] : null }
}

function backoffMs(): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 3 ** Math.min(attempts, 6))
}

function scheduleRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void syncNow()
  }, backoffMs())
}

/** The one-time repair pass: on its first sync with this version, the phone walks its whole history again under the safe merge (2026-10-02). */
export const REPAIR = '2026-10-02'

async function run(): Promise<SyncOutcome> {
  const { token } = await resolveToken()
  if (!token) {
    setLive('off')
    return 'noToken'
  }
  if (!isOnline()) {
    setLive('offline')
    return 'offline'
  }
  setLive('syncing')
  try {
    const deviceId = await ensureDeviceId()
    const store = await factory(token)
    if ((await getMeta()).repair !== REPAIR) await patchMeta({ watermark: '', repair: REPAIR })
    // The phone's own rows first. The Worker's lines and the other app's workouts come back whatever
    // happens to them (the writer history stayed empty while a failing pull blocked them),
    // and nothing is pushed unless every pull went through: never over a cloud this phone could not read.
    let failure: unknown = null
    try {
      await pull(store)
      // This storage has read the whole cloud: from here its ids run on from what it holds (2026-10-03).
      if (!inStep()) markInStep()
    } catch (e) {
      failure = e
    }
    try {
      await pullOutside(store)
    } catch (e) {
      failure ??= e
    }
    try {
      await pullBrain(store)
    } catch (e) {
      failure ??= e
    }
    if (failure) throw failure
    // With the whole history back, the links a reused id bent are taken back, once per repair.
    if ((await getMeta()).relinked !== REPAIR) {
      await unlinkLost()
      await patchMeta({ relinked: REPAIR })
    }
    // With the history in: what the browser cleared before the cloud had it comes back from the second copy, and goes up with the rest.
    const back = await putBackPending()
    if (back) appendLog({ at: new Date().toISOString(), kind: 'restored', detail: back === 1 ? copy.cloud.logPutBackOne : fill(copy.cloud.logPutBack, { n: String(back) }) })
    const pushed = await push(store, deviceId)
    if (pushed.refused) {
      // The rest went through; the refused rows wait in the queue. The phone's last sync stays the last one that left nothing behind.
      attempts++
      await patchMeta({ lastError: pushed.reason, refused: pushed.refused })
      setLive('error')
      scheduleRetry()
      return 'failed'
    }
    const now = new Date().toISOString()
    await store.touchDevice({ device_id: deviceId, app: APP, label: DEVICE_LABEL, at: now })
    await patchMeta({ lastSyncAt: now, lastError: null, refused: 0 })
    attempts = 0
    setLive('idle')
    return 'done'
  } catch (e) {
    attempts++
    const message = e instanceof Error ? e.message : String(e)
    await patchMeta({ lastError: message, refused: 0 }).catch(() => undefined)
    setLive(isOnline() ? 'error' : 'offline')
    scheduleRetry()
    return 'failed'
  }
}

/** One sync, pull then push. A second call while one runs waits for it and then runs once more. */
export function syncNow(): Promise<SyncOutcome> {
  if (running) {
    again = true
    return running
  }
  running = run().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

/** Deletes this app's rows in the cloud, before a wipe. True when there is nothing to delete or it went through. */
export async function deleteCloudCopy(): Promise<boolean> {
  const settings = await getSettings()
  if (!settings.cloud.token) return true
  try {
    const store = await factory(settings.cloud.token)
    await store.deleteApp(APP, settings.cloud.deviceId || 'unregistered')
    return true
  } catch {
    return false
  }
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncNow()
  }, PUSH_DEBOUNCE_MS)
}

/** Whether the phone's browser keeps this app's storage when space runs low: true kept, false not granted, null unknown (sync safety, 2026-10-02). */
let persisted: boolean | null = null

export function storagePersisted(): boolean | null {
  return persisted
}

/** Asks the browser to keep this app's storage rather than clear it under pressure; an installed app is usually granted it. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    persisted = storage?.persist ? (await storage.persisted()) || (await storage.persist()) : null
  } catch {
    persisted = null
  }
  for (const w of watchers) w()
  return persisted
}

/** On open, every fifteen minutes, when the network returns, and soon after any change. Returns the stop function. */
/** A phone that synced before this version knew to mark it has read the cloud: it is in step. */
export async function markInStepIfSynced(): Promise<void> {
  if (inStep()) return
  if ((await getMeta()).lastSyncAt) markInStep()
}

export function startCloud(): () => void {
  void markInStepIfSynced().catch(() => undefined)
  void captureFloors(db).catch(() => undefined)
  void requestPersistence()
  // The queue as it stands is kept beside the token before the first sync can take anything out of it.
  void keepQueued(db)
    .catch(() => 0)
    .then(() => syncNow())
  const interval = setInterval(() => void syncNow(), PULL_EVERY_MS)
  const onOnline = () => void syncNow()
  window.addEventListener('online', onOnline)
  const stopOutbox = onOutboxChange(schedulePush)
  return () => {
    clearInterval(interval)
    window.removeEventListener('online', onOnline)
    stopOutbox()
    if (pushTimer) clearTimeout(pushTimer)
    if (retryTimer) clearTimeout(retryTimer)
  }
}

/** The status for the screen: the live state, the last sync, the last error, and how much is waiting. */
export function useCloudStatus(): SyncStatus | undefined {
  const settings = useLive(getSettings, [])
  const meta = useLive(getMeta, [])
  const pending = useLive(() => db.outbox.count(), [])
  const [, bump] = useState(0)
  useEffect(() => {
    const w = () => bump((n) => n + 1)
    watchers.add(w)
    return () => void watchers.delete(w)
  }, [])
  if (!settings || !meta || pending === undefined) return undefined
  const hasToken = Boolean(settings.cloud.token)
  return { state: hasToken ? live : 'off', hasToken, lastSyncAt: meta.lastSyncAt, lastError: meta.lastError, pending, notice: latestNotice(), persisted, refused: meta.refused ?? 0 }
}
