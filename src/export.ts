import { compareSlots } from './blocks'
import { type Aim, type AnchorSwap, askedOf, blocksOf, type BrainBrief, type BriefFeedback, type BriefLog, type Card, type CheckIn, type DayContext, type Declaration, type Forecast, type ForecastScore, type HerSkill, type Intention, type KnownPlace, type Moment, type MonthlyCheck, type Offer, type Outcome, type OutsideDay, type PathMark, type PrivateItem, type Reflection, type RungMark, type Skill, type UseRow, type Win } from './db'
import type { CoachAsk, CoachProposal } from './coachShared'
import type { Fact } from './factTypes'
import { pathKey } from './pathStage'
import { anchorFor, readings, type Position } from './readings'
import { INGREDIENTS } from './score'
import type { Settings } from './settings'

/** The record's own key: which end of each reading is good, and the phrases as they stood, dated where reworded. */
export const REWORDED: readonly { reading: string; position: number; on: string; from: string; to: string }[] = [
  { reading: 'loneliness', position: 1, on: '2026-09-11', from: 'Connected — people feel close', to: 'Connected — or fine on my own' },
  { reading: 'loneliness', position: 4, on: '2026-09-11', from: 'Alone — nobody feels close today', to: 'Lonely — nobody feels close' },
  { reading: 'loneliness', position: 3, on: '2026-09-24', from: 'Wanting — a fair bit feels missing', to: 'Distant — a fair bit feels missing' },
]

/** A reading's question as it stood, dated where it was reworded: the answers keep their meaning (Part 42). */
export const REPROMPTED: readonly { reading: string; on: string; from: string; to: string }[] = [{ reading: 'loneliness', on: '2026-09-24', from: 'Right now', to: 'How much meaningful closeness feels missing' }]

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
  /** The brain: the phone's lines, the Worker's lines, and how each landed. */
  brain?: { log: readonly BriefLog[]; feedback: readonly BriefFeedback[]; briefs: readonly BrainBrief[] }
  /** The paths' declarations, your notes on them, and the monthly checks (Part 27). */
  pathMarks?: readonly PathMark[]
  reflections?: readonly Reflection[]
  monthlyChecks?: readonly MonthlyCheck[]
  /** How the app is used (Part 34; F1): counts, times and fixed ids, never content. */
  useLog?: readonly UseRow[]
  /** The usage facts the day's sheet carries: what Claude may be given, word for word (Follow-up F1). */
  usage?: readonly Fact[]
  /** Part 43: each day's record, for where its parts were spent; and the places you named. Never a fingerprint or a coordinate. */
  days?: readonly DayContext[]
  places?: readonly KnownPlace[]
}

// Everything recorded, as JSON and CSV. Private items are left out unless asked for by name.
// The push address is a device credential, not a record, and is never exported.

export interface ExportOptions {
  includePrivate: boolean
  /** The Partner path's record: its commitment, its steps, what you declared, your notes and the monthly checks (Part 27). */
  includePartner?: boolean
}

/** Screens that are the Partner path's own: their opening goes with the path's record (Part 27). */
const PARTNER_SCREENS: readonly string[] = ['partnerNotes']

/**
 * A step of the Partner path's own: offered through its row, or a rep the Social path does not
 * hold. A rep both paths hold, offered through the Social row, is Social's too and always goes in.
 */
export function partnerOwn(o: Pick<Offer, 'paths' | 'situationKey'>): boolean {
  return o.situationKey === pathKey('partner') || (o.paths?.includes('partner') === true && !o.paths.includes('social'))
}

