import { compareSlots } from './blocks'
import { askedOf, type CheckIn, type PrivateItem, type Win } from './db'
import { anchorFor, readings, type Position } from './readings'
import type { Settings } from './settings'

// Everything recorded, as JSON and CSV. Private items are left out unless asked for by name.
// The push address is a device credential, not a record, and is never exported.

export interface ExportOptions {
  includePrivate: boolean
}

export interface ExportBundle {
  json: string
  csv: string
  exportedAt: string
}

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function yesNo(v: boolean): string {
  return v ? 'yes' : ''
}

export function buildExport(all: readonly CheckIn[], wins: readonly Win[], items: readonly PrivateItem[], settings: Settings, opts: ExportOptions): ExportBundle {
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
      ...(opts.includePrivate ? { private: Object.keys(c.extras?.private ?? {}).map((id) => names.get(id) ?? `item ${id}`) } : {}),
    },
  }))

  const json = JSON.stringify(
    {
      app: 'Life Mirror',
      exportedAt,
      includesPrivateItems: opts.includePrivate,
      readings: readings.map((r) => ({ id: r.id, name: r.name, unit: r.unit, anchors: r.anchors })),
      checkins,
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
    ...privateItems.map((it) => yesNo(Boolean(c.extras?.private?.[String(it.id)]))),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

  return { json, csv, exportedAt }
}
