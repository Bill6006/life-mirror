import { useEffect, useState } from 'preact/hooks'
import { onRepairTrip, repairTripped } from './breaker'

// The learning repair is the only engine (the owner's requirement of 2026-10-20: the old engine retired, with no
// fallback). If it fails on this phone, nothing draws or shows in its place: no move is offered, and each screen that reads
// it says so, until the next start of the app reads the record again.

/** Whether the engine failed on this phone since the app started. */
export function engineFailed(): boolean {
  return repairTripped()
}

/** The same, for a screen: it redraws the moment the engine fails. */
export function useEngineFailed(): boolean {
  const [failed, setFailed] = useState(() => engineFailed())
  useEffect(() => onRepairTrip(() => setFailed(engineFailed())), [])
  return failed
}
