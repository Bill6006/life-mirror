import { describe, expect, it } from 'vitest'
import type { CheckIn, PrivateItem, Win } from './db'
import { buildExport } from './export'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { DEFAULT_SETTINGS } from './settings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))

const items: PrivateItem[] = [{ id: 7, name: 'Item one', createdAt: '', archived: 0 }]
const checkins: CheckIn[] = [
  {
    day: '2026-09-05',
    block: 'evening',
    answers: allAt(blockReadings('evening'), 4),
    startedAt: '2026-09-05T23:00:00.000Z',
    completedAt: '2026-09-05T23:01:00.000Z',
    updatedAt: '2026-09-05T23:01:00.000Z',
    activeMs: 4200,
    extras: { caffeine: true, private: { '7': true } },
  },
  {
    day: '2026-09-05',
    block: 'morning',
    answers: { mood: 2 },
    startedAt: '2026-09-05T12:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-05T12:00:00.000Z',
    activeMs: 900,
  },
]
const wins: Win[] = [{ forDay: '2026-09-06', setOn: '2026-09-05', text: 'Read ten pages, "quietly"', outcome: null, answeredAt: null, updatedAt: '' }]
const settings = { ...DEFAULT_SETTINGS, push: { subscription: { endpoint: 'https://push.example/abc' }, subscribedAt: 'x', changed: false } }

describe('export', () => {
  it('leaves private items out unless asked, in both files', () => {
    const plain = buildExport(checkins, wins, items, settings, { includePrivate: false })
    expect(plain.json).not.toContain('Item one')
    expect(plain.csv).not.toContain('Item one')
    expect(JSON.parse(plain.json).includesPrivateItems).toBe(false)
    const withPrivate = buildExport(checkins, wins, items, settings, { includePrivate: true })
    const parsed = JSON.parse(withPrivate.json)
    expect(parsed.privateItems).toEqual(['Item one'])
    expect(parsed.checkins[1].extras.private).toEqual(['Item one'])
    expect(withPrivate.csv.split('\n')[0]).toContain('private: Item one')
    expect(withPrivate.csv.split('\n')[2]).toMatch(/,yes$/)
  })

  it('never carries the push address, and orders check-ins oldest first', () => {
    const out = buildExport(checkins, wins, items, settings, { includePrivate: false })
    expect(out.json).not.toContain('push.example')
    const parsed = JSON.parse(out.json)
    expect(parsed.checkins.map((c: { block: string }) => c.block)).toEqual(['morning', 'evening'])
    expect(parsed.checkins[1].answers.mood).toEqual({ position: 4, phrase: 'Warm — quietly glad about things' })
    expect(parsed.minimumWins[0].text).toBe('Read ten pages, "quietly"')
  })

  it('writes a CSV with one row per check-in, blanks for unanswered readings, and quoted cells where needed', () => {
    const out = buildExport(checkins, wins, items, settings, { includePrivate: false })
    const lines = out.csv.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0].startsWith('day,block,completed_at,active_ms,mood,')).toBe(true)
    const morning = lines[1].split(',')
    expect(morning[0]).toBe('2026-09-05')
    expect(morning[1]).toBe('morning')
    expect(morning[4]).toBe('2')
    expect(morning[5]).toBe('')
    expect(lines[2]).toContain('yes')
  })
})
