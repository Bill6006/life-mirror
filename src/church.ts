import { BLOCKS, blockStart, type Block } from './blocks'

// Its own shapes, structurally the week's and a day context's, so the Worker can read a synced day with it.
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
type WeekChurch = { churchDay: Weekday | null; thirdDay?: Weekday | null; sabbathServices?: string[]; thirdDayServices?: string[] }
type ChurchPart = { church?: 'sabbath' | 'third'; services?: string[] }

// Sabbath Day and Third Day (Item 3, 2026-10-23): two church schedules in the week's shape. The Sabbath is the whole of its
// day; the Third Day is the blocks its service times fall in (Tuesday's 19:30 is the evening). A schedule is context, never
// attendance: it shapes what fits a block, and it writes no check-in answer, no chip and no history. It touches nothing of home
// or office: the absence of church means only not church. A day's context keeps the schedule it was made under, so an edit
// re-shapes today at most, never an earlier day; a day made before the schedule existed keeps "a church day" as it was read
// then, its morning.

export const SABBATH_DEFAULT: readonly string[] = ['07:30', '14:30', '19:30']
export const THIRD_DAY_DEFAULT: readonly string[] = ['19:30']
/** The Third Day a week from before Item 3 reads: Tuesday. */
export const THIRD_DAY_WEEKDAY: Weekday = 2

export interface ChurchSchedule {
  sabbath: { day: Weekday | null; services: string[] }
  third: { day: Weekday | null; services: string[] }
}

/** Service times as kept: HH:MM, each once, in the day's order. */
export function cleanTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))].sort()
}

/** The week's two schedules, a week from before Item 3 read with the defaults: Tuesday at 19:30, and the Sabbath's three services. */
export function churchSchedule(w: WeekChurch): ChurchSchedule {
  return {
    sabbath: { day: w.churchDay, services: cleanTimes(w.sabbathServices ?? SABBATH_DEFAULT) },
    third: { day: w.thirdDay === undefined ? THIRD_DAY_WEEKDAY : w.thirdDay, services: cleanTimes(w.thirdDayServices ?? THIRD_DAY_DEFAULT) },
  }
}

/** What a day's context carries of the schedule: the Sabbath, or the Third Day (the Sabbath when both fall on one day), with its times. */
export function churchOf(w: WeekChurch, weekday: Weekday): ChurchPart {
  const s = churchSchedule(w)
  if (s.sabbath.day === weekday) return { church: 'sabbath', services: s.sabbath.services }
  if (s.third.day === weekday) return { church: 'third', services: s.third.services }
  return {}
}

type ChurchCtx = ChurchPart & { churchDay?: boolean }

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
/** The block a service time falls in. */
export function blockOfService(hhmm: string): Block {
  const m = minutes(hhmm)
  return m >= minutes(blockStart.evening) ? 'evening' : m >= minutes(blockStart.afternoon) ? 'afternoon' : 'morning'
}

/** The blocks a day's church context covers: the Sabbath every block; the Third Day its services' blocks (the evening when it has none); an older church day its morning. */
export function churchBlocks(ctx: ChurchCtx | null | undefined): Record<Block, boolean> {
  const none = { morning: false, afternoon: false, evening: false }
  if (!ctx) return none
  if (ctx.church === 'sabbath') return { morning: true, afternoon: true, evening: true }
  if (ctx.church === 'third') {
    const at = new Set((ctx.services?.length ? ctx.services : ['19:30']).map(blockOfService))
    return Object.fromEntries(BLOCKS.map((b) => [b, at.has(b)])) as Record<Block, boolean>
  }
  return ctx.churchDay ? { ...none, morning: true } : none
}

export function churchIn(ctx: ChurchCtx | null | undefined, block: Block): boolean {
  return churchBlocks(ctx)[block]
}

/** Whether a day is the Sabbath: on the schedule, or an older church day. */
export function sabbathOf(ctx: ChurchCtx | null | undefined): boolean {
  return Boolean(ctx && (ctx.church === 'sabbath' || (ctx.church === undefined && ctx.churchDay)))
}

/** Times said as a list: "07:30, 14:30 and 19:30". */
export function timesWords(times: readonly string[]): string {
  return times.length <= 1 ? (times[0] ?? '') : `${times.slice(0, -1).join(', ')} and ${times[times.length - 1]}`
}

/** A day's church, in the words the Brain and Ask hear: scheduled, never attended; null when the day holds none. */
export function churchWords(ctx: ChurchCtx | null | undefined): string | null {
  if (!ctx) return null
  const t = ctx.services ?? []
  if (ctx.church === 'sabbath') return t.length ? `the Sabbath, services scheduled at ${timesWords(t)}` : 'the Sabbath'
  if (ctx.church === 'third') return t.length ? `the Third Day, ${t.length === 1 ? 'a service' : 'services'} scheduled at ${timesWords(t)}` : 'the Third Day'
  return ctx.churchDay ? 'a church day' : null
}
