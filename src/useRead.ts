import { addDays } from './blocks'
import { db } from './db'
import { summarizeUse, usageFacts, type UseInput, type UseSummary } from './usageFacts'
import { USE_WINDOW_DAYS } from './useLog'
import type { Fact } from './factTypes'

// The use log read for the screens (Part 34; Follow-up F1): the four weeks Data and privacy shows,
// and the usage facts as today's sheet carries them. Apart from the log's writer, which the service
// worker shares, so the catalogue the counts are set against never reaches it.

/** Everything the two readings are counted from, read together in one go. */
export async function readUseInput(): Promise<UseInput> {
  const [rows, briefs, log, picks, offers, outcomes, intentions, aims] = await Promise.all([db.useLog.toArray(), db.brainBriefs.toArray(), db.briefLog.toArray(), db.coachPicks.toArray(), db.offers.toArray(), db.outcomes.toArray(), db.intentions.toArray(), db.aims.toArray()])
  return { rows, briefs, log, picks, offers, outcomes, intentions, aims }
}

/** The last four weeks of use, today included, as Data and privacy shows them. */
export async function useSummary(today: string, days: number = USE_WINDOW_DAYS): Promise<UseSummary> {
  return summarizeUse(await readUseInput(), addDays(today, -(days - 1)), today, today)
}

/** The usage facts today's sheet carries: what Claude may be given, once its access opens and while its switch is on. */
export async function usageFactsToday(today: string): Promise<Fact[]> {
  return usageFacts(await readUseInput(), today)
}
