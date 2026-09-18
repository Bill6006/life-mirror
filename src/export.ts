import { compareSlots } from './blocks'
import { type HerSkill, type Moment, askedOf, type Aim, type AnchorSwap, type Card, type CheckIn, type Declaration, type Forecast, type ForecastScore, type Intention, type Offer, type Outcome, type OutsideDay, type PrivateItem, type RungMark, type Skill, type Win } from './db'
import { anchorFor, readings, type Position } from './readings'
import { INGREDIENTS } from './score'
import type { Settings } from './settings'

/** The record's own key: which end of each reading is good, and the phrases as they stood, dated where reworded. */
export const REWORDED: readonly { reading: string; position: number; on: string; from: string; to: string }[] = [
  { reading: 'loneliness', position: 1, on: '2026-09-11', from: 'Connected — people feel close', to: 'Connected — or fine on my own' },
  { reading: 'loneliness', position: 4, on: '2026-09-11', from: 'Alone — nobody feels close today', to: 'Lonely — nobody feels close' },
]

/** Offers, cards, outcomes and declarations: what was offered against what you did. */
export interface RecordsData {
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  cards: readonly Card[]
  declarations: readonly Declaration[]
  forecasts?: readonly Forecast[]
  forecastScores?: readonly ForecastScore[]
  anchorSwaps?: readonly AnchorSwap[]
  herSkills?: readonly HerSkill[]
  moments?: readonly Moment[]
  /** The other app's finished workouts, as read from the shared cloud copy. */
  outside?: readonly OutsideDay[]
}

// Everything recorded, as JSON and CSV. Private items are left out unless asked for by name.
// The push address is a device credential, not a record, and is never exported.

export interface ExportOptions {
  includePrivate: boolean
}

/** The aims as recorded: commitments, the skills you typed, and every mark that moved one. */
export interface AimsData {
  aims: readonly Aim[]
  skills: readonly Skill[]
  marks: readonly RungMark[]
  /** One tap says when: the cue planned for a step each day, and whether the step was started. */
  intentions?: readonly Intention[]
}

export interface ExportBundle {
  json: string
  csv: string
  /** Offers against outcomes, one row per offer. */
  offersCsv: string
  exportedAt: string
}

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function yesNo(v: boolean): string {
  return v ? 'yes' : ''
}

