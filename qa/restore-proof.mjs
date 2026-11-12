// The new-phone restore proof. A snapshot's rows (scripts/snapshot.mjs) are served by a stand-in for the
// cloud database to the built app in a fresh, throwaway browser profile; the app restores from it the way
// a new phone does. Run it on the computer that holds the snapshot, and nowhere else. It prints counts
// alone, writes nothing to the repository, and reaches no host but the local preview.
//
//   npm run build
//   node qa/restore-proof.mjs [<file.ndjson.gz>] [--out <folder>]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import readline from 'node:readline'
import { BASE, chromium, startServer, stopServer } from './common.mjs'

const APP = 'life-mirror'
const BRAIN = 'life-mirror-brain'
const TOKEN = 'restore-proof-token-never-real'
const COLUMNS = ['app', 'store', 'id', 'day', 'body', 'updated_at', 'deleted', 'device_id', 'synced_at']
const PAGE = 500
/** Stores the app itself adds to as soon as it opens: a restored count may be higher there, never lower. */
const GROWS = new Set(['settings', 'facts', 'useLog', 'forecasts', 'forecastScores', 'days', 'briefLog', 'cards', 'declarations', 'anchorSwaps', 'offers', 'intentions'])

function newestIn(folder) {
  const files = fs.readdirSync(folder).filter((f) => /^life-record-.*\.ndjson\.gz$/.test(f)).sort()
  if (!files.length) throw new Error(`no snapshot in ${folder}`)
  return path.join(folder, files[files.length - 1])
}

async function readSnapshot(file) {
  const rows = new Map()
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const r = JSON.parse(line)
    if (r.t !== 'records') continue
    rows.set(`${r.app}|${r.store}|${r.id}`, { app: r.app, store: r.store, id: String(r.id), day: r.day ?? null, body: r.body ?? null, updated_at: r.updated_at, deleted: Number(r.deleted) ? 1 : 0, device_id: r.device_id ?? '', synced_at: r.synced_at })
  }
  return rows
}

const valueOf = (v) => (v.type === 'null' ? null : v.type === 'integer' ? Number(v.value) : v.type === 'blob' ? v.base64 : v.value)
const asValue = (v) => (v === null || v === undefined ? { type: 'null' } : typeof v === 'number' ? (Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }) : { type: 'text', value: String(v) })

