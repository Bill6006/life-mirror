// Geometry the week-ahead strip shares with its tests: where a value's label sits against its step,
// and where the whisker runs so it passes through neither.

/** How far above its baseline a value's digits stand, with a hair of air: where the whisker stops. */
export const VALUE_HEIGHT = 9
/** The air between a value's step and its digits. */
export const VALUE_AIR = 3.5

export interface ValuePlacement {
  /** The label's baseline. */
  y: number
  /** True when the step sits too near the plot's top for the label to fit above it, so it sits under. */
  below: boolean
}

/** Where a value's label sits: its baseline just above its step; just under it when the step is too near the plot's top. */
export function valuePlacement(stepY: number, top: number): ValuePlacement {
  const above = stepY - VALUE_AIR
  if (above - VALUE_HEIGHT >= top) return { y: above, below: false }
  return { y: stepY + VALUE_AIR + VALUE_HEIGHT, below: true }
}

/**
 * The whisker's visible parts, top to bottom: it stops at the label and starts again past the
 * step, whichever side of the step the label sits on. A part shows only where it has length.
 */
export function whiskerParts(hi: number, lo: number, stepY: number | null, top: number, gap: number): [number, number][] {
  if (stepY === null) return [[hi, lo]]
  const p = valuePlacement(stepY, top)
  return p.below ? [[hi, stepY - gap], [p.y + 2, lo]] : [[hi, p.y - VALUE_HEIGHT], [stepY + gap, lo]]
}
