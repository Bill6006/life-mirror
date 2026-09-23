import { describe, expect, it } from 'vitest'
import { associationFor } from './associations'
import { addDays } from './blocks'
import { CAUSAL_WORDS, validateOutput } from './brainShared'
import {
  bandsLabel,
  byDayBand,
  byLatestWindow,
  byMorningBand,
  caffeineEvidence,
  caffeineHabit,
  dayCaffeine,
  itemDays,
  lateCaffeine,
  mergeCells,
  onBoard,
  reportedAgainstUntapped,
  windowState,
  windowsLabel,
} from './caffeineRecord'
import { copy } from './copy'
import type { CaffeineBand, CheckIn, Extras } from './db'
import type { FactSheet } from './factTypes'
import { caffeineFacts } from './facts'
import { lastNightKeys } from './forecastFlow'
import { library } from './library'
import { blockReadings, type Answers, type Position } from './readings'
import { readingOf } from './score'
import { bestDays } from './weekly'

// What the record may say about caffeine (Part 22): three states never collapsed, groups of five
// merged like for like, Promising only from fifteen a group across six weeks, the late line fired
// only by a reported band, and never a cause.

const TODAY = '2026-09-20'
const UP = ['mood', 'energy', 'focus']
const DOWN = ['stress', 'overwhelm', 'irritation']

interface Opts {
  pos?: Position
  hours?: Position
  quality?: Position
  band?: CaffeineBand
  shown?: boolean
  at?: [number, number]
  extras?: Extras
}

/** A completed check-in: its reading set by pos (up ingredients at pos, down ones mirrored), its sleep, and its caffeine state. */
function ci(day: string, block: CheckIn['block'], o: Opts = {}): CheckIn {
  const asked = blockReadings(block)
  const pos = o.pos ?? 3
  const answers = Object.fromEntries(asked.map((id) => [id, DOWN.includes(id) ? 6 - pos : UP.includes(id) ? pos : 3])) as Answers
  if (block === 'morning') {
    if (o.hours) answers.sleepHours = o.hours
    if (o.quality) answers.sleepQuality = o.quality
  }
  const [h, m] = o.at ?? (block === 'morning' ? [8, 0] : block === 'afternoon' ? [13, 30] : [19, 30])
  const [y, mo, d] = day.split('-').map(Number)
  const at = new Date(y, mo - 1, d, h, m).toISOString()
  const extras: Extras = { ...(o.extras ?? {}) }
  if (o.band) extras.caffeineIntake = { band: o.band, at, since: null }
  if (o.band || o.shown) extras.caffeineShown = true
  return { day, block, asked: [...asked], answers, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000, extras }
}

/** Pairs of days from a start: a morning carrying the band (the day began at six to seven hours), then the next morning's sleep. */
function pairs(start: string, bands: readonly CaffeineBand[], next: (band: CaffeineBand) => { hours: Position; quality: Position }): CheckIn[] {
  const out: CheckIn[] = []
  bands.forEach((band, k) => {
    const day = addDays(start, 2 * k)
    out.push(ci(day, 'morning', { band, hours: 3, quality: 3 }))
    out.push(ci(addDays(day, 1), 'morning', { ...next(band) }))
  })
  return out
}
const short = (b: CaffeineBand) => (b >= 3 ? { hours: 3 as Position, quality: 3 as Position } : { hours: 4 as Position, quality: 4 as Position })
const repeat = <T,>(x: T, n: number): T[] => Array.from({ length: n }, () => x)

