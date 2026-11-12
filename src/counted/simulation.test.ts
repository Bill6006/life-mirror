import { describe, expect, it } from 'vitest'
import { bandOf } from '../score'
import { compare, seeded, seedOf, standings, type Point } from './compare'

// A small seeded simulation of the chance check, so the suite guards the rule every time it runs (the counted
// foundation, 2026-11-12; in shadow). The full proof is offline, in stress/RESULTS-8.md: fourteen worlds, 2,000
// people each. This is three hundred seeded people of its own in four small worlds, each sixty days long, with
// four things laid over each person's evenings. Seeded, so its counts are the same on every run; the marks below
// were set from those counts and from what each deliberate break does to them.

const PEOPLE = 300
const THINGS = 4
const DAYS = 60
type World = 'nothing' | 'follows' | 'streaks' | 'real'

const dayName = (d: number): string => new Date(Date.UTC(2031, 0, 6 + d)).toISOString().slice(0, 10)
const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

/** One person's evenings in one world: for each thing, the next morning's reading after evenings with it and without. */
function person(world: World, seed: number): Point[][] {
  const next = seeded(seedOf(`${world}|${seed}`))
  const gauss = (): number => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next())
  // A state that carries over from day to day; strongly in the world of streaks.
  const carry = world === 'streaks' ? 0.85 : 0.6
  const state: number[] = [9 * gauss()]
  for (let d = 1; d <= DAYS; d++) state.push(carry * state[d - 1] + 9 * Math.sqrt(1 - carry * carry) * gauss())
  const evening = Array.from({ length: DAYS }, (_, d) => clamp(50 + state[d] + 6 * gauss()))
  const morning = Array.from({ length: DAYS }, (_, d) => 50 + state[d + 1] + 6 * gauss())
  return Array.from({ length: THINGS }, (_, thing) => {
    let on = next() < 0.3
    return Array.from({ length: DAYS }, (_, d): Point => {
      const u = next()
      if (world === 'streaks') on = d === 0 ? on : u < (on ? 0.85 : 0.0643)
      else if (world === 'follows') on = u < (evening[d] < 40 ? 0.9 : evening[d] < 60 ? 0.3 : 0.03)
      else on = u < 0.3
      const lift = world === 'real' && thing === 0 && on ? 15 : 0
      return { day: dayName(d), event: on, outcome: clamp(morning[d] + lift), band: bandOf(evening[d]) }
    })
  })
}

/** Over every person: the comparisons tested with nothing there, how many gave a chance at or under 0.05, and how many people's first thing was called a pattern. */
function run(world: World): { tested: number; eager: number; called: number } {
  let tested = 0
  let eager = 0
  let called = 0
  for (let seed = 1; seed <= PEOPLE; seed++) {
    person(world, seed).forEach((points, thing) => {
      const c = compare(points, { id: `${world}|${seed}|${thing}`, worth: 10 })
      const real = world === 'real' && thing === 0
      if (real && standings([c])[0].standing === 'pattern') called++
      if (real || c.p === null) return
      tested++
      if (c.p <= 0.05) eager++
    })
  }
  return { tested, eager, called }
}

// Each of these runs three hundred people through the chance check: a few seconds alone, more on a loaded machine.
describe('the chance check, on three hundred seeded people', { timeout: 60_000 }, () => {
  it('with nothing there, gives a chance at or under 0.05 about five times in a hundred', () => {
    // 58 of 1,200 as built.
    const { tested, eager } = run('nothing')
    expect(tested).toBe(1200)
    expect(eager).toBeGreaterThanOrEqual(40)
    expect(eager).toBeLessThanOrEqual(72)
  })

  it('stays honest where a thing follows how the evening started', () => {
    // 40 of 1,200 as built. Ranked by the plain difference instead of against its own spread, 96.
    const { tested, eager } = run('follows')
    expect(tested).toBe(1200)
    expect(eager).toBeLessThanOrEqual(72)
  })

  it('stays honest where a thing comes in streaks beside a state that carries over', () => {
    // 63 of 1,012 as built. With the labels dealt out afresh instead of turned round, 101.
    const { tested, eager } = run('streaks')
    expect(tested).toBe(1012)
    expect(eager).toBeLessThanOrEqual(80)
  })

  it('calls a real fifteen-point difference a pattern for nearly everyone in sixty days', () => {
    // 285 of 300 as built.
    expect(run('real').called).toBeGreaterThanOrEqual(270)
  })
})