export function buildExport(all: readonly CheckIn[], wins: readonly Win[], items: readonly PrivateItem[], settings: Settings, opts: ExportOptions, aims?: AimsData, records?: RecordsData): ExportBundle {
  const exportedAt = new Date().toISOString()
  const names = new Map(items.map((it) => [String(it.id), it.name]))
  const sorted = [...all].sort(compareSlots)

  const checkins = sorted.map((c) => ({
    day: c.day,
    block: c.block,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    activeMs: c.activeMs,
    asked: [...askedOf(c)],
    answers: Object.fromEntries(Object.entries(c.answers).map(([id, p]) => [id, { position: p, phrase: anchorFor(id, p as Position) }])),
    extras: {
      caffeineAfterMidday: Boolean(c.extras?.caffeine),
      lateOrHeavyDinner: Boolean(c.extras?.dinner),
      feltCloseToGod: Boolean(c.extras?.closeToGod),
      nothingLandedToday: Boolean(c.extras?.nothingLanded),
      hardToSeeThePointToday: Boolean(c.extras?.hardToSeePoint),
      nappedToday: Boolean(c.extras?.napped),
      coolingOffEvent: Boolean(c.extras?.coolingOff),
      bigSocialEvent: Boolean(c.extras?.bigSocial),
      heavyCaffeineThisMorning: Boolean(c.extras?.heavyCaffeine),
      necessitiesMissed: Object.keys(c.extras?.necessities ?? {}),
      note: c.extras?.note ?? null,
      ...(opts.includePrivate ? { private: Object.keys(c.extras?.private ?? {}).map((id) => names.get(id) ?? `item ${id}`) } : {}),
    },
  }))

  const json = JSON.stringify(
    {
      app: 'Life Mirror',
      exportedAt,
      includesPrivateItems: opts.includePrivate,
      key: {
        readings: readings.map((r) => ({ id: r.id, name: r.name, unit: r.unit, goodEnd: INGREDIENTS[r.id] === 'down' ? 'low' : INGREDIENTS[r.id] === 'up' ? 'high' : 'context', anchors: r.anchors, alternates: r.alternates ?? null })),
        positions: 'Each answer is a position 1 to 5 into the anchors, in order. Points are 0, 25, 50, 75, 100, reversed where the good end is low.',
        reworded: REWORDED,
        swaps: (records?.anchorSwaps ?? []).map((s) => ({ reading: s.reading, position: s.position, from: s.from, to: s.to, on: s.at, answers: s.answers, stretchDays: s.stretchDays })),
        retiredReadings: settings.retiredReadings,
        weights: settings.weights,
        events: ['caffeineAfterMidday', 'lateOrHeavyDinner', 'feltCloseToGod', 'nothingLandedToday', 'hardToSeeThePointToday', 'coolingOffEvent', 'bigSocialEvent', 'heavyCaffeineThisMorning', 'nappedToday'],
      },
      readings: readings.map((r) => ({ id: r.id, name: r.name, unit: r.unit, anchors: r.anchors })),
      checkins,
      freeText: sorted.filter((c) => c.extras?.note).map((c) => ({ day: c.day, block: c.block, note: c.extras?.note ?? '' })),
      outsideDays: (records?.outside ?? []).map((o) => ({ day: o.day, minutes: o.minutes, at: o.at, source: o.source })),
      ...(records
        ? {
            offers: records.offers.map((o) => {
              const x = records.outcomes.find((y) => y.offerId === o.id)
              return { id: o.id, kind: o.kind, day: o.day, block: o.block, at: o.at, situation: o.situationKey, target: o.target, move: o.moveId, label: o.label ?? null, coinFlip: o.coinFlip, passive: o.passiveId, skipped: o.skippedAt !== null, cardId: o.cardId, outcome: x?.outcome ?? null, why: x?.why ?? null, passiveOutcome: x?.passiveOutcome ?? null, answeredAt: x?.at ?? null }
            }),
            cards: records.cards.map((c) => ({ id: c.id, createdAt: c.createdAt, situation: c.situationKey, target: c.target, move: c.moveId, alternative: c.alternativeId, window: c.window, worthwhile: c.worthwhile, origin: c.origin ?? 'app', weights: c.weights ?? null })),
            declarations: records.declarations.map((d) => ({ cardId: d.cardId, at: d.at, diff: d.diff, lo: d.lo, hi: d.hi, level: d.level, nDone: d.nDone, nAlternative: d.nAlternative })),
            forecasts: (records.forecasts ?? []).map((f) => ({ day: f.day, block: f.block, horizon: f.horizon, madeOn: f.madeOn, model: f.model, point: f.point, lo: f.lo, hi: f.hi, whatIf: f.whatIf })),
            forecastScores: (records.forecastScores ?? []).map((s) => ({ day: s.day, block: s.block, horizon: s.horizon, point: s.point, lo: s.lo, hi: s.hi, actual: s.actual, error: s.error, hit: s.hit })),
            her: {
              skills: (records.herSkills ?? []).map((s) => ({ skill: s.skillId, rung: s.rung, addedAt: s.addedAt, rungAt: s.rungAt, removedAt: s.archivedAt })),
              moments: (records.moments ?? []).map((m) => ({ day: m.day, at: m.at, skill: m.skillId, help: m.help })),
            },
          }
        : {}),
      minimumWins: wins.map((w) => ({ forDay: w.forDay, setOn: w.setOn, text: w.text, outcome: w.outcome, answeredAt: w.answeredAt })),
      settings: {
        depth: settings.depth,
        frequency: settings.frequency,
        quietHours: { from: settings.quietStart, to: settings.quietEnd },
        lowDemand: settings.lowDemand,
        reminders: settings.reminders,
        extras: settings.extras,
      },
      ...(opts.includePrivate ? { privateItems: items.map((it) => it.name) } : {}),
      ...(aims
        ? {
            aims: {
              commitments: aims.aims.map((a) => ({ id: a.id, kind: a.kind, name: a.name ?? null, ladder: a.kind === 'certification' ? (a.ladder ?? 'technical') : null, step: a.stepMoveId, createdAt: a.createdAt, archivedAt: a.archivedAt })),
              skills: aims.skills.map((s) => ({ id: s.id, name: s.name, subject: s.subject ?? null, ladder: s.ladder ?? 'technical', order: s.order, createdAt: s.createdAt, archivedAt: s.archivedAt })),
              ladderMarks: aims.marks.map((m) => ({ skill: m.skillId, rung: m.rung, at: m.at, via: m.via })),
              plans: (aims.intentions ?? []).map((i) => ({ aim: i.aimId, day: i.day, cue: i.cue, time: i.time, setAt: i.setAt, started: i.offerId !== null })),
            },
          }
        : {}),
    },
    null,
    2,
  )

  const ids = readings.map((r) => r.id)
  const privateItems = opts.includePrivate ? items : []
  const header = [
    'day',
    'block',
    'completed_at',
    'active_ms',
    ...ids,
    'caffeine_after_midday',
    'late_or_heavy_dinner',
    'felt_close_to_god',
    'nothing_landed_today',
    'hard_to_see_the_point_today',
    'heavy_caffeine_this_morning',
    'napped_today',
    'note',
    ...privateItems.map((it) => `private: ${it.name}`),
  ]
  const rows = sorted.map((c) => [
    c.day,
    c.block,
    c.completedAt ?? '',
    String(c.activeMs),
    ...ids.map((id) => (c.answers[id] === undefined ? '' : String(c.answers[id]))),
    yesNo(Boolean(c.extras?.caffeine)),
    yesNo(Boolean(c.extras?.dinner)),
    yesNo(Boolean(c.extras?.closeToGod)),
    yesNo(Boolean(c.extras?.nothingLanded)),
    yesNo(Boolean(c.extras?.hardToSeePoint)),
    yesNo(Boolean(c.extras?.heavyCaffeine)),
    yesNo(Boolean(c.extras?.napped)),
    c.extras?.note ?? '',
    ...privateItems.map((it) => yesNo(Boolean(c.extras?.private?.[String(it.id)]))),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

  const offerHeader = ['id', 'kind', 'day', 'block', 'situation', 'target', 'move', 'coin_flip', 'passive', 'skipped', 'card_id', 'outcome', 'why', 'passive_outcome']
  const offerRows = (records?.offers ?? []).map((o) => {
    const x = records?.outcomes.find((y) => y.offerId === o.id)
    return [String(o.id ?? ''), o.kind, o.day, o.block, o.situationKey, o.target, o.moveId, yesNo(o.coinFlip), o.passiveId ?? '', yesNo(o.skippedAt !== null), String(o.cardId ?? ''), x?.outcome ?? '', x?.why ?? '', x?.passiveOutcome ?? '']
  })
  const offersCsv = [offerHeader, ...offerRows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

  return { json, csv, offersCsv, exportedAt }
}
