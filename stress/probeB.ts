// A first look at engine B on one simulated person: speed, offers, calls.
import { BLOCKS } from '../src/blocks'
import { NOTHING } from '../src/catalogue'
import { EngineB } from './engineB'
import { stream } from './stats'
import { BASE, DAYS, World, type Truth } from './world'

const seed = Number(process.argv[2] ?? 1)
const effect = Number(process.argv[3] ?? 0)
const move = process.argv[4] ?? 'walk-ten'
const truth: Truth = new Map(effect ? [[move, { mood: { e: effect }, energy: { e: effect }, stress: { e: effect } }]] : [])
const t0 = performance.now()
const world = new World(seed, BASE, truth)
const engine = new EngineB(stream(seed, 'engineB'))
let offers = 0
let nothing = 0
let tracked = 0
let learnMs = 0
const levels: Record<string, number> = {}
let established: string[] = []
for (let d = 0; d < DAYS; d++) {
  const l0 = performance.now()
  const calls = engine.learn(d)
  learnMs += performance.now() - l0
  if (d === DAYS - 1) {
    for (const c of calls) levels[`${c.level}:${c.direction}`] = (levels[`${c.level}:${c.direction}`] ?? 0) + 1
    established = calls.filter((c) => c.level === 'established').map((c) => `${c.key} ${c.direction} θ=${c.theta?.toFixed(2)} cs=[${c.csLo?.toFixed(2)},${c.csHi?.toFixed(2)}] n=${c.n1}/${c.n0}`)
    const mine = calls.filter((c) => c.moveId === move)
    for (const c of mine) console.log('TRACK', c.key, c.level, c.direction, 'θ', c.theta?.toFixed(2), '±', c.thetaSe?.toFixed(2), 'cs', c.csLo?.toFixed(2), c.csHi?.toFixed(2), 'n', c.n1, c.n0, 'days', c.nDays, 'comp', c.compliance.toFixed(2))
  }
  for (const b of BLOCKS) {
    const a = world.checkin(d, b)
    if (!a) continue
    const o = engine.checkIn(a, d, world.context(d))
    if (!o) continue
    offers++
    if (o.moveId === NOTHING) nothing++
    if (o.moveId === move) tracked++
    const r = world.respond(o.moveId, d, b)
    world.apply(o.moveId, d, b, r.did === 'done' ? 1 : r.did === 'partly' ? 0.5 : 0)
    engine.respond(o.id, r)
  }
}
console.log(JSON.stringify({ seed, effect, ms: Math.round(performance.now() - t0), learnMs: Math.round(learnMs), offers, nothing, tracked, levels }))
for (const e of established) console.log('EST', e)
