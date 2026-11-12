// Restores a snapshot made by snapshot.mjs into an EMPTY database.
// Usage: node scripts/snapshot-restore.mjs --to <address> [<file.ndjson.gz>] [--out <folder>]
//   --to file:<path>        a local SQLite file (node:sqlite); the file must not exist or be empty
//   --to https://... | libsql://...   a remote libSQL database; the token comes from the
//                           environment variable LM_RESTORE_TOKEN only, and is never printed
// With no file, the newest life-record-*.ndjson.gz in the folder is used.
// Refuses (exit 2) when: the target is the live database named in worker/wrangler.toml,
// the target already holds data, or the snapshot fails its own manifest check.
// Exit 0 only when every restored count matches the manifest; otherwise 1.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { scanSnapshot, compareToManifest, defaultOutDir, readAddress } from './snapshot.mjs';

const BATCH = 50;
const USAGE = 'Usage: node scripts/snapshot-restore.mjs --to <address> [<file.ndjson.gz>] [--out <folder>]';
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

export class Refusal extends Error {
  constructor(message) { super(message); this.name = 'Refusal'; this.code = 2; }
}

function sanitize(err, secrets = []) {
  let msg = String(err && err.message ? err.message : err);
  for (const s of secrets) if (s) msg = msg.split(s).join('[redacted]');
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
  return msg.replace(/\s+/g, ' ').slice(0, 300);
}

function toObjects(res) {
  return res.rows.map((r) => {
    const o = {};
    for (const c of res.columns) o[c] = r[c];
    return o;
  });
}

function newestIn(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^life-record-.*\.ndjson\.gz$/.test(f)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

async function* readLines(file) {
  const raw = fs.createReadStream(file);
  const gunzip = zlib.createGunzip();
  raw.on('error', (e) => gunzip.destroy(e));
  const rl = readline.createInterface({ input: raw.pipe(gunzip), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield JSON.parse(line);
}

// "libsql://host" and "https://host" name the same database: compare host and port (443 by default).
export function hostKey(address) {
  const u = new URL(address);
  return `${u.hostname.toLowerCase()}:${u.port || '443'}`;
}

export function isLiveAddress(address, liveAddress) {
  try { return hostKey(address) === hostKey(liveAddress); } catch { return false; }
}

// Refusal 3: size, SHA-256 and counts must match the manifest before anything is written.
export async function verifyManifest(file, manifest) {
  let scan;
  try { scan = await scanSnapshot(file); }
  catch (e) { throw new Refusal('the snapshot file is unreadable or cut off: ' + sanitize(e).slice(0, 120)); }
  const diffs = compareToManifest(manifest, scan);
  if (diffs.length) throw new Refusal('the snapshot fails its manifest check: ' + diffs.slice(0, 5).join('; '));
  return scan;
}

function diffCounts(label, expected, actual, out) {
  for (const k of new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})])) {
    const a = (expected || {})[k] || 0, b = (actual || {})[k] || 0;
    if (a !== b) out.push(`${label} ${k}: manifest ${a}, target ${b}`);
  }
}

