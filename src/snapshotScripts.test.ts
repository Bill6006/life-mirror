import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'

// The weekly copy of the cloud database and its way back (2026-11-12), on a stand-in: a local SQLite file with the
// cloud tables' own definitions plays the cloud database, and a small client answers the scripts from it. Nothing
// here reaches a network, a real token or a real record. The scripts are run as the weekly task runs them, with
// Node's own SQLite for the restore.

type Row = Record<string, unknown>
interface Statement {
  all(...args: unknown[]): Row[]
  run(...args: unknown[]): unknown
}
interface Db {
  exec(sql: string): void
  prepare(sql: string): Statement
  close(): void
}
interface Client {
  execute(q: { sql: string; args: unknown[] }): Promise<{ columns: string[]; rows: Row[] }>
}
interface Taken {
  ok: boolean
  file: string | null
  rows: Record<string, number> | null
  bytes: number | null
  error: string | null
}
interface Manifest {
  rows: Record<string, number>
  rowsPerAppStore: Record<string, number>
  deletedPerApp: Record<string, number>
  tableCountsBefore: Record<string, number>
  tableCountsAfter: Record<string, number>
  schema: { type: string; name: string; sql: string | null }[]
  file: string
  bytes: number
  sha256: string
  version: string
}
interface Target {
  close(): void
}
interface SnapshotModule {
  takeSnapshot(o: { client: Client; outDir: string; now?: Date; address?: string; secrets?: string[]; log?: (m: string) => void }): Promise<Taken>
  readToken(env: Record<string, string | undefined>, devVarsPath: string): string | null
  readAddress(): string
  findGitRoot(dir: string): string | null
}
interface CheckModule {
  checkSnapshot(file: string, log?: (m: string) => void): Promise<boolean | null>
}
interface RestoreModule {
  restoreSnapshot(o: { file: string; manifest: Manifest; target: Target; log?: (m: string) => void }): Promise<{ ok: boolean; rows: Record<string, number>; differences: string[] }>
  localTarget(path: string): Promise<Target>
  isLiveAddress(address: string, live: string): boolean
}

const load = async <T>(name: string): Promise<T> => (await import(/* @vite-ignore */ pathToFileURL(resolve('scripts', name)).href)) as T
const sqlite = 'node:sqlite'

let DatabaseSync: new (path: string) => Db
let snapshot: SnapshotModule
let check: CheckModule
let restore: RestoreModule

beforeAll(async () => {
  ;({ DatabaseSync } = (await import(/* @vite-ignore */ sqlite)) as { DatabaseSync: new (path: string) => Db })
  snapshot = await load<SnapshotModule>('snapshot.mjs')
  check = await load<CheckModule>('snapshot-check.mjs')
  restore = await load<RestoreModule>('snapshot-restore.mjs')
})

/** The cloud database's own definitions: three tables and two indexes. */
const DEFINITIONS = [
  'CREATE TABLE devices (device_id TEXT PRIMARY KEY, app TEXT NOT NULL, label TEXT, first_seen TEXT NOT NULL, last_sync TEXT NOT NULL)',
  'CREATE TABLE records (app TEXT NOT NULL, store TEXT NOT NULL, id TEXT NOT NULL, day TEXT, body TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, device_id TEXT NOT NULL, synced_at TEXT NOT NULL, PRIMARY KEY (app, store, id))',
  'CREATE INDEX records_by_day ON records(app, store, day)',
  'CREATE INDEX records_by_updated ON records(app, updated_at)',
  'CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
]
const APPS = ['life-mirror', 'life-mirror-brain', 'another-app']
const STORES = ['checkins', 'days', 'lines']
const two = (n: number) => String(n).padStart(2, '0')

const folder = (name: string) => mkdtempSync(join(tmpdir(), `lm-${name}-`))

