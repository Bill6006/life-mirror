import { describe, expect, it } from 'vitest'
import { engineReport } from './engineReport'
import { APP, memoryStore } from './turso'

// The learning engine's failures on the phone, as the Worker reports them (the owner's requirement of 2026-10-20: no
// fallback, the failure shown): read from the newest facts row of the day and the day before, counts and days alone.

function facts(day: string, updatedAt: string, engineFault?: object) {
  return { app: APP, store: 'facts', id: day, day, body: JSON.stringify({ updatedAt, sheet: { day, builtAt: updatedAt, facts: [], ...(engineFault ? { engineFault } : {}) } }), updated_at: updatedAt, deleted: 0 as const, synced_at: updatedAt }
}

describe('the engine’s report', () => {
  it('gives the failure the newest facts row carries, with when it was built', async () => {
    const store = memoryStore()
    store.put(facts('2026-10-19', '2026-10-19T23:00:00.000Z', { count: 1, first: '2026-10-19', last: '2026-10-19', name: 'TypeError' }))
    store.put(facts('2026-10-20', '2026-10-20T13:00:00.000Z', { count: 2, first: '2026-10-19', last: '2026-10-20', name: 'TypeError' }))
    expect(await engineReport(store, '2026-10-20')).toEqual({ day: '2026-10-20', builtAt: '2026-10-20T13:00:00.000Z', fault: { count: 2, first: '2026-10-19', last: '2026-10-20', name: 'TypeError' } })
  })

  it('reads the day before when the day has no row yet, and says none when no failure is kept', async () => {
    const store = memoryStore()
    store.put(facts('2026-10-19', '2026-10-19T23:00:00.000Z', { count: 1, first: '2026-10-19', last: '2026-10-19', name: 'RangeError' }))
    expect((await engineReport(store, '2026-10-20')).fault).toEqual({ count: 1, first: '2026-10-19', last: '2026-10-19', name: 'RangeError' })
    store.put(facts('2026-10-20', '2026-10-20T13:00:00.000Z'))
    expect(await engineReport(store, '2026-10-20')).toEqual({ day: '2026-10-20', builtAt: '2026-10-20T13:00:00.000Z', fault: null })
    expect(await engineReport(memoryStore(), '2026-10-20')).toEqual({ day: '2026-10-20', builtAt: null, fault: null })
  })
})