describe('three states, never collapsed', () => {
  it('reads a window as reported, shown and left, or unknown; old yes records are not bands', () => {
    expect(windowState(ci(TODAY, 'morning', { band: 2 })).state).toBe('reported')
    expect(windowState(ci(TODAY, 'morning', { shown: true })).state).toBe('untapped')
    expect(windowState(ci(TODAY, 'morning')).state).toBe('unknown')
    expect(windowState(ci(TODAY, 'evening', { extras: { caffeine: true } })).state).toBe('unknown')
    expect(windowState(ci(TODAY, 'morning', { extras: { heavyCaffeine: true } })).state).toBe('unknown')
  })

  it('adds a day up as a range, never a figure, and never counts a window nobody reported', () => {
    const day = [ci(TODAY, 'morning', { band: 2 }), ci(TODAY, 'afternoon', { shown: true }), ci(TODAY, 'evening', { band: 1 })]
    expect(dayCaffeine(day, TODAY)).toMatchObject({ floor: 100, ceiling: 298, band: 2, untapped: ['afternoon'] })
    expect(dayCaffeine([ci(TODAY, 'morning', { band: 4 })], TODAY)).toMatchObject({ floor: 300, ceiling: null, band: 4 })
    expect(dayCaffeine([ci(TODAY, 'morning', { shown: true })], TODAY)).toMatchObject({ floor: 0, band: null, windows: [] })
  })

  it('keeps untapped and unseen days out of the band groups, whatever their nights read', () => {
    const base = pairs('2026-07-01', [...repeat<CaffeineBand>(1, 6), ...repeat<CaffeineBand>(3, 6)], short)
    const before = byDayBand(base, TODAY, 0)
    // Twelve more days with the item seen and left, and twelve never seen, each followed by a terrible night.
    const noise: CheckIn[] = []
    for (let k = 0; k < 12; k++) {
      const day = addDays('2026-08-01', 2 * k)
      noise.push(ci(day, 'morning', { hours: 3, quality: 3, shown: k % 2 === 0 }), ci(addDays(day, 1), 'morning', { hours: 1, quality: 1 }))
    }
    const after = byDayBand([...base, ...noise], TODAY, 0)
    expect(after).toEqual(before)
    expect(after.groups.map((g) => g.n)).toEqual([6, 6])
  })

  it('sets reported against shown-and-left only; a check-in nobody saw the item on enters neither side', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, k) => ci(addDays('2026-08-01', k), 'afternoon', { band: 2, pos: 4 })),
      ...Array.from({ length: 5 }, (_, k) => ci(addDays('2026-08-01', k), 'evening', { shown: true, pos: 3 })),
      ...Array.from({ length: 5 }, (_, k) => ci(addDays('2026-08-01', k), 'afternoon', { shown: true, pos: 3 })),
      ...Array.from({ length: 9 }, (_, k) => ci(addDays('2026-08-10', k), 'afternoon', { pos: 1 })),
    ]
    const r = reportedAgainstUntapped(rows, TODAY, 0)
    expect(r.groups.map((g) => [g.keys, g.n])).toEqual([
      [['untapped'], 10],
      [['reported'], 6],
    ])
    // Like for like by time of day: the afternoons alone meet, 75 against 50.
    expect(r.diff).toBe(25)
    expect(r.habitual).toBe(false)
  })

  it('sets last night’s caffeine only against evenings where the item was seen', () => {
    const evenings: CheckIn[] = []
    for (let k = 0; k < 4; k++) {
      const day = addDays('2026-08-01', 3 * k)
      evenings.push(ci(day, 'evening', { band: 2 }), ci(addDays(day, 1), 'morning', { pos: 2 }))
      evenings.push(ci(addDays(day, 1), 'evening', { shown: true }), ci(addDays(day, 2), 'morning', { pos: 4 }))
      evenings.push(ci(addDays(day, 2), 'evening'), ci(addDays(day, 3), 'morning', { pos: 5 }))
    }
    expect(lastNightKeys(ci(TODAY, 'evening', { band: 3 }), undefined, false)).toContain('caffeine')
    expect(lastNightKeys(ci(TODAY, 'evening', { shown: true }), undefined, false)).not.toContain('caffeine')
    const known = (c: CheckIn) => Boolean(c.extras?.caffeine || c.extras?.caffeineIntake || c.extras?.caffeineShown)
    const a = associationFor(evenings, TODAY, (c) => Boolean(c.extras?.caffeineIntake), known)
    expect(a.times).toBe(4)
    expect(a.without.n).toBe(4)
    expect(a.without.mean).toBe(75)
    // Without the rule, the unseen evenings would have joined the other side.
    expect(associationFor(evenings, TODAY, (c) => Boolean(c.extras?.caffeineIntake)).without.n).toBe(8)
  })
})