/** A stand-in cloud database holding `records` made-up rows: three apps, three stores, text ids, tombstones, a day left empty, and one very long body. */
function standIn(records: number): Db {
  const db = new DatabaseSync(join(folder('standin'), 'cloud.db'))
  for (const sql of DEFINITIONS) db.exec(sql)
  db.exec('BEGIN')
  const put = db.prepare('INSERT INTO records (app, store, id, day, body, updated_at, deleted, device_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (let i = 0; i < records; i++) {
    const deleted = i % 17 === 5
    const body = deleted ? '{}' : i === 7 ? JSON.stringify({ n: i, long: 'x'.repeat(200_000) }) : JSON.stringify({ n: i, words: `stand-in ${i}`, quoted: 'a "quoted" line\nand a second' })
    put.run(APPS[i % 3], STORES[Math.floor(i / 3) % 3], String(i + 1), i % 5 === 0 ? null : `2026-01-${two((i % 28) + 1)}`, body, `2026-01-01T00:00:${two(i % 60)}.000Z`, deleted ? 1 : 0, `device-${i % 3}`, `2026-01-02T00:${two(Math.floor(i / 60))}:${two(i % 60)}.000Z`)
  }
  const device = db.prepare('INSERT INTO devices (device_id, app, label, first_seen, last_sync) VALUES (?, ?, ?, ?, ?)')
  for (let i = 0; i < 3; i++) device.run(`device-${i}`, APPS[i], i === 1 ? null : `stand-in ${i}`, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')
  db.prepare('INSERT INTO schema_meta (key, value) VALUES (?, ?)').run('version', '1')
  db.exec('COMMIT')
  return db
}

/** The client the scripts are handed, answering from the stand-in. `tamper` may change or refuse an answer. */
function clientOf(db: Db, tamper?: (sql: string, rows: Row[]) => Row[]): Client {
  return {
    async execute({ sql, args }) {
      const rows = db.prepare(sql).all(...args).map((r) => ({ ...r }))
      const out = tamper ? tamper(sql, rows) : rows
      return { columns: out.length ? Object.keys(out[0]) : [], rows: out }
    },
  }
}

const readsRecords = (sql: string) => sql.startsWith('SELECT * FROM records')
const linesOf = (file: string) => gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row & { t: string })
const manifestOf = (file: string) => JSON.parse(readFileSync(`${file}.manifest.json`, 'utf8')) as Manifest
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n))
const count = (db: Db, table: string) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all()[0].n)

/** One good snapshot of a stand-in, with where it is. */
async function taken(records: number, n: number): Promise<{ db: Db; outDir: string; file: string; result: Taken }> {
  const db = standIn(records)
  const outDir = folder('snapshots')
  const result = await snapshot.takeSnapshot({ client: clientOf(db), outDir, now: stamp(n) })
  return { db, outDir, file: join(outDir, result.file ?? 'none'), result }
}

