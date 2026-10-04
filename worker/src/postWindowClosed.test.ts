import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import { AWAY_FROM_HOME } from '../../src/postWindow'
import { accessFor, gatesFrom, readCategory } from './retrieval'
import { APP, memoryStore } from './turso'

// The Worker's side of Away from home as it ships, its gate closed: a day stored with a trip's mark
// reads as it always did. Its open side is postWindowOpen.test.ts.

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: '', deleted: 0, synced_at: '' })

describe('Away from home in the Worker, closed as it ships', () => {
  it('reads a day stored with a trip’s mark exactly as before', async () => {
    expect(AWAY_FROM_HOME).toBe('gated')
    const store = memoryStore()
    const held = { atOffice: true, pickupTime: '17:30', churchDay: false, studyNight: false }
    put(store, 'days', '2026-10-14', '2026-10-14', { day: '2026-10-14', withHer: true, pickupTime: null, atOffice: false, churchDay: false, studyNight: false, awayFromHome: { held } })
    put(store, 'days', '2026-10-13', '2026-10-13', { day: '2026-10-13', withHer: true, pickupTime: null, atOffice: false, churchDay: false, studyNight: false })
    const a = accessFor('line', gatesFrom({ hideFaith: false, privateInSelection: false }), readBrainPrefs({}))
    const items = (await readCategory({ store, catalogue: new Map(), a }, 'dayRecord', { from: '2026-10-07', to: '2026-10-14', limit: 20 })) ?? []
    const dayText = (d: string) => items.filter((i) => i.day === d && i.text.startsWith('the day')).map((i) => i.text).join(' | ')
    expect(dayText('2026-10-14')).toBe('the day: at home')
    expect(dayText('2026-10-14')).toBe(dayText('2026-10-13'))
  })
})
