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
  /** The bridge key (Part 29), set by the builder from a local file without printing it; Anthropic's agent proxy sends it with the run's requests. */
  CLAUDE_BRIDGE_KEY?: string
  /** The routine's own fire token, pasted by you into the Cloudflare form. */
  CLAUDE_FIRE_TOKEN?: string
  /** The routine's fire URL: not a secret. */
  CLAUDE_FIRE_URL?: string
  /** "on": Claude writes the line and the review through the routine (Part 30); anything else, the free model chain, as before. */
  CLAUDE_WRITER?: string
  /** Minutes without a valid line from Claude before the free chain writes (the plan's twenty). */
  CLAUDE_TIMEOUT_MINUTES?: string
  /** "on": the coach runs once a day while its reliability gate is met (Part 32); anything else, never. */
  COACH_WRITER?: string
  /** The catalogue as the app ships it, for naming reps and knowing faith's in the retrieval layer. */
  CATALOGUE_URL: string
  TIMEZONE: string
  /** The check-in pings' local times, HH:MM, comma-separated. */
  PING_TIMES?: string
  BRIEF_HOUR: string
  /** Local HH:MM after which, with no morning check-in on a sheet, the day's line is written from the newest sheet (Part 28). */
  FALLBACK_TIME?: string
  LIBRARY_URL: string
  MODELS: string
}
