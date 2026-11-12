// One batch of small fixes (2026-11-12) on the live site, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data. No request leaves the browser but to the site itself: the one check that needs a cloud copy
// (the wipe) is answered by a stand-in inside the browser, with a made-up token.
// A commitment on a Path the phone does not know; a screen that throws while it is drawn; Delete everything and the
// token's homes; a private item's name under the name switch; what the week-ahead card says of its range.
// node live-phase1.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves the fault screen in each theme, to be looked at.
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const SHOTS = process.env.SHOTS ?? null
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
// CHROMIUM_PATH=<path> launches that browser instead of Playwright's own, where its own is not installed.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const text = (loc) => loc.textContent({ timeout: 5000 }).then((t) => (t ?? '').trim(), () => null)

/** A fresh phone at a moment; with `cloud`, the cloud database's address is answered inside the browser, holding nothing. */
async function fresh(when, { theme = null, cloud = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => {
    const host = new URL(r.url()).host
    if (!(cloud && /turso\.io$/.test(host))) hosts.add(host)
  })
  if (cloud) {
    await page.route(/turso\.io/, async (route) => {
      const req = route.request()
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' }
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      cloud.requests++
      const empty = { cols: [], rows: [], affected_row_count: 0, last_insert_rowid: null }
      const results = req.postDataJSON().requests.map((r) =>
        r.type === 'execute'
          ? { type: 'ok', response: { type: 'execute', result: empty } }
          : r.type === 'batch'
            ? { type: 'ok', response: { type: 'batch', result: { step_results: (r.batch?.steps ?? []).map(() => empty), step_errors: (r.batch?.steps ?? []).map(() => null) } } }
            : { type: 'ok', response: { type: r.type } },
      )
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ baton: null, base_url: null, results }) })
    })
  }
  await page.addInitScript((t) => {
    // The phone has read its cloud before, so its ids run from one.
    localStorage.setItem('lm.inStep', '1')
    if (t) localStorage.setItem('life-mirror.theme', t)
  }, theme)
  if (when) await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  return { ctx, page }
}
const tab = async (page, name) => {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
}
/** Writes rows straight into one of the phone's stores; returns their keys. */
const put = (page, store, rows) =>
  page.evaluate(
    async ({ name, list }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      const keys = []
      for (const row of list) {
        const q = tx.objectStore(name).put(row)
        q.onsuccess = () => keys.push(q.result)
      }
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
      return keys
    },
    { name: store, list: rows },
  )
const rowsOf = (page, store) =>
  page.evaluate(async (name) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return rows
  }, store)
const patchSettings = async (page, patch) => put(page, 'settings', [{ ...((await rowsOf(page, 'settings'))[0] ?? { id: 1 }), ...patch }])
const aimOn = (path) => ({ kind: 'path', path, name: null, stepMoveId: null, createdAt: '2026-11-01T12:00:00.000Z', archivedAt: null })
const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const AFTERNOON = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/** Complete check-ins for the days before `today`, every reading at one level; `evening` adds to each evening's extras. */
function checkins(today, days, evening = () => ({})) {
  const out = []
  for (let d = days; d >= 1; d--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d)
    const at = (hour) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 40).toISOString()
    const answers = (ids) => Object.fromEntries(ids.map((id) => [id, ['mood', 'energy', 'focus'].includes(id) ? 4 : ['stress', 'overwhelm', 'irritation'].includes(id) ? 2 : 3]))
    out.push({ day: dayOf(date), block: 'morning', asked: MORNING, startedAt: at(7), completedAt: at(7), updatedAt: at(7), answers: answers(MORNING), activeMs: 60_000 })
    out.push({ day: dayOf(date), block: 'afternoon', asked: AFTERNOON, startedAt: at(13), completedAt: at(13), updatedAt: at(13), answers: answers(AFTERNOON), activeMs: 60_000 })
    out.push({ day: dayOf(date), block: 'evening', asked: EVENING, startedAt: at(19), completedAt: at(19), updatedAt: at(19), answers: answers(EVENING), activeMs: 60_000, ...evening(d) })
  }
  return out
}
const faults = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('life-mirror.screen.faults') ?? 'null'))
const TOKEN_KEYS = ['lm.cloudToken', 'lm.cloudTokenMark', 'lm.cloudTokenLog', 'lm.cloudDevice']
const tokenHomes = (page) => page.evaluate((keys) => keys.filter((k) => localStorage.getItem(k) !== null), TOKEN_KEYS)

