// What a push from the Worker says (2026-10-02). Every push but one is content-free: a kind, and the
// phone decides from its own record what, if anything, to show. The one exception is the clean window's
// qualification report, whose words the Worker wrote from the ten-day check's own counts, days and
// reasons, never from the record: it carries them, and the phone shows them as sent.

export interface PushPayload {
  kind: string
  /** The report's words; null for every other push, or a report that came without them. */
  body: string | null
}

const BODY_LIMIT = 400

export function readPush(data: unknown): PushPayload {
  const d = data && typeof data === 'object' ? (data as { kind?: unknown; body?: unknown }) : {}
  const kind = typeof d.kind === 'string' ? d.kind : 'ping'
  const body = kind === 'report' && typeof d.body === 'string' && d.body.trim() ? d.body.trim().slice(0, BODY_LIMIT) : null
  // A report with nothing to say is a ping: the phone shows its quiet notice and takes it down.
  return kind === 'report' && body === null ? { kind: 'ping', body: null } : { kind, body }
}
