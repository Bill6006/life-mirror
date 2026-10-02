import type { AuditRow } from './turso'

// The storage audit (2026-10-02): what the cloud holds of the phone's own records, by structure
// alone: ids, days, blocks, counts, stamps and devices. Never an answer, a note or any word the
// owner wrote. Read-only.

function parse(body: string | null): Record<string, unknown> | null {
  if (!body) return null
  try {
    const v = JSON.parse(body) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null)
const short = (v: string | null): string | null => (v ? v.slice(0, 8) : null)
/** A situation key compared whole and shown only as a hash. */
const hashed = (v: string | null): string | null => {
  if (!v) return null
  let h = 5381
  for (let i = 0; i < v.length; i++) h = ((h * 33) ^ v.charCodeAt(i)) >>> 0
  return h.toString(16)
}

/** The logical identity of a row in the stores whose identity is not their id. */
const LOGICAL: Record<string, (b: Record<string, unknown>) => string | null> = {
  checkins: (b) => (b.day && b.block ? `${str(b.day)}|${str(b.block)}` : null),
  forecasts: (b) => (b.day && b.block && b.horizon !== undefined ? `${str(b.day)}|${str(b.block)}|${str(b.horizon)}` : null),
  forecastScores: (b) => (b.day && b.block && b.horizon !== undefined ? `${str(b.day)}|${str(b.block)}|${str(b.horizon)}` : null),
}

export function recordsAudit(rows: readonly AuditRow[], from: string, since: string) {
  const stores: Record<string, { rows: number; live: number; deleted: number; maxId: number | null; firstSynced: string | null; lastSynced: string | null; devices: number; syncedSince: number; sinceMinId: number | null; sinceMaxId: number | null }> = {}
  const devices = new Map<string, Set<string>>()
  for (const r of rows) {
    const s = (stores[r.store] ??= { rows: 0, live: 0, deleted: 0, maxId: null, firstSynced: null, lastSynced: null, devices: 0, syncedSince: 0, sinceMinId: null, sinceMaxId: null })
    s.rows++
    if (r.deleted) s.deleted++
    else s.live++
    const n = Number(r.id)
    if (Number.isFinite(n)) s.maxId = s.maxId === null ? n : Math.max(s.maxId, n)
    if (!s.firstSynced || r.synced_at < s.firstSynced) s.firstSynced = r.synced_at
    if (!s.lastSynced || r.synced_at > s.lastSynced) s.lastSynced = r.synced_at
    if (r.synced_at >= since) {
      s.syncedSince++
      if (Number.isFinite(n)) {
        s.sinceMinId = s.sinceMinId === null ? n : Math.min(s.sinceMinId, n)
        s.sinceMaxId = s.sinceMaxId === null ? n : Math.max(s.sinceMaxId, n)
      }
    }
    if (r.device_id) (devices.get(r.store) ?? devices.set(r.store, new Set()).get(r.store) as Set<string>).add(r.device_id)
  }
  for (const [store, set] of devices) stores[store].devices = set.size

  const checkins = rows
    .filter((r) => r.store === 'checkins')
    .map((r) => {
      const b = parse(r.body)
      const answers = b && b.answers && typeof b.answers === 'object' ? Object.keys(b.answers as object).length : 0
      return { id: r.id, day: str(b?.day) ?? r.day, block: str(b?.block), completed: Boolean(b?.completedAt), answers, updatedAt: r.updated_at, syncedAt: r.synced_at, device: short(r.device_id), deleted: r.deleted === 1 }
    })
  const recent = checkins.filter((c) => (c.day ?? '') >= from).sort((a, b) => ((a.day ?? '') + (a.block ?? '') < (b.day ?? '') + (b.block ?? '') ? -1 : 1))

  // A check-in whose id comes before another's while its day comes after: a later record written over an older id.
  const byId = checkins.filter((c) => !c.deleted && Number.isFinite(Number(c.id))).sort((a, b) => Number(a.id) - Number(b.id))
  const outOfStep: { id: string; day: string | null; block: string | null; nextId: string; nextDay: string | null; nextBlock: string | null }[] = []
  for (let i = 0; i + 1 < byId.length; i++) {
    const a = byId[i]
    const b = byId[i + 1]
    if (a.day && b.day && a.day > b.day) outOfStep.push({ id: a.id, day: a.day, block: a.block, nextId: b.id, nextDay: b.day, nextBlock: b.block })
  }

  const duplicates: Record<string, { keys: number; examples: { key: string; ids: string[]; synced: string[] }[] }> = {}
  for (const [store, keyOf] of Object.entries(LOGICAL)) {
    const groups = new Map<string, AuditRow[]>()
    for (const r of rows) {
      if (r.store !== store || r.deleted) continue
      const b = parse(r.body)
      const k = b ? keyOf(b) : null
      if (k) groups.set(k, [...(groups.get(k) ?? []), r])
    }
    const many = [...groups.entries()].filter(([, g]) => g.length > 1)
    duplicates[store] = { keys: many.length, examples: many.slice(0, 12).map(([key, g]) => ({ key, ids: g.map((r) => r.id), synced: g.map((r) => r.synced_at) })) }
  }

  // Rows written since the event under an id the cloud already held before it: an update of the same record, or a
  // different record written over that id. In an add-only store (forecasts, scores, the usage log) every one is the latter.
  const reused: Record<string, { beforeMaxId: number | null; count: number; examples: { id: string; day: string | null; synced: string; key: string | null }[] }> = {}
  for (const store of Object.keys(stores)) {
    const mine = rows.filter((r) => r.store === store && Number.isFinite(Number(r.id)))
    const before = mine.filter((r) => r.synced_at < since).map((r) => Number(r.id))
    const beforeMaxId = before.length ? Math.max(...before) : null
    const hits = beforeMaxId === null ? [] : mine.filter((r) => r.synced_at >= since && Number(r.id) <= beforeMaxId)
    const keyOf = LOGICAL[store] as ((b: Record<string, unknown>) => string | null) | undefined
    reused[store] = {
      beforeMaxId,
      count: hits.length,
      examples: hits.slice(0, 8).map((r) => {
        const body = parse(r.body)
        return { id: r.id, day: r.day, synced: r.synced_at, key: keyOf && body ? keyOf(body) : null }
      }),
    }
  }

  return { from, since, stores, checkins: recent, outOfStep: outOfStep.slice(0, 40), duplicates, reused }
}

/**
 * The links between the phone's records, by structure alone (2026-10-02): an outcome names its offer, an
 * offer its card, an intention and a study night the offer that began them. A record written over another's
 * id leaves the records that named the old one pointing at the new one. An outcome is asked at a later
 * check-in than its offer, so its slot is not the offer's; but it can never be answered before the offer
 * was made. A plan is started by an offer of its own day. A link the phone took back (lostLinks.ts) names
 * a negative id and keeps the old one in lostOfferId: listed as taken back, not as broken. Every record
 * from `from` on is listed with its ids, slot and times only.
 */
export function recordsLinks(rows: readonly AuditRow[], from: string) {
  const live = (store: string) => rows.filter((r) => r.store === store && !r.deleted).map((r) => ({ r, b: parse(r.body) ?? {} }))
  const offers = live('offers').map(({ r, b }) => ({ id: r.id, day: str(b.day), block: str(b.block), at: str(b.at), cardId: str(b.cardId), situation: hashed(str(b.situationKey)), closedAt: str(b.closedAt), skippedAt: str(b.skippedAt), syncedAt: r.synced_at, updatedAt: r.updated_at }))
  const outcomes = live('outcomes').map(({ r, b }) => ({ id: r.id, offerId: str(b.offerId), lostOfferId: str(b.lostOfferId), day: str(b.day), block: str(b.block), at: str(b.at), answered: b.outcome !== null && b.outcome !== undefined, syncedAt: r.synced_at }))
  const cards = live('cards').map(({ r, b }) => ({ id: r.id, createdAt: str(b.createdAt), block: str(b.block), situation: hashed(str(b.situationKey)), syncedAt: r.synced_at }))
  const intentions = live('intentions').map(({ r, b }) => ({ id: r.id, day: str(b.day), offerId: str(b.offerId), lostOfferId: str(b.lostOfferId), syncedAt: r.synced_at }))
  const studyNights = live('studyNights').map(({ r, b }) => ({ id: r.id, day: str(b.day), offerId: str(b.offerId), lostOfferId: str(b.lostOfferId), syncedAt: r.synced_at }))
  const offerById = new Map(offers.map((o) => [o.id, o]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const broken: { from: string; id: string; to: string; toId: string | null; why: string }[] = []
  const takenBack: { from: string; id: string; lostOfferId: string | null }[] = []
  for (const o of outcomes) {
    if (o.lostOfferId) {
      takenBack.push({ from: 'outcome', id: o.id, lostOfferId: o.lostOfferId })
      continue
    }
    const off = o.offerId ? offerById.get(o.offerId) : undefined
    if (!off) broken.push({ from: 'outcome', id: o.id, to: 'offer', toId: o.offerId, why: 'missing' })
    else if (off.at && o.at && off.at > o.at) broken.push({ from: 'outcome', id: o.id, to: 'offer', toId: o.offerId, why: `answered ${o.at} (${o.day}|${o.block}), offer made ${off.at} (${off.day}|${off.block})` })
  }
  for (const o of offers) {
    if (!o.cardId) continue
    const card = cardById.get(o.cardId)
    if (!card) broken.push({ from: 'offer', id: o.id, to: 'card', toId: o.cardId, why: 'missing' })
    else if (card.situation !== o.situation || card.block !== o.block) broken.push({ from: 'offer', id: o.id, to: 'card', toId: o.cardId, why: `offer ${o.block}/${o.situation}, card ${card.block}/${card.situation}` })
  }
  for (const [kind, list] of [['intention', intentions], ['studyNight', studyNights]] as const) {
    for (const x of list) {
      if (x.lostOfferId) {
        takenBack.push({ from: kind, id: x.id, lostOfferId: x.lostOfferId })
        continue
      }
      if (!x.offerId) continue
      const off = offerById.get(x.offerId)
      if (!off) broken.push({ from: kind, id: x.id, to: 'offer', toId: x.offerId, why: 'missing' })
      else if (off.day !== x.day) broken.push({ from: kind, id: x.id, to: 'offer', toId: x.offerId, why: `${kind} ${x.day}, offer ${off.day}` })
    }
  }
  // Two outcomes naming one offer: one of them was meant for an offer whose id another took.
  const named = new Map<string, string[]>()
  for (const o of outcomes) if (o.offerId && !o.lostOfferId) named.set(o.offerId, [...(named.get(o.offerId) ?? []), o.id])
  const shared = [...named.entries()].filter(([, ids]) => ids.length > 1).map(([offerId, ids]) => ({ offerId, outcomes: ids }))
  const recent = <T extends { day?: string | null; createdAt?: string | null }>(list: T[]) => list.filter((x) => (x.day ?? x.createdAt ?? '') >= from)
  return { from, broken, takenBack, shared, offers: recent(offers), outcomes: recent(outcomes), cards: recent(cards), intentions: recent(intentions), studyNights: recent(studyNights) }
}
