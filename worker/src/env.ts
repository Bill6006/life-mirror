/** What the Worker is given: the AI binding, the vars in wrangler.toml, and the secrets you pasted. */
export interface Env {
  AI: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> }
  TURSO_URL: string
  /** A token scoped to the database, pasted with `wrangler secret put TURSO_TOKEN`. */
  TURSO_TOKEN?: string
  /** The phone's push address as Settings shows it, pasted with `wrangler secret put PUSH_SUBSCRIPTION`. */
  PUSH_SUBSCRIPTION?: string
  /** The private half of the push key, pasted with `wrangler secret put VAPID_PRIVATE_KEY`. */
  VAPID_PRIVATE_KEY?: string
  VAPID_PUBLIC_KEY: string
  VAPID_SUBJECT: string
  /** Optional: lets you run a job by hand at /run/brief?key=… ; without it those routes are off. */
  RUN_KEY?: string
  TIMEZONE: string
  /** The check-in pings' local times, HH:MM, comma-separated. */
  PING_TIMES?: string
  BRIEF_HOUR: string
  /** Local HH:MM after which, with no morning check-in on a sheet, the day's line is written from the newest sheet (Part 28). */
  FALLBACK_TIME?: string
  LIBRARY_URL: string
  MODELS: string
}