describe('groups of five, merged like for like, and the cap', () => {
  it('merges the smallest group into its neighbour, under or over 200 mg first, until each holds five', () => {
    const cells = (n: [number, number, number, number]) => mergeCells(n.map((x, i) => ({ key: (i + 1) as CaffeineBand, n: x })), (b) => (b >= 3 ? 1 : 0)).map((c) => c.keys)
    expect(cells([2, 8, 6, 1])).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(cells([6, 7, 5, 5])).toEqual([[1], [2], [3], [4]])
    expect(cells([6, 3, 3, 0])).toEqual([[1, 2, 3]])
    expect(cells([0, 0, 0, 0])).toEqual([])
    expect(bandsLabel([1, 2])).toBe('Under 200 mg')
    expect(bandsLabel([3, 4])).toBe('200 mg or more')
    expect(bandsLabel([2, 3])).toBe('100–299 mg')
    expect(bandsLabel([1, 2, 3, 4])).toBe('Any amount')
    expect(windowsLabel(['afternoon', 'evening'])).toBe('Afternoon or evening')
  })

  it('shows a group under five as a count and nothing else, and compares nothing with one group', () => {
    const c = byDayBand(pairs('2026-07-01', repeat<CaffeineBand>(1, 3), short), TODAY, 10)
    expect(c.groups).toEqual([{ keys: [1], n: 3, hours: null, quality: null }])
    expect(c.hoursDiff).toBeNull()
    expect(c.standing).toBe('little')
    expect(c.none).toBe(false)
  })

  it('reads the next night like for like, and stays Unclear under fifteen a group or six weeks', () => {
    const six = pairs('2026-07-01', [...repeat<CaffeineBand>(1, 6), ...repeat<CaffeineBand>(3, 6)], short)
    const c = byDayBand(six, TODAY, 10)
    expect(c.groups.map((g) => [g.keys, g.n, g.hours, g.quality])).toEqual([
      [[1], 6, 4, 4],
      [[3], 6, 3, 3],
    ])
    expect(c.hoursDiff).toBe(-1)
    expect(c.qualityDiff).toBe(-1)
    expect(c.standing).toBe('unclear')
    const fifteen = pairs('2026-06-01', [...repeat<CaffeineBand>(1, 15), ...repeat<CaffeineBand>(3, 15)], short)
    expect(byDayBand(fifteen, TODAY, 5).standing).toBe('unclear')
    expect(byDayBand(fifteen, TODAY, 6).standing).toBe('promising')
    const fourteen = pairs('2026-06-01', [...repeat<CaffeineBand>(1, 14), ...repeat<CaffeineBand>(3, 15)], short)
    expect(byDayBand(fourteen, TODAY, 12).standing).toBe('unclear')
  })

  it('says no difference in its fixed words when the groups read alike', () => {
    const alike = pairs('2026-07-01', [...repeat<CaffeineBand>(1, 6), ...repeat<CaffeineBand>(3, 6)], () => ({ hours: 4, quality: 4 }))
    const c = byDayBand(alike, TODAY, 10)
    expect(c.none).toBe(true)
    const f = caffeineFacts(alike, { ...caffeineEvidence(alike, TODAY), byDayBand: c }, TODAY).find((x) => x.id === 'assoc.caffeine.bands')
    expect(f?.text).toContain('no difference is showing, and self-reported sleep is known to miss caffeine’s effect')
    expect(copy.caffeine.ev.none).toBe('No difference is showing; self-reported sleep is known to miss caffeine’s effect.')
  })

  it('groups days by the last window with 100 mg or more, and mornings by their band against that afternoon', () => {
    const rows: CheckIn[] = []
    for (let k = 0; k < 5; k++) {
      const a = addDays('2026-07-01', 2 * k)
      rows.push(ci(a, 'morning', { band: 2, hours: 3 }), ci(addDays(a, 1), 'morning', { hours: 4, quality: 4 }))
      const b = addDays('2026-08-01', 2 * k)
      rows.push(ci(b, 'morning', { band: 1, hours: 3 }), ci(b, 'afternoon', { band: 2, at: [15, 30] }), ci(addDays(b, 1), 'morning', { hours: 2, quality: 2 }))
    }
    const latest = byLatestWindow(rows, TODAY, 10)
    expect(latest.groups.map((g) => [g.keys, g.n])).toEqual([
      [['morning'], 5],
      [['afternoon'], 5],
    ])
    expect(latest.hoursDiff).toBe(-2)
    const mornings: CheckIn[] = []
    for (let k = 0; k < 6; k++) {
      const d = addDays('2026-07-01', k)
      mornings.push(ci(d, 'morning', { band: 1, hours: 4 }), ci(d, 'afternoon', { pos: 4 }))
      const e = addDays('2026-08-01', k)
      mornings.push(ci(e, 'morning', { band: 3, hours: 4 }), ci(e, 'afternoon', { pos: 2 }))
    }
    const m = byMorningBand(mornings, TODAY, 10)
    expect(m.groups.map((g) => [g.keys, g.n, g.value])).toEqual([
      [[1], 6, 75],
      [[3], 6, 25],
    ])
    expect(m.diff).toBe(-50)
  })
})

