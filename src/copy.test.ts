import { describe, expect, it } from 'vitest'
import { copy } from './copy'
import catalogue from './catalogue.json'
import library from './library.json'
import readings from './readings.json'
import her from './her.json'
import { daysAgoWords } from './format'

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

  it('keeps build-phase wording off every screen: the copy, the catalogue, the library, the readings and her checklists', () => {
    const phase = /\bPhase (?:\d+|F)\b/
    const found: string[] = []
    for (const [name, source] of Object.entries({ copy, catalogue, library, readings, her })) for (const s of strings(source)) if (phase.test(s)) found.push(`${name}: "${s.slice(0, 80)}"`)
    expect(found).toEqual([])
  })

  it('says how long ago in words a person would use', () => {
    expect(daysAgoWords(0, copy.when)).toBe('today')
    expect(daysAgoWords(1, copy.when)).toBe('yesterday')
    expect(daysAgoWords(3, copy.when)).toBe('3 days ago')
  })
})
