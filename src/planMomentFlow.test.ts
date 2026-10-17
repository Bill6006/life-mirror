import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { planAim } from './aimFlow'
import { contextFromWeek, db, getSettings, type Aim, type Offer } from './db'

// Timing (stage 3, group 2), as a plan is made: its time stays its cue's own, and the moment its
// reminder comes is stored beside it, learned from the record, never mid-pickup.

const DAY = '2026-10-20'
const NOW = new Date(2026, 9, 20, 9, 0)
const AIM = { id: 1, kind: 'practice', stepMoveId: 'walk-ten', createdAt: '2026-09-01T12:00:00.000Z', archivedAt: null } as Aim

/** A plan after pickup on an earlier day, started that day at a local time. */
async function startedAfterPickup(id: number, d: number, startedAt: string): Promise<void> {
  const [h, m] = startedAt.split(':').map(Number)
  const day = `2026-10-${String(d).padStart(2, '0')}`
  await db.offers.add({ id, day, at: new Date(2026, 9, d, h, m).toISOString() } as Offer)
  await db.intentions.add({ aimId: 1, day, cue: 'afterPickup', time: '17:00', setAt: new Date(2026, 9, d, 9).toISOString(), offerId: id })
}

async function pickupDay(): Promise<void> {
  await db.days.put({ ...contextFromWeek(DAY, await getSettings()), withHer: true, pickupTime: '17:00' })
}

describe('a plan made', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.aims.add(AIM)
  })

  it('keeps its cue’s time and is reminded at the moment its steps have started after that cue', async () => {
    await pickupDay()
    for (const [id, d, at] of [[1, 13, '17:40'], [2, 14, '17:50'], [3, 15, '18:00']] as const) await startedAfterPickup(id, d, at)
    await planAim(AIM, 'afterPickup', '17:00', NOW)
    const plan = (await db.intentions.where('day').equals(DAY).toArray())[0]
    expect(plan).toMatchObject({ cue: 'afterPickup', time: '17:00', remindAt: '17:50' })
  })

  it('after pickup with nothing learned, waits out the pickup; at a check-in, is reminded at its own time', async () => {
    await pickupDay()
    await planAim(AIM, 'afterPickup', '17:00', NOW)
    await planAim(AIM, 'nextCheckIn', '19:00', new Date(2026, 9, 20, 9, 5))
    const [pickup, checkIn] = await db.intentions.where('day').equals(DAY).sortBy('setAt')
    expect(pickup).toMatchObject({ time: '17:00', remindAt: '17:45' })
    expect(checkIn.time).toBe('19:00')
    expect(checkIn).not.toHaveProperty('remindAt')
  })
})
