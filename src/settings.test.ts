import { describe, expect, it } from 'vitest'
import type { Block } from './blocks'
import type { CheckIn } from './db'
import { blockReadings } from './readings'
import { activeBlocks, applyLowDemand, askedReadings, DEFAULT_SETTINGS, inQuietHours, pushDecision, reminderDue, withDefaults, type Settings } from './settings'

describe('depth, frequency, quiet hours and Low-demand mode', () => {
  it('short depth asks mood, energy and stress in every block; full asks the block set', () => {
    expect(askedReadings('morning', 'short')).toEqual(['mood', 'stress', 'energy'])
    expect(askedReadings('evening', 'short')).toEqual(['mood', 'energy', 'stress'])
    expect(askedReadings('morning', 'full')).toEqual(blockReadings('morning'))
  })

  it('frequency picks which blocks are asked', () => {
    expect(activeBlocks('three')).toEqual(['morning', 'afternoon', 'evening'])
    expect(activeBlocks('two')).toEqual(['morning', 'evening'])
    expect(activeBlocks('one')).toEqual(['evening'])
  })

  it('quiet hours wrap past midnight, and equal ends mean none', () => {
    const s = { quietStart: '22:00', quietEnd: '07:00' }
    expect(inQuietHours('23:00', s)).toBe(true)
    expect(inQuietHours('06:59', s)).toBe(true)
    expect(inQuietHours('07:00', s)).toBe(false)
    expect(inQuietHours('12:00', s)).toBe(false)
    expect(inQuietHours('12:00', { quietStart: '08:00', quietEnd: '08:00' })).toBe(false)
    expect(inQuietHours('14:00', { quietStart: '13:00', quietEnd: '15:00' })).toBe(true)
  })

  it('Low-demand sets short depth, one block and no move at once, and restores what it replaced', () => {
    const on = applyLowDemand({ ...DEFAULT_SETTINGS, depth: 'full', frequency: 'two' }, true)
    expect(on).toMatchObject({ lowDemand: true, depth: 'short', frequency: 'one', hideMoves: true, beforeLowDemand: { depth: 'full', frequency: 'two' } })
    const off = applyLowDemand(on, false)
    expect(off).toMatchObject({ lowDemand: false, depth: 'full', frequency: 'two', hideMoves: false, beforeLowDemand: null })
    expect(applyLowDemand(off, false)).toBe(off)
  })

  it('fills fields an older stored record lacks', () => {
    const old = { id: 1, depth: 'short', frequency: 'one' } as unknown as Partial<Settings>
    const s = withDefaults(old)
    expect(s.depth).toBe('short')
    expect(s.push).toEqual({ subscription: null, subscribedAt: null, changed: false })
    expect(s.reminders.times.evening).toBe('19:30')
    expect(withDefaults(undefined)).toBe(DEFAULT_SETTINGS)
  })
})

const enabled: Settings = { ...DEFAULT_SETTINGS, reminders: { enabled: true, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } } }
const at = (h: number, m: number) => new Date(2026, 8, 5, h, m)
const begun = (block: Block): Map<Block, CheckIn> =>
  new Map([[block, { day: '2026-09-05', block, answers: {}, startedAt: '', completedAt: null, updatedAt: '', activeMs: 0 }]])

describe('in-app reminders', () => {
  it('is due once the time has passed for an active block nobody has begun', () => {
    expect(reminderDue(at(13, 5), enabled, new Map())).toBe('afternoon')
    expect(reminderDue(at(12, 30), enabled, new Map())).toBeNull()
    expect(reminderDue(at(7, 30), enabled, new Map())).toBe('morning')
  })

  it('stays silent when off, when the block has begun, in quiet hours, and after one has been sent', () => {
    expect(reminderDue(at(13, 5), { ...enabled, reminders: { ...enabled.reminders, enabled: false } }, new Map())).toBeNull()
    expect(reminderDue(at(13, 5), enabled, begun('afternoon'))).toBeNull()
    const lateEvening = { ...enabled, reminders: { ...enabled.reminders, times: { ...enabled.reminders.times, evening: '22:30' } } }
    expect(reminderDue(at(23, 0), lateEvening, new Map())).toBeNull()
    expect(reminderDue(at(13, 5), { ...enabled, reminded: { '2026-09-05:afternoon': true } }, new Map())).toBeNull()
  })

  it('stays silent for blocks the frequency does not ask', () => {
    expect(reminderDue(at(13, 5), { ...enabled, frequency: 'two' }, new Map())).toBeNull()
    expect(reminderDue(at(19, 45), { ...enabled, frequency: 'one' }, new Map())).toBe('evening')
  })
})

describe('what the worker does with a ping', () => {
  it('reminds when the block is active and unanswered, whatever the clock says', () => {
    expect(pushDecision(at(12, 40), enabled, new Map(), false)).toEqual({ kind: 'remind', day: '2026-09-05', block: 'afternoon' })
    expect(pushDecision(at(7, 31), enabled, new Map(), true)).toEqual({ kind: 'remind', day: '2026-09-05', block: 'morning' })
  })

  it('does nothing when the app is in front, and takes down a silent notice otherwise', () => {
    expect(pushDecision(at(13, 5), enabled, begun('afternoon'), true)).toEqual({ kind: 'nothing' })
    expect(pushDecision(at(13, 5), enabled, begun('afternoon'), false)).toEqual({ kind: 'quiet' })
    expect(pushDecision(at(23, 0), enabled, new Map(), false)).toEqual({ kind: 'quiet' })
    expect(pushDecision(at(13, 5), { ...enabled, reminders: { ...enabled.reminders, enabled: false } }, new Map(), false)).toEqual({ kind: 'quiet' })
    expect(pushDecision(at(13, 5), { ...enabled, reminded: { '2026-09-05:afternoon': true } }, new Map(), false)).toEqual({ kind: 'quiet' })
    expect(pushDecision(at(13, 5), { ...enabled, frequency: 'one' }, new Map(), false)).toEqual({ kind: 'quiet' })
  })
})
