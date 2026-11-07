// The polish pass (2026-11-07) on the live site, in fresh throwaway contexts with stand-in records only: nothing touches
// the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set).
// The sweets hint under the question on the afternoon's card and in the evening's list; Now's five effort figures as one
// set in every theme at the phone's width, a narrower phone and text at 130 percent.
// node live-polish.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const HINT = 'Sweets, desserts, sugary drinks or juice. Whole fruit doesn’t count.'
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

async function fresh(when, theme = null) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  if (theme) await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
  await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  return { ctx, page }
}
const tab = async (page, name) => {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
}
/** Taps through a check-in until the screen named shows: the readings, Not now on any question, Done on the extras. */
async function through(page, until) {
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId(until).isVisible()) return true
    if (await page.getByTestId('outcome-ask').isVisible()) {
      await page.getByRole('button', { name: /^(Not now|Leave it unanswered)$/ }).click()
      await page.waitForTimeout(300)
      continue
    }
    if (until !== 'extras' && (await page.getByTestId('extras').isVisible())) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      continue
    }
    if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(2).click({ timeout: 3000 }).catch(() => {})
    else await page.waitForTimeout(250)
  }
  return page.getByTestId(until).isVisible()
}
/** An element's words, or null when it never shows: a build without it fails its check rather than stopping the script. */
const text = (loc) => loc.textContent({ timeout: 5000 }).then((t) => (t ?? '').trim(), () => null)
/** The hint's words start where the question's do: past the chip's mark; null when there is no hint. */
const offset = (li) =>
  li
    .evaluate((el) => {
      const hint = el.querySelector('[data-testid="sweet-hint"]')
      if (!hint) return null
      const r = document.createRange()
      r.selectNodeContents(hint)
      return Math.round(r.getClientRects()[0].left - el.querySelector('.row-main').getBoundingClientRect().left)
    })
    .catch(() => null)
/** How the five figures lie: the lines they make, the room they are given, their widths, and whether they stay in it. */
const laid = (sheet) =>
  sheet.evaluate((el) => {
    const chips = [1, 2, 3, 4, 5].map((n) => el.querySelector(`[data-testid="path-effort-${n}"]`).getBoundingClientRect())
    const tops = [...new Set(chips.map((c) => Math.round(c.top)))].sort((a, b) => a - b)
    // The room is the sheet's own width, which the figures' container fills: the same measure on any build.
    const box = el.getBoundingClientRect()
    return {
      room: box ? Math.round(box.width) : 0,
      lines: tops.map((t) => chips.filter((c) => Math.round(c.top) === t).length),
      narrowest: Math.min(...chips.map((c) => Math.round(c.width))),
      inside: Boolean(box) && chips.every((c) => c.left >= box.left - 0.5 && c.right <= box.right + 0.5),
    }
  })

try {
  {
    // An afternoon: the build stamp, then Something sweet on the summary with what counts under it.
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 14, 5))
    await page.getByTestId('direction-input').fill('One line, mine')
    await page.getByRole('button', { name: 'Keep it', exact: true }).click()
    await page.waitForTimeout(400)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.locator('.sub-head .back').click()
    await tab(page, 'Now')
    await page.getByRole('button', { name: /Check in/ }).click()
    check('the afternoon summary is reached', await through(page, 'give-back'))
    const li = page.locator('li[data-chip="sweet"]')
    check('the afternoon asks Something sweet', await seen(li.getByTestId('chip-sweet')))
    await li.scrollIntoViewIfNeeded()
    check('what counts is said under it, in the owner’s words', (await text(li.getByTestId('sweet-hint'))) === HINT)
    check('the question alone stays the button’s words', !((await text(li.getByTestId('chip-sweet'))) ?? 'Whole fruit').includes('Whole fruit'))
    check('the hint sits in line with the question’s words', (await offset(li)) === 0, `${await offset(li)} px`)
    // The evening's list asks it too, with the same words under it.
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
    await page.reload()
    await page.getByRole('button', { name: /Check in/ }).click()
    check('the evening extras are reached', await through(page, 'extras'))
    const eve = page.getByTestId('extras').locator('li[data-chip="sweet"]')
    await eve.scrollIntoViewIfNeeded()
    check('the evening’s list says what counts under it too', (await text(eve.getByTestId('sweet-hint'))) === HINT)
    check('there too, in line with the question’s words', (await offset(eve)) === 0, `${await offset(eve)} px`)
    await ctx.close()
  }
  for (const theme of ['nocturne', 'instrument', 'signal']) {
    // A Monday morning: the speaking Path started, a rep done on Now, and its sheet's five figures at three widths.
    const { ctx, page } = await fresh(new Date(2026, 10, 9, 9, 5), theme)
    await tab(page, 'Aims')
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-path-speaking').click()
    await page.getByTestId('path-read-start').click()
    await page.getByTestId('path-start-focus-speaking').click()
    await page.getByTestId('path-start-begin').click()
    await tab(page, 'Now')
    const row = page.locator('[data-kind="path"]')
    await row.getByTestId('aim-start').click()
    await row.getByTestId('path-predict-input').fill('I will rush the ending')
    await row.getByTestId('path-predict-start').click()
    await row.getByTestId('aim-done').click()
    const sheet = row.getByTestId('path-sheet')
    check(`${theme}: the rep's sheet asks how hard, one to five`, await seen(sheet.getByTestId('path-effort-5')))
    for (const width of [390, 360, 300]) {
      await page.setViewportSize({ width, height: 844 })
      await page.waitForTimeout(300)
      const l = await laid(sheet)
      const want5 = l.room >= 256
      const ok = l.narrowest === 48 && l.inside && JSON.stringify(l.lines) === JSON.stringify(want5 ? [5] : [3, 2]) && (width !== 390 || want5)
      check(`${theme} at ${width}: the five read as one set, never one alone`, ok, `room ${l.room}, lines ${l.lines.join('+')}, narrowest ${l.narrowest}${l.inside ? '' : ', past its room'}`)
    }
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
