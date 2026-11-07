import data from './methods.json'

// The method library (P3 of the AI-generated Paths design, 2026-11-06): the training methods a Path the
// catalogue adds may build its reps from, each resting on library cards, and the methods none may use.

export interface Method {
  id: string
  name: string
  what: string
  /** The library cards behind it, admitted. */
  cards: readonly string[]
  works: string
  fails: string
  size: string
}

export interface BlockedMethod {
  id: string
  name: string
  why: string
  /** The card that rules it out: disputed, or a finding that failed to replicate. */
  card: string
}

const library = data as unknown as { methods: Method[]; blocked: BlockedMethod[] }

export const methods: readonly Method[] = library.methods
export const blockedMethods: readonly BlockedMethod[] = library.blocked

export function methodById(id: string): Method | undefined {
  return methods.find((m) => m.id === id)
}

export function isBlocked(id: string): boolean {
  return blockedMethods.some((b) => b.id === id)
}