describe('the snapshot of the cloud database, on a stand-in', () => {
  it('copies every table row for row, and its manifest holds the counts the database itself gives', async () => {
    const { db, outDir, file, result } = await taken(173, 1)
    expect(result.error).toBeNull()
    expect(result.ok).toBe(true)
    expect(result.rows).toEqual({ devices: 3, records: 173, schema_meta: 1 })

    const manifest = manifestOf(file)
    expect(manifest.rows).toEqual({ devices: count(db, 'devices'), records: count(db, 'records'), schema_meta: count(db, 'schema_meta') })
    expect(manifest.tableCountsBefore).toEqual({ devices: 3, records: 173, schema_meta: 1 })
    expect(manifest.tableCountsAfter).toEqual(manifest.tableCountsBefore)
    expect(manifest.schema.map((s) => s.sql)).toEqual([...DEFINITIONS].sort((a, b) => (a.split(' ')[2] < b.split(' ')[2] ? -1 : 1)))
    const groups = Object.fromEntries(db.prepare('SELECT app, store, COUNT(*) AS n FROM records GROUP BY app, store').all().map((r) => [`${r.app}/${r.store}`, Number(r.n)]))
    expect(manifest.rowsPerAppStore).toEqual(groups)
    expect(manifest.deletedPerApp).toEqual(Object.fromEntries(db.prepare('SELECT app, COUNT(*) AS n FROM records WHERE deleted GROUP BY app').all().map((r) => [r.app, Number(r.n)])))

    // The file itself: every row of every table, the long body and the empty day included.
    const lines = linesOf(file)
    const rowsOf = (t: string) => lines.filter((l) => l.t === t).map(({ t: _t, ...row }) => row)
    expect(rowsOf('records')).toEqual(db.prepare('SELECT * FROM records ORDER BY app, store, id').all().map((r) => ({ ...r })))
    expect(rowsOf('devices')).toEqual(db.prepare('SELECT * FROM devices').all().map((r) => ({ ...r })))
    expect(rowsOf('schema_meta')).toEqual([{ key: 'version', value: '1' }])
    expect(lines).toHaveLength(177)

    // Nothing half-written is left beside it, and the last run's note says it went through.
    expect(readdirSync(outDir).sort()).toEqual([result.file, `${result.file}.manifest.json`, 'last-snapshot.json'].sort())
    expect(JSON.parse(readFileSync(join(outDir, 'last-snapshot.json'), 'utf8'))).toMatchObject({ ok: true, file: result.file, rows: { records: 173 } })
    db.close()
  })

  it('reads the records fifty to a request, to the very end', async () => {
    const asked = async (records: number) => {
      const db = standIn(records)
      let reads = 0
      const result = await snapshot.takeSnapshot({ client: clientOf(db, (sql, rows) => (readsRecords(sql) && reads++, rows)), outDir: folder('snapshots'), now: stamp(2) })
      db.close()
      return { reads, rows: result.rows?.records }
    }
    // Three full requests of fifty need a fourth to learn there is no more; one row fewer does not.
    expect(await asked(150)).toEqual({ reads: 4, rows: 150 })
    expect(await asked(149)).toEqual({ reads: 3, rows: 149 })
  })

  it('leaves no file that looks finished when a read fails part way', async () => {
    const db = standIn(173)
    const outDir = folder('snapshots')
    let reads = 0
    const result = await snapshot.takeSnapshot({
      client: clientOf(db, (sql, rows) => {
        if (readsRecords(sql) && ++reads === 3) throw new Error('the connection dropped')
        return rows
      }),
      outDir,
      now: stamp(3),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('the connection dropped')
    expect(readdirSync(outDir)).toEqual(['last-snapshot.json'])
    expect(JSON.parse(readFileSync(join(outDir, 'last-snapshot.json'), 'utf8'))).toMatchObject({ ok: false, file: null })
    db.close()
  })

  it('refuses a read that came back short of the count the database gives', async () => {
    const db = standIn(173)
    const outDir = folder('snapshots')
    let reads = 0
    // The second request loses its last row, so the read ends early with 99 of 173.
    const result = await snapshot.takeSnapshot({ client: clientOf(db, (sql, rows) => (readsRecords(sql) && ++reads === 2 ? rows.slice(0, -1) : rows)), outDir, now: stamp(4) })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('rows read differ from the count the database gives: records: read 99, the database counts 173')
    expect(readdirSync(outDir).filter((f) => /\.ndjson\.gz$/.test(f) || /\.manifest\.json$/.test(f))).toEqual([])
    db.close()
  })

  it('keeps the token out of every message it writes', async () => {
    const secret = 'stand-in-secret-0123456789'
    const outDir = folder('snapshots')
    const failing: Client = {
      async execute() {
        throw new Error(`HTTP 401 for Authorization: Bearer ${secret} (token ${secret})`)
      },
    }
    const logged: string[] = []
    const result = await snapshot.takeSnapshot({ client: failing, outDir, now: stamp(5), secrets: [secret], log: (m) => logged.push(m) })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('HTTP 401')
    const written = [result.error, ...logged, readFileSync(join(outDir, 'last-snapshot.json'), 'utf8')].join('\n')
    expect(written).not.toContain(secret)
  })

  it('reads its token from the environment first, then from the one line of the file', () => {
    const file = join(folder('vars'), 'vars')
    writeFileSync(file, 'OTHER_KEY=not-this-one\nLM_SNAPSHOT_TOKEN="from-the-file"\nLM_SNAPSHOT_TOKEN_OLD=nor-this\n')
    expect(snapshot.readToken({ LM_SNAPSHOT_TOKEN: ' from-the-environment ' }, file)).toBe('from-the-environment')
    expect(snapshot.readToken({}, file)).toBe('from-the-file')
    expect(snapshot.readToken({ LM_SNAPSHOT_TOKEN: '  ' }, join(folder('vars'), 'missing'))).toBeNull()
  })
})

describe('the check of a snapshot', () => {
  it('passes a good one by restoring it, and fails one cut short or miscounted', async () => {
    const { db, file } = await taken(173, 6)
    db.close()
    const said: string[] = []
    expect(await check.checkSnapshot(file, (m) => said.push(m))).toBe(true)
    expect(said).toContain('PASS restored records: 173 rows')
    expect(said).toContain('PASS restored schema_meta: 1 rows')
    expect(said).toContain('PASS records content hash: snapshot equals restored')

    // Cut short: the first half of the file under the same manifest.
    const cut = join(folder('cut'), 'life-record-cut.ndjson.gz')
    const bytes = readFileSync(file)
    writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length / 2)))
    writeFileSync(`${cut}.manifest.json`, readFileSync(`${file}.manifest.json`))
    const cutSaid: string[] = []
    expect(await check.checkSnapshot(cut, (m) => cutSaid.push(m))).toBe(false)
    expect(cutSaid.some((m) => m.startsWith('FAIL '))).toBe(true)

    // Miscounted: the whole file under a manifest that claims one row more.
    const off = join(folder('off'), 'life-record-off.ndjson.gz')
    writeFileSync(off, bytes)
    const manifest = manifestOf(file)
    writeFileSync(`${off}.manifest.json`, JSON.stringify({ ...manifest, rows: { ...manifest.rows, records: 174 } }))
    const offSaid: string[] = []
    expect(await check.checkSnapshot(off, (m) => offSaid.push(m))).toBe(false)
    expect(offSaid).toContain('FAIL manifest vs file: rows in table records: manifest 174, file 173')
  })
})

