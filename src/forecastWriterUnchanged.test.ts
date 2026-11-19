import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setChallengerForTests } from './challenger'
import { FIXTURE_TODAY, fixtureCheckins } from './challengerTesting'
import { db } from './db'
import { runForecasting } from './forecastFlow'

// The forecast writer with the challenger switched off (2026-11-14): every row it writes on a stand-in record is what
// it wrote before the challenger was wired in. The snapshot was recorded on the code before that change. The switch is
// set off here by name, so the test says the same once the code's own switch is on.

describe('the forecast writer, with the challenger switched off', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.checkins.bulkAdd(fixtureCheckins())
    setChallengerForTests(false)
  })
  afterEach(() => setChallengerForTests(null))

  it('writes the rows it wrote before the challenger existed', async () => {
    await runForecasting(FIXTURE_TODAY)
    const rows = (await db.forecasts.toArray()).map(({ id: _id, ...row }) => row)
    expect(rows.length).toBeGreaterThan(20)
    expect(new Set(rows.map((r) => r.point)).size).toBeGreaterThan(1)
    expect(JSON.stringify(rows, null, 1)).toMatchSnapshot()
  })
})
