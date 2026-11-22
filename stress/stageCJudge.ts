import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { StageCNumbers } from './stageC'
import type { CPerson } from './stageCSim'

// Stage C: what its runs counted, world by world, and each frozen criterion read from them (the private repository
// holds the criteria; this file is the public code that reads them and never their text).
//
// node stress/.out/stageCJudge.mjs baseline <results folder>
// node stress/.out/stageCJudge.mjs tuning <results folder>            every setting in the files, one line each
// node stress/.out/stageCJudge.mjs judge <results folder> [setting] [folder of further people]

export const IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half', 'rhythm-one', 'rhythm-turn', 'two', 'two-strong', 'sun', 'sun-weak', 'sun-bad', 'kind-move', 'kind-idle', 'all', 'event', 'event-weak', 'event-rhythm', 'event-idle', 'event-flat', 'event-told', 'event-masked', 'event-many']
const NAMES = ['days 29 to 90', 'days 91 to 150', 'days 151 to 180']
const EVERY = [0, 1, 2]
const MIDDLE = [1]
const AFTER = [1, 2]
const LATE = [2]
const spanOf = (sts: readonly number[]): string => (sts.length === 3 ? 'days 29 to 180' : sts.length === 2 ? 'days 91 to 180' : NAMES[sts[0]])

/** The places of a person's "ever in use" marks: the score's own test, a reading's, sunshine, rain, the day's high, an event. */
const READING = 1
const SUN = 2
const RAIN = 3
const HIGH = 4
const EVENT = 5
/** The terms with nothing to find in each world (criterion 9). */
const NOTHING: Record<string, number[]> = {
  plain: [READING, SUN, RAIN, HIGH],
  streaks: [READING, SUN, RAIN, HIGH],
  sparse: [READING, SUN, RAIN, HIGH],
  season: [READING, SUN, RAIN, HIGH],
  rhythm: [SUN, RAIN, HIGH],
  'rhythm-half': [SUN, RAIN, HIGH],
  'rhythm-one': [SUN, RAIN, HIGH],
  'rhythm-turn': [SUN, RAIN, HIGH],
  two: [SUN, RAIN, HIGH],
  'two-strong': [SUN, RAIN, HIGH],
  'kind-move': [SUN, RAIN, HIGH],
  'kind-idle': [SUN, RAIN, HIGH],
  event: [SUN, RAIN, HIGH],
  'event-weak': [SUN, RAIN, HIGH],
  'event-rhythm': [SUN, RAIN, HIGH],
  sun: [READING, RAIN, HIGH],
  'sun-weak': [READING, RAIN, HIGH],
  'sun-bad': [READING, RAIN, HIGH],
  all: [RAIN, HIGH],
  'event-idle': [SUN, RAIN, HIGH, EVENT],
  'event-many': [SUN, RAIN, HIGH, EVENT],
  'event-flat': [READING, SUN, RAIN, HIGH, EVENT],
  'event-told': [READING, SUN, RAIN, HIGH, EVENT],
  'event-masked': [READING, SUN, RAIN, HIGH, EVENT],
}

interface RunFile {
  world: string
  seeds: [number, number]
  settings: StageCNumbers[]
  challenger: boolean
  results: CPerson[]
}

const load = (folder: string, id: string, suffix = ''): RunFile | null => {
  const path = `${folder}/${id}${suffix}.json`
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RunFile) : null
}

export interface Terms {
  readings: boolean
  schedule: boolean
  weather: boolean
  events: boolean
}
export const termsOf = (n: StageCNumbers): Terms => ({ readings: n.readingChance > 0, schedule: n.reset, weather: n.weatherChance > 0, events: n.eventChance > 0 })

interface Interval {
  n: number
  mean: number
  lo: number
  hi: number
}
function interval(values: readonly number[]): Interval {
  const n = values.length
  if (n === 0) return { n, mean: NaN, lo: NaN, hi: NaN }
  const mean = values.reduce((a, b) => a + b, 0) / n
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0
  const half = (1.96 * sd) / Math.sqrt(n)
  return { n, mean, lo: mean - half, hi: mean + half }
}
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN]
  const z = 1.96
  const p = k / n
  const mid = (p + (z * z) / (2 * n)) / (1 + (z * z) / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n)
  return [mid - half, mid + half]
}