/** The stand-in cloud: the statements the app sends, answered from memory. Mirrors the one in e2e/storage.spec.ts. */
class Cloud {
  constructor(rows) {
    this.rows = rows
    this.events = []
    this.touches = 0
    this.known = new Set()
    this.stored = new Map()
  }
  run(stmt) {
    const sql = (stmt.sql ?? this.stored.get(stmt.sql_id ?? -1) ?? '').trim()
    const args = (stmt.args ?? []).map(valueOf)
    if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA)\b/i.test(sql)) return { cols: [], rows: [], affected: 0 }
    if (sql.startsWith('INSERT OR REPLACE INTO records')) {
      const r = Object.fromEntries(COLUMNS.map((c, i) => [c, args[i]]))
      if (r.body === null || r.body === undefined) throw Object.assign(new Error('SQLite error: NOT NULL constraint failed: records.body'), { code: 'SQLITE_CONSTRAINT' })
      this.rows.set(`${r.app}|${r.store}|${r.id}`, { ...r, deleted: Number(r.deleted) })
      this.events.push(`write:${r.store}`)
      return { cols: [], rows: [], affected: 1 }
    }
    // The pull, of every store or (the Worker's rows) of the stores it names.
    if (/^ FROM records WHERE app = \? AND synced_at > \?( AND store IN \(\?(, \?)*\))? ORDER BY synced_at ASC LIMIT \?$/.test(sql.slice(`SELECT ${COLUMNS.join(', ')}`.length)) && sql.startsWith(`SELECT ${COLUMNS.join(', ')} FROM`)) {
      const [app, after] = args
      const limit = args[args.length - 1]
      const stores = args.slice(2, -1)
      const out = [...this.rows.values()].filter((r) => r.app === app && r.synced_at > after && (!stores.length || stores.includes(r.store))).sort((a, b) => (a.synced_at < b.synced_at ? -1 : a.synced_at > b.synced_at ? 1 : 0)).slice(0, limit)
      this.events.push(`pull:${app}:${out.length}`)
      return { cols: [...COLUMNS], rows: out.map((r) => COLUMNS.map((c) => r[c])), affected: 0 }
    }
    if (sql.startsWith('SELECT store, id, synced_at FROM records WHERE app = ? AND store = ? AND id = ?')) {
      const r = this.rows.get(`${args[0]}|${args[1]}|${args[2]}`)
      return { cols: ['store', 'id', 'synced_at'], rows: r ? [[r.store, r.id, r.synced_at]] : [], affected: 0 }
    }
    if (sql.startsWith('UPDATE devices SET last_sync')) {
      this.touches++
      this.events.push('touch')
      return { cols: [], rows: [], affected: this.known.has(String(args[1])) ? 1 : 0 }
    }
    if (sql.startsWith('INSERT INTO devices')) {
      this.known.add(String(args[0]))
      return { cols: [], rows: [], affected: 1 }
    }
    throw new Error(`not a statement the app sends: ${sql.slice(0, 60)}`)
  }
  result(r) {
    return { cols: r.cols.map((name) => ({ name, decltype: null })), rows: r.rows.map((row) => row.map(asValue)), affected_row_count: r.affected, last_insert_rowid: null }
  }
  async handle(route) {
    const req = route.request()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (!req.url().endsWith('/v2/pipeline')) return route.fulfill({ status: 404, headers, body: '{}' })
    const results = []
    for (const r of req.postDataJSON().requests) {
      try {
        if (r.type === 'close') results.push({ type: 'ok', response: { type: 'close' } })
        else if (r.type === 'store_sql') { this.stored.set(r.sql_id, r.sql); results.push({ type: 'ok', response: { type: 'store_sql' } }) }
        else if (r.type === 'close_sql') { this.stored.delete(r.sql_id); results.push({ type: 'ok', response: { type: 'close_sql' } }) }
        else if (r.type === 'execute' && r.stmt) results.push({ type: 'ok', response: { type: 'execute', result: this.result(this.run(r.stmt)) } })
        else if (r.type === 'batch' && r.batch) {
          const before = new Map(this.rows)
          const steps = []
          try {
            for (const step of r.batch.steps) steps.push(this.result(this.run(step.stmt)))
          } catch (e) {
            this.rows = before
            throw e
          }
          results.push({ type: 'ok', response: { type: 'batch', result: { step_results: steps, step_errors: steps.map(() => null) } } })
        } else throw new Error(`not a request the app sends: ${r.type}`)
      } catch (e) {
        results.push({ type: 'error', error: { message: e instanceof Error ? e.message : String(e), code: e?.code ?? 'SQLITE_ERROR' } })
      }
    }
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ baton: null, base_url: null, results }) })
  }
}

