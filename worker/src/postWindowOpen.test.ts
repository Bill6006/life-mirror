import { describe, expect, it, vi } from 'vitest'

// The Worker's side of Away from home once its gate is open (post-window): opened here for the test
// alone, by standing in for the shared gate. While it ships closed, postWindowGated.test.ts holds
// every prompt, day record and verdict as it was.
vi.mock('../../src/postWindow', async (original) => ({ ...(await original<typeof import('../../src/postWindow')>()), AWAY_FROM_HOME: 'open', HOME_ONLY: 'open' }))

const { readBrainPrefs } = await import('../../src/brainShared')
const { accessFor, factCategories, gatesFrom, readCategory, sheetForClaude } = await import('./retrieval')
const { APP, memoryStore } = await import('./turso')

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: '', deleted: 0, synced_at: '' })
const OPEN = gatesFrom({ hideFaith: false, privateInSelection: false })
const held = { atOffice: true, pickupTime: '17:30', churchDay: false, studyNight: false }

describe('Away from home in the Worker, once open', () => {
  it('says a trip’s day is away from home, and every other day as before', async () => {
    const store = memoryStore()
    put(store, 'days', '2026-10-13', '2026-10-13', { day: '2026-10-13', withHer: true, pickupTime: '17:30', atOffice: true, churchDay: false, studyNight: false })
    put(store, 'days', '2026-10-14', '2026-10-14', { day: '2026-10-14', withHer: true, pickupTime: null, atOffice: false, churchDay: false, studyNight: false, awayFromHome: { held } })
    const a = accessFor('line', OPEN, readBrainPrefs({}))
    const items = (await readCategory({ store, catalogue: new Map(), a }, 'dayRecord', { from: '2026-10-07', to: '2026-10-14', limit: 20 })) ?? []
    const dayText = (d: string) => items.filter((i) => i.day === d && i.text.startsWith('the day')).map((i) => i.text).join(' | ')
    expect(dayText('2026-10-14')).toBe('the day: away from home on a trip')
    expect(dayText('2026-10-13')).toBe('the day: at the office; a daycare day, pickup at 17:30')
  })

  it('reads the trip fact as part of the sheet, so the free chain and Claude both have it', () => {
    const trip = { id: 'trip', tags: ['monitoring', 'habit'], text: 'You are away from home on a trip.', values: { state: 'away', a0: 2 } }
    expect(factCategories(trip, new Map())).toEqual(['factSheet'])
    const sheet = { version: 1, day: '2026-10-14', builtAt: '', hour: 8, weeks: 4, days: 30, direction: null, said: [], shortlist: [], facts: [trip] }
    expect(sheetForClaude(sheet as never, accessFor('line', OPEN, readBrainPrefs({}))).facts.map((f) => f.id)).toEqual(['trip'])
  })
})
