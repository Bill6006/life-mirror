import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import { accessFor, gatesFrom, readCategory } from './retrieval'
import { APP, memoryStore } from './turso'

// Item 3 (2026-10-23): Claude's on-demand day words name the Sabbath and the Third Day as the schedule held them, never as
// attendance; a day from before reads "a church day" as it always did.

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, day: string, body: Record<string, unknown>) => store.put({ app: APP, store: 'days', id: day, day, body: JSON.stringify({ day, withHer: true, pickupTime: null, atOffice: false, studyNight: false, ...body }), updated_at: '', deleted: 0, synced_at: '' })

describe('the church schedule in Claude’s day words', () => {
  it('says the Sabbath and the Third Day as scheduled, an older church day as before, and nothing on a day without', async () => {
    const store = memoryStore()
    put(store, '2026-10-24', { churchDay: true, church: 'sabbath', services: ['07:30', '14:30', '19:30'] })
    put(store, '2026-10-27', { churchDay: false, church: 'third', services: ['19:30'], atOffice: true })
    put(store, '2026-10-17', { churchDay: true })
    put(store, '2026-10-28', { churchDay: false })
    const a = accessFor('line', gatesFrom({ hideFaith: false, privateInSelection: false }), readBrainPrefs({}))
    const items = (await readCategory({ store, catalogue: new Map(), a }, 'dayRecord', { from: '2026-10-17', to: '2026-10-28', limit: 20 })) ?? []
    const dayText = (d: string) => items.filter((i) => i.day === d && i.text.startsWith('the day')).map((i) => i.text).join(' | ')
    expect(dayText('2026-10-24')).toBe('the day: at home; the Sabbath, services scheduled at 07:30, 14:30 and 19:30')
    expect(dayText('2026-10-27')).toBe('the day: at the office; the Third Day, a service scheduled at 19:30')
    expect(dayText('2026-10-17')).toBe('the day: at home; a church day')
    expect(dayText('2026-10-28')).toBe('the day: at home')
  })
})
