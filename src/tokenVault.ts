// The token's second home on the phone, and the record of what happened to it. The first home is
// settings.cloud in the app's database; this one is the browser's local storage, a different engine
// in the same browser, so one losing its records does not lose the token. The phone's device id keeps
// a second copy here too, so a phone that lost its settings stays the same device in the cloud. A mark
// carries only times and the log only times and words: nothing here ever holds the token but the one
// copy, and none of it enters the outbox, an export or the cloud copy.

export const MIRROR_KEY = 'lm.cloudToken'
export const DEVICE_KEY = 'lm.cloudDevice'
export const MARK_KEY = 'lm.cloudTokenMark'
export const LOG_KEY = 'lm.cloudTokenLog'
const LOG_LIMIT = 8

/** When the token was saved on this phone and when it was last found. Never the token. */
export interface TokenMark {
  savedAt: string
  lastSeenAt: string
}

export type TokenEventKind = 'saved' | 'restored' | 'missing' | 'removed'

export interface TokenEvent {
  at: string
  kind: TokenEventKind
  detail: string
  /** On a missing entry: when a copy was last found. */
  lastSeenAt?: string
}

export interface KeyValue {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

let override: KeyValue | null = null

/** The tests run under Node, with no local storage: they hand in a map. */
export function setTokenStorageForTests(kv: KeyValue | null): void {
  override = kv
}

/** A map with the same three calls, for the tests. */
export function memoryKeyValue(): KeyValue {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

/** Local storage when the browser offers it; null under Node or when it is blocked, and then the second home does not exist. */
export function tokenStorage(): KeyValue | null {
  if (override) return override
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function read(key: string): string | null {
  try {
    const value = tokenStorage()?.getItem(key) ?? null
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

/** Writes and reads back; false when the value did not stick. */
function write(key: string, value: string): boolean {
  try {
    const kv = tokenStorage()
    if (!kv) return false
    kv.setItem(key, value)
    return kv.getItem(key) === value
  } catch {
    return false
  }
}

function remove(key: string): void {
  try {
    tokenStorage()?.removeItem(key)
  } catch {
    // nothing to remove, or nowhere to remove it from
  }
}

function parse(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isMark(value: unknown): value is TokenMark {
  return typeof value === 'object' && value !== null && typeof (value as TokenMark).savedAt === 'string' && typeof (value as TokenMark).lastSeenAt === 'string'
}

function isEvent(value: unknown): value is TokenEvent {
  if (typeof value !== 'object' || value === null) return false
  const e = value as TokenEvent
  return typeof e.at === 'string' && typeof e.detail === 'string' && (e.kind === 'saved' || e.kind === 'restored' || e.kind === 'missing' || e.kind === 'removed')
}

export const readMirror = (): string | null => read(MIRROR_KEY)
export const writeMirror = (token: string): boolean => write(MIRROR_KEY, token)
export const clearMirror = (): void => remove(MIRROR_KEY)

export const readDeviceMirror = (): string | null => read(DEVICE_KEY)
export const writeDeviceMirror = (id: string): boolean => write(DEVICE_KEY, id)

export function readMark(): TokenMark | null {
  const parsed = parse(read(MARK_KEY))
  return isMark(parsed) ? { savedAt: parsed.savedAt, lastSeenAt: parsed.lastSeenAt } : null
}

export const writeMark = (mark: TokenMark): boolean => write(MARK_KEY, JSON.stringify(mark))
export const clearMark = (): void => remove(MARK_KEY)

/** Every event the log still holds, oldest first, the newest eight. */
export function readLog(): TokenEvent[] {
  const parsed = parse(read(LOG_KEY))
  return Array.isArray(parsed) ? parsed.filter(isEvent) : []
}

/** Adds an event; a repeated event moves to the end rather than keeping its first place. */
export function appendLog(event: TokenEvent): TokenEvent {
  const seen = new Map<string, TokenEvent>()
  for (const e of [...readLog(), event]) {
    const key = `${e.at}|${e.kind}|${e.detail}`
    seen.delete(key)
    seen.set(key, e)
  }
  const events = [...seen.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-LOG_LIMIT)
  write(LOG_KEY, JSON.stringify(events))
  return event
}

/** The newest event, when the last thing that happened to the token was a loss. */
export function latestNotice(): TokenEvent | null {
  const log = readLog()
  const last = log[log.length - 1]
  return last && (last.kind === 'restored' || last.kind === 'missing') ? last : null
}
