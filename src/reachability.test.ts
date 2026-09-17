import { describe, expect, it } from 'vitest'
import { liveMoves, moveById, OBSERVED_ONLY, PASSIVE, type Move } from './catalogue'
import { everySituation, reachableAnywhere } from './offers'
import { catalogueHealth } from './weekly'

// Every entry the day's draw is meant to reach can be a candidate in at least one situation.
// The catalogue is content; this is the check that keeps a live entry from being dead on paper.

const drawn = liveMoves.filter((m) => !PASSIVE.has(m.id) && !OBSERVED_ONLY.has(m.id) && m.family !== 'study')

describe('reachability', () => {
  it('covers every block, every ingredient and every band', () => {
    expect(everySituation()).toHaveLength(3 * 6 * 5)
  })

  it('admits every live entry the draw is meant to reach in at least one situation', () => {
    const dead = drawn.filter((m) => !reachableAnywhere(m).reachable).map((m) => m.id)
    expect(dead).toEqual([])
  })

  it('names the filter that keeps a context-only entry out everywhere', () => {
    const ghost: Move = { ...moveById('walk-ten'), id: 'ghost', targets: [{ reading: 'confidence', direction: 'up', window: 'nextBlock' }] }
    expect(reachableAnywhere(ghost)).toEqual({ reachable: false, blocker: 'target' })
  })

  it('lets every passive item ride in some block, and a harder rung follow the one below it', () => {
    for (const id of PASSIVE) {
      const m = moveById(id)
      expect(m.when.length, id).toBeGreaterThan(0)
      expect(m.targets.length, id).toBeGreaterThan(0)
    }
    for (const id of ['say-one-full-thought', 'tell-one-short-story', 'start-a-topic']) expect(reachableAnywhere(moveById(id)).reachable, id).toBe(true)
  })

  it('reports no never-offerable entry in catalogue health for the catalogue as it stands', () => {
    for (const h of catalogueHealth([], [], [])) expect(h.dead, h.family).toEqual([])
  })
})
