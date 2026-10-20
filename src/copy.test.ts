import { describe, expect, it } from 'vitest'
import { copy } from './copy'
import catalogue from './catalogue.json'
import library from './library.json'
import readings from './readings.json'
import her from './her.json'
import { clockTimes12, daysAgoWords } from './format'

// Rule 4 of the plan: a reading, never a verdict. These words fail the build.
const banned = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']
/**
 * The owner's own words, kept exactly as they gave them, that use a banned word without judging anyone. Only the
 * whole phrase is allowed: "Anything behind it?" asks what lies behind a drop (stage 3, group 3, the owner's
 * word of 2026-10-09, restored at their word of 2026-10-18); "The evidence behind this has changed" is Ask Life Mirror's
 * marker on an older answer, word for word as the owner agreed it (point 8, 2026-10-11), and names what an answer rests
 * on; "behind" anywhere else still fails.
 */
const ownersWords = ['Anything behind it?', 'The evidence behind this has changed']

function* strings(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* strings(v)
}

describe('UI copy', () => {
  it('contains no verdict words', () => {
    const offences: string[] = []
    for (const s of strings(copy)) {
      const plain = ownersWords.reduce((rest, phrase) => rest.split(phrase).join(''), s)
      for (const w of banned) {
        if (new RegExp(`\\b${w}\\b`, 'i').test(plain)) offences.push(`"${s}" uses "${w}"`)
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

  it('writes no 24-hour clock time anywhere a screen shows it: 5:30 PM, never 17:30 (truth audit, 2026-09-24)', () => {
    const h24 = /(?<![\d:.])\d{1,2}:[0-5]\d(?![\d:])(?!\s?[AP]M\b)/g
    const found: string[] = []
    for (const [name, source] of Object.entries({ copy, catalogue, readings, her })) {
      for (const s of strings(source)) for (const m of s.matchAll(h24)) found.push(`${name}: "${m[0]}" in "${s.slice(0, 80)}"`)
    }
    // The library is research text the Worker reads as it stands (13:00 to 16:00 in one card); the screens show a card's words through clockTimes12.
    for (const card of library) for (const s of [card.claim, card.effect]) for (const m of clockTimes12(s).matchAll(h24)) found.push(`library ${card.id}: "${m[0]}"`)
    expect(found).toEqual([])
  })

  it('says how long ago in words a person would use', () => {
    expect(daysAgoWords(0, copy.when)).toBe('today')
    expect(daysAgoWords(1, copy.when)).toBe('yesterday')
    expect(daysAgoWords(3, copy.when)).toBe('3 days ago')
  })
})