/** How many records each object store of the app's database holds. */
function localCounts(page) {
  return page.evaluate(async () => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const out = {}
    for (const name of dbx.objectStoreNames) {
      out[name] = await new Promise((res, rej) => {
        const q = dbx.transaction([name], 'readonly').objectStore(name).count()
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
    }
    dbx.close()
    return out
  })
}

async function main() {
  const args = process.argv.slice(2)
  const outAt = args.indexOf('--out')
  const folder = outAt >= 0 ? args[outAt + 1] : path.join(os.homedir(), 'LifeMirrorSnapshots')
  const file = args.find((a, i) => !a.startsWith('--') && i !== outAt + 1) ?? newestIn(folder)
  const rows = await readSnapshot(file)
  const live = new Map()
  const slots = new Set()
  for (const r of rows.values()) {
    if (r.app !== APP || r.deleted) continue
    live.set(r.store, (live.get(r.store) ?? 0) + 1)
    if (r.store === 'checkins') {
      const b = JSON.parse(r.body)
      slots.add(`${b.day}|${b.block}`)
    }
  }
  console.log(`snapshot: ${path.basename(file)}; rows ${rows.size}; this app's live rows ${[...live.values()].reduce((a, b) => a + b, 0)} in ${live.size} stores`)

  const cloud = new Cloud(rows)
  const server = await startServer()
  const browser = await chromium.launch()
  const outside = new Set()
  const errors = []
  let ok = true
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'block' })
    // Nothing leaves this machine: the cloud's address is answered here, the preview is local, and any other host is refused.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (/turso\.io$/.test(url.hostname)) return cloud.handle(route)
      if (url.hostname === '127.0.0.1') return route.continue()
      outside.add(url.hostname)
      return route.abort('failed')
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
    await page.goto(BASE)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /Cloud copy/ }).click()
    await page.getByTestId('token-input').fill(TOKEN)
    await page.getByTestId('token-keep').click()
    const started = Date.now()
    while (cloud.touches === 0 && Date.now() - started < 8 * 60_000) await page.waitForTimeout(1000)
    if (cloud.touches === 0) throw new Error('the first sync did not finish within eight minutes')
    console.log(`first sync finished in ${Math.round((Date.now() - started) / 1000)} s`)
    await page.waitForTimeout(3000)

    const firstWrite = cloud.events.findIndex((e) => e.startsWith('write:'))
    const before = firstWrite < 0 ? cloud.events : cloud.events.slice(0, firstWrite)
    const pulledWhole = (app) => before.some((e) => e.startsWith(`pull:${app}:`) && Number(e.split(':')[2]) < PAGE)
    const order = pulledWhole(APP) && pulledWhole(BRAIN)
    console.log(`${order ? 'PASS' : 'FAIL'} order: the phone's rows and the Worker's rows were pulled whole before the first write (${before.filter((e) => e.startsWith('pull:')).length} pulls first; ${cloud.events.filter((e) => e.startsWith('write:')).length} writes in all)`)
    ok &&= order

    const local = await localCounts(page)
    let fewer = 0
    for (const [store, n] of [...live.entries()].sort()) {
      const got = local[store]
      if (got === undefined) { console.log(`     ${store}: snapshot ${n}; no such store on the phone`); continue }
      const twins = store === 'checkins' ? n - slots.size : 0
      const want = n - twins
      const verdict = got === want ? 'equal' : got > want ? (GROWS.has(store) ? 'more (the app adds here at open)' : 'MORE') : 'FEWER'
      if (got < want) fewer++
      console.log(`     ${store}: snapshot ${n}${twins ? ` (${twins} held twice, made one)` : ''}; restored ${got}; ${verdict}`)
    }
    const checkins = local.checkins === slots.size
    console.log(`${checkins ? 'PASS' : 'FAIL'} check-ins: restored ${local.checkins}, snapshot ${live.get('checkins') ?? 0} live in ${slots.size} slots`)
    console.log(`${fewer === 0 ? 'PASS' : 'FAIL'} no store came back with fewer records than the snapshot holds (${fewer} short)`)
    console.log(`     waiting to upload after the sync: ${local.outbox ?? 0}; page errors: ${errors.length}${errors.length ? ` (${[...new Set(errors)].slice(0, 3).join(' / ')})` : ''}; other hosts refused: ${outside.size ? [...outside].join(', ') : 'none'}`)
    ok &&= checkins && fewer === 0 && errors.length === 0
    await context.close()
  } finally {
    await browser.close()
    stopServer(server)
  }
  console.log(ok ? 'RESULT PASS' : 'RESULT FAIL')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('restore proof failed: ' + (e instanceof Error ? e.message : String(e)))
  process.exit(1)
})
