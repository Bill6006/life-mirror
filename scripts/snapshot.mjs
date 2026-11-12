// Takes a read-only snapshot of the remote libSQL (Turso) database into a
// gzipped NDJSON file plus a manifest, then verifies the file by reading it back.
// Usage: node scripts/snapshot.mjs [--out <folder>]
// The token comes from the LM_SNAPSHOT_TOKEN environment variable, or from the
// line starting "LM_SNAPSHOT_TOKEN=" in worker/.dev.vars. It is never printed.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

export const VERSION = 'snapshot.mjs 1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const DEV_VARS = path.join(ROOT, 'worker', '.dev.vars');
export const WRANGLER_TOML = path.join(ROOT, 'worker', 'wrangler.toml');
const PAGE = 50;

export function defaultOutDir() {
  return path.join(os.homedir(), 'LifeMirrorSnapshots');
}

// Returns the token, or null. Reads only the one line it needs and never prints it.
export function readToken(env = process.env, devVarsPath = DEV_VARS) {
  if (env.LM_SNAPSHOT_TOKEN && env.LM_SNAPSHOT_TOKEN.trim()) return env.LM_SNAPSHOT_TOKEN.trim();
  try {
    for (const line of fs.readFileSync(devVarsPath, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('LM_SNAPSHOT_TOKEN=')) {
        const v = line.slice('LM_SNAPSHOT_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
        if (v) return v;
      }
    }
  } catch { /* file missing */ }
  return null;
}

export function readAddress(tomlPath = WRANGLER_TOML) {
  const m = /^\s*TURSO_URL\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(tomlPath, 'utf8'));
  if (!m) throw new Error('TURSO_URL not found in worker/wrangler.toml');
  return m[1];
}

// Walks up from a folder looking for ".git". Returns the repository root or null.
export function findGitRoot(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

function sanitize(err, secrets = []) {
  let msg = String(err && err.message ? err.message : err);
  for (const s of secrets) if (s) msg = msg.split(s).join('[redacted]');
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
  return msg.replace(/\s+/g, ' ').slice(0, 300);
}

export function looksLikeTlsError(err) {
  const text = [err && err.message, err && err.code, err && err.cause && err.cause.message, err && err.cause && err.cause.code].join(' ');
  return /certificate|CERT_|TLS|SSL|self[- ]signed|UNABLE_TO_VERIFY/i.test(text);
}

function toObjects(res) {
  const cols = res.columns;
  return res.rows.map((r) => {
    const o = {};
    for (const c of cols) o[c] = r[c];
    return o;
  });
}

const replacer = (_k, v) => (typeof v === 'bigint' ? Number(v) : v);

// Reads a snapshot file back: counts lines and recomputes the SHA-256.
export async function scanSnapshot(file) {
  const hash = crypto.createHash('sha256');
  const raw = fs.createReadStream(file);
  raw.on('data', (c) => hash.update(c));
  const gunzip = zlib.createGunzip();
  raw.on('error', (e) => gunzip.destroy(e));
  const rl = readline.createInterface({ input: raw.pipe(gunzip), crlfDelay: Infinity });
  const tables = {}, stores = {}, deleted = {};
  for await (const line of rl) {
    if (!line) continue;
    const o = JSON.parse(line);
    tables[o.t] = (tables[o.t] || 0) + 1;
    if (o.t === 'records') {
      const k = `${o.app}/${o.store}`;
      stores[k] = (stores[k] || 0) + 1;
      if (o.deleted) deleted[o.app] = (deleted[o.app] || 0) + 1;
    }
  }
  const bytes = (await fsp.stat(file)).size;
  return { tables, stores, deleted, bytes, sha256: hash.digest('hex') };
}

function diffCounts(label, a, b, out) {
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (((a || {})[k] || 0) !== ((b || {})[k] || 0)) out.push(`${label} ${k}: manifest ${(a || {})[k] || 0}, file ${(b || {})[k] || 0}`);
  }
}

export function compareToManifest(manifest, scan) {
  const out = [];
  if (manifest.bytes !== scan.bytes) out.push(`byte size: manifest ${manifest.bytes}, file ${scan.bytes}`);
  if (manifest.sha256 !== scan.sha256) out.push('SHA-256 differs');
  diffCounts('rows in table', manifest.rows, scan.tables, out);
  diffCounts('rows in app/store', manifest.rowsPerAppStore, scan.stores, out);
  diffCounts('deleted rows in app', manifest.deletedPerApp, scan.deleted, out);
  return out;
}

async function removeQuiet(p) { try { await fsp.rm(p, { force: true }); } catch { /* ignore */ } }

