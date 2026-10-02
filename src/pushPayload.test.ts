import { describe, expect, it } from 'vitest'
import { readPush } from './pushPayload'

describe('what a push from the Worker says', () => {
  it('carries words only for the clean window’s report; every other push is a kind alone', () => {
    expect(readPush({ kind: 'report', body: ' The clean ten days: met. ' })).toEqual({ kind: 'report', body: 'The clean ten days: met.' })
    expect(readPush({ kind: 'cue', body: 'never shown' })).toEqual({ kind: 'cue', body: null })
    expect(readPush({ kind: 'test' })).toEqual({ kind: 'test', body: null })
  })

  it('reads anything else as the quiet ping, a report with nothing to say included, and keeps a report short', () => {
    expect(readPush(null)).toEqual({ kind: 'ping', body: null })
    expect(readPush('report')).toEqual({ kind: 'ping', body: null })
    expect(readPush({ kind: 'report', body: '  ' })).toEqual({ kind: 'ping', body: null })
    expect(readPush({ kind: 'report', body: 7 })).toEqual({ kind: 'ping', body: null })
    expect(readPush({ kind: 'report', body: 'x'.repeat(900) }).body).toHaveLength(400)
  })
})