/** A person's average miss over a set of stretches: today's system, the Stage B system, Stage C under a setting, the told forecast; null with no row. */
function missOf(p: CPerson, k: number, sts: readonly number[]): { today: number; b: number; c: number; t: number } | null {
  let n = 0
  let today = 0
  let b = 0
  let t = 0
  let c = 0
  for (const st of sts) {
    n += p.base[st][0]
    today += p.base[st][1]
    b += p.base[st][2]
    t += p.base[st][3]
    c += p.c[k].s[st][0]
  }
  return n ? { today: today / n, b: b / n, c: c / n, t: t / n } : null
}
/** A person's average range score over a set of stretches, for the Stage B system and Stage C. */
function rangeOf(p: CPerson, k: number, sts: readonly number[]): { b: number; c: number } | null {
  let n = 0
  let b = 0
  let c = 0
  for (const st of sts) {
    n += p.base[st][0]
    b += p.base[st][6]
    c += p.c[k].s[st][3]
  }
  return n ? { b: b / n, c: c / n } : null
}
const some = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null)

export interface Cell {
  criterion: string
  world: string
  what: string
  shown: string
  /** Passed, failed, or (null) waiting on the further people. */
  pass: boolean | null
  /** How far inside its bar, in the bar's own unit: above nothing passes. */
  room: number
}

const f3 = (v: number): string => v.toFixed(3)

/** The quarter-of-the-gap reading (criteria 1, 3 and 5). */
function quarter(criterion: string, file: RunFile, k: number, sts: readonly number[]): Cell {
  const all = some(file.results.map((p) => missOf(p, k, sts)))
  const g = interval(all.map((m) => m.b - m.c))
  const gap = interval(all.map((m) => m.b - m.t))
  const i = interval(all.map((m) => m.b - m.c - (m.b - m.t) / 4))
  return { criterion, world: file.world, what: `${spanOf(sts)}: closes at least a quarter of the gap`, shown: `g less a quarter of b ${f3(i.mean)} (${f3(i.lo)} to ${f3(i.hi)}); g ${f3(g.mean)}, the gap ${f3(gap.mean)}, closed ${((100 * g.mean) / gap.mean).toFixed(0)} of 100; ${i.n} people`, pass: i.lo > 0, room: i.lo }
}
/** The better reading (criteria 2, 4, 6 and 7). */
function better(criterion: string, file: RunFile, k: number, sts: readonly number[]): Cell {
  const all = some(file.results.map((p) => missOf(p, k, sts)))
  const i = interval(all.map((m) => m.b - m.c))
  const gap = interval(all.map((m) => m.b - m.t))
  return { criterion, world: file.world, what: `${spanOf(sts)}: the forecasts get better`, shown: `B less C ${f3(i.mean)} (${f3(i.lo)} to ${f3(i.hi)}); the gap ${f3(gap.mean)}, closed ${((100 * i.mean) / gap.mean).toFixed(0)} of 100; ${i.n} people`, pass: i.lo > 0, room: i.lo }
}
function noHarm(file: RunFile, k: number, sts: readonly number[]): Cell {
  const i = interval(some(file.results.map((p) => missOf(p, k, sts))).map((m) => m.c - m.b))
  return { criterion: '8', world: file.world, what: `${spanOf(sts)}: no harm`, shown: `C less B ${f3(i.mean)} (${f3(i.lo)} to ${f3(i.hi)}); ${i.n} people`, pass: i.hi < 0.05, room: 0.05 - i.hi }
}
const everOf = (p: CPerson, k: number, places: readonly number[]): boolean => places.some((at) => p.c[k].ever[at] === 1)
/** At most 80 of 2,000 passes at once, 100 or more fails at once; between, the further people decide at 457 of 10,000. For another count of people the same shares. */
function twenty(criterion: string, world: string, what: string, hits: number, people: number, more: { hits: number; people: number } | null): Cell {
  const share = (100 * hits) / people
  if (hits <= 0.04 * people) return { criterion, world, what, shown: `${hits} of ${people} (${share.toFixed(1)} of 100)`, pass: true, room: 4 - share }
  if (hits >= 0.05 * people) return { criterion, world, what, shown: `${hits} of ${people} (${share.toFixed(1)} of 100)`, pass: false, room: 4 - share }
  if (!more) return { criterion, world, what, shown: `${hits} of ${people} (${share.toFixed(1)} of 100): between the marks, the further people decide`, pass: null, room: 4 - share }
  const both = hits + more.hits
  const all = people + more.people
  return { criterion, world, what, shown: `${hits} of ${people}, and with the further people ${both} of ${all} (${((100 * both) / all).toFixed(2)} of 100)`, pass: both <= 0.0457 * all, room: 4.57 - (100 * both) / all }
}
const PLACE = ['the score', 'readings', 'sunshine', 'rain', 'high', 'events']
function invented(file: RunFile, k: number, further: RunFile | null): Cell {
  const places = NOTHING[file.world]
  const hits = file.results.filter((p) => everOf(p, k, places)).length
  const more = further ? { hits: further.results.filter((p) => everOf(p, 0, places)).length, people: further.results.length } : null
  return twenty('9', file.world, `no invented differences (${places.map((at) => PLACE[at]).join(', ')})`, hits, file.results.length, more)
}
function rangeHarm(file: RunFile, k: number): Cell {
  const i = interval(some(file.results.map((p) => rangeOf(p, k, EVERY))).map((m) => m.c - m.b))
  return { criterion: '10', world: file.world, what: 'days 29 to 180: the ranges, no harm', shown: `score C less B ${f3(i.mean)} (${f3(i.lo)} to ${f3(i.hi)}); ${i.n} people`, pass: i.hi < 0.18, room: 0.18 - i.hi }
}
function rangeHolds(file: RunFile, k: number): Cell {
  const v: number[] = []
  for (const p of file.results) {
    let n = 0
    let b = 0
    let c = 0
    for (const st of AFTER) {
      n += p.c[k].diff[st][0]
      b += p.c[k].diff[st][1]
      c += p.c[k].diff[st][2]
    }
    if (n) v.push((100 * (c - b)) / n)
  }
  const i = interval(v)
  return { criterion: '10', world: file.world, what: 'days 91 to 180, the rows that differ: the ranges still hold', shown: i.n ? `inside, C less B ${i.mean.toFixed(2)} of 100 (${i.lo.toFixed(2)} to ${i.hi.toFixed(2)}); ${i.n} people with such rows` : 'no person with such rows', pass: i.n > 0 && i.lo > -2, room: i.n ? i.lo + 2 : NaN }
}
function stays(file: RunFile, k: number): Cell {
  const used = file.results.filter((p) => p.c[k].first >= 0)
  const again = used.filter((p) => p.c[k].offs > 0).length
  const [lo, hi] = wilson(again, used.length)
  return { criterion: '12', world: file.world, what: 'it stays', shown: `${again} of ${used.length} out of use again (${(100 * lo).toFixed(1)} to ${(100 * hi).toFixed(1)} of 100)`, pass: used.length > 0 && hi < 0.25, room: 25 - 100 * hi }
}
function challenger(folder: string, id: string, moreFolder: string | null): Cell | null {
  const own = load(folder, id, '.ch') ?? load(folder, id)
  if (!own || !own.results.every((p) => p.ch)) return null
  const further = moreFolder ? (load(moreFolder, id, '.ch') ?? load(moreFolder, id)) : null
  const more = further && further.results.every((p) => p.ch) ? { hits: further.results.filter((p) => p.ch?.adopted === 1).length, people: further.results.length } : null
  return twenty('11', id, 'the challenger stays safe', own.results.filter((p) => p.ch?.adopted === 1).length, own.results.length, more)
}

