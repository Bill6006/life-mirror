import { describe, expect, it } from 'vitest'
import { recordsAudit, recordsLinks } from './recordsAudit'
import type { AuditRow } from './turso'

// The storage audit (2026-10-02): structure alone, and the traces a wipe leaves in the cloud. Every value here is made up.

const row = (store: string, id: string, body: Record<string, unknown>, synced: string, deleted = 0): AuditRow => ({ store, id, day: (body.day as string) ?? null, body: JSON.stringify(body), updated_at: synced, deleted, device_id: 'device-abcdefgh-1234', synced_at: synced })

describe('the storage audit', () => {
  const rows = [
    row('checkins', '10', { id: 10, day: '2026-03-06', block: 'evening', completedAt: 'x', answers: { mood: 3, energy: 2 }, note: 'private words' }, '2026-03-06T23:00:00.000Z'),
    row('checkins', '11', { id: 11, day: '2026-03-08', block: 'evening', completedAt: 'x', answers: { mood: 4 } }, '2026-03-09T01:00:00.000Z'),
    row('checkins', '12', { id: 12, day: '2026-03-07', block: 'morning', completedAt: 'x', answers: {} }, '2026-03-07T13:00:00.000Z'),
    row('forecasts', '3', { id: 3, day: '2026-03-09', block: 'morning', horizon: 1 }, '2026-03-08T10:00:00.000Z'),
    row('forecasts', '30', { id: 30, day: '2026-03-09', block: 'morning', horizon: 1 }, '2026-03-09T10:00:00.000Z'),
  ]

  it('lists the check-ins from a day on, by structure alone, and never a word written', () => {
    const a = recordsAudit(rows, '2026-03-06', '2026-03-08T00:00:00.000Z')
    expect(a.checkins.map((c) => `${c.day} ${c.block}`)).toEqual(['2026-03-06 evening', '2026-03-07 morning', '2026-03-08 evening'])
    expect(a.checkins[0]).toMatchObject({ id: '10', answers: 2, completed: true, device: 'device-a' })
    const text = JSON.stringify(a)
    expect(text).not.toContain('private words')
    expect(text).not.toContain('mood')
  })

  it('finds a later record written over an earlier id, and a logical record held twice', () => {
    const a = recordsAudit(rows, '2026-03-06', '2026-03-08T00:00:00.000Z')
    expect(a.outOfStep).toEqual([{ id: '11', day: '2026-03-08', block: 'evening', nextId: '12', nextDay: '2026-03-07', nextBlock: 'morning' }])
    expect(a.duplicates.forecasts).toMatchObject({ keys: 1, examples: [{ key: '2026-03-09|morning|1', ids: ['3', '30'] }] })
    expect(a.duplicates.checkins.keys).toBe(0)
    expect(a.stores.checkins).toMatchObject({ rows: 3, live: 3, maxId: 12, syncedSince: 1, sinceMinId: 11 })
  })
})

describe('the links between records', () => {
  it('finds an answer given before the offer under its id, a plan started by an offer of another day, and a card gone; links the phone took back are listed apart', () => {
    const rows = [
      row('offers', '21', { id: 21, day: '2026-03-08', block: 'evening', at: '2026-03-09T00:40:00.000Z', cardId: 12, situationKey: 'evening|low', note: 'private words' }, '2026-03-10T15:00:00.000Z'),
      row('offers', '20', { id: 20, day: '2026-03-06', block: 'afternoon', at: '2026-03-06T17:00:00.000Z', cardId: 9, situationKey: 'afternoon|mid' }, '2026-03-07T01:00:00.000Z'),
      row('offers', '22', { id: 22, day: '2026-03-09', block: 'morning', at: '2026-03-09T12:30:00.000Z', cardId: 12, situationKey: 'morning|lower' }, '2026-03-10T15:00:00.000Z'),
      row('cards', '12', { id: 12, createdAt: '2026-03-09T00:40:00.000Z', block: 'evening', situationKey: 'evening|low' }, '2026-03-10T15:00:00.000Z'),
      // Asked the next morning about last evening's move: a true link across slots.
      row('outcomes', '31', { id: 31, offerId: 21, day: '2026-03-09', block: 'morning', at: '2026-03-09T12:29:00.000Z', outcome: null }, '2026-03-10T15:00:00.000Z'),
      // Answered on 2026-03-07, before offer 21 was made: it named the offer that held id 21 before.
      row('outcomes', '35', { id: 35, offerId: 21, day: '2026-03-07', block: 'evening', at: '2026-03-08T01:05:00.000Z', outcome: 'done' }, '2026-03-08T01:05:00.000Z'),
      row('outcomes', '36', { id: 36, offerId: -26, lostOfferId: 26, day: '2026-03-08', block: 'morning', at: '2026-03-08T12:35:00.000Z', outcome: 'done' }, '2026-03-12T12:00:00.000Z'),
      row('intentions', '2', { id: 2, day: '2026-03-07', offerId: 20 }, '2026-03-07T15:00:00.000Z'),
      row('intentions', '4', { id: 4, day: '2026-03-07', offerId: -24, lostOfferId: 24 }, '2026-03-12T12:00:00.000Z'),
    ]
    const l = recordsLinks(rows, '2026-03-06')
    expect(l.broken).toEqual([
      { from: 'outcome', id: '35', to: 'offer', toId: '21', why: 'answered 2026-03-08T01:05:00.000Z (2026-03-07|evening), offer made 2026-03-09T00:40:00.000Z (2026-03-08|evening)' },
      { from: 'offer', id: '20', to: 'card', toId: '9', why: 'missing' },
      { from: 'offer', id: '22', to: 'card', toId: '12', why: expect.stringContaining('offer morning/') },
      { from: 'intention', id: '2', to: 'offer', toId: '20', why: 'intention 2026-03-07, offer 2026-03-06' },
    ])
    expect(l.takenBack).toEqual([
      { from: 'outcome', id: '36', lostOfferId: '26' },
      { from: 'intention', id: '4', lostOfferId: '24' },
    ])
    expect(l.shared).toEqual([{ offerId: '21', outcomes: ['31', '35'] }])
    expect(l.outcomes.find((o) => o.id === '35')).toMatchObject({ answered: true })
    const text = JSON.stringify(l)
    expect(text).not.toContain('private words')
    expect(text).not.toContain('low')
  })
})
