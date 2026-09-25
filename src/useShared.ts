// How Life Mirror is used (Part 34, Follow-up F1): what the use log records and the names its
// summaries and slices use, shared by the phone and the Worker, so no import reaches the app.
//
// The log records meaningful use of Life Mirror itself: counts, times and fixed ids. Never
// anything outside the app, never a keystroke or what you type, never other phone activity.
// Usage is evidence of what happened, never an explanation of why.

/** Every kind of use the log records. */
export const USE_KINDS = ['appOpened', 'screen', 'checkinOpened', 'checkinLeft', 'lineAction', 'lineWhy', 'notification', 'changePicked'] as const
export type UseKind = (typeof USE_KINDS)[number]

export function isUseKind(v: unknown): v is UseKind {
  return typeof v === 'string' && (USE_KINDS as readonly string[]).includes(v)
}

/** The screens a summary or a slice may name, as it names them. */
export const USE_SCREENS: Readonly<Record<string, string>> = {
  now: 'Now',
  mirror: 'Mirror',
  moves: 'Moves',
  aims: 'Aims',
  settings: 'Settings',
  summary: 'a check-in’s summary',
  history: 'History',
  catalogue: 'the catalogue',
  // Named in full: a line may speak of the screen without claiming evidence.
  evidence: 'the Evidence screen',
  weekly: 'the weekly view',
  readings: 'Readings and chips',
  brain: 'Brain',
  data: 'Data and privacy',
  cloud: 'Cloud copy',
  legend: 'the Legend',
  wording: 'Wording',
  becoming: 'Becoming',
  follow: 'Follow-through',
  ladder: 'Earlier proofs',
  addAim: 'Add a commitment',
  pickStep: 'Change the step',
  pathChange: 'Change on the People row',
}

/** Settings' own sections, as a summary names them. */
const SETTINGS_SECTIONS: Readonly<Record<string, string>> = {
  week: 'The week',
  checkins: 'Check-ins and reminders',
  extras: 'Evening extras',
  moves: 'Moves and private items',
  direction: 'Your direction',
  theme: 'Theme',
  brain: 'Brain',
  cloud: 'Cloud copy',
  data: 'Data and privacy',
  readings: 'Readings and wording',
  legend: 'Legend',
  about: 'About',
}

/**
 * Screens whose opening is itself about the Partner path, her record or your private items: their
 * own switches govern them, so no summary or slice names them.
 */
export const USE_SCREENS_OUT: readonly string[] = ['partnerNotes', 'her', 'herPick', 'private']

/** The sections worth knowing were rarely or never opened: the tabs past Now, and the screens with doors of their own. */
export const USE_SECTIONS: readonly string[] = ['mirror', 'moves', 'aims', 'evidence', 'weekly', 'history', 'catalogue', 'readings', 'brain', 'legend', 'becoming', 'follow']

/** A screen's name for a summary or a slice; null for one left out or unknown, which is never named. */
export function useScreenName(id: string | null | undefined): string | null {
  if (!id || USE_SCREENS_OUT.includes(id)) return null
  if (id.startsWith('settings:')) {
    const section = SETTINGS_SECTIONS[id.slice('settings:'.length)]
    return section ? `Settings → ${section}` : null
  }
  return USE_SCREENS[id] ?? null
}

const BLOCKS = ['morning', 'afternoon', 'evening']

/** One event as a slice says it: what happened, in fixed words; null for an event left out. */
export function useEventText(kind: string, what: string | null | undefined): string | null {
  switch (kind) {
    case 'appOpened':
      return what === 'return' ? 'came back to Life Mirror' : 'opened Life Mirror'
    case 'screen': {
      const name = useScreenName(what)
      return name ? `opened ${name}` : null
    }
    case 'checkinOpened':
      return BLOCKS.includes(what ?? '') ? `opened the ${what} check-in` : 'opened a check-in'
    case 'checkinLeft':
      return BLOCKS.includes(what ?? '') ? `left the ${what} check-in before its end` : 'left a check-in before its end'
    case 'lineAction':
      return 'took the line’s one tap'
    case 'lineWhy':
      return 'opened Why under the line'
    case 'notification':
      return 'opened a notification'
    case 'changePicked':
      return 'chose a rep in Change'
    default:
      return null
  }
}

/**
 * The families a summary of skips may name, as it names them. Faith (Rule 10), the Partner path,
 * her moves and study are left out: their own switches and engines govern them.
 */
export const USE_FAMILIES: Readonly<Record<string, string>> = {
  ending: 'ending-the-day',
  movement: 'movement',
  steadying: 'steadying',
  food: 'food',
  house: 'house',
  people: 'people',
  rest: 'rest',
  money: 'money',
  setup: 'setup',
  charisma: 'charisma',
  finishing: 'finishing',
}

/** Usage facts on the sheet: all of them are the usage category's, and nothing else is. */
export function isUsageFact(id: string): boolean {
  return id.startsWith('usage.')
}

/**
 * Which usage facts bear on each task (task relevance): the day's line reads the short window of
 * its own taps, plans, skips and check-ins; the weekly review reads them all; the coach reads what
 * bears on the People row.
 */
export const USAGE_FOR: Readonly<Record<'line' | 'review' | 'coach' | 'skill' | 'progress', readonly string[]>> = {
  line: ['usage.line', 'usage.plans', 'usage.skips', 'usage.checkins'],
  review: ['usage.opened', 'usage.screens', 'usage.line', 'usage.checkins', 'usage.notifications', 'usage.change', 'usage.coach', 'usage.plans', 'usage.skips', 'usage.setup'],
  coach: ['usage.change', 'usage.coach'],
  // Parts 40 and 41: the skill coach reads no usage.
  skill: [],
  progress: [],
}

/** A raw slice of events, read only when the order of events matters: the weekly review's alone, a week at most, from the last fourteen days, forty events at most. */
export const USAGE_SLICE = { maxDays: 7, reachDays: 14, maxEvents: 40, defaultEvents: 20 } as const
