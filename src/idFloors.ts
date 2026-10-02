import type Dexie from 'dexie'
import { markSilent, SYNCED_STORES } from './cloudOutbox'
import { raiseFloors, readFloors } from './tokenVault'

// Sync safety (2026-10-02). A synced row's id is its identity in the cloud copy. A database the phone's
// browser clears starts counting ids from the beginning again: ids the cloud already holds for other
// records. A push then writes the new records over them, and the earlier records are lost. So the
// highest id each synced store is known to have used is kept
// outside the database (tokenVault's floors), and each time the database opens, a counter below its
// floor is raised past it before anything else is written.

/** The synced stores whose ids the database counts out itself, read from the schema rather than copied. */
export function countedStores(db: Dexie): string[] {
  return SYNCED_STORES.filter((s) => db.tables.some((t) => t.name === s && t.schema.primKey.auto))
}

/** The highest numeric id of each store among some rows. */
export function maxIds(rows: readonly { store: string; id?: unknown; key?: unknown }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const n = Number(r.id ?? r.key)
    if (Number.isInteger(n) && n > 0) out[r.store] = Math.max(out[r.store] ?? 0, n)
  }
  return out
}

/** Raises each counted store's counter past its floor, quietly: nothing is queued for the cloud. Returns the stores raised. */
export async function raiseCounters(db: Dexie, floors: Readonly<Record<string, number>> = readFloors()): Promise<string[]> {
  const stores = countedStores(db).filter((s) => (floors[s] ?? 0) > 0)
  if (!stores.length) return []
  const raised: string[] = []
  await db.transaction('rw', stores, async () => {
    markSilent()
    for (const s of stores) {
      const table = db.table(s)
      const last = await table.orderBy(':id').lastKey()
      const floor = floors[s]
      if (typeof last === 'number' && last >= floor) continue
      // A placeholder at the floor's next id moves the counter past it; removed at once, it leaves nothing behind.
      await table.add({ id: floor + 1, placeholder: true })
      await table.delete(floor + 1)
      raised.push(s)
    }
  })
  return raised
}

/** Keeps the floors at least as high as what this phone holds now: run on start, so a phone from before the floors has them. */
export async function captureFloors(db: Dexie): Promise<void> {
  const found: Record<string, number> = {}
  for (const s of countedStores(db)) {
    const last = await db.table(s).orderBy(':id').lastKey()
    if (typeof last === 'number' && last > 0) found[s] = last
  }
  raiseFloors(found)
}

/** On every open of the database (sticky), before any other read or write is let through. A failure here (a full disk) never keeps the database from opening. */
export function installIdFloors(db: Dexie): void {
  db.on('ready', () => raiseCounters(db).then(() => undefined, () => undefined), true)
}