describe('the restore of a snapshot', () => {
  it('fills an empty database with every row, and refuses one that already holds rows', async () => {
    const { db, file } = await taken(173, 7)
    const manifest = manifestOf(file)
    const path = join(folder('restore'), 'restored.db')

    const first = await restore.localTarget(path)
    const done = await restore.restoreSnapshot({ file, manifest, target: first })
    first.close()
    expect(done).toEqual({ ok: true, rows: { records: 173, devices: 3, schema_meta: 1 }, differences: [] })

    const everything = (d: Db) => ['records ORDER BY app, store, id', 'devices ORDER BY device_id', 'schema_meta ORDER BY key'].map((from) => d.prepare(`SELECT * FROM ${from}`).all().map((r) => ({ ...r })))
    const restored = new DatabaseSync(path)
    expect(everything(restored)).toEqual(everything(db))
    restored.close()
    db.close()

    // A second restore into the same database is refused, and changes nothing.
    const second = await restore.localTarget(path)
    await expect(restore.restoreSnapshot({ file, manifest, target: second })).rejects.toThrow('the target already holds data')
    second.close()
    const after = new DatabaseSync(path)
    expect(count(after, 'records')).toBe(173)
    after.close()
  })

  it('writes nothing from a snapshot that fails its own manifest', async () => {
    const { db, file } = await taken(60, 8)
    db.close()
    const manifest = manifestOf(file)
    const path = join(folder('restore'), 'never.db')
    const target = await restore.localTarget(path)
    await expect(restore.restoreSnapshot({ file, manifest: { ...manifest, rows: { ...manifest.rows, records: 61 } }, target })).rejects.toThrow('the snapshot fails its manifest check')
    target.close()
    expect(existsSync(path)).toBe(false)
  })

  it('knows the live database under either spelling of its address', () => {
    expect(restore.isLiveAddress('https://db.example.io', 'libsql://db.example.io')).toBe(true)
    expect(restore.isLiveAddress('libsql://DB.example.io:443', 'libsql://db.example.io')).toBe(true)
    expect(restore.isLiveAddress('libsql://other.example.io', 'libsql://db.example.io')).toBe(false)
  })
})

describe('the scripts run from the command line', () => {
  // Each run is given no token and a token file that does not exist, so no run here can reach the cloud whatever a
  // change does to the refusals below.
  function run(script: string, args: string[]) {
    const r = spawnSync(process.execPath, [`scripts/${script}`, ...args], { env: { ...process.env, LM_SNAPSHOT_TOKEN: '', LM_RESTORE_TOKEN: '', LM_DEV_VARS: join(folder('vars'), 'missing') }, encoding: 'utf8' })
    return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  }

  it('refuses to write a snapshot inside a repository', () => {
    const inside = join(process.cwd(), 'qa', 'out', 'never-written')
    rmSync(inside, { recursive: true, force: true })
    expect(snapshot.findGitRoot(inside)).toBe(process.cwd())
    const r = run('snapshot.mjs', ['--out', inside])
    expect(r.out).toContain('Refusing: the output folder is inside a git repository')
    expect(r.code).toBe(2)
    expect(existsSync(inside)).toBe(false)
  })

  it('refuses to restore over the live database, under either spelling', () => {
    const live = new URL(snapshot.readAddress()).host
    for (const address of [`libsql://${live}`, `https://${live}`]) {
      const r = run('snapshot-restore.mjs', ['--to', address, '--out', folder('empty')])
      expect(r.out).toContain('Refusing: the target is the live database named in worker/wrangler.toml.')
      expect(r.code).toBe(2)
    }
  })
})
