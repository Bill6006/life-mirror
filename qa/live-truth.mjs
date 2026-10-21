// The record's comparisons said truthfully (2026-10-21, before Item 3), on the live site, in fresh throwaway contexts with
// stand-in records only: nothing touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is
// ever set). An evening chip's answer says "started the same" only when the evenings that carried it and the evenings that did
// not shared a band; when they shared none it says what the record holds and that nothing is set against it yet.
// node live-truth.mjs <expected short commit>
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
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const text = async (loc) => ((await loc.textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()

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

/** Six evenings with their mornings after: the napped ones' mornings high, the others' low; their evenings apart, or all level. */
async function seed(page, level) {
  await page.evaluate(async (level) => {
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
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const put = (date, block, p, extras) => {
      const answers = {}
      for (const id of blocks[block]) answers[id] = ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
      const done = new Date(at.getTime() + 95_000).toISOString()
      tx.objectStore('checkins').add({ day: key(date), block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000, ...(extras ? { extras } : {}) })
    }
    ;[1, 3, 5, 7, 9, 11].forEach((d, i) => {
      const napped = i % 2 === 0
      put(new Date(2026, 8, d), 'evening', level ? 3 : napped ? 5 : 1, napped ? { napped: true } : undefined)
      put(new Date(2026, 8, d + 1), 'morning', napped ? 4 : 2)
    })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, level)
}

/** Opens the check-in and taps the middle of every reading until the evening's extras; any move asked about is left. */
async function toExtras(page) {
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 30; i++) {
    const end = page.getByTestId('extras')
    if (await end.isVisible()) return true
    const ask = page.getByTestId('outcome-ask')
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: /^(Not now|Leave it unanswered)$/ }).click()
      await page.waitForTimeout(300)
      continue
    }
    const title = await page.locator('#ci-title').textContent({ timeout: 3000 }).catch(() => null)
    if (title === null) {
      await page.waitForTimeout(300)
      continue
    }
    await page.getByTestId('anchor').nth(2).click({ timeout: 5000 }).catch(() => undefined)
    await page.locator('#ci-title', { hasNotText: title }).or(end).or(ask).first().waitFor({ timeout: 8000 }).catch(() => undefined)
  }
  return page.getByTestId('extras').isVisible()
}

/** The napped chip's answer at this evening's check-in, on a record whose evenings are apart or level. */
async function nappedAnswer(level, stamp) {
  const { ctx, page } = await fresh(new Date(2026, 8, 15, 19, 5))
  if (stamp) {
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  }
  await seed(page, level)
  await page.reload()
  const reached = await toExtras(page)
  const chip = page.getByTestId('extras').getByTestId('chip-napped')
  await chip.click({ timeout: 8000 }).catch(() => undefined)
  const answer = await text(page.getByTestId('extras').getByTestId('chip-answer').first())
  await ctx.close()
  return { reached, answer }
}

try {
  {
    const { reached, answer } = await nappedAnswer(false, true)
    check('evenings that shared no band: the answer says nothing is set against it, never "started the same"', reached && /^3 times before\. The morning after read \d+ \(3\); nothing yet to set it against\.$/.test(answer) && !answer.includes('started the same'), answer)
  }
  {
    const { reached, answer } = await nappedAnswer(true, false)
    check('evenings that started the same: the answer says so, with both sides', reached && /^3 times before\. The morning after read \d+, against \d+ after evenings that started the same \(3 and 3\)\.$/.test(answer), answer)
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
