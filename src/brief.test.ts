import { describe, expect, it } from 'vitest'
import { todayLine } from './brief'

describe('the brief’s line for today', () => {
  it('sets what a block read beside what is usual, says what is usual while a block is ahead, and marks a gap', () => {
    const f = (point: number) => ({ point, lo: point - 5, hi: point + 5 })
    expect(todayLine([{ block: 'morning', forecast: f(63), actual: 79 }, { block: 'afternoon', forecast: f(68), actual: null }, { block: 'evening', forecast: null, actual: null }])).toBe('morning 79, usually 63 (58 to 68) · afternoon 68 (63 to 73) · evening —')
    expect(todayLine([{ block: 'morning', forecast: null, actual: 50 }])).toBe('morning 50')
  })
})
