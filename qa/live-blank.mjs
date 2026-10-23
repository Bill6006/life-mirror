// The blank Now's repair (2026-10-23) on the live site, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, no position of anyone's is read (the phone's location is stood in for), and nothing is sent
// anywhere but the site. An existing user's shape of record; Location Context switched off and on as the owner did; then
// the browser's storage interrupted as Chrome does when its storage fails under a page (every transaction under way
// aborted, the connection closed with its close event), at Now's first read and during the open: Now shows its record again
// by itself, with no reload. A read dropped with no word: Now says so past its limit and Try again brings it. The
// interruption is kept on this phone, and the next start carries it on the facts row for the Worker's report alone.
// node live-blank.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium, tab } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const WHEN = new Date(2026, 9, 23, 16, 26, 30)
const TODAY = `${WHEN.getFullYear()}-${String(WHEN.getMonth() + 1).padStart(2, '0')}-${String(WHEN.getDate()).padStart(2, '0')}`
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

/** The page's own stand-ins: an approximate location, and the storage interruption on request. */
function standIns() {
  try {
    localStorage.setItem('lm.inStep', '1')
  } catch {}
  const at = (age) => ({ coords: { latitude: 40.7128, longitude: -74.006, accuracy: 2000 }, timestamp: Date.now() - age })
  const g = navigator.geolocation
  g.getCurrentPosition = (ok) => void setTimeout(() => ok(at(5 * 60_000)), 50)
  g.watchPosition = (ok) => {
    setTimeout(() => ok(at(5 * 60_000)), 30)
    setTimeout(() => ok(at(0)), 600)
    return 1
  }
  g.clearWatch = () => undefined
  const query = navigator.permissions.query.bind(navigator.permissions)
  navigator.permissions.query = (d) => (d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : query(d))
  window.__cuts = 0
  const conns = []
  const live = new Set()
  const open = IDBFactory.prototype.open
  IDBFactory.prototype.open = function (...args) {
    const req = open.apply(this, args)
    req.addEventListener('success', () => conns.push(req.result))
    return req
  }
  const cut = () => {
    for (const t of [...live]) {
      try {
        t.abort()
      } catch {}
    }
    for (const c of conns.splice(0)) {
      c.close()
      c.dispatchEvent(new Event('close'))
    }
    window.__cuts++
  }
  const when = sessionStorage.getItem('live.cut')
  // Dropping lasts until the check ends it, never a time the machine's speed decides.
  window.__dropping = sessionStorage.getItem('live.drop') === '1'
  sessionStorage.removeItem('live.drop')
  const tx = IDBDatabase.prototype.transaction
  IDBDatabase.prototype.transaction = function (...args) {
    const t = tx.apply(this, args)
    live.add(t)
    const done = () => live.delete(t)
    t.addEventListener('complete', done)
    t.addEventListener('abort', done)
    const names = [args[0]].flat()
    const due = when === 'open' || (when === 'read' && t.mode === 'readonly' && names.length === 1 && names[0] === 'checkins')
    if (due && sessionStorage.getItem('live.cut')) {
      sessionStorage.removeItem('live.cut')
      queueMicrotask(cut)
    }
    if (window.__dropping && t.mode === 'readonly' && names.length === 1 && names[0] === 'checkins') queueMicrotask(() => t.abort())
    return t
  }
}

/** An existing user's record, written straight into the phone's store as it holds one (the browser test's shape). */
async function seed(page) {
  await page.evaluate(async ({ today, now }) => {
    const blocks = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const hours = { morning: 9, afternoon: 13, evening: 19 }
    const fits = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'settings', 'places', 'placeCandidates'], 'readwrite')
    const add = (store, row) => new Promise((res) => {
      const q = tx.objectStore(store).add(row)
      q.onsuccess = () => res(q.result)
    })
    const base = new Date(now)
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let k = 0
    for (let d = 21; d >= 0; d--) {
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() - d)
      const dk = key(date)
      for (const block of Object.keys(blocks)) {
        if (d === 0 && block === 'evening') continue
        k++
        const answers = {}
        blocks[block].forEach((id, ri) => {
          answers[id] = 1 + ((k + ri * 3) % 5)
        })
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
        const done = new Date(at.getTime() + 95_000).toISOString()
        tx.objectStore('checkins').add({ day: dk, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
        const moveId = k % 2 ? 'walk-ten' : 'nothing'
        if (d === 0 && block === 'afternoon') await add('offers', { kind: 'block', day: dk, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: done, closedAt: null, seenAt: done, fits })
        const id = await add('offers', { kind: 'block', day: dk, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done, fits })
        tx.objectStore('outcomes').add({ offerId: id, moveId, day: dk, block, at: done, outcome: moveId === 'nothing' ? null : 'done', why: null, passiveOutcome: null, seen: true })
      }
    }
    tx.objectStore('offers').add({ kind: 'pickup', day: today, block: 'afternoon', at: new Date(base.getTime() - 4 * 60_000).toISOString(), situationKey: 'pickup:energy', target: 'energy', stance: '', band: '', reading: 0, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: null })
    const settings = tx.objectStore('settings')
    const get = settings.get(1)
    get.onsuccess = () => {
      const s = get.result
      const weekdays = { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }
      settings.put({ ...s, location: { on: true, area: { lat: 40.7, lon: -74, at: new Date(base.getTime() - 86_400_000).toISOString() } }, week: { ...s.week, livesWithMe: true, daycareDays: weekdays, pickupTime: '17:30' } })
    }
    const named = new Date(base.getTime() - 9 * 86_400_000)
    tx.objectStore('places').put({ id: 1, kind: 'home', cells: ['seeded-home'], area: { lat: 40.7, lon: -74 }, learnedAt: named.toISOString() })
    tx.objectStore('placeCandidates').put({ id: 1, cells: ['seeded-candidate'], area: { lat: 40.7, lon: -74 }, firstDay: key(named), lastDay: key(new Date(base.getTime() - 86_400_000)), days: 3, morning: 0, afternoon: 3, evening: 0, office: 0, church: 0 })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, { today: TODAY, now: WHEN.getTime() })
}