// Core. target = { isEmpty(), createSchema(schemaRows), insertRows(table, rows), counts(),
//                  optional begin(), commit(), rollback(), abort() }.
// Returns { ok, rows, differences }. Throws Refusal (exit 2) or an Error (exit 1).
export async function restoreSnapshot({ file, manifest, target, log = () => {} }) {
  await verifyManifest(file, manifest);
  log('snapshot matches its manifest (size, SHA-256, counts)');
  if (!(await target.isEmpty())) {
    throw new Refusal('the target already holds data (a records or devices table with rows, or a non-empty file). Nothing was written.');
  }
  const schema = (manifest.schema || []).filter((s) => s.sql);
  const tableNames = new Set(schema.filter((s) => s.type === 'table').map((s) => s.name));
  const rows = {};
  let began = false;
  try {
    await target.createSchema([
      ...schema.filter((s) => s.type === 'table'),
      ...schema.filter((s) => s.type === 'index'),
    ]);
    log('schema created (tables, then indexes)');
    if (target.begin) { await target.begin(); began = true; }
    let table = null, buf = [];
    const flush = async () => {
      if (!buf.length) return;
      await target.insertRows(table, buf);
      rows[table] = (rows[table] || 0) + buf.length;
      buf = [];
    };
    for await (const o of readLines(file)) {
      const { t, ...cols } = o;
      if (!tableNames.has(t)) throw new Error(`the snapshot has a row for a table that is not in its schema: ${String(t).slice(0, 40)}`);
      if (t !== table) { await flush(); table = t; }
      buf.push(cols);
      if (buf.length >= BATCH) await flush();
    }
    await flush();
    if (target.commit) { await target.commit(); began = false; }
    log('rows inserted: ' + (Object.keys(rows).map((k) => `${k} ${rows[k]}`).join(', ') || 'none'));
  } catch (e) {
    try { if (began && target.rollback) await target.rollback(); } catch { /* ignore */ }
    try { if (target.abort) await target.abort(); } catch { /* ignore */ }
    throw e;
  }

  const c = await target.counts();
  const differences = [];
  diffCounts('rows in table', manifest.rows, c.tables, differences);
  diffCounts('rows in app/store', manifest.rowsPerAppStore, c.stores, differences);
  diffCounts('deleted rows in app', manifest.deletedPerApp, c.deleted, differences);
  return { ok: differences.length === 0, rows, differences };
}

// ---- local SQLite adapter (node:sqlite) ----
export async function localTarget(filePath) {
  const { DatabaseSync } = await import('node:sqlite');
  let db = null, created = false;
  const stmts = new Map();
  const open = () => { if (!db) { db = new DatabaseSync(filePath); created = true; } return db; };
  return {
    async isEmpty() {
      try { return fs.statSync(filePath).size === 0; } catch { return true; }
    },
    async createSchema(schemaRows) { const d = open(); for (const s of schemaRows) d.exec(s.sql); },
    async begin() { db.exec('BEGIN'); },
    async commit() { db.exec('COMMIT'); },
    async rollback() { db.exec('ROLLBACK'); },
    async insertRows(table, rows) {
      for (const r of rows) {
        const names = Object.keys(r);
        const key = table + '|' + names.join(',');
        if (!stmts.has(key)) stmts.set(key, db.prepare(`INSERT INTO ${q(table)} (${names.map(q).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`));
        stmts.get(key).run(...names.map((n) => r[n]));
      }
    },
    async counts() {
      const d = open();
      const tables = {}, stores = {}, deleted = {};
      for (const t of d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
        tables[t.name] = Number(d.prepare(`SELECT COUNT(*) AS n FROM ${q(t.name)}`).get().n);
      }
      for (const r of d.prepare('SELECT app, store, COUNT(*) AS n FROM records GROUP BY app, store').all()) stores[`${r.app}/${r.store}`] = Number(r.n);
      for (const r of d.prepare('SELECT app, COUNT(*) AS n FROM records WHERE deleted GROUP BY app').all()) deleted[r.app] = Number(r.n);
      return { tables, stores, deleted };
    },
    async abort() {
      // Only a file this run created is removed, so a failed restore does not block a retry.
      if (!created) return;
      try { db.close(); } catch { /* ignore */ }
      db = null;
      fs.rmSync(filePath, { force: true });
    },
    close() { try { if (db) db.close(); } catch { /* ignore */ } db = null; },
  };
}

