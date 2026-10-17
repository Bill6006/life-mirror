// A first look at engine A on one simulated person: speed, offers and the tiers it reaches.
import { BLOCKS } from '../src/blocks'
import { NOTHING } from '../src/catalogue'
import { EngineA } from './engineA'
import { stream } from './stats'
import { BASE, DAYS, World } from './world'

const seed = Number(process.argv[2] ?? 1)
const t0 = performance.now()
const world = new World(seed, BASE, new Map())
const engine = new EngineA(stream(seed, 'engineA'))
let offers = 0
let nothing = 0
let checkins = 0
const tiers = new Map<string, string>()
let holds = 0
let learnMs = 0
for (let d = 0; d < DAYS; d++) {
  const l0 = performance.now()
  const calls = engine.learn(world.dayString(d))
  learnMs += performance.now() - l0
  for (const c of calls) {
    tiers.set(c.key, c.tier)
    if (c.tier === 'holdsUp') holds++
  }
  for (const b of BLOCKS) {
    const a = world.checkin(d, b)
    if (!a) continue
    checkins++
    const o = engine.checkIn(a, world.context(d))
    if (!o) continue
    offers++
    if (o.moveId === NOTHING) nothing++
    const r = world.respond(o.moveId, d, b)
    world.apply(o.moveId, d, b, r.did === 'done' ? 1 : r.did === 'partly' ? 0.5 : 0)
    engine.respond(o.id, r)
  }
}
const counts: Record<string, number> = {}
for (const t of tiers.values()) counts[t] = (counts[t] ?? 0) + 1
console.log(JSON.stringify({ seed, ms: Math.round(performance.now() - t0), learnMs: Math.round(learnMs), checkins, offers, nothing, cards: tiers.size, finalTiers: counts, holdsUpDayCalls: holds }))
