import type { DayContext } from './db'

// What a day holds once its exceptions are applied. The day record keeps the week's shape and the
// chips beside it, so a chip taken back restores the day; every reader of the pickup or her
// bedtime reads through these, never the record's raw fields.

/** The pickup a day holds: none while she is away (the chip), whatever the week's shape wrote, so no drop-off or pickup is assumed that day. */
export function heldPickup(ctx: Pick<DayContext, 'withHer' | 'pickupTime'> | null | undefined): string | null {
  return ctx && ctx.withHer ? ctx.pickupTime : null
}

/** Her bedtime, which a day holds only while she is with you. */
export function heldBedtime(ctx: Pick<DayContext, 'withHer' | 'soloUntil'> | null | undefined): string | null {
  return ctx && ctx.withHer ? ctx.soloUntil : null
}