/** Whether Now shows its record within `ms`: the day's blocks, the pickup's move and the place to ask about. */
async function shown(page, ms = 12000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const rows = await page.getByTestId('block-row').count().catch(() => 0)
    const pickup = await page.locator('[data-testid="move-card"][data-kind="pickup"]').count().catch(() => 0)
    const place = await page.getByTestId('place-question').count().catch(() => 0)
    if (rows === 3 && pickup > 0 && place > 0) return true
    await page.waitForTimeout(250)
  }
  return false
}

async function existingUser() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(standIns)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  // The interruption's own refusals are expected; anything else is a page error.
  page.on('pageerror', (e) => {
    if (!['DatabaseClosedError', 'AbortError', 'InvalidStateError', 'OpenFailedError'].includes(e.name)) errors.push(String(e))
  })
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.getByTestId('block-row').first().waitFor()
  await seed(page)
  await page.reload()
  return { ctx, page, ok: await shown(page) }
}

async function ownersSteps(page) {
  await tab(page, 'Settings')
  await page.getByTestId('settings-location').click()
  const sw = page.getByTestId('location-switch')
  const states = []
  for (let i = 0; i < 4; i++) {
    await sw.click()
    await page.waitForTimeout(400)
    states.push(await sw.getAttribute('aria-pressed'))
  }
  await page.goBack()
  await tab(page, 'Now')
  return states.join(',')
}

const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('life-mirror.storage.faults') ?? 'null'))
const cuts = (page) => page.evaluate(() => window.__cuts)

try {
  {
    const { ctx, page } = await existingUser()
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    const { ctx, page, ok } = await existingUser()
    check('an existing user’s Now shows its record', ok)
    const states = await ownersSteps(page)
    check('Location Context switches off and on again, and back on Now its record shows', states === 'false,true,false,true' && (await shown(page)), states)
    await page.evaluate(() => sessionStorage.setItem('live.cut', 'read'))
    await page.reload()
    const back = await shown(page)
    check('the storage cut at Now’s first read: Now shows its record again by itself, with no reload', back && (await cuts(page)) === 1, `cuts ${await cuts(page)}`)
    check('the interruption is kept on this phone, counts and minutes alone', ((await kept(page))?.count ?? 0) >= 1, JSON.stringify(await kept(page)))
    await page.reload()
    await shown(page)
    let carried = 0
    for (let i = 0; i < 40 && !carried; i++) {
      carried = await page.evaluate(async (today) => {
        const dbx = await new Promise((res) => {
          const r = indexedDB.open('life-mirror')
          r.onsuccess = () => res(r.result)
        })
        const got = await new Promise((res) => {
          const q = dbx.transaction(['facts'], 'readonly').objectStore('facts').get(today)
          q.onsuccess = () => res(q.result)
        })
        dbx.close()
        return got?.sheet?.storageFault?.count ?? 0
      }, TODAY)
      if (!carried) await page.waitForTimeout(500)
    }
    check('the next start carries it on the facts row, beside the facts, for the Worker’s report', carried >= 1, `count ${carried}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await existingUser()
    await page.evaluate(() => sessionStorage.setItem('live.cut', 'open'))
    await page.reload()
    check('the storage cut while the database opens: Now shows its record, with no reload', (await shown(page)) && (await cuts(page)) === 1, `cuts ${await cuts(page)}`)
    const states = await ownersSteps(page)
    check('and the rest of the app reads and writes again: Location Context switches and holds', states === 'false,true,false,true' && (await shown(page)), states)
    await ctx.close()
  }
  {
    const { ctx, page } = await existingUser()
    await page.evaluate(() => sessionStorage.setItem('live.drop', '1'))
    await page.reload()
    const reading = page.getByTestId('now-reading')
    await reading.waitFor()
    const head = (await reading.locator('h1').textContent())?.trim()
    check('never an empty screen while Now reads: its head and a line', head === 'Now' && (await reading.textContent())?.includes('Reading the record on this phone.'), head)
    await page.getByTestId('now-read-again').waitFor({ timeout: 8000 })
    check('past its limit it says so, with Try again', (await reading.textContent())?.includes('taking longer than usual'))
    await page.evaluate(() => void (window.__dropping = false))
    await page.waitForTimeout(1000)
    const still = (await page.getByTestId('block-row').count()) === 0
    await page.getByTestId('now-read-again').click()
    check('a read dropped with no word waits for the tap, and Try again brings Now its record', still && (await shown(page)))
    check('the wait is kept with the read that had not answered', JSON.stringify((await kept(page))?.waited) === '["checkins"]', JSON.stringify(await kept(page)))
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error but the interruption’s own refusals', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
