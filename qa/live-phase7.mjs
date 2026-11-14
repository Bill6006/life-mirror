// "Coach me on everything" covers everything, on the live site (Phase 7, 2026-11-14), in a fresh throwaway context
// with stand-in records only: nothing touches the owner's data, and no request leaves the browser but to the site
// itself. The phone's side alone: the build stamp, and the Brain screen's names for the deep tier's two new reads.
// The Worker's side (the write-ups and the month under way served to the deep tier) is checked by its own run by hand.
// node live-phase7.mjs <expected short commit>
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
const text = (loc) => loc.textContent({ timeout: 8000 }).then((t) => (t ?? '').trim(), () => null)

/** A fresh phone at a moment. */
async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => {
    // The phone has read its cloud before, so its ids run from one.
    localStorage.setItem('lm.inStep', '1')
  })
  await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  return { ctx, page }
}
const tab = async (page, name) => {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
}
/** Writes rows straight into one of the phone's stores. */
const put = (page, store, rows) =>
  page.evaluate(
    async ({ name, list }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      for (const row of list) tx.objectStore(name).put(row)
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { name: store, list: rows },
  )
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const openBrain = async (page) => {
  await tab(page, 'Settings')
  await page.getByRole('button', { name: /^Brain/ }).click()
  await seen(page.getByTestId('brain-reads'))
}
const start = async (page) => {
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
}

try {
  {
    // The build stamp.
    const { ctx, page } = await fresh(new Date(2026, 10, 12, 19, 5))
    await start(page)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    // What Claude read: the deep tier's reads of the write-ups and of the month so far, named, by count and size.
    const NOW = new Date(2026, 10, 12, 19, 5)
    const TODAY = dayOf(NOW)
    const { ctx, page } = await fresh(NOW)
    await start(page)
    // Before any such read is logged, the screen names none: the probe below can say yes.
    await openBrain(page)
    const before = (await text(page.getByTestId('brain-screen'))) ?? ''
    check('with no such read logged, the Brain screen names neither', !before.includes('Lookup: your monthly write-ups') && !before.includes('Lookup: this month so far'), before.includes('Lookup:') ? 'a lookup is named' : 'none named')
    await put(page, 'brainReads', [
      { id: 'read:deep:200', day: TODAY, at: new Date(2026, 10, 12, 12, 5).toISOString(), task: 'deep', category: 'lookup.writeups', count: 24, bytes: 6144, via: 'context' },
      { id: 'read:deep:201', day: TODAY, at: new Date(2026, 10, 12, 12, 6).toISOString(), task: 'deep', category: 'lookup.monthSoFar', count: 131, bytes: 22528, via: 'context' },
    ])
    await page.reload()
    await openBrain(page)
    const group = (await text(page.getByTestId('brain-read-group').first())) ?? ''
    check('the Brain screen names the read of the write-ups by its count and size, under the deep tier', group.includes('“Coach me on everything”') && group.includes('Lookup: your monthly write-ups 24, 6.0 KB'), group.slice(0, 120))
    check('the Brain screen names the read of the month so far by its count and size', group.includes('Lookup: this month so far 131, 22.0 KB'), group.slice(0, 120))
    check('no read is shown by its raw name', !group.includes('lookup.'), group.slice(0, 120))
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