describe('the habitual reporter', () => {
  it('drops untapped mornings from the secondary comparison when caffeine was reported on 20 of the last 28 days, and says why', () => {
    const rows: CheckIn[] = []
    for (let k = 1; k <= 28; k++) {
      const day = addDays(TODAY, -k)
      rows.push(k <= 22 ? ci(day, 'morning', { band: 2 }) : ci(day, 'morning', { shown: true }))
      rows.push(ci(day, 'afternoon', { shown: true }))
    }
    const h = caffeineHabit(rows, TODAY)
    expect(h).toMatchObject({ reportedDays: 22, usualMorning: 2, habitual: true })
    const r = reportedAgainstUntapped(rows, TODAY, 4)
    expect(r.droppedMornings).toBe(6)
    expect(r.habitual).toBe(true)
    const f = caffeineFacts(rows, caffeineEvidence(rows, TODAY), TODAY)
    expect(f.find((x) => x.id === 'caffeine.habit')?.text).toContain('Reported on most days, so an untapped morning is more likely forgotten than empty.')
    const rep = f.find((x) => x.id === 'assoc.caffeine.reported')
    expect(rep?.text).toContain('Untapped mornings left out: 6')
    expect(rep?.text).toContain('may be withdrawal on the check-ins without it, not a lift')
    // Below twenty days, nothing is dropped.
    expect(reportedAgainstUntapped(rows.filter((c) => c.day >= addDays(TODAY, -19)), TODAY, 4).droppedMornings).toBe(0)
  })
})

