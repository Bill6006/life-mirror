// Checks a snapshot made by snapshot.mjs: verifies the manifest's SHA-256 and counts,
// then proves the file restores into a local SQLite database (node:sqlite).
// Usage: node scripts/snapshot-check.mjs [<file.ndjson.gz>] [--out <folder>]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { scanSnapshot, compareToManifest, defaultOutDir } from './snapshot.mjs';

const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const canon = (o) => JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])));

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

function diffKeys(a, b, out) {
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (((a || {})[k] || 0) !== ((b || {})[k] || 0)) out.push(`${k}: snapshot ${(a || {})[k] || 0}, restored ${(b || {})[k] || 0}`);
  }
}

// Returns true (all pass), false (a failure), or null (node:sqlite unavailable).
export async function checkSnapshot(file, log = console.log) {
  let ok = true;
  const pass = (m) => log('PASS ' + m);
  const fail = (m) => { ok = false; log('FAIL ' + m); };

  const manifestPath = file + '.manifest.json';
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { fail('manifest missing or unreadable: ' + path.basename(manifestPath)); return false; }

  let scan;
  try { scan = await scanSnapshot(file); }
  catch (e) { fail('data file unreadable or cut off: ' + String(e.message).slice(0, 120)); return false; }
  const diffs = compareToManifest(manifest, scan);
  if (diffs.length) { for (const d of diffs) fail('manifest vs file: ' + d); return false; }
  pass(`manifest: size, SHA-256 and counts match (records ${scan.tables.records || 0}, devices ${scan.tables.devices || 0})`);

  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); }
  catch {
    log(`node:sqlite is not available in Node ${process.version}; Node 22.5 or newer is needed (22.13 or newer without a flag).`);
    return null;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-restore-'));
  let db;
  try {
    db = new DatabaseSync(path.join(tmpDir, 'restore.db'));
    const schema = manifest.schema.filter((s) => s.sql);
    for (const s of schema.filter((x) => x.type === 'table')) db.exec(s.sql);
    for (const s of schema.filter((x) => x.type === 'index')) db.exec(s.sql);
    pass('schema created (tables, then indexes)');

    const stmts = new Map();
    const snapDigests = [];
    db.exec('BEGIN');
    for await (const o of readLines(file)) {
      const { t, ...cols } = o;
      const names = Object.keys(cols);
      const key = t + '|' + names.join(',');
      if (!stmts.has(key)) {
        stmts.set(key, db.prepare(`INSERT INTO ${q(t)} (${names.map(q).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`));
      }
      stmts.get(key).run(...names.map((n) => cols[n]));
      if (t === 'records') snapDigests.push({ k: Buffer.from([cols.app, cols.store, cols.id].map(String).join('\0')), h: sha(canon(cols)) });
    }
    db.exec('COMMIT');

    for (const t of Object.keys(manifest.rows)) {
      const n = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${q(t)}`).get().n);
      if (n === manifest.rows[t]) pass(`restored ${t}: ${n} rows`);
      else fail(`restored ${t}: ${n} rows, snapshot has ${manifest.rows[t]}`);
    }
    const restoredStores = {};
    for (const r of db.prepare('SELECT app, store, COUNT(*) AS n FROM records GROUP BY app, store').all()) {
      restoredStores[`${r.app}/${r.store}`] = Number(r.n);
    }
    const sd = [];
    diffKeys(manifest.rowsPerAppStore, restoredStores, sd);
    if (sd.length) sd.forEach((d) => fail('app/store ' + d));
    else pass(`restored per app/store counts match (${Object.keys(restoredStores).length} groups)`);

    snapDigests.sort((a, b) => Buffer.compare(a.k, b.k));
    const h1 = crypto.createHash('sha256');
    for (const d of snapDigests) h1.update(d.h);
    const h2 = crypto.createHash('sha256');
    for (const r of db.prepare('SELECT * FROM records ORDER BY app, store, id').all()) h2.update(sha(canon({ ...r })));
    if (h1.digest('hex') === h2.digest('hex')) pass('records content hash: snapshot equals restored');
    else fail('records content hash differs between snapshot and restored');
  } catch (e) {
    fail('restore error: ' + String(e.message).slice(0, 200));
  } finally {
    try { if (db) db.close(); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  let outDir = defaultOutDir(), file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) outDir = path.resolve(args[++i]);
    else if (!args[i].startsWith('--')) file = path.resolve(args[i]);
    else { console.error('Usage: node scripts/snapshot-check.mjs [<file.ndjson.gz>] [--out <folder>]'); process.exit(2); }
  }
  if (!file) {
    try { file = newestIn(outDir); } catch { file = null; }
    if (!file) { console.error('No life-record-*.ndjson.gz found in ' + outDir); process.exit(2); }
  }
  if (!fs.existsSync(file)) { console.error('File not found: ' + file); process.exit(2); }
  console.log('Checking ' + path.basename(file));
  const ok = await checkSnapshot(file);
  if (ok === null) process.exit(3);
  console.log(ok ? 'RESULT PASS' : 'RESULT FAIL');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Check failed: ' + String(e.message).slice(0, 200)); process.exit(1); });
}