/** Every criterion's cells for one setting, from a folder of runs; a world whose file is missing gives no cell. */
export function cellsOf(folder: string, k: number, moreFolder: string | null = null): { cells: Cell[]; terms: Terms; missing: string[] } {
  const files = new Map(some(IDS.map((id) => load(folder, id))).map((f) => [f.world, f]))
  const first = [...files.values()][0]
  if (!first) throw new Error(`no run in ${folder}`)
  const terms = termsOf(first.settings[k])
  const cells: Cell[] = []
  const own = (on: boolean, id: string, make: (f: RunFile) => Cell): void => {
    const f = files.get(id)
    if (on && f) cells.push(make(f))
  }
  own(terms.readings, 'two', (f) => quarter('1', f, k, LATE))
  own(terms.readings, 'two-strong', (f) => better('2', f, k, MIDDLE))
  own(terms.weather, 'sun', (f) => quarter('3', f, k, AFTER))
  own(terms.schedule, 'kind-move', (f) => better('4', f, k, AFTER))
  own(terms.readings && terms.weather, 'all', (f) => quarter('5', f, k, LATE))
  own(terms.events, 'event', (f) => better('6', f, k, LATE))
  own(terms.events, 'event-rhythm', (f) => better('7', f, k, LATE))
  for (const id of IDS) {
    const f = files.get(id)
    if (!f) continue
    cells.push(noHarm(f, k, EVERY), noHarm(f, k, LATE))
    cells.push(invented(f, k, moreFolder ? load(moreFolder, id) : null))
    cells.push(rangeHarm(f, k))
  }
  for (const id of ['two', 'two-strong', 'sun', 'all']) own(true, id, (f) => rangeHolds(f, k))
  own(terms.schedule, 'kind-move', (f) => rangeHolds(f, k))
  own(terms.events, 'event', (f) => rangeHolds(f, k))
  for (const id of ['plain', 'two-strong', 'sun']) {
    const c = challenger(folder, id, moreFolder)
    if (c) cells.push(c)
  }
  own(true, 'two', (f) => stays(f, k))
  own(true, 'sun', (f) => stays(f, k))
  own(terms.events, 'event', (f) => stays(f, k))
  return { cells, terms, missing: IDS.filter((id) => !files.has(id)) }
}

