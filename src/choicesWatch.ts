import type Dexie from 'dexie'
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, DBCoreTransaction } from 'dexie'
import { tokenStorage } from './tokenVault'

// The tables that hold this phone's own choices (2026-10-19): Location Context's and the weather's switches in the
// settings, the places named and the key their fingerprints use. A write to any of them is heard once its transaction
// has committed, so phoneChoices.ts can keep its second copy in step. Nothing here reads the database: db.ts installs
// it, and phoneChoices.ts says who hears.

export const CHOICE_TABLES: readonly string[] = ['settings', 'places', 'placeMeta']

/** The second copy's key in local storage. */
export const CHOICES_KEY = 'lm.choices'

let listener: (() => void) | null = null
const heardIn = new WeakSet<object>()

/** Who hears that a choice may have changed. */
export function onChoicesChanged(l: (() => void) | null): void {
  listener = l
}

function heard(trans: DBCoreTransaction): void {
  const target = trans as unknown as { addEventListener?: (type: string, cb: () => void) => void }
  if (typeof target.addEventListener !== 'function') return void listener?.()
  if (heardIn.has(trans)) return
  heardIn.add(trans)
  target.addEventListener('complete', () => listener?.())
}

function watched(table: DBCoreTable): DBCoreTable {
  return {
    ...table,
    async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
      const res = await table.mutate(req)
      heard(req.trans)
      return res
    },
  }
}

export function installChoicesWatch(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'choicesWatch',
    level: 6,
    create: (down: DBCore): DBCore => ({
      ...down,
      table: (name: string) => (CHOICE_TABLES.includes(name) ? watched(down.table(name)) : down.table(name)),
    }),
  })
}

/** The wipe takes the second copy too: what you deleted is never put back. */
export function clearChoicesCopy(): void {
  try {
    tokenStorage()?.removeItem(CHOICES_KEY)
  } catch {
    // Nothing kept, nothing to clear.
  }
}
