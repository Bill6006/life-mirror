import { allCheckIns, db, getSettings } from '../db'
import { readMissing, type MissingReading } from './missing'

// Requirement 13 for Evidence (stage R7): "If it does, the affected estimates say so". Read from the record at the moment
// of asking, every table at once.

export async function missingNow(today: string): Promise<MissingReading> {
  const [checkins, contexts, settings] = await Promise.all([allCheckIns(), db.days.toArray(), getSettings()])
  return readMissing({ checkins, contexts, frequency: settings.frequency }, today)
}
