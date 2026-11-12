import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { factSheet, writeFactsRow } from './brainFlow'
import { db, type Aim } from './db'
import { pathOn } from './pathFlow'
import { aimOffered } from './pathVersions'
import { SCREEN_FAULT_KEY, screenFailed, screenFaults } from './screenFaults'

// A screen that threw while it was drawn, and the Path this phone does not know (2026-11-12). The fault is kept on this
// phone by count, minute, screen and the error's name alone, and rides the day's sheet for the Worker's report. A
// commitment on a Path the phone does not know (a generated one whose row has not arrived, or one its own check
// refuses) is offered nowhere and runs nothing, so no screen is asked to compute it.

const DAY = '2026-11-10'

describe('a screen that threw while it was drawn', () => {
  let kept: Map<string, string>
  beforeEach(async () => {
    kept = new Map()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, String(v)), removeItem: (k: string) => void kept.delete(k) })
    await db.delete()
    await db.open()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is kept by count, minute, screen and the error’s name, and never by its message', () => {
    expect(screenFaults()).toBeNull()
    screenFailed('pathChange', new Error('unknown path: something from the record'), new Date('2026-11-10T14:03:20.000Z'))
    expect(screenFaults()).toEqual({ count: 1, first: '2026-11-10T14:03', last: '2026-11-10T14:03', name: 'Error', screen: 'pathChange' })
    screenFailed('aims', new TypeError('cannot read a private thing'), new Date('2026-11-10T14:09:59.000Z'))
    expect(screenFaults()).toEqual({ count: 2, first: '2026-11-10T14:03', last: '2026-11-10T14:09', name: 'TypeError', screen: 'aims' })
    const stored = kept.get(SCREEN_FAULT_KEY) as string
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['count', 'first', 'last', 'name', 'screen'])
    expect(stored).not.toContain('something from the record')
    expect(stored).not.toContain('private thing')
  })

  it('keeps a name of letters alone: an error whose name carries words, or a thing thrown that is no error, is kept as a plain Error', () => {
    const odd = Object.assign(new Error('x'), { name: 'a note: walked with Sam' })
    screenFailed('now', odd, new Date('2026-11-10T14:03:20.000Z'))
    expect(screenFaults()).toMatchObject({ count: 1, name: 'Error', screen: 'now' })
    screenFailed('a screen: with words', 'a string was thrown', new Date('2026-11-10T14:04:20.000Z'))
    expect(screenFaults()).toMatchObject({ count: 2, name: 'Error', screen: 'unknown' })
    expect(kept.get(SCREEN_FAULT_KEY)).not.toContain('Sam')
  })

  it('rides the Brain’s sheet for the Worker’s report, beside the facts and never among them', async () => {
    const at = new Date(2026, 10, 10, 16, 30)
    expect((await factSheet(DAY, at)).screenFault).toBeUndefined()
    screenFailed('pathChange', new Error('unknown path'), new Date('2026-11-10T14:03:20.000Z'))
    const sheet = await factSheet(DAY, at)
    expect(sheet.screenFault).toEqual({ count: 1, first: '2026-11-10T14:03', last: '2026-11-10T14:03', name: 'Error', screen: 'pathChange' })
    expect(sheet.facts.some((f) => JSON.stringify(f).includes('pathChange'))).toBe(false)
  })

  it('writes the facts row again when only a screen fault is new, so the report shows it', async () => {
    const at = new Date(2026, 10, 10, 16, 30)
    await writeFactsRow(DAY, at)
    expect(await writeFactsRow(DAY, at)).toBe(false)
    screenFailed('aims', new Error('x'), new Date('2026-11-10T14:03:20.000Z'))
    expect(await writeFactsRow(DAY, at)).toBe(true)
    expect((await db.facts.get(DAY))?.sheet.screenFault).toMatchObject({ count: 1, screen: 'aims' })
  })
})

describe('a commitment on a Path this phone does not know', () => {
  const aim = (path: string, extra: Partial<Aim> = {}): Aim => ({ kind: 'path', path, name: null, stepMoveId: null, createdAt: '2026-11-01T12:00:00.000Z', archivedAt: null, ...extra }) as Aim

  it('is offered nowhere, while one on a Path it knows is offered as ever', () => {
    expect(aimOffered({ kind: 'path', path: 'gen-not-here-yet' }, [])).toBe(false)
    expect(aimOffered({ kind: 'path', path: 'social' }, [])).toBe(true)
    expect(aimOffered({ kind: 'practice', path: undefined }, [])).toBe(true)
  })

  it('is not on: nothing runs for it until the Path arrives', () => {
    expect(pathOn(aim('gen-not-here-yet'))).toBe(false)
    expect(pathOn(aim('social'))).toBe(true)
    expect(pathOn(aim('social', { pausedAt: '2026-11-02T12:00:00.000Z' }))).toBe(false)
    expect(pathOn(aim('social', { archivedAt: '2026-11-02T12:00:00.000Z' }))).toBe(false)
  })
})