// ---- remote libSQL adapter (client from @libsql/client/web, or a fake with execute and batch) ----
export function remoteTarget(client) {
  const run = async (sql) => toObjects(await client.execute({ sql, args: [] }));
  return {
    async isEmpty() {
      for (const t of await run("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('records','devices')")) {
        const n = Number((await run(`SELECT COUNT(*) AS n FROM ${q(t.name)}`))[0].n);
        if (n > 0) return false;
      }
      return true;
    },
    async createSchema(schemaRows) {
      await client.batch(schemaRows.map((s) => ({ sql: s.sql, args: [] })), 'write');
    },
    async insertRows(table, rows) {
      for (let i = 0; i < rows.length; i += BATCH) {
        const statements = rows.slice(i, i + BATCH).map((r) => {
          const names = Object.keys(r);
          return { sql: `INSERT INTO ${q(table)} (${names.map(q).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`, args: names.map((n) => r[n]) };
        });
        await client.batch(statements, 'write');
      }
    },
    async counts() {
      const tables = {}, stores = {}, deleted = {};
      for (const t of await run("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) {
        tables[t.name] = Number((await run(`SELECT COUNT(*) AS n FROM ${q(t.name)}`))[0].n);
      }
      for (const r of await run('SELECT app, store, COUNT(*) AS n FROM records GROUP BY app, store')) stores[`${r.app}/${r.store}`] = Number(r.n);
      for (const r of await run('SELECT app, COUNT(*) AS n FROM records WHERE deleted GROUP BY app')) deleted[r.app] = Number(r.n);
      return { tables, stores, deleted };
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let outDir = defaultOutDir(), file = null, to = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) outDir = path.resolve(args[++i]);
    else if (args[i] === '--to' && args[i + 1]) to = args[++i];
    else if (!args[i].startsWith('--')) file = path.resolve(args[i]);
    else { console.error(USAGE); process.exit(2); }
  }
  if (!to) { console.error(USAGE); process.exit(2); }
  const isLocal = to.startsWith('file:');
  const isRemote = /^(https|libsql):\/\//i.test(to);
  if (!isLocal && !isRemote) { console.error('--to must start with file:, https:// or libsql://'); process.exit(2); }

  if (isRemote) {
    let live = null;
    try { live = readAddress(); } catch (e) { console.error('Refusing: cannot read the live address to compare with (' + sanitize(e) + ').'); process.exit(2); }
    if (isLiveAddress(to, live)) { console.error('Refusing: the target is the live database named in worker/wrangler.toml.'); process.exit(2); }
  }

  if (!file) {
    try { file = newestIn(outDir); } catch { file = null; }
    if (!file) { console.error('No life-record-*.ndjson.gz found in ' + outDir); process.exit(2); }
  }
  if (!fs.existsSync(file)) { console.error('File not found: ' + file); process.exit(2); }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8')); }
  catch { console.error('Manifest missing or unreadable: ' + path.basename(file) + '.manifest.json'); process.exit(2); }

  let token = null, client = null, target;
  if (isRemote) {
    token = (process.env.LM_RESTORE_TOKEN || '').trim();
    if (!token) { console.error('No token: set the environment variable LM_RESTORE_TOKEN.'); process.exit(2); }
  }
  try {
    if (isLocal) {
      const p = path.resolve(to.slice('file:'.length));
      try { target = await localTarget(p); }
      catch { console.error(`node:sqlite is not available in Node ${process.version}; Node 22.5 or newer is needed.`); process.exit(3); }
    } else {
      const { createClient } = await import('@libsql/client/web');
      client = createClient({ url: to, authToken: token, intMode: 'number' });
      target = remoteTarget(client);
    }
    console.log('Restoring ' + path.basename(file));
    const r = await restoreSnapshot({ file, manifest, target, log: (m) => console.log(m) });
    if (!r.ok) {
      console.error('Restore finished but counts differ: ' + r.differences.slice(0, 10).join('; '));
      process.exitCode = 1;
    } else {
      console.log('RESULT PASS: every count matches the manifest');
    }
  } catch (e) {
    console.error((e instanceof Refusal ? 'Refusing: ' : 'Restore failed: ') + sanitize(e, [token]));
    process.exitCode = e instanceof Refusal ? 2 : 1;
  } finally {
    try { if (target && target.close) target.close(); } catch { /* ignore */ }
    try { if (client) client.close(); } catch { /* ignore */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Restore failed: ' + sanitize(e)); process.exit(1); });
}
