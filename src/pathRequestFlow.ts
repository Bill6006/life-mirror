import { db, type PathRequest } from './db'
import { triageGoal, type Triage } from './pathTriage'

// Asking for a Path (P5): your words and the intake's answers, routed by the rules alone before anything is kept.
// A goal the rules route as a Path waits for a draft, made later by your own Claude; any other route is kept with
// what it was, the app's own help shown at once. Nothing a model writes decides the route.

/** Where it should show up: the intake's choices, in the app's words. None chosen means anywhere in your week. */
export const WHERE = ['home', 'work', 'outAndAbout', 'withPeople', 'callsAndMessages'] as const
export type Where = (typeof WHERE)[number]
/** Minutes a week: the intake's choices, ninety unless you say. */
export const MINUTES = [30, 60, 90, 120, 180] as const

export interface PathAnswers {
  goal: string
  why?: string
  where?: readonly string[]
  month?: string
  minutes: number
  offLimits?: string
}

/** The route your answers take by the rules: the goal, read with your why and what is off-limits for harm and risk. */
export function routeOf(a: Pick<PathAnswers, 'goal' | 'why' | 'offLimits'>): Triage {
  return triageGoal(a.goal, [a.why ?? '', a.offLimits ?? ''])
}

/** Whether a route waits for a draft: a Path, or practice beside the app's own help. */
export const drafts = (t: Pick<Triage, 'route' | 'practice'>): boolean => t.route === 'fits' || (t.route === 'redirect' && t.practice === true)

const kept = (v: string | undefined, n: number) => (v?.trim() ? v.trim().slice(0, n) : undefined)

/** Asked: kept with its route, waiting for a draft only when the rules route it as one. */
export async function requestPath(a: PathAnswers, now: Date = new Date()): Promise<{ id: number; triage: Triage }> {
  const triage = routeOf(a)
  const at = now.toISOString()
  const row: PathRequest = {
    at,
    goal: a.goal.trim().slice(0, 200),
    ...(kept(a.why, 300) ? { why: kept(a.why, 300) } : {}),
    ...(a.where?.length ? { where: [...a.where].slice(0, 8) } : {}),
    ...(kept(a.month, 300) ? { month: kept(a.month, 300) } : {}),
    minutes: a.minutes,
    ...(kept(a.offLimits, 300) ? { offLimits: kept(a.offLimits, 300) } : {}),
    route: triage.route,
    state: drafts(triage) ? 'queued' : 'triaged',
    updatedAt: at,
  }
  const id = (await db.pathRequests.add(row)) as number
  return { id, triage }
}

/** Withdrawn before a draft starts: it is never drafted. Once drafting, a Path that comes is yours to set aside. */
export async function withdrawRequest(id: number, now: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.pathRequests, db.pathJobs, async () => {
    const r = await db.pathRequests.get(id)
    const job = await db.pathJobs.where('requestId').equals(id).first()
    if (!r || r.state !== 'queued' || job) return
    await db.pathRequests.update(id, { state: 'withdrawn', updatedAt: now.toISOString() })
  })
}
