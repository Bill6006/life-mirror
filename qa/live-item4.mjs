// Item 4 (2026-10-23) on the live site, in fresh throwaway contexts with stand-in records only: nothing touches the owner's
// data, no position of anyone's is read (the phone's location is stood in for), and nothing is sent anywhere but the site.
// Location Context: a phone giving only an approximate location (2 km) is told so as naming reads, then plainly, with the
// steps to allow a precise one; daylight keeps it. Nothing extra: its card says ordinary life goes ahead and nothing is
// asked; the next check-in asks nothing of it and closes it with no answer written. Ask: a failed answer is said by its
// kind, its reasons folded, its thread "no checked answer"; a question naming no finding is told so.
// node live-item4.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const SHOTS = process.argv[3] ?? null
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}
const idb = (page, fn, arg) =>
  page.evaluate(
    async ({ src, arg }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      // eslint-disable-next-line no-new-func
      const out = await new Function('dbx', 'arg', `return (${src})(dbx, arg)`)(dbx, arg)
      dbx.close()
      return out
    },
    { src: fn.toString(), arg },
  )
const rowsOf = (page, store) =>
  idb(page, (dbx, name) => new Promise((res, rej) => {
    const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  }), store)

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  if (opts.approximate) {
    // The phone's location service, stood in for: every reading 2 km across, fresh; permission given.
    await page.addInitScript(() => {
      const at = () => ({ coords: { latitude: 40.7, longitude: -74, accuracy: 2000 }, timestamp: Date.now() })
      const g = navigator.geolocation
      g.getCurrentPosition = (ok) => setTimeout(() => ok(at()), 0)
      g.watchPosition = (ok) => {
        setTimeout(() => ok(at()), 10)
        return 1
      }
      g.clearWatch = () => undefined
      const query = navigator.permissions.query.bind(navigator.permissions)
      navigator.permissions.query = (d) => (d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : query(d))
    })
  }
  if (opts.clock) await page.clock.install({ time: opts.clock })
  else if (opts.fixed) await page.clock.setFixedTime(opts.fixed)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.waitForTimeout(400)
  return { ctx, page }
}
const tab = async (page, name) => {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
}

/** Opens the check-in and taps the middle of every reading until the card after it; returns whether a question about a move came first. */
async function checkIn(page) {
  await page.getByRole('button', { name: /Check in/ }).click()
  let asked = false
  for (let i = 0; i < 30; i++) {
    if (await page.getByTestId('give-back').isVisible()) return asked
    if (await page.getByTestId('outcome-ask').isVisible()) {
      asked = true
      await page.getByRole('button', { name: /^(Not now|Leave it unanswered)$/ }).click()
      await page.waitForTimeout(300)
      continue
    }
    if (await page.getByTestId('extras').isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      continue
    }
    const title = await page.locator('#ci-title').textContent({ timeout: 3000 }).catch(() => null)
    if (title === null) {
      await page.waitForTimeout(300)
      continue
    }
    await page.getByTestId('anchor').nth(2).click({ timeout: 5000 }).catch(() => undefined)
    await page.locator('#ci-title', { hasNotText: title }).or(page.getByTestId('give-back')).or(page.getByTestId('outcome-ask')).first().waitFor({ timeout: 8000 }).catch(() => undefined)
  }
  return asked
}

