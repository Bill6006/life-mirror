import { describe, expect, it } from 'vitest'
import { copy } from './copy'

// Rule 4 of the plan: a reading, never a verdict. These words fail the build.
const banned = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']

function* strings(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* strings(v)
}

describe('UI copy', () => {
  it('contains no verdict words', () => {
    const offences: string[] = []
    for (const s of strings(copy)) {
      for (const w of banned) {
        if (new RegExp(`\\b${w}\\b`, 'i').test(s)) offences.push(`"${s}" uses "${w}"`)
      }
    }
    expect(offences).toEqual([])
  })
})
