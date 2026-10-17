// The three UI cleanups (agreed 2026-10-17) on the live site, in fresh throwaway contexts with
// stand-in records only: nothing touches the owner's data, and nothing is sent anywhere but the site
// itself (no cloud token is ever set, so the skill coach shows its no-cloud form).
// node live-ui-cleanups.mjs <expected short commit>
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
async function rowsOf(page, store) {
  return page.evaluate(async (name) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const out = await new Promise((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return out
  }, store)
}

try {
  {
    // An evening: the build stamp, then the extras with Let it out.
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 21, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.locator('.sub-head .back').click()
    await tab(page, 'Now')
    await page.getByRole('button', { name: /Check in/ }).click()
    for (let i = 0; i < 40 && !(await page.getByTestId('extras').isVisible()); i++) {
      if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(2).click({ timeout: 3000 }).catch(() => {})
      else await page.waitForTimeout(250)
    }
    check('the evening extras are reached', await seen(page.getByTestId('extras')))
    check('Let it out sits in the note’s own card, under its line', await seen(page.locator('.note-card').getByTestId('journal-open')))
    const inked = await page.getByTestId('journal-open').locator('.d-label').evaluate((el) => getComputedStyle(el).color === getComputedStyle(document.body).color).catch(() => false)
    check('Let it out’s label is at full ink', inked)
    const opened = await page.getByTestId('journal-open').click({ timeout: 8000 }).then(() => true, () => false)
    check('opened, the box shows', opened && (await seen(page.getByTestId('journal-input'))))
    check('no explanatory line under it', !(await page.getByTestId('extras').textContent())?.includes('Never a reading, a score or a finding'))
    await ctx.close()
  }
  {
    // Aims: a learning goal with no skill asked for, its card, and the Social path's one Details row.
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 14, 0))
    await tab(page, 'Aims')
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-certification').click()
    check('the goal form asks Goal, Practice with and anything Claude should know', (await seen(page.getByText('Practice with', { exact: true }))) && (await seen(page.getByText('Optional: anything Claude should know', { exact: true }))))
    check('no skill is asked for with the goal', (await page.getByTestId('aim-skill-now-input').count()) === 0)
    await page.getByTestId('aim-goal-input').fill('Handstand')
    await page.getByTestId('aim-method-input').fill('A video course')
    await page.getByTestId('aim-learn-add').click()
    const card = page.getByTestId('aim-card').filter({ hasText: 'Handstand' })
    check('the card says No current skill yet', await seen(card.getByText('No current skill yet', { exact: true })))
    check('no "not practised yet" before there is a skill', !(await card.textContent())?.includes('not practised yet'))
    const asked = await page.getByTestId('coach-pending').or(page.getByTestId('coach-ask')).or(page.getByTestId('coach-suggestion')).count()
    check('with no cloud copy nothing is asked of Claude, and Set one myself is offered', asked === 0 && (await card.getByTestId('aim-skill-own').count()) === 1)
    // A step the cleanup added may be missing from an older build: it then fails as a check, never as a crash.
    const tap = (loc) => loc.click({ timeout: 8000 }).then(() => true, () => false)
    const set = (await tap(card.getByTestId('aim-skill-own'))) && (await card.getByTestId('aim-skill-set-name').fill('Wall holds', { timeout: 8000 }).then(() => true, () => false)) && (await tap(card.getByTestId('aim-skill-set-save')))
    check('Set one myself sets the skill', set && (await seen(card.getByTestId('aim-step').filter({ hasText: 'Wall holds' }))))
    check('Details is one line', (await card.getByTestId('aim-details').locator('.d-sub').count()) === 0)
    check('no closing note under the cards', !(await page.locator('#main').textContent())?.includes('nothing is graded'))
    const asks = await rowsOf(page, 'coachAsks')
    check('no ask was ever filed to travel to Claude', asks.every((a) => a.claude === false), `${asks.length} asks`)
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-path-social').click()
    const path = page.locator('[data-kind="path"]')
    check('the Social path card has one Details row', (await seen(path.first())) && (await path.locator('.disclosure').count()) === 1)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
