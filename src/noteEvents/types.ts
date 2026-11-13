// The one list of event types (2026-11-13): the recurring things a read may notice in notes. Every read tags from this
// list alone, by a type's definition, and every count reads a stored event's type through it. A type that is renamed
// keeps the ids it was known by, so its events stay one count and never split in two. No import: the phone and the
// Worker both take this file.
//
// The list ships empty. A type's definition is an instruction to the read that tags by it, and that read is the
// month's, built after this; its first types are written there. Until then nothing is tagged, and every rule here
// is held by tests on stand-in types.

export interface EventType {
  /** The id events are stored under from now on. */
  id: string
  /** What it is called, in a few plain words. */
  label: string
  /** What counts as one, for the read that tags: written so two reads would tag the same notes. */
  definition: string
  /** The ids it was known by before: an event stored under one of them is this type's. */
  was?: readonly string[]
}

export const EVENT_TYPES: readonly EventType[] = []

/** The key an automated browser holds to have two stand-in types beside the list, so the screens can be read before any type is written. */
export const STAND_IN_TYPES_KEY = 'life-mirror.preview.noticed'
/** Two types that mean nothing, for tests alone: one of them renamed once, so the merge has something to merge. */
export const STAND_IN_TYPES: readonly EventType[] = [
  { id: 'stand-in-one', label: 'A stand-in thing', definition: 'A stand-in type, for tests alone.', was: ['stand-in-first'] },
  { id: 'stand-in-two', label: 'Another stand-in thing', definition: 'A second stand-in type, for tests alone.' },
]

let forTests: readonly EventType[] | null = null
/** For unit tests: a list to read in place of the one list; null puts the one list back. */
export function setEventTypesForTests(list: readonly EventType[] | null): void {
  forTests = list
}

/**
 * The list every read on the phone uses: the one list. Only an automated browser that holds the test key reads the
 * two stand-in types beside it, as the app's earlier previews were opened; no phone in a hand is one, so no key
 * reaches it there.
 */
export function eventTypes(): readonly EventType[] {
  if (forTests) return forTests
  try {
    const g = globalThis as { navigator?: { webdriver?: boolean }; localStorage?: { getItem(key: string): string | null } }
    return g.navigator?.webdriver === true && g.localStorage?.getItem(STAND_IN_TYPES_KEY) === '1' ? [...EVENT_TYPES, ...STAND_IN_TYPES] : EVENT_TYPES
  } catch {
    return EVENT_TYPES
  }
}

/** The type an event's stored id names today, whether the id is current or an earlier one; null for an id no type knows. */
export function eventTypeOf(id: string, list: readonly EventType[] = EVENT_TYPES): EventType | null {
  return list.find((t) => t.id === id) ?? list.find((t) => t.was?.includes(id)) ?? null
}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * What is wrong with a list, one line a fault; none for a list every read can use. An id is said once across every
 * current and earlier id, so no stored event can belong to two types; and each type says what it is and what counts.
 */
export function eventTypeFaults(list: readonly EventType[] = EVENT_TYPES): string[] {
  const faults: string[] = []
  const seen = new Map<string, string>()
  for (const t of list) {
    if (!ID.test(t.id)) faults.push(`${t.id}: an id is lower-case letters and digits, hyphens between`)
    if (!t.label.trim()) faults.push(`${t.id}: no label`)
    if (!t.definition.trim()) faults.push(`${t.id}: no definition`)
    for (const id of [t.id, ...(t.was ?? [])]) {
      const other = seen.get(id)
      if (other !== undefined) faults.push(`${id}: named by ${other} and by ${t.id}`)
      seen.set(id, t.id)
    }
  }
  return faults
}