// Core. Never throws for a failed run: returns { ok, file, rows, bytes, error }.
export async function takeSnapshot({ client, outDir, now = new Date(), address, secrets = [], log = () => {} }) {
  const startedAt = new Date(now);
  const stamp = startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const name = `life-record-${stamp}.ndjson.gz`;
  const dataPath = path.join(outDir, name);
  const partial = dataPath + '.partial';
  const manifestPath = dataPath + '.manifest.json';
  const manifestPartial = manifestPath + '.partial';
  const result = { ok: false, file: null, rows: null, bytes: null, error: null };
  let fileOut, gz;
  try {
    await fsp.mkdir(outDir, { recursive: true });
    fileOut = fs.createWriteStream(partial);
    gz = zlib.createGzip();
    gz.pipe(fileOut);
    const finished = new Promise((res, rej) => {
      fileOut.on('finish', res); fileOut.on('error', rej); gz.on('error', rej);
    });
    finished.catch(() => {});
    const put = async (obj) => {
      if (!gz.write(JSON.stringify(obj, replacer) + '\n')) await once(gz, 'drain');
    };

    const counts = async () => toObjects(await client.execute({ sql: 'SELECT app, COUNT(*) AS n, MAX(synced_at) AS newest FROM records GROUP BY app', args: [] }));

    log('reading schema');
    const schema = toObjects(await client.execute({ sql: "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name", args: [] }));
    const before = await counts();

    const rows = { records: 0, devices: 0 };
    const rowsPerAppStore = {}, deletedPerApp = {};
    let last = null;
    for (;;) {
      const res = last
        ? await client.execute({ sql: `SELECT * FROM records WHERE (app, store, id) > (?, ?, ?) ORDER BY app, store, id LIMIT ${PAGE}`, args: last })
        : await client.execute({ sql: `SELECT * FROM records ORDER BY app, store, id LIMIT ${PAGE}`, args: [] });
      const page = toObjects(res);
      for (const r of page) {
        await put({ t: 'records', ...r });
        rows.records++;
        const k = `${r.app}/${r.store}`;
        rowsPerAppStore[k] = (rowsPerAppStore[k] || 0) + 1;
        if (r.deleted) deletedPerApp[r.app] = (deletedPerApp[r.app] || 0) + 1;
      }
      log(`records read: ${rows.records}`);
      if (page.length < PAGE) break;
      const l = page[page.length - 1];
      last = [l.app, l.store, l.id];
    }

    for (const r of toObjects(await client.execute({ sql: 'SELECT * FROM devices', args: [] }))) {
      await put({ t: 'devices', ...r });
      rows.devices++;
    }
    log(`devices read: ${rows.devices}`);
    const after = await counts();

    gz.end();
    await finished;

    const scan1 = await scanSnapshot(partial);
    const manifest = {
      address: address ? new URL(address).host : null,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      rows, rowsPerAppStore, deletedPerApp,
      countsBefore: before, countsAfter: after,
      schema,
      file: name,
      bytes: scan1.bytes,
      sha256: scan1.sha256,
      version: VERSION,
    };
    const manifestText = JSON.stringify(manifest, replacer, 2) + '\n';
    await fsp.writeFile(manifestPartial, manifestText);

    log('verifying by reading the file back');
    const scan2 = await scanSnapshot(partial);
    const differs = compareToManifest(JSON.parse(manifestText), scan2);
    if (differs.length) {
      result.error = 'verification failed: ' + differs.join('; ').slice(0, 250);
      return result; // nothing deleted: the .partial files stay for inspection
    }

    await fsp.rename(manifestPartial, manifestPath);
    await fsp.rename(partial, dataPath);
    Object.assign(result, { ok: true, file: name, rows: { ...rows }, bytes: scan2.bytes });
    log(`rows: records ${rows.records}, devices ${rows.devices}; ${scan2.bytes} bytes; sha256 ${scan2.sha256.slice(0, 12)}`);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      log('note: per-app counts changed while reading (see countsBefore and countsAfter in the manifest)');
    }
    return result;
  } catch (err) {
    result.error = sanitize(err, secrets);
    result.cause = err;
    try {
      if (gz) gz.destroy();
      if (fileOut) { const closed = once(fileOut, 'close').catch(() => {}); fileOut.destroy(); await closed; }
    } catch { /* ignore */ }
    await removeQuiet(partial);
    await removeQuiet(manifestPartial);
    return result;
  } finally {
    try {
      await fsp.writeFile(path.join(outDir, 'last-snapshot.json'), JSON.stringify({
        ok: result.ok, at: new Date().toISOString(), file: result.file, rows: result.rows, bytes: result.bytes, error: result.error,
      }, null, 2) + '\n');
    } catch { /* ignore */ }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let outDir = defaultOutDir();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) outDir = path.resolve(args[++i]);
    else { console.error('Usage: node scripts/snapshot.mjs [--out <folder>]'); process.exit(2); }
  }
  const gitRoot = findGitRoot(outDir);
  if (gitRoot) {
    console.error(`Refusing: the output folder is inside a git repository (${gitRoot}). Choose a folder outside any repository.`);
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const token = readToken();
  if (!token) {
    const msg = 'No token: set the environment variable LM_SNAPSHOT_TOKEN, or add a line LM_SNAPSHOT_TOKEN=... to worker/.dev.vars.';
    fs.writeFileSync(path.join(outDir, 'last-snapshot.json'), JSON.stringify({ ok: false, at: new Date().toISOString(), file: null, rows: null, bytes: null, error: msg }, null, 2) + '\n');
    console.error(msg);
    process.exit(2);
  }
  const address = readAddress();
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url: address, authToken: token, intMode: 'number' });
  const r = await takeSnapshot({ client, outDir, address, secrets: [token], log: (m) => console.log(m) });
  try { client.close(); } catch { /* ignore */ }
  if (!r.ok) {
    console.error('Snapshot failed: ' + r.error);
    if (r.cause && looksLikeTlsError(r.cause)) {
      console.error("This looks like a certificate failure. A computer that scans HTTPS needs the environment variable NODE_EXTRA_CA_CERTS set to its scanner's certificate file.");
    }
    process.exit(1);
  }
  console.log('Snapshot written: ' + path.join(outDir, r.file));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Snapshot failed: ' + sanitize(e)); process.exit(1); });
}
