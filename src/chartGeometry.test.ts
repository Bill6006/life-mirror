import { describe, expect, it } from 'vitest'
import { VALUE_AIR, VALUE_HEIGHT, valuePlacement, whiskerParts } from './chartGeometry'

describe('a value’s label against its step', () => {
  it('sits just above its step, and just under it when the step is too near the top', () => {
    expect(valuePlacement(60, 10)).toEqual({ y: 60 - VALUE_AIR, below: false })
    expect(valuePlacement(10 + VALUE_AIR + VALUE_HEIGHT, 10)).toEqual({ y: 10 + VALUE_HEIGHT, below: false })
    expect(valuePlacement(12, 10)).toEqual({ y: 12 + VALUE_AIR + VALUE_HEIGHT, below: true })
  })

  it('leaves the whisker out of the label and the step on either side', () => {
    expect(whiskerParts(30, 90, null, 10, 1.3)).toEqual([[30, 90]])
    const above = whiskerParts(30, 90, 60, 10, 1.3)
    expect(above).toEqual([
      [30, 60 - VALUE_AIR - VALUE_HEIGHT],
      [61.3, 90],
    ])
    const below = whiskerParts(10, 60, 12, 10, 1.3)
    expect(below[0]).toEqual([10, 12 - 1.3])
    expect(below[1][0]).toBeGreaterThan(12 + VALUE_AIR + VALUE_HEIGHT)
    expect(below[1][1]).toBe(60)
  })
})
