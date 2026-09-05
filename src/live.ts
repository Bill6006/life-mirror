import { liveQuery } from 'dexie'
import { useEffect, useState } from 'preact/hooks'

/** Re-runs a Dexie query whenever the tables it touched change. Undefined while loading. */
export function useLive<T>(querier: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v as T),
      error: (e) => console.error(e),
    })
    return () => sub.unsubscribe()
  }, deps)
  return value
}
