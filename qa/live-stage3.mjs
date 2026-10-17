// Stage 3 on the live site, in fresh throwaway contexts with stand-in records only: nothing touches the
// owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set).
// Group 3, in the moment: Anything going on? after a two-step drop, and the evening's matching pattern.
// node live-stage3.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
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
// CHROMIUM_PATH=<path> launches that browser instead of Playwright's own, where its own is not installed.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)

async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(when)
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

/**
 * Stand-in check-ins: evenings from Aug 27 to Sep 19, every other one with Stress at its top phrase and
 * the morning after it lower; on Sep 20 a morning two steps down on Mood from the evening before, and an
 * evening with Stress high.
 */
async function seed(page) {
  await page.evaluate(async () => {
    const blocks = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins'], 'readwrite')
    const store = tx.objectStore('checkins')
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const put = (date, block, over) => {
      const answers = {}
      for (const id of blocks[block]) answers[id] = over[id] ?? 3
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
      const done = new Date(at.getTime() + 95_000).toISOString()
      store.add({ day: key(date), block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
    }
    for (let i = 0; i < 24; i++) {
      const stressed = i % 2 === 0
      put(new Date(2026, 7, 27 + i), 'evening', stressed ? { stress: 5 } : {})
      if (i < 23) put(new Date(2026, 7, 28 + i), 'morning', stressed ? { mood: 2, energy: 2, focus: 2, stress: 4, overwhelm: 4, irritation: 4 } : {})
    }
    put(new Date(2026, 8, 20), 'morning', { mood: 1 })
    put(new Date(2026, 8, 20), 'evening', { stress: 5 })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
  await page.waitForTimeout(600)
}

try {
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 20, 21, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await seed(page)
    await tab(page, 'Now')
    // A morning two steps down on Mood: one optional line, writing the morning's own note.
    const opened = await page.getByRole('button', { name: /^Morning Logged/ }).click({ timeout: 8000 }).then(() => true, () => false)
    check('the morning after a two-step drop asks Anything going on?', opened && (await seen(page.getByTestId('behind-it').filter({ hasText: 'Anything going on?' }))))
    const typed = await page.getByTestId('behind-input').fill('A stand-in line', { timeout: 8000 }).then(() => true, () => false)
    if (typed) await page.getByTestId('behind-input').blur()
    await page.waitForTimeout(500)
    const note = await page.evaluate(async () => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const rows = await new Promise((res, rej) => {
        const q = dbx.transaction(['checkins'], 'readonly').objectStore('checkins').getAll()
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      dbx.close()
      return rows.find((r) => r.day === '2026-09-20' && r.block === 'morning')?.extras?.note ?? null
    })
    check('it writes the morning’s own note', note === 'A stand-in line', String(note))
    // The evening with Stress high: the one pattern it matches, as Mirror words it, and no Anything going on?.
    await page.reload()
    await tab(page, 'Now')
    const evening = await page.getByRole('button', { name: /^Evening Logged/ }).click({ timeout: 8000 }).then(() => true, () => false)
    const card = page.getByTestId('pattern-card')
    check('the evening shows Evenings like this one', evening && (await seen(card.filter({ hasText: 'After an evening with stress high' }))))
    check('worded as an association, never a cause', ((await card.textContent().catch(() => '')) ?? '').includes('an association, never a cause'))
    check('the evening never asks Anything going on?', (await page.getByTestId('behind-it').count()) === 0)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