const numbersLine = (n: StageCNumbers): string => `readings ${n.readingChance}/${n.readingShrink}; schedule ${n.reset ? `on, ${n.minWeekdays} weekdays` : 'off'}; weather ${n.weatherChance}/${n.weatherShrink}, window ${n.weatherWindow}, level ${n.weatherLevel}, pairs ${n.minPairs}; events ${n.eventChance}/${n.eventShrink}`

export function judge(folder: string, k: number, moreFolder: string | null): void {
  const { cells, terms, missing } = cellsOf(folder, k, moreFolder)
  const first = some(IDS.map((id) => load(folder, id)))[0]
  console.log(`Stage C, every criterion: ${folder}, setting ${k}: ${numbersLine(first.settings[k])}`)
  console.log(`terms in: ${Object.entries(terms).filter(([, on]) => on).map(([name]) => name).join(', ') || 'none'}; left out: ${Object.entries(terms).filter(([, on]) => !on).map(([name]) => name).join(', ') || 'none'}`)
  if (missing.length) console.log(`worlds with no run here: ${missing.join(', ')}`)
  for (const c of cells) console.log(`${c.pass === null ? 'MORE' : c.pass ? 'pass' : 'FAIL'} | criterion ${c.criterion.padEnd(2)} | ${c.world.padEnd(13)} | ${c.what} | ${c.shown}`)
  const failed = cells.filter((c) => c.pass === false)
  const waiting = cells.filter((c) => c.pass === null)
  console.log(`${cells.length} cells: ${cells.length - failed.length - waiting.length} pass, ${failed.length} fail, ${waiting.length} wait on the further people`)
  report(folder, k)
}

/** Reported, not judged: every world by stretch, in use by term, and the last stretch by distance. */
export function report(folder: string, k: number): void {
  console.log('reported, not judged')
  console.log('world         | stretch         | miss: today  B  C  told | closed of 100 of B to told | ranges inside of 100: B, C | score: B, C | in use of 100 days: B, C')
  for (const id of IDS) {
    const f = load(folder, id)
    if (!f) continue
    const people = f.results
    NAMES.forEach((name, st) => {
      const m = some(people.map((p) => missOf(p, k, [st])))
      const avg = (pick: (x: { today: number; b: number; c: number; t: number }) => number): number => m.reduce((s, x) => s + pick(x), 0) / m.length
      const n = people.reduce((s, p) => s + p.base[st][0], 0)
      const span = [62, 60, 30][st] * people.length
      const hitB = people.reduce((s, p) => s + p.base[st][4], 0)
      const hitC = people.reduce((s, p) => s + p.c[k].s[st][1], 0)
      const scB = people.reduce((s, p) => s + p.base[st][6], 0)
      const scC = people.reduce((s, p) => s + p.c[k].s[st][3], 0)
      const dB = people.reduce((s, p) => s + p.b.days[st + 1], 0)
      const dC = people.reduce((s, p) => s + p.c[k].days[st + 1], 0)
      const gap = avg((x) => x.b - x.t)
      console.log(`${id.padEnd(13)} | ${name.padEnd(15)} | ${f3(avg((x) => x.today))}  ${f3(avg((x) => x.b))}  ${f3(avg((x) => x.c))}  ${f3(avg((x) => x.t))} | ${((100 * avg((x) => x.b - x.c)) / gap).toFixed(0)} | ${((100 * hitB) / n).toFixed(1)}, ${((100 * hitC) / n).toFixed(1)} | ${(scB / n).toFixed(2)}, ${(scC / n).toFixed(2)} | ${((100 * dB) / span).toFixed(1)}, ${((100 * dC) / span).toFixed(1)}`)
    })
    const ever = [0, 1, 2, 3, 4, 5].map((at) => people.filter((p) => p.c[k].ever[at] === 1).length)
    const firsts = people.map((p) => p.c[k].first).filter((d) => d >= 0).sort((a, b) => a - b)
    const used = people.filter((p) => everOf(p, k, NOTHING[id]))
    const cost = interval(some(used.map((p) => missOf(p, k, EVERY))).map((x) => x.c - x.b))
    const kinds = people[0].c[k].kinds.map((_, j) => people.filter((p) => p.c[k].kinds[j] === 1).length)
    const ahead = Array.from({ length: 8 }, (_, h) => {
      const rows = people.reduce((s, p) => s + p.c[k].ahead[h][0], 0)
      return rows ? ((people.reduce((s, p) => s + p.c[k].ahead[h][2], 0) - people.reduce((s, p) => s + p.c[k].ahead[h][1], 0)) / rows).toFixed(3) : '-'
    })
    console.log(`${id.padEnd(13)} | ever in use of ${people.length}: the score's test ${ever[0]}, a reading's ${ever[1]}, sunshine ${ever[2]}, rain ${ever[3]}, high ${ever[4]}, an event ${ever[5]}${kinds.length ? ` (by kind: ${kinds.join(' ')})` : ''}; Stage C at all ${firsts.length}, middle first day ${firsts.length ? firsts[Math.floor(firsts.length / 2)] + 1 : '-'}; out of use again ${people.filter((p) => p.c[k].offs > 0).length}; in use in days 151 to 180: ${people.filter((p) => p.c[k].days[3] > 0).length}; where a term with nothing to find was ever in use (${used.length} people), C less B over days 29 to 180: ${used.length ? f3(cost.mean) : '-'}; last stretch, C less B by days ahead 0 to 7: ${ahead.join(' ')}`)
  }
}