describe('caffeine on board, and the late line', () => {
  it('marks a check-in whose window reported a band, or whose previous window within six hours reported 100 mg or more', () => {
    const morning = ci(TODAY, 'morning', { band: 2, at: [8, 0] })
    const afternoon = ci(TODAY, 'afternoon', { at: [13, 30] })
    expect(onBoard([morning, afternoon], afternoon)).toBe(true)
    expect(onBoard([morning, ci(TODAY, 'afternoon', { at: [14, 30] })], ci(TODAY, 'afternoon', { at: [14, 30] }))).toBe(false)
    expect(onBoard([ci(TODAY, 'morning', { band: 1 }), afternoon], afternoon)).toBe(false)
    expect(onBoard([], ci(TODAY, 'evening', { band: 1 }))).toBe(true)
    // The marker never moves the number.
    expect(readingOf(ci(TODAY, 'afternoon', { band: 4, pos: 2 }))).toEqual(readingOf(ci(TODAY, 'afternoon', { pos: 2 })))
  })

  it('fires only from a reported band of 100 mg or more whose cut-off runs past midnight', () => {
    expect(lateCaffeine([ci(TODAY, 'afternoon', { band: 3, at: [13, 30] })], TODAY)).toMatchObject({ block: 'afternoon', time: '13:30', mg: 217, hours: 13.2 })
    expect(lateCaffeine([ci(TODAY, 'afternoon', { band: 2, at: [15, 30] })], TODAY)).toMatchObject({ mg: 107, hours: 8.8 })
    expect(lateCaffeine([ci(TODAY, 'morning', { band: 3, at: [9, 0] })], TODAY)).toBeNull()
    expect(lateCaffeine([ci(TODAY, 'afternoon', { band: 2, at: [14, 0] })], TODAY)).toBeNull()
    expect(lateCaffeine([ci(TODAY, 'evening', { band: 1, at: [20, 0] })], TODAY)).toBeNull()
    expect(lateCaffeine([ci(TODAY, 'evening', { shown: true, at: [20, 0] }), ci(TODAY, 'afternoon', { at: [16, 0] })], TODAY)).toBeNull()
    const f = caffeineFacts([ci(addDays(TODAY, -1), 'afternoon', { band: 3, at: [16, 40] })], caffeineEvidence([], TODAY), TODAY).find((x) => x.id === 'caffeine.late')
    expect(f?.values).toMatchObject({ when: 'yesterday', band: '200–299 mg', time: '16:40', mg: 217, hours: 13.2 })
  })
})