/** The aims as recorded: commitments, the skills you typed, and every mark that moved one. */
export interface AimsData {
  aims: readonly Aim[]
  skills: readonly Skill[]
  marks: readonly RungMark[]
  /** One tap says when: the cue planned for a step each day, and whether the step was started. */
  intentions?: readonly Intention[]
  /** The skill coach (Parts 40 and 41): what was asked, what you decided, and what Claude proposed. */
  coachAsks?: readonly CoachAsk[]
  coachProposals?: readonly CoachProposal[]
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
  // The Partner path stays out unless ticked (Part 27): its commitment, its plans, its steps, and a line that cites it.
  const partner = opts.includePartner === true
  const partnerAims = new Set((aims?.aims ?? []).filter((a) => a.kind === 'path' && a.path === 'partner').map((a) => a.id))
  const offers = (records?.offers ?? []).filter((o) => partner || !partnerOwn(o))
  const pathsOf = (o: Offer) => (o.paths ? o.paths.filter((p) => partner || p !== 'partner') : null)
  const aboutPartner = (factIds: readonly string[]) => !partner && factIds.some((f) => f.startsWith('partner.'))
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
      caffeineBand: c.extras?.caffeineIntake?.band ?? null,
      caffeineAt: c.extras?.caffeineIntake?.at ?? null,
      caffeineSince: c.extras?.caffeineIntake?.since ?? null,
      caffeineShown: Boolean(c.extras?.caffeineShown),
      necessitiesMissed: Object.keys(c.extras?.necessities ?? {}),
      note: c.extras?.note ?? null,
      ...(opts.includePrivate
        ? {
            private: Object.keys(c.extras?.private ?? {}).map((id) => names.get(id) ?? `item ${id}`),
            // Pass 3: the items on screen at this check-in, so what was seen and left is kept apart from what was never shown.
            privateShown: Object.keys(c.extras?.privateShown ?? {}).map((id) => names.get(id) ?? `item ${id}`),
          }
        : {}),
    },
  }))

  const json = JSON.stringify(
    {
      app: 'Life Mirror',
      exportedAt,
      includesPrivateItems: opts.includePrivate,
      includesPartnerPath: partner,
      key: {
        readings: readings.map((r) => ({ id: r.id, name: r.name, unit: r.unit, goodEnd: INGREDIENTS[r.id] === 'down' ? 'low' : INGREDIENTS[r.id] === 'up' ? 'high' : 'context', anchors: r.anchors, alternates: r.alternates ?? null })),
        positions: 'Each answer is a position 1 to 5 into the anchors, in order. Points are 0, 25, 50, 75, 100, reversed where the good end is low.',
        reworded: REWORDED,
        reprompted: REPROMPTED,
        swaps: (records?.anchorSwaps ?? []).map((s) => ({ reading: s.reading, position: s.position, from: s.from, to: s.to, on: s.at, answers: s.answers, stretchDays: s.stretchDays })),
        retiredReadings: settings.retiredReadings,
        weights: settings.weights,
        caffeine: 'caffeineBand is the band reported for the window from caffeineSince (null: since waking) to caffeineAt: 1 under 100 mg, 2 100 to 199, 3 200 to 299, 4 300 or more. caffeineShown without a band means the item was seen and none was reported, never a confirmed none. caffeineAfterMidday and heavyCaffeineThisMorning are the older yes/no records: some caffeine, amount unknown.',
        events: ['caffeineAfterMidday', 'lateOrHeavyDinner', 'feltCloseToGod', 'nothingLandedToday', 'hardToSeeThePointToday', 'coolingOffEvent', 'bigSocialEvent', 'heavyCaffeineThisMorning', 'nappedToday'],
        location: 'Location Context (Part 43): where each part of a day was spent, as kinds of place only (home, work, church, regular, out, away), as Life Mirror saw them while it was open; and the places you named, by kind and your own word. No coordinate, address or trail is recorded; the fingerprints that recognise a place stay on the phone and are never exported.',
        useLog: 'How Life Mirror was used, in its own words: appOpened (launch, or return after five minutes away), screen (which one), checkinOpened and checkinLeft (the block), lineAction, lineWhy, notification (its kind) and changePicked, each with its day and time. Never content, never anything outside the app. The Partner path’s own screens are left out unless the Partner path is included. usage is what Claude may be given of it: counts over windows ending the day before, what was observed and never why.',
      },
      readings: readings.map((r) => ({ id: r.id, name: r.name, unit: r.unit, anchors: r.anchors })),
      checkins,
      freeText: sorted.filter((c) => c.extras?.note).map((c) => ({ day: c.day, block: c.block, note: c.extras?.note ?? '' })),
      outsideDays: (records?.outside ?? []).map((o) => ({ day: o.day, minutes: o.minutes, at: o.at, source: o.source })),
      useLog: (records?.useLog ?? []).filter((r) => partner || !PARTNER_SCREENS.includes(r.what ?? '')).map((r) => ({ day: r.day, at: r.at, kind: r.kind, what: r.what ?? null })),
      usage: (records?.usage ?? []).map((f) => ({ id: f.id, text: f.text })),
      location: {
        named: (records?.places ?? []).filter((p) => p.kind !== 'none').map((p) => ({ kind: p.kind, label: p.label ?? null, namedAt: p.learnedAt })),
        days: (records?.days ?? []).filter((d) => d.where && Object.keys(d.where).length).map((d) => ({ day: d.day, where: d.where })),
      },
      ...(records
        ? {
            offers: offers.map((o) => {
              const x = records.outcomes.find((y) => y.offerId === o.id)
              return { id: o.id, kind: o.kind, day: o.day, block: o.block, at: o.at, situation: o.situationKey, target: o.target, move: o.moveId, label: o.label ?? null, coinFlip: o.coinFlip, passive: o.passiveId, skipped: o.skippedAt !== null, cardId: o.cardId, outcome: x?.outcome ?? null, why: x?.why ?? null, passiveOutcome: x?.passiveOutcome ?? null, ease: x?.ease ?? null, note: x?.note ?? null, answeredAt: x?.at ?? null, chosenBy: o.chosenBy ?? null, paths: pathsOf(o), setting: o.setting ?? null, rule: o.rule ?? null, stage: o.stage ?? null, candidates: o.candidates, propensities: o.propensities ?? null }
            }),
            cards: records.cards.map((c) => ({ id: c.id, createdAt: c.createdAt, situation: c.situationKey, target: c.target, move: c.moveId, alternative: c.alternativeId, window: c.window, worthwhile: c.worthwhile, origin: c.origin ?? 'app', weights: c.weights ?? null })),
            declarations: records.declarations.map((d) => ({ cardId: d.cardId, at: d.at, diff: d.diff, lo: d.lo, hi: d.hi, level: d.level, nDone: d.nDone, nAlternative: d.nAlternative })),
            forecasts: (records.forecasts ?? []).map((f) => ({ day: f.day, block: f.block, horizon: f.horizon, madeOn: f.madeOn, model: f.model, point: f.point, lo: f.lo, hi: f.hi, whatIf: f.whatIf })),
            forecastScores: (records.forecastScores ?? []).map((s) => ({ day: s.day, block: s.block, horizon: s.horizon, point: s.point, lo: s.lo, hi: s.hi, actual: s.actual, error: s.error, hit: s.hit })),
            her: {
              skills: (records.herSkills ?? []).map((s) => ({ skill: s.skillId, rung: s.rung, addedAt: s.addedAt, rungAt: s.rungAt, removedAt: s.archivedAt })),
              moments: (records.moments ?? []).map((m) => ({ day: m.day, at: m.at, skill: m.skillId, help: m.help })),
            },
            brain: {
              lines: (records.brain?.log ?? []).filter((l) => !aboutPartner(l.factIds)).map((l) => ({ day: l.day, source: 'phone', situation: l.situationId, mode: l.mode, text: l.text, facts: l.factIds, cards: l.cardIds, at: l.at })),
              briefs: (records.brain?.briefs ?? []).filter((b) => !aboutPartner(b.factIds)).map((b) => ({ id: b.id, day: b.day, kind: b.kind, mode: b.mode, text: b.text, facts: b.factIds, cards: b.cardIds, model: b.model, at: b.at, lacked: b.lacked ?? [] })),
              feedback: (records.brain?.feedback ?? []).map((f) => ({ day: f.day, line: f.briefKey, situation: f.situationId, answer: f.answer, at: f.at })),
            },
            ...(partner
              ? {
                  partnerPath: {
                    declarations: (records.pathMarks ?? []).filter((m) => m.path === 'partner').map((m) => ({ kind: m.kind, day: m.day, stage: m.stage ?? null, note: m.note ?? null, at: m.at })),
                    reflections: (records.reflections ?? []).filter((r) => r.path === 'partner').map((r) => ({ kind: r.kind, step: r.step ?? null, part: r.part ?? null, day: r.day, text: r.text, createdAt: r.createdAt, updatedAt: r.updatedAt })),
                    monthlyChecks: (records.monthlyChecks ?? []).map((m) => ({ month: m.month, day: m.day, answers: m.answers, at: m.at })),
                  },
                }
              : {}),
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
        ...(partner ? { partnerOnline: settings.partnerOnline } : {}),
      },
      ...(opts.includePrivate ? { privateItems: items.map((it) => it.name), privateAskedAt: items.map((it) => ({ name: it.name, blocks: blocksOf(it) })) } : {}),
      ...(aims
        ? {
            aims: {
              commitments: aims.aims.filter((a) => partner || !partnerAims.has(a.id)).map((a) => ({ id: a.id, kind: a.kind, name: a.name ?? null, path: a.path ?? null, ladder: a.kind === 'certification' ? (a.ladder ?? 'technical') : null, step: a.stepMoveId, about: a.about ?? null, method: a.method ?? null, currentSkill: a.currentSkillId ?? null, rhythm: a.rhythm ?? null, schedule: a.schedule ?? null, pausedAt: a.pausedAt ?? null, finishedAt: a.finishedAt ?? null, convertedFrom: a.convertedFrom ?? null, createdAt: a.createdAt, archivedAt: a.archivedAt })),
              skills: aims.skills.map((s) => ({ id: s.id, aim: s.aimId ?? null, name: s.name, subject: s.subject ?? null, ladder: s.ladder ?? 'technical', method: s.method ?? null, how: s.how ?? null, minutes: s.minutes ?? null, source: s.source ?? null, safety: s.safety ?? null, likelyNext: s.likelyNext ?? null, order: s.order, startedAt: s.startedAt ?? null, endedAt: s.endedAt ?? null, createdAt: s.createdAt, archivedAt: s.archivedAt })),
              ladderMarks: aims.marks.map((m) => ({ skill: m.skillId, rung: m.rung, at: m.at, via: m.via })),
              plans: (aims.intentions ?? []).filter((i) => partner || !partnerAims.has(i.aimId)).map((i) => ({ aim: i.aimId, day: i.day, cue: i.cue, time: i.time, setAt: i.setAt, started: i.offerId !== null })),
              ...(aims.coachAsks?.length || aims.coachProposals?.length
                ? {
                    coach: {
                      asks: (aims.coachAsks ?? []).map((a) => ({ id: a.id, aim: a.aimId, kind: a.kind, day: a.day, at: a.at, claudeAsked: a.claude, skill: a.skillId ?? null, days: a.days ?? null, reason: a.reason ?? null, care: a.care ?? null, anotherAfter: a.after ?? null, decision: a.decision ?? null, decidedAt: a.decidedAt ?? null })),
                      proposals: (aims.coachProposals ?? []).map((p) => ({ ask: p.askId, aim: p.aimId, kind: p.kind, day: p.day, at: p.at, model: p.model, suggestion: p.suggestion ?? null, review: p.review ?? null })),
                    },
                  }
                : {}),
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
    'caffeine_band',
    'caffeine_since',
    'caffeine_at',
    'caffeine_shown',
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
    c.extras?.caffeineIntake ? String(c.extras.caffeineIntake.band) : '',
    c.extras?.caffeineIntake?.since ?? '',
    c.extras?.caffeineIntake?.at ?? '',
    yesNo(Boolean(c.extras?.caffeineShown)),
    c.extras?.note ?? '',
    ...privateItems.map((it) => yesNo(Boolean(c.extras?.private?.[String(it.id)]))),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

  const offerHeader = ['id', 'kind', 'day', 'block', 'situation', 'target', 'move', 'coin_flip', 'passive', 'skipped', 'card_id', 'outcome', 'why', 'passive_outcome', 'ease', 'note']
  const offerRows = offers.map((o) => {
    const x = records?.outcomes.find((y) => y.offerId === o.id)
    return [String(o.id ?? ''), o.kind, o.day, o.block, o.situationKey, o.target, o.moveId, yesNo(o.coinFlip), o.passiveId ?? '', yesNo(o.skippedAt !== null), String(o.cardId ?? ''), x?.outcome ?? '', x?.why ?? '', x?.passiveOutcome ?? '', x?.ease ?? '', x?.note ?? '']
  })
  const offersCsv = [offerHeader, ...offerRows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

  return { json, csv, offersCsv, exportedAt }
}
