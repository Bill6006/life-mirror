import { findPath, pathReps, type Path, type PathChange, type PathId } from './catalogue'
import { db, type Aim, type PathVersion } from './db'

// Your decisions on the versions of a Path the catalogue adds (P1, Paths as data, 2026-11-06): a Path
// that is not built in is offered nowhere until you start its version; a later version is shown with
// what changed before it runs, a major change waiting for you and a minor one noted. Nothing here
// rewrites a Path: the catalogue holds each version, and your record holds what you decided.

/** A key-sorted rendering, so the same content always gives the same text. */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`
  if (x && typeof x === 'object') return `{${Object.keys(x as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(x) ?? 'null'
}

/** FNV-1a over a text, from a seed: two seeds make a sixteen-digit hash, enough to tell one version's content from another's. */
function fnv(text: string, seed: number): string {
  let h = seed >>> 0
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The hash of a Path as you would see it: the Path and every rep it holds. Its change records are left out, so recording a change never makes a new version by itself. */
export function contentHash(path: Path): string {
  const { changes: _changes, ...rest } = path
  const text = stable({ path: rest, reps: pathReps(path.id).map((m) => ({ ...m, path: { [path.id]: m.path?.[path.id] } })) })
  return fnv(text, 2166136261) + fnv(text, 0x9e3779b9)
}

/** Your latest decision on a Path, any version. */
export function latestDecision(path: Pick<Path, 'id'>, versions: readonly PathVersion[]): PathVersion | null {
  return versions.filter((v) => v.path === path.id).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (b.id ?? 0) - (a.id ?? 0)))[0] ?? null
}

/** The changes since the version you started, newest last: empty while you are on the current one. */
export function changesSince(path: Path, started: Pick<PathVersion, 'version' | 'hash'>): PathChange[] {
  if (started.hash === contentHash(path)) return []
  const all = [...(path.changes ?? [])]
  const from = all.findIndex((c) => c.version === started.version)
  return from === -1 ? all : all.slice(from + 1)
}

export type PathStanding =
  /** Built in: offered as ever. */
  | { kind: 'builtIn' }
  /** Not decided yet, or later: a proposal, offered nowhere. */
  | { kind: 'proposed'; later: boolean }
  /** Not this: kept as you left it, offered nowhere. */
  | { kind: 'declined'; reason: string | null }
  /** Started, on the current version, or on an older one whose changes since are all minor: offered, the minor changes noted. */
  | { kind: 'started'; noted: PathChange[] }
  /** Started, and a major change since: offered nowhere until you continue. */
  | { kind: 'waiting'; changes: PathChange[] }

/** Where a Path stands with you, from your decisions alone. */
export function standing(path: Path, versions: readonly PathVersion[]): PathStanding {
  if (path.builtIn) return { kind: 'builtIn' }
  const last = latestDecision(path, versions)
  if (!last || last.decision === 'later') return { kind: 'proposed', later: last?.decision === 'later' }
  if (last.decision === 'notThis') return { kind: 'declined', reason: last.reason ?? null }
  const since = changesSince(path, last)
  return since.some((c) => c.major) ? { kind: 'waiting', changes: since } : { kind: 'started', noted: since }
}

/** Whether a Path may be offered: built in, or started on a version you have seen. */
export function offeredNow(path: Path, versions: readonly PathVersion[]): boolean {
  const s = standing(path, versions)
  return s.kind === 'builtIn' || s.kind === 'started'
}

/**
 * Whether a commitment is offered today: one on a Path the catalogue adds only on a version you started that passes the
 * compiler's checks (P1, P4); one on a Path this phone does not know, never (2026-11-12: a generated Path whose row has
 * not arrived yet, or one the phone's own check refuses); every other as ever.
 */
export function aimOffered(aim: Pick<Aim, 'kind' | 'path'>, versions: readonly PathVersion[], compiled: (path: Path) => boolean = () => true): boolean {
  if (aim.kind !== 'path') return true
  const path = findPath(aim.path as PathId)
  if (!path) return false
  return offeredNow(path, versions) && (path.builtIn === true || compiled(path))
}

/** Your decision on the Path as it stands now: its version, its content's hash and the cards it rests on, each with its review day. */
export async function decide(path: Path, decision: PathVersion['decision'], cards: readonly { id: string; reviewed: string }[], reason?: string, now: Date = new Date()): Promise<void> {
  const text = reason?.trim()
  await db.pathVersions.add({ path: path.id, version: path.version ?? '1', hash: contentHash(path), decision, at: now.toISOString(), cards: path.cards.map((id) => cards.find((c) => c.id === id) ?? { id, reviewed: '' }), ...(text ? { reason: text } : {}) })
}