try {
  {
    // The build stamp; then a commitment on a Path this phone does not know, beside one it knows.
    const NOW = new Date(2026, 10, 10, 13, 30)
    const { ctx, page } = await fresh(NOW)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await put(page, 'aims', [aimOn('gen-not-here-yet'), aimOn('social')])
    await page.reload()
    // Wait for each thing before counting it: the rows are drawn after their reads answer.
    await seen(page.locator('[data-kind="path"]').first())
    check('Now draws, with the one People row the known Path gives', (await seen(page.getByRole('button', { name: /Check in/ }))) && (await page.locator('[data-kind="path"]').count()) === 1)
    await tab(page, 'Aims')
    await seen(page.locator('[data-path="social"]'))
    check('Aims draws the known Path’s card and nothing for the other', (await page.locator('[data-kind="path"]').count()) === 1 && (await page.getByTestId('path-waiting').count()) === 0)
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click()
    await seen(page.getByTestId('path-evidence-reps').first())
    check('Evidence draws, its Path reps naming the known Path alone', (await seen(page.getByTestId('evidence'))) && (await page.getByTestId('path-evidence-reps').count()) === 1)
    check('no screen said it could not be shown, and none was kept as failed', (await page.getByTestId('screen-fault').count()) === 0 && (await faults(page)) === null)
    await ctx.close()
  }
  for (const theme of ['nocturne', 'instrument', 'signal']) {
    // A screen made to throw: the commitment's Path goes missing under the open list, and its row is tapped.
    const { ctx, page } = await fresh(new Date(2026, 10, 10, 13, 30), { theme })
    const [aimId] = await put(page, 'aims', [aimOn('social')])
    await page.reload()
    await tab(page, 'Aims')
    const card = page.locator('[data-path="social"]')
    await seen(card)
    await put(page, 'aims', [{ ...aimOn('gone-from-the-phone'), id: aimId }])
    await card.getByTestId('path-change').first().click({ timeout: 5000 }).catch(() => {})
    const fault = page.getByTestId('screen-fault')
    check(`${theme}: a screen that throws says so in a plain line`, (await seen(fault)) && ((await text(fault)) ?? '').includes('This screen could not be shown just now.'))
    check(`${theme}: with Try again and, over the tabs, Close`, (await seen(page.getByTestId('screen-fault-again'), 2000)) && (await seen(page.getByTestId('screen-fault-leave'), 2000)))
    const kept = await faults(page)
    check(`${theme}: the fault is kept by count, screen and the error’s name alone`, kept?.count === 1 && kept?.name === 'Error' && kept?.screen === 'pathChange' && !JSON.stringify(kept).includes('gone-from-the-phone'), JSON.stringify(kept))
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fault-${theme}.png` })
    await put(page, 'aims', [{ ...aimOn('social'), id: aimId }])
    // A build without the guard has no such button: its check fails, and the script goes on.
    await page.getByTestId('screen-fault-again').click({ timeout: 3000 }).catch(() => {})
    check(`${theme}: Try again draws the screen once the fault is gone`, (await seen(page.getByTestId('path-change-screen'))) && (await fault.count()) === 0)
    await ctx.close()
  }
  {
    // Delete everything, with a made-up token kept in both homes and a stand-in cloud that holds nothing.
    const cloud = { requests: 0 }
    const { ctx, page } = await fresh(null, { cloud })
    await tab(page, 'Settings')
    await page.getByTestId('settings-cloud').click()
    await page.getByTestId('token-input').fill('stand-in-token-never-real')
    await page.getByTestId('token-keep').click()
    for (let i = 0; i < 40 && ((await tokenHomes(page)).length < 4 || cloud.requests === 0); i++) await page.waitForTimeout(250)
    check('before the wipe the token is in both homes, with its mark, its log and the device id', (await tokenHomes(page)).length === 4 && (await rowsOf(page, 'settings'))[0]?.cloud?.token === 'stand-in-token-never-real', (await tokenHomes(page)).join(', '))
    await page.evaluate(() => localStorage.setItem('another-app.choice', 'kept'))
    await page.goto(LIVE)
    await tab(page, 'Settings')
    await page.getByTestId('settings-data').click()
    await page.getByTestId('delete-start').click()
    await page.getByTestId('delete-word').fill('delete')
    await page.getByTestId('delete-confirm').click()
    await page.waitForTimeout(1200)
    await seen(page.getByRole('button', { name: /Check in/ }))
    check('after Delete everything none of the four is left', (await tokenHomes(page)).length === 0, (await tokenHomes(page)).join(', ') || 'none left')
    check('another app’s key at the same address is untouched', (await page.evaluate(() => localStorage.getItem('another-app.choice'))) === 'kept')
    const asked = cloud.requests
    await page.reload()
    await seen(page.getByRole('button', { name: /Check in/ }))
    await page.waitForTimeout(1500)
    check('after a restart no token is back in the settings, and nothing is asked of the cloud', ((await rowsOf(page, 'settings'))[0]?.cloud?.token ?? null) === null && (await tokenHomes(page)).length === 0 && cloud.requests === asked)
    await ctx.close()
  }
  {
    // A private item on Evidence, with "Use private items to pick moves" on: named only while the name switch is on.
    const NOW = new Date(2026, 10, 10, 13, 30)
    const { ctx, page } = await fresh(NOW)
    const [itemId] = await put(page, 'privateItems', [{ name: 'Stand-in item', createdAt: '2026-10-20T12:00:00.000Z', archived: 0 }])
    await put(page, 'checkins', checkins(NOW, 12, (d) => ({ extras: { privateShown: { [String(itemId)]: true }, ...(d % 2 === 0 ? { private: { [String(itemId)]: true } } : {}) } })))
    await patchSettings(page, { privateInSelection: true, showPrivate: false })
    const open = async () => {
      await page.reload()
      await tab(page, 'Moves')
      await page.getByRole('button', { name: /^Evidence/ }).click()
      await seen(page.getByTestId('evidence'))
      return text(page.getByTestId('private-association'))
    }
    const off = await open()
    check('the name switch off: Evidence says "A private item", never its name', (off ?? '').startsWith('A private item: ') && !((await text(page.getByTestId('evidence'))) ?? 'Stand-in item').includes('Stand-in item'), off ?? 'no line')
    await patchSettings(page, { showPrivate: true })
    const on = await open()
    check('the name switch on: the same line names it', (on ?? '').startsWith('Stand-in item: '), on ?? 'no line')
    await ctx.close()
  }
  {
    // The week-ahead card: how its range is built until twenty day-ahead forecasts are scored, then what was counted.
    const NOW = new Date(2026, 8, 30, 12, 0)
    const { ctx, page } = await fresh(NOW)
    await put(page, 'checkins', checkins(NOW, 35))
    const model = async () => {
      await page.reload()
      await tab(page, 'Mirror')
      await page.getByRole('button', { name: /^The weekly view/ }).click()
      return text(page.getByTestId('week-ahead-model'))
    }
    const built = await model()
    check('with no forecast scored, the card says how its range is built, and no rate', (built ?? '').includes('Its range is sized from its own misses over those weeks') && !(built ?? 'landed inside').includes('landed inside'), built ?? 'no line')
    const scores = Array.from({ length: 20 }, (_, i) => {
      const day = dayOf(new Date(2026, 8, 29 - i))
      return { day, block: 'morning', horizon: 1, model: 'sameSlot', point: 75, lo: 70, hi: 80, actual: i < 13 ? 75 : 60, error: i < 13 ? 0 : -15, hit: i < 13, scoredOn: day }
    })
    await put(page, 'forecastScores', scores)
    const measured = await model()
    check('with twenty scored, it says how many landed inside their range, as counted', (measured ?? '').includes('Of 20 day-ahead forecasts scored so far, 13 landed inside their range (65 percent).'), measured ?? 'no line')
    await ctx.close()
  }
} finally {
  await browser.close()
}

check('the page reached no host but the site itself', [...hosts].every((h) => h === SITE), `only ${[...hosts].join(', ')}`)
check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
const passed = results.filter((r) => r.startsWith('PASS')).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
