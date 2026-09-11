// The cloud copy's store: the fixed schema in your Turso database, behind one small interface
// so the sync worker can be tested against a fake. The app never creates or alters tables,
// writes only rows where app is this app, and may read the others.

/** The database, a constant shown in Settings. Not a secret: the token is. */
export const CLOUD_URL = 'libsql://life-record-bill6006.aws-us-east-1.turso.io'
/** The same database over HTTPS, which is how the browser client reaches it. */
export const CLOUD_HTTP_URL = 'https://life-record-bill6006.aws-us-east-1.turso.io'

/** One row of `records`: primary key app + store + id. */
export interface CloudRow {
  app: string
  store: string
  id: string
  day: string | null
  body: string | null
  updated_at: string
  deleted: 0 | 1
  device_id: string
  synced_at: string
}

export interface DeviceTouch {
  device_id: string
  app: string
  label: string
  at: string
}

export interface CloudStore {
  /** Writes rows, replacing by primary key: the phone is the source of truth. */
  upsert(rows: readonly CloudRow[]): Promise<void>
  /** Rows of one app synced after the watermark, oldest first, at most `limit`. */
  pull(app: string, after: string, limit: number): Promise<CloudRow[]>
  /** Registers this phone in `devices` on first sight and stamps its last sync after. */
  touchDevice(d: DeviceTouch): Promise<void>
  /** Deletes every row of one app, and this phone's device row. Never another app's rows. */
  deleteApp(app: string, deviceId: string): Promise<void>
}

export type StoreFactory = (token: string) => Promise<CloudStore>

const COLUMNS = 'app, store, id, day, body, updated_at, deleted, device_id, synced_at'

/** The real store, over the libsql web client, created only once a token exists. The client is loaded on demand. */
export async function libsqlStore(token: string): Promise<CloudStore> {
  const { createClient } = await import('@libsql/client/web')
  const client = createClient({ url: CLOUD_HTTP_URL, authToken: token, intMode: 'number' })
  return {
    async upsert(rows) {
      if (!rows.length) return
      await client.batch(
        rows.map((r) => ({
          sql: `INSERT OR REPLACE INTO records (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [r.app, r.store, r.id, r.day, r.body, r.updated_at, r.deleted, r.device_id, r.synced_at],
        })),
        'write',
      )
    },
    async pull(app, after, limit) {
      const res = await client.execute({ sql: `SELECT ${COLUMNS} FROM records WHERE app = ? AND synced_at > ? ORDER BY synced_at ASC LIMIT ?`, args: [app, after, limit] })
      return res.rows.map((row) => ({
        app: String(row.app),
        store: String(row.store),
        id: String(row.id),
        day: row.day === null || row.day === undefined ? null : String(row.day),
        body: row.body === null || row.body === undefined ? null : String(row.body),
        updated_at: String(row.updated_at),
        deleted: Number(row.deleted) === 1 ? 1 : 0,
        device_id: String(row.device_id ?? ''),
        synced_at: String(row.synced_at),
      }))
    },
    async touchDevice(d) {
      const updated = await client.execute({ sql: 'UPDATE devices SET last_sync = ? WHERE device_id = ? AND app = ?', args: [d.at, d.device_id, d.app] })
      if (updated.rowsAffected === 0) {
        await client.execute({ sql: 'INSERT INTO devices (device_id, app, label, first_seen, last_sync) VALUES (?, ?, ?, ?, ?)', args: [d.device_id, d.app, d.label, d.at, d.at] })
      }
    },
    async deleteApp(app, deviceId) {
      await client.batch(
        [
          { sql: 'DELETE FROM records WHERE app = ?', args: [app] },
          { sql: 'DELETE FROM devices WHERE app = ? AND device_id = ?', args: [app, deviceId] },
        ],
        'write',
      )
    },
  }
}

export interface MemoryStore extends CloudStore {
  rows: Map<string, CloudRow>
  devices: Map<string, DeviceTouch & { first_seen: string }>
  calls: number
  /** When set, every call throws it, as a network that is down would. */
  failWith: Error | null
}

/** A fake store for the tests: the same contract, in memory. */
export function memoryStore(): MemoryStore {
  const keyOf = (r: Pick<CloudRow, 'app' | 'store' | 'id'>) => `${r.app}|${r.store}|${r.id}`
  const store: MemoryStore = {
    rows: new Map(),
    devices: new Map(),
    calls: 0,
    failWith: null,
    async upsert(rows) {
      store.calls++
      if (store.failWith) throw store.failWith
      for (const r of rows) store.rows.set(keyOf(r), { ...r })
    },
    async pull(app, after, limit) {
      store.calls++
      if (store.failWith) throw store.failWith
      return [...store.rows.values()]
        .filter((r) => r.app === app && r.synced_at > after)
        .sort((a, b) => (a.synced_at < b.synced_at ? -1 : a.synced_at > b.synced_at ? 1 : 0))
        .slice(0, limit)
        .map((r) => ({ ...r }))
    },
    async touchDevice(d) {
      store.calls++
      if (store.failWith) throw store.failWith
      const existing = store.devices.get(d.device_id)
      store.devices.set(d.device_id, { ...d, first_seen: existing?.first_seen ?? d.at })
    },
    async deleteApp(app, deviceId) {
      store.calls++
      if (store.failWith) throw store.failWith
      for (const [k, r] of store.rows) if (r.app === app) store.rows.delete(k)
      const dev = store.devices.get(deviceId)
      if (dev && dev.app === app) store.devices.delete(deviceId)
    },
  }
  return store
}