/** One line a setting: each own criterion's room and the tightest cell of each shared one. */
export function tuning(folder: string): void {
  const first = some(IDS.map((id) => load(folder, id)))[0]
  if (!first) throw new Error(`no run in ${folder}`)
  console.log(`Stage C, the tuning read: ${folder}; ${first.results.length} people a world; room is how far inside its bar a cell stands (under nothing fails)`)
  first.settings.forEach((numbers, k) => {
    const { cells } = cellsOf(folder, k)
    const by = (criterion: string): Cell[] => cells.filter((c) => c.criterion === criterion)
    const tight = (criterion: string): string => {
      const cs = by(criterion).filter((c) => !Number.isNaN(c.room))
      if (!cs.length) return '-'
      const worst = cs.reduce((a, b) => (b.room < a.room ? b : a))
      const failed = by(criterion).filter((c) => c.pass === false).map((c) => c.world)
      return `${worst.room.toFixed(3)} ${worst.world}${failed.length ? ` FAIL(${[...new Set(failed)].join(',')})` : ''}`
    }
    const ownCells = ['1', '2', '3', '4', '5', '6', '7'].map((c) => {
      const cell = by(c)[0]
      return cell ? `${c}: ${cell.room.toFixed(3)}${cell.pass ? '' : ' FAIL'}` : `${c}: -`
    })
    console.log(`${String(k).padStart(2)} | ${numbersLine(numbers)} | ${ownCells.join('  ')} | 8: ${tight('8')} | 9: ${tight('9')} | 10: ${tight('10')} | 11: ${tight('11')} | 12: ${tight('12')}`)
  })
}

export function baseline(folder: string): void {
  console.log(`Stage C's worlds, today's system, the Stage B system and the told forecast: ${folder}`)
  console.log('world          | stretch         | miss: today  Stage B  told | the gap from Stage B to told | Stage B in use, of 100 days | Stage B ranges: inside of 100, score')
  for (const id of IDS) {
    const file = load(folder, id)
    if (!file) continue
    const people = file.results
    NAMES.forEach((name, st) => {
      const t = people.reduce((s, p) => s.map((v, j) => v + p.base[st][j]), [0, 0, 0, 0, 0, 0, 0])
      const days = people.reduce((s, p) => s + p.b.days[st + 1], 0)
      const span = [62, 60, 30][st] * people.length
      console.log(`${id.padEnd(14)} | ${name.padEnd(15)} | ${(t[1] / t[0]).toFixed(3)}  ${(t[2] / t[0]).toFixed(3)}  ${(t[3] / t[0]).toFixed(3)} | ${((t[2] - t[3]) / t[0]).toFixed(3)} | ${((100 * days) / span).toFixed(1)} | ${((100 * t[4]) / t[0]).toFixed(1)}, ${(t[6] / t[0]).toFixed(2)}`)
    })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && /stageCJudge\.mjs$/.test(process.argv[1])) {
  const [what, folder, setting, more] = process.argv.slice(2)
  if (what === 'baseline' && folder) baseline(folder)
  else if (what === 'tuning' && folder) tuning(folder)
  else if (what === 'judge' && folder) judge(folder, Number(setting || 0), more ?? null)
  else throw new Error('usage: stageCJudge.mjs baseline|tuning|judge <results folder> [setting] [folder of further people]')
}