try {
  {
    // The build first.
    const { ctx, page } = await fresh()
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    // Location Context on a phone that gives only an approximate location; the page's clock runs the waits.
    const { ctx, page } = await fresh({ approximate: true, clock: new Date(2026, 9, 20, 14, 0) })
    await tab(page, 'Settings')
    await page.getByTestId('settings-location').click()
    await page.getByTestId('location-switch').click()
    await page.clock.runFor(16_000)
    const help = page.getByTestId('location-approximate')
    await help.waitFor({ timeout: 10000 }).catch(() => undefined)
    check('an approximate location is said plainly once read, and daylight keeps it', (await text(help)).startsWith('Your phone gives Life Mirror only an approximate location, about 2 km across. Daylight uses it as it is'))
    await page.getByTestId('location-precise-open').click()
    const steps = page.getByTestId('location-precise-steps')
    const stepsText = await text(steps)
    check('the steps to allow a precise location name this site and the Android setting, and clear nothing', stepsText.includes(`Site settings › Location › ${SITE}`) && stepsText.includes('Settings › Apps › Chrome › Permissions › Location') && stepsText.includes('Nothing in Life Mirror needs clearing or reinstalling.'), stepsText.slice(0, 90))
    await shot(help, 'item4-location-approximate')
    await page.getByTestId('location-name-home').click()
    const status = page.getByTestId('location-name-status')
    await page.clock.runFor(500)
    check('naming says, as it reads, that the phone gives an approximate location', (await text(status)).startsWith('Still reading: the phone is giving an approximate location, 2000 metres across'))
    await page.clock.runFor(31_000)
    await page.waitForTimeout(300)
    check('naming ends saying the location was only approximate, never a window to try', (await text(status)).startsWith('Not named: the phone gave only an approximate location, about 2 km across'), await text(status))
    check('no place is named from it', !(await text(page.getByTestId('location-places'))).includes('Home'))
    await ctx.close()
  }
  {
    // Nothing extra: the morning's draw stood in by it; the afternoon's check-in.
    const { ctx, page } = await fresh({ fixed: new Date(2026, 9, 22, 9, 5) })
    await checkIn(page)
    await idb(page, (dbx) => new Promise((res) => {
      const store = dbx.transaction(['offers'], 'readwrite').objectStore('offers')
      const q = store.getAll()
      q.onsuccess = () => {
        for (const o of q.result.filter((x) => x.day === '2026-10-22' && x.block === 'morning' && x.kind === 'block')) store.put({ ...o, moveId: 'nothing', passiveId: null })
        setTimeout(res, 50)
      }
    }))
    await page.reload()
    const card = page.getByTestId('move-card')
    const cardText = await text(card)
    check('Nothing extra’s card: ordinary life goes ahead, and nothing is asked about it', (await text(card.getByTestId('move-name'))) === 'Nothing extra' && cardText.includes('live it as you normally would') && cardText.includes('Nothing is asked about it at your next check-in.'))
    await shot(card, 'item4-nothing-extra-card')
    await page.clock.setFixedTime(new Date(2026, 9, 22, 13, 5))
    await page.reload()
    const asked = await checkIn(page)
    const morning = (await rowsOf(page, 'offers')).find((o) => o.day === '2026-10-22' && o.block === 'morning' && o.moveId === 'nothing')
    const answered = (await rowsOf(page, 'outcomes')).some((x) => x.offerId === morning?.id)
    check('the next check-in asks nothing of it, and closes it with no answer written', !asked && Boolean(morning?.closedAt) && !answered, JSON.stringify({ asked, closed: Boolean(morning?.closedAt), answered }))
    await ctx.close()
  }
  {
    // Ask: two failed answers, as the owner's turns stood, and a broad question with none named.
    const { ctx, page } = await fresh({ fixed: new Date(2026, 9, 23, 13, 0) })
    await idb(page, (dbx) => new Promise((res, rej) => {
      const tx = dbx.transaction(['askThreads', 'askTurns', 'askAnswers'], 'readwrite')
      const at = '2026-10-23T16:00:00.000Z'
      const day = '2026-10-23'
      const add = (store, v) => new Promise((r) => {
        const q = tx.objectStore(store).add(v)
        q.onsuccess = () => r(q.result)
      })
      ;(async () => {
        const thread = await add('askThreads', { day, at, title: 'Is there anything I might not have noticed?', from: { kind: 'typed' } })
        const turn = await add('askTurns', { threadId: thread, day, at, question: 'Is there anything you can tell me that I might not have noticed?', tier: 'standard', state: 'answered', kind: 'typed', version: 'earlier', cited: [], updatedAt: at })
        tx.objectStore('askAnswers').put({ id: `turn:${turn}`, turnId: turn, threadId: thread, day, at, status: 'failed', reason: 'says "gave you" of an association in the record', kind: 'checks', reasons: ['gives a reason for how the app was used as a fact', 'says "gave you" of an association in the record'] })
      })()
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    }))
    await page.reload()
    await tab(page, 'Mirror')
    await page.getByTestId('ask-open').click()
    const row = page.getByTestId('ask-thread-row').first()
    await page.waitForTimeout(800)
    check('a failed answer’s thread says no checked answer, never answered', (await text(row)).includes('no checked answer'), await text(row))
    await row.click()
    check('the failure is said by its kind: the checks held back each draft, nothing unchecked shown', (await text(page.getByTestId('ask-no-checked'))).startsWith('No checked answer: Claude wrote one, and the evidence checks held back') && (await page.getByTestId('ask-claude').count()) === 0)
    await page.getByTestId('ask-failed-why-open').click()
    const why = await text(page.getByTestId('ask-failed-why'))
    check('what the checks held back, each draft’s reasons, folded beneath', why.includes('Draft 1: gives a reason for how the app was used as a fact') && why.includes('Draft 2: says "gave you"'), why.slice(0, 80))
    check('a question naming no finding is told so, never that the record holds nothing', (await text(page.getByTestId('ask-matches'))).startsWith('Its words name no finding') && !(await text(page.getByTestId('ask-matches'))).includes('No finding matches'))
    await shot(page.getByTestId('ask-turn'), 'item4-ask-failed')
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
