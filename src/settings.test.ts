import { describe, expect, it } from 'vitest'
import type { Block } from './blocks'
import type { CheckIn } from './db'
import { blockReadings } from './readings'
import { activeBlocks, applyLowDemand, askedReadings, DEFAULT_SETTINGS, inQuietHours, reminderDue, type Settings } from './settings'

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
})

describe('in-app reminders', () => {
  const s: Settings = { ...DEFAULT_SETTINGS, reminders: { enabled: true, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } } }
  const at = (h: number, m: number) => new Date(2026, 8, 5, h, m)
  const begun = (block: Block): Map<Block, CheckIn> =>
    new Map([[block, { day: '2026-09-05', block, answers: {}, startedAt: '', completedAt: null, updatedAt: '', activeMs: 0 }]])

  it('is due once the time has passed for an active block nobody has begun', () => {
    expect(reminderDue(at(13, 5), s, new Map())).toBe('afternoon')
    expect(reminderDue(at(12, 30), s, new Map())).toBeNull()
    expect(reminderDue(at(7, 30), s, new Map())).toBe('morning')
  })

  it('stays silent when off, when the block has begun, in quiet hours, and after one has been sent', () => {
    expect(reminderDue(at(13, 5), { ...s, reminders: { ...s.reminders, enabled: false } }, new Map())).toBeNull()
    expect(reminderDue(at(13, 5), s, begun('afternoon'))).toBeNull()
    const lateEvening = { ...s, reminders: { ...s.reminders, times: { ...s.reminders.times, evening: '22:30' } } }
    expect(reminderDue(at(23, 0), lateEvening, new Map())).toBeNull()
    expect(reminderDue(at(13, 5), { ...s, reminded: { '2026-09-05:afternoon': true } }, new Map())).toBeNull()
  })

  it('stays silent for blocks the frequency does not ask', () => {
    expect(reminderDue(at(13, 5), { ...s, frequency: 'two' }, new Map())).toBeNull()
    expect(reminderDue(at(19, 45), { ...s, frequency: 'one' }, new Map())).toBe('evening')
  })
})