describe('what the record says in words', () => {
  it('says today’s windows as reported or none reported, with an "at least" total, never a zero', () => {
    const f = caffeineFacts([ci(TODAY, 'morning', { band: 2 }), ci(TODAY, 'afternoon', { shown: true })], caffeineEvidence([], TODAY), TODAY).find((x) => x.id === 'today.caffeine')
    expect(f?.text).toBe('Caffeine by check-in window today: morning 100–199 mg; afternoon none reported; at least 100 mg reported in all. None reported is not a confirmed none.')
    expect(f?.values).toMatchObject({ morning: '100–199 mg', afternoon: 'none reported', evening: null, reported: 1, untapped: 1 })
    expect(JSON.stringify(f?.values)).not.toMatch(/"(morning|afternoon|evening)":0/)
  })

  it('never names a cause, never "because of", never "affects", never caffeine-free, in any caffeine copy', () => {
    const texts: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') texts.push(v)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(copy.caffeine)
    for (const [id, line] of Object.entries(copy.brain.lines)) if (id.includes('caffeine')) texts.push(line)
    texts.push(copy.brief.lastNightEvents.caffeine, copy.evidence.caffeineTitle, copy.evidence.caffeineLine)
    for (const card of library.filter((c) => c.tags.includes('caffeine'))) texts.push(card.claim, card.effect, card.caveats, card.app)
    // The fact texts, from a record rich enough to write every one of them.
    const rows: CheckIn[] = [...pairs('2026-06-01', [...repeat<CaffeineBand>(1, 15), ...repeat<CaffeineBand>(3, 15)], short)]
    // Each band morning also has its afternoon, so the morning-band comparison has something to read.
    for (const m of [...rows]) if (m.extras?.caffeineIntake) rows.push(ci(m.day, 'afternoon', { pos: m.extras.caffeineIntake.band >= 3 ? 2 : 4 }))
    for (let k = 1; k <= 28; k++) rows.push(ci(addDays(TODAY, -k), 'afternoon', { band: k % 3 === 0 ? 2 : undefined, shown: true, at: [15, 40] }))
    rows.push(ci(TODAY, 'morning', { band: 2 }), ci(TODAY, 'afternoon', { band: 3, at: [14, 0] }))
    const facts = caffeineFacts(rows, caffeineEvidence(rows, TODAY), TODAY)
    expect(facts.map((f) => f.id).sort()).toEqual(['assoc.caffeine.bands', 'assoc.caffeine.latest', 'assoc.caffeine.morning', 'assoc.caffeine.reported', 'caffeine.habit', 'caffeine.late', 'today.caffeine'])
    texts.push(...facts.map((f) => f.text))
    expect(texts.length).toBeGreaterThan(40)
    for (const t of texts) {
      expect(t, t).not.toMatch(CAUSAL_WORDS)
      expect(t, t).not.toMatch(/caffeine[- ]free|\bno caffeine\b(?! (?:was )?reported)/i)
    }
  })

  it('refuses a writer that calls a window caffeine-free or caffeine a cause, and lets an association through', () => {
    const sheet: FactSheet = { version: 1, day: TODAY, builtAt: '', hour: 8, weeks: 4, days: 28, direction: null, facts: [{ id: 'caffeine.habit', tags: [], text: '', values: { reported: 12 }, n: 12 }], said: [] }
    const say = (text: string) => validateOutput({ mode: 'observation', text, factIds: ['caffeine.habit'], cardIds: [] }, sheet, library)
    expect(say('Your caffeine-free days read calmer.')).toMatchObject({ ok: false, reason: expect.stringContaining('caffeine-free') })
    expect(say('On days with no caffeine you slept longer.')).toMatchObject({ ok: false, reason: expect.stringContaining('caffeine-free') })
    expect(say('Coffee affects your sleep more than you think.')).toMatchObject({ ok: false, reason: expect.stringContaining('cause') })
    expect(say('The short nights came because of the late coffee.')).toMatchObject({ ok: false, reason: expect.stringContaining('cause') })
    expect(say('Caffeine was reported on 12 days; on the others no caffeine was reported.')).toMatchObject({ ok: true })
  })
})

describe('best days, from reported bands', () => {
  it('counts caffeine rows over the days the item recorded anything, and keeps the old rows until it has 28 days', () => {
    const rows: CheckIn[] = []
    for (let k = 1; k <= 30; k++) {
      const day = addDays(TODAY, -k)
      // The top tenth of thirty days is three: two of them inside the item's ten days, one before it.
      const good = k === 3 || k === 6 || k === 20
      rows.push(ci(day, 'morning', { pos: good ? 5 : 3, band: k <= 10 && !good ? 3 : undefined, shown: k <= 10, extras: k > 10 && k % 2 === 0 ? { heavyCaffeine: true } : undefined }))
      rows.push(ci(day, 'evening', { pos: good ? 5 : 3 }))
    }
    expect(itemDays(rows, TODAY)).toBe(10)
    const b = bestDays(rows, [], [], [], TODAY)
    const row = [...b.controlled, ...b.uncontrolled].find((d) => d.label === 'at least 200 mg of caffeine reported')
    // Ten days carry the item's record: two of them among the best, eight among the others.
    expect(row).toMatchObject({ onBest: 0, ofBest: 2, onOthers: 8, ofOthers: 8 })
    expect(b.controlled.some((d) => d.label === 'heavy caffeine in the morning')).toBe(true)
    // Twenty-eight days of the item's own record retire the old rows.
    const later = rows.map((c) => (c.block === 'morning' ? { ...c, extras: { ...c.extras, caffeineShown: true as const } } : c))
    expect(itemDays(later, TODAY)).toBe(30)
    const b2 = bestDays(later, [], [], [], TODAY)
    expect([...b2.controlled].some((d) => d.label === 'heavy caffeine in the morning' || d.label === 'caffeine after midday')).toBe(false)
  })
})
