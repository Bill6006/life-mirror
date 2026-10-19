// A day's record and the choices made in it by hand (the owner's fix of 2026-10-19): a choice made by hand survives tab
// changes, reloads, sync, recalibration and the app reopening. A day only made from the week's shape can be made again at
// any time; a day changed by hand holds what only the owner can say. One rule for the database, the sync and the second
// copy of the queue, so none of them lets the first replace the second. Nothing here reads the database.

/** Whether a day's record holds a choice made by hand: a chip, a change to the day, or a learning week's answer. */
export function dayByHand(d: { changed?: unknown; updatedAt?: unknown; weekAnswer?: unknown } | null | undefined): boolean {
  if (!d) return false
  return d.changed === true || (typeof d.updatedAt === 'string' && d.updatedAt !== '') || d.weekAnswer !== undefined
}

/** The same, for a record as the queue and the cloud carry it: JSON, or null for a deletion. */
export function bodyByHand(body: string | null | undefined): boolean {
  if (!body) return false
  try {
    return dayByHand(JSON.parse(body) as Record<string, unknown>)
  } catch {
    return false
  }
}
