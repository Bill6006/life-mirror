// The skill coach on the live site the way the owner uses it, with the cloud copy on (the audit's fix 4, 2026-10-18), checked
// against the owner's words of 2026-10-17 for it, and D7 as they amended it on 2026-10-18 ("suggestions on tap, two a day").
// A throwaway context with stand-in records only. The cloud is a stand-in answered inside the page: every request to the
// database's host is fulfilled here, never reached, and the token is made up and written into the app's own storage, never
// typed. The stand-in plays the Worker too: it takes the ask, writes Claude's answer, and refuses a fire.
// node qa/live-skillcoach.mjs <expected short commit> [url]
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.argv[3] ?? process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const APP = 'life-mirror'
const BRAIN = 'life-mirror-brain'
const COLUMNS = ['app', 'store', 'id', 'day', 'body', 'updated_at', 'deleted', 'device_id', 'synced_at']
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}

/** The stand-in cloud: the records table and the devices touch, as the app's statements use them (Hrana over HTTP, version 2). */
class Cloud {
  rows = new Map()
  answered = 0
  known = new Set()
  stored = new Map()
  down = false
  live(app, store) {
    return [...this.rows.values()].filter((r) => r.app === app && r.store === store && !r.deleted)
  }
  seed(row) {
    this.rows.set(`${row.app}|${row.store}|${row.id}`, row)
  }
  run(stmt) {
    const sql = (stmt.sql ?? this.stored.get(stmt.sql_id ?? -1) ?? '').trim()
    const args = (stmt.args ?? []).map((v) => (v.type === 'null' ? null : v.type === 'integer' ? Number(v.value) : v.type === 'blob' ? v.base64 : v.value))
    if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA)\b/i.test(sql)) return { cols: [], rows: [], affected: 0 }
    if (sql.startsWith('INSERT OR REPLACE INTO records')) {
      const r = Object.fromEntries(COLUMNS.map((c, i) => [c, args[i]]))
      if (r.body === null || r.body === undefined) throw Object.assign(new Error('SQLite error: NOT NULL constraint failed: records.body'), { code: 'SQLITE_CONSTRAINT' })
      this.seed({ ...r, deleted: Number(r.deleted) })
      return { cols: [], rows: [], affected: 1 }
    }
    if (sql.startsWith(`SELECT ${COLUMNS.join(', ')} FROM records WHERE app = ? AND synced_at > ? ORDER BY synced_at ASC LIMIT ?`)) {
      const [app, after, limit] = args
      const out = [...this.rows.values()].filter((r) => r.app === app && r.synced_at > after).sort((a, b) => (a.synced_at < b.synced_at ? -1 : a.synced_at > b.synced_at ? 1 : 0)).slice(0, limit)
      return { cols: [...COLUMNS], rows: out.map((r) => COLUMNS.map((c) => r[c])), affected: 0 }
    }
    if (sql.startsWith('SELECT store, id, synced_at FROM records WHERE app = ? AND store = ? AND id = ?')) {
      const [app, store, id] = args
      const r = this.rows.get(`${app}|${store}|${id}`)
      return { cols: ['store', 'id', 'synced_at'], rows: r ? [[r.store, r.id, r.synced_at]] : [], affected: 0 }
    }
    if (sql.startsWith('UPDATE devices SET last_sync')) return { cols: [], rows: [], affected: this.known.has(String(args[1])) ? 1 : 0 }
    if (sql.startsWith('INSERT INTO devices')) {
      this.known.add(String(args[0]))
      return { cols: [], rows: [], affected: 1 }
    }
    throw new Error(`not a statement the app sends: ${sql.slice(0, 60)}`)
  }
  result(r) {
    const value = (v) => (v === null || v === undefined ? { type: 'null' } : typeof v === 'number' ? (Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }) : { type: 'text', value: String(v) })
    return { cols: r.cols.map((name) => ({ name, decltype: null })), rows: r.rows.map((row) => row.map(value)), affected_row_count: r.affected, last_insert_rowid: null }
  }
  async handle(route) {
    const req = route.request()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' }
    if (this.down) return route.abort('failed')
    this.answered++
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (!req.url().endsWith('/v2/pipeline')) return route.fulfill({ status: 404, headers, body: '{}' })
    const body = req.postDataJSON()
    const results = []
    for (const r of body.requests) {
      try {
        if (r.type === 'close') results.push({ type: 'ok', response: { type: 'close' } })
        else if (r.type === 'store_sql') {
          this.stored.set(r.sql_id, r.sql)
          results.push({ type: 'ok', response: { type: 'store_sql' } })
        } else if (r.type === 'close_sql') {
          this.stored.delete(r.sql_id)
          results.push({ type: 'ok', response: { type: 'close_sql' } })
        } else if (r.type === 'execute') results.push({ type: 'ok', response: { type: 'execute', result: this.result(this.run(r.stmt)) } })
        else if (r.type === 'batch') {
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

const errors = []
const hosts = new Set()
const browser = await chromium.launch()
try {
  const cloud = new Cloud()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.route(/turso\.io/, (route) => cloud.handle(route))
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => {
    const host = new URL(r.url()).host
    if (!host.endsWith('turso.io')) hosts.add(host)
  })
  await page.clock.install({ time: new Date(2026, 9, 18, 8, 0) })
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  const tab = async (name) => {
    await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
    await page.waitForTimeout(300)
  }
  await tab('Settings')
  await page.getByTestId('settings-about').click()
  const commit = (await page.getByTestId('build-commit').textContent())?.trim()
  check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  // The cloud copy on: a made-up token, written into the app's own storage, as a phone that pasted one holds it.
  await page.evaluate(async () => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const store = dbx.transaction(['settings'], 'readwrite').objectStore('settings')
    const s = await new Promise((res) => {
      const q = store.get(1)
      q.onsuccess = () => res(q.result)
    })
    store.put({ ...s, cloud: { ...s.cloud, token: 'qa-token-never-real' } })
    await new Promise((res) => setTimeout(res, 200))
    dbx.close()
  })
  await page.reload()
  for (let i = 0; i < 40 && !cloud.known.size; i++) await page.waitForTimeout(250)
  check('the cloud copy is on: the first sync reached the stand-in', cloud.known.size === 1)
  await tab('Aims')
  // "Do not require a current skill when creating a learning goal": Goal, Practice with, and anything Claude should know.
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  const form = (await page.locator('#main').textContent()) ?? ''
  check('the learning goal asks Goal, Practice with and anything Claude should know, and no skill', (await page.getByTestId('aim-goal-input').count()) === 1 && (await page.getByTestId('aim-method-input').count()) === 1 && form.includes('Optional: anything Claude should know') && (await page.getByTestId('aim-skill-now-input').count()) === 0)
  await page.getByTestId('aim-goal-input').fill('Handstand')
  await page.getByTestId('aim-method-input').fill('YouTube')
  await page.getByTestId('aim-learn-add').click()
  const card = page.getByTestId('aim-card').filter({ hasText: 'Handstand' })
  // "No current skill yet", "Suggest a skill with Claude" an obvious action, and "Set one myself".
  await card.getByTestId('coach-ask').waitFor()
  const askClass = (await card.getByTestId('coach-ask').getAttribute('class')) ?? ''
  check('the card says No current skill yet, with Suggest a skill with Claude as its primary button and Set one myself', ((await card.getByTestId('aim-step').textContent()) ?? '').trim() === 'No current skill yet' && askClass.includes('is-primary') && ((await card.getByTestId('coach-ask').textContent()) ?? '').trim() === 'Suggest a skill with Claude' && ((await card.getByTestId('aim-skill-own').textContent()) ?? '').trim() === 'Set one myself')
  // "Keep safety questions when genuinely relevant, but present them compactly": one line, above the ask.
  check('a physical goal asks its one safety question, one line, above the ask', ((await card.getByTestId('coach-care-ask').textContent()) ?? '').includes('Any injury or condition the practice should respect?'))
  // "Tapping it should request a suggestion immediately": the ask is in the cloud within seconds.
  await card.getByTestId('coach-care').fill('None')
  await card.getByTestId('coach-ask').click()
  const pending = ((await card.getByTestId('coach-pending').textContent()) ?? '').trim()
  let asked = false
  for (let i = 0; i < 40 && !asked; i++) {
    asked = cloud.live(APP, 'coachAsks').length === 1
    if (!asked) await page.waitForTimeout(250)
  }
  check('tapped: the ask reaches the cloud at once', asked)
  // "While waiting, show a clear state such as 'Claude is choosing a skill…'": and when it comes.
  check('while it waits: Claude is choosing a skill…, usually ready in a few minutes', pending.includes('Claude is choosing a skill…') && pending.includes('Usually ready in a few minutes.'), pending)
  const ask = JSON.parse(cloud.live(APP, 'coachAsks')[0]?.body ?? '{}')
  const now = () => page.evaluate(() => new Date().toISOString())
  const worker = (store, id, body, at) => cloud.seed({ app: BRAIN, store, id, day: ask.day, body: JSON.stringify(body), updated_at: at, deleted: 0, device_id: 'worker', synced_at: at })
  const run = (id, at, extra) => ({ id, kind: 'task', task: 'skill', day: ask.day, at, trigger: 'ask', factsDay: ask.day, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], ...extra })
  // The stand-in Worker takes it within the minute; Claude answers.
  const fired = await now()
  worker('bridge', `task:${ask.day}:skill`, run(`task:${ask.day}:skill`, fired, { status: 'fired', firedAt: fired, fireStatus: 200, asks: [ask.id] }), fired)
  const written = await now()
  worker('proposals', `ask:${ask.id}`, { askId: ask.id, aimId: ask.aimId, kind: 'setup', revision: ask.revision, day: ask.day, at: written, model: 'claude-opus-5-5', askedModel: 'opus', suggestion: { skill: 'Wall-supported holds', method: 'YouTube', how: 'Kick up facing the wall and hold, coming down with control.', minutes: 10, rhythm: { perWeek: 3, restDays: 1 }, why: 'Holding against the wall builds the line safely.', physical: true, safety: 'Warm the wrists first; stop at sharp pain.', likelyNext: 'Chest-to-wall holds' } }, written)
  worker('bridge', `task:${ask.day}:skill`, run(`task:${ask.day}:skill`, fired, { status: 'written', firedAt: fired, fireStatus: 200, writer: 'claude', writtenAt: written, posts: 1, asks: [ask.id] }), written)
  await page.clock.fastForward(20_000)
  const shown = await card.getByTestId('coach-suggestion-skill').waitFor({ timeout: 10_000 }).then(() => true, () => false)
  // "When a suggestion returns, present it prominently with clear actions such as: Use this skill / Try another / Set one myself."
  const actions = shown ? await Promise.all(['coach-use', 'coach-another', 'coach-own', 'coach-edit'].map(async (id) => ((await card.getByTestId(id).textContent()) ?? '').trim())) : []
  check('the answer shows at the next look, 20 seconds on, whole and prominent: Use this skill, Try another, Set one myself, Edit first', shown && actions.join(' | ') === 'Use this skill | Try another | Set one myself | Edit first', actions.join(' | '))
  // "Preserve approval rules: Claude may suggest, but must not silently replace the owner's current skill."
  check('nothing replaces the skill without your tap: still no current skill while the suggestion shows', ((await card.getByTestId('aim-step').textContent()) ?? '').trim() === 'No current skill yet')
  // Try another: the second run of the day. "If an immediate run genuinely cannot happen, clearly say when/how the queued request will run."
  await card.getByTestId('coach-another').click()
  let second = null
  for (let i = 0; i < 40 && !second; i++) {
    second = cloud.live(APP, 'coachAsks').map((r) => JSON.parse(r.body ?? '{}')).find((a) => !a.decision) ?? null
    if (!second) await page.waitForTimeout(250)
  }
  const refused = await now()
  worker('bridge', `task:${ask.day}:skill.2`, run(`task:${ask.day}:skill.2`, refused, { status: 'fallback', fireStatus: 403, error: 'Request not allowed', asks: [second?.id ?? -1] }), refused)
  await page.clock.fastForward(20_000)
  const retry = await page.evaluate((at) => {
    const d = new Date(Date.parse(at) + 15 * 60_000)
    return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
  }, refused)
  const refusedWords = `Claude couldn’t start just now; your Claude usage limit may be reached. It tries again at ${retry}.`
  const sawRefused = await card.getByTestId('coach-when').filter({ hasText: refusedWords }).waitFor({ timeout: 10_000 }).then(() => true, () => false)
  check('a refused fire is said, with when it is tried again', sawRefused, ((await card.getByTestId('coach-when').textContent()) ?? '').trim())
  const taken = await now()
  worker('bridge', `task:${ask.day}:skill.2`, run(`task:${ask.day}:skill.2`, taken, { status: 'written', firedAt: taken, fireStatus: 200, writer: 'claude', posts: 1, asks: [-1] }), taken)
  await page.clock.fastForward(20_000)
  const sawTomorrow = await card.getByTestId('coach-when').filter({ hasText: 'Both of today’s two suggestions are used. This one comes after midnight.' }).waitFor({ timeout: 10_000 }).then(() => true, () => false)
  check('both of the day’s runs used: it comes after midnight, and says so', sawTomorrow)
  // Out of reach: not sent yet, and when it goes.
  cloud.down = true
  await page.reload()
  await tab('Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-goal-input').fill('Orrish')
  await page.getByTestId('aim-learn-add').click()
  const orrish = page.getByTestId('aim-card').filter({ hasText: 'Orrish' })
  await orrish.getByTestId('coach-ask').click()
  const unsent = await orrish.getByTestId('coach-when').filter({ hasText: 'Not sent yet: it goes as soon as this phone reaches the cloud copy.' }).waitFor({ timeout: 10_000 }).then(() => true, () => false)
  check('out of reach of the cloud copy: not sent yet, and it goes when it can', unsent)
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself; the cloud was answered in the page, never reached', others.length === 0 && cloud.answered > 0, (others.join(', ') || `only ${SITE}`) + `; ${cloud.answered} cloud requests answered in the page`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
