import { addDays, blockAt } from './blocks'
import { db, type UseKind, type UseRow } from './db'

// How the app is used (Part 34): kept on this phone alone, never synced, never sent, never read by
// any model. Counts and times, no content. After a few weeks it is read together, and what comes of
// it is a removal list for your veto, not a feature list.

/** Rows older than this are dropped when the app opens. */
export const USE_KEEP_DAYS = 120

/** The window the summary covers. */
export const USE_WINDOW_DAYS = 28

/** Records one use. It never stands in the way: a failed write is dropped. */
export async function logUse(kind: UseKind, what?: string, now: Date = new Date()): Promise<void> {
  try {
    await db.useLog.add({ day: blockAt(now).day, at: now.toISOString(), kind, ...(what ? { what } : {}) })
  } catch {
    // The log is an instrument; the app never waits on it or fails for it.
  }
}

export async function pruneUseLog(today: string): Promise<void> {
  await db.useLog.where('day').below(addDays(today, -USE_KEEP_DAYS)).delete()
}

export interface UseSummary {
  from: string
  to: string
  /** Each screen and how often it was opened, most first. */
  screens: { what: string; n: number }[]
  checkins: { opened: number; left: number }
  /** Days whose line offered one tap, the days that tap was taken, and how often Why was opened. */
  line: { withAction: number; taken: number; why: number }
  /** Days the coach picked a rep, and the days its pick was not taken. */
  coach: { picked: number; notTaken: number }
  notifications: number
  /** The People row's Change: opened, and a rep picked there. */
  change: { opened: number; picked: number }
}

/** The last four weeks of use, counted; the coach's picks and the line's taps are set against the record. */
export async function useSummary(today: string, days: number = USE_WINDOW_DAYS): Promise<UseSummary> {
  const from = addDays(today, -(days - 1))
  const inWindow = (d: string) => d >= from && d <= today
  const [rows, briefs, log, picks, offers] = await Promise.all([
    db.useLog.where('day').between(from, today, true, true).toArray(),
    db.brainBriefs.toArray(),
    db.briefLog.toArray(),
    db.coachPicks.toArray(),
    db.offers.toArray(),
  ])
  const of = (kind: UseKind) => rows.filter((r) => r.kind === kind)
  const screens = new Map<string, number>()
  for (const r of of('screen')) if (r.what) screens.set(r.what, (screens.get(r.what) ?? 0) + 1)
  // A day's line offered one tap when the line on screen that day carried one: the brain's own, else the phone's once shown.
  const withAction = new Set<string>()
  for (const b of briefs) if (b.kind === 'brief' && b.action && inWindow(b.day)) withAction.add(b.day)
  for (const l of log) if (l.action && l.shownAt && inWindow(l.day)) withAction.add(l.day)
  const takenDays = new Set(of('lineAction').map((r) => r.day))
  // A coach's pick is taken when a rep it chose was started that day; days still running are left out.
  const picked = picks.filter((p) => inWindow(p.day) && p.day < today)
  const coachDays = new Set(offers.filter((o) => o.chosenBy === 'coach').map((o) => o.day))
  return {
    from,
    to: today,
    screens: [...screens].map(([what, n]) => ({ what, n })).sort((a, b) => b.n - a.n || (a.what < b.what ? -1 : 1)),
    checkins: { opened: of('checkinOpened').length, left: of('checkinLeft').length },
    line: { withAction: withAction.size, taken: takenDays.size, why: of('lineWhy').length },
    coach: { picked: picked.length, notTaken: picked.filter((p) => !coachDays.has(p.day)).length },
    notifications: of('notification').length,
    change: { opened: screens.get('pathChange') ?? 0, picked: of('changePicked').length },
  }
}

/** Every row, oldest first, for the export. */
export function useRows(): Promise<UseRow[]> {
  return db.useLog.orderBy('id').toArray()
}
