import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { onQuarter } from './index'

// The Worker's one cron, every minute (D7 as the owner amended it on 2026-10-18: "Go on the new D7:
// suggestions on tap, two a day"). Each minute answers a skill suggestion the phone asked for; every
// fifteenth minute runs every job as it did when the cron ran each fifteen minutes. Seen here by the
// jobs each tick tries: the database answers nothing, so every job that reads says so in its log line.

afterEach(() => vi.restoreAllMocks())

async function jobsAt(iso: string): Promise<string[]> {
  const seen: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    try {
      const j = JSON.parse(String(line)) as { job?: unknown }
      if (typeof j.job === 'string' && !seen.includes(j.job)) seen.push(j.job)
    } catch {
      // not a job's line
    }
  })
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'))
  const waits: Promise<unknown>[] = []
  const env = { TIMEZONE: 'America/New_York', FALLBACK_TIME: '11:00', BRIEF_HOUR: '5', TURSO_URL: 'https://db.test', TURSO_TOKEN: 'token', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token' }
  await handler.scheduled?.({ scheduledTime: Date.parse(iso), cron: '* * * * *', noRetry() {} } as never, env as never, { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException() {} } as never)
  await Promise.all(waits)
  return seen
}

describe('the tick, each minute (D7 as amended 2026-10-18)', () => {
  it('knows the fifteenth minutes by the clock the cron was scheduled for', () => {
    expect(['00', '15', '30', '45'].map((m) => onQuarter(new Date(`2026-10-18T14:${m}:00Z`)))).toEqual([true, true, true, true])
    expect(['01', '07', '14', '16', '59'].map((m) => onQuarter(new Date(`2026-10-18T14:${m}:00Z`)))).toEqual([false, false, false, false, false])
  })

  it('answers a suggestion alone in the minutes between, and runs every job as before on the fifteenth minute, the suggestion first', async () => {
    expect(await jobsAt('2026-10-18T14:07:00Z')).toEqual(['suggestions'])
    const quarter = await jobsAt('2026-10-18T14:15:00Z')
    expect(quarter[0]).toBe('suggestions')
    expect(quarter).toEqual(expect.arrayContaining(['suggestions', 'cues', 'brief', 'review', 'coach', 'commitments']))
  })
})
