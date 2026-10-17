// Pass 1B on the live site, in fresh throwaway contexts with stand-in records only: nothing touches
// the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set).
// node live-pass1b.mjs <expected short commit>
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = 'https://bill6006.github.io/life-mirror/'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch()
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)

async function fresh(when, scheme = 'dark') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
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
async function tapThrough(page) {
  const card = page.getByTestId('give-back')
  for (let i = 0; i < 40; i++) {
    if (await card.isVisible()) return true
    if (await page.getByTestId('outcome-ask').isVisible()) await page.getByRole('button', { name: 'Not now', exact: true }).click().catch(() => {})
    else if (await page.getByTestId('extras').isVisible()) await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {})
    else if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(0).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250)
  }
  return card.isVisible()
}

try {
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 14, 0))
    // The build stamp.
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.locator('.sub-head .back').click()
    // How firm, open: under Brain, Adaptive until chosen.
    await page.getByTestId('settings-brain').click()
    check('How firm is open under Settings → Brain', await seen(page.getByTestId('brain-firm')))
    check('How firm: Adaptive until chosen', (await page.getByTestId('brain-firm-adaptive').getAttribute('aria-pressed')) === 'true')
    await page.reload()
    await page.waitForTimeout(600)
    // The skill coach, open, with no cloud copy: Claude is never asked; the card offers Set one myself (since the cleanup of 2026-10-17).
    await tab(page, 'Aims')
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-certification').click()
    await page.getByTestId('aim-goal-input').fill('Orrish')
    await page.getByTestId('aim-learn-add').click()
    await seen(page.getByTestId('aim-card').filter({ hasText: 'Orrish' }))
    const asked = await page.getByTestId('coach-pending').or(page.getByTestId('coach-ask')).or(page.getByTestId('coach-suggestion')).count()
    check('the skill coach with no cloud copy asks nothing of Claude', asked === 0 && (await page.getByTestId('aim-skill-own').count()) === 1)
    const ord = page.getByTestId('aim-card').filter({ hasText: 'Orrish' })
    await ord.getByTestId('aim-skill-own').click()
    await ord.getByTestId('aim-skill-set-name').fill('Ten words')
    await ord.getByTestId('aim-skill-set-save').click()
    check('a skill set by hand becomes the step', await seen(ord.getByTestId('aim-step').filter({ hasText: 'Ten words' })))
    // The phone's own line, said at Adaptive's choice and saying so under Why.
    await tab(page, 'Now')
    await page.getByRole('button', { name: /Check in/ }).click()
    const through = await tapThrough(page)
    if (through) await page.getByRole('button', { name: 'Done', exact: true }).click()
    const line = page.getByTestId('brief').getByTestId('brief-line')
    check('a line is shown after the check-in', await seen(line), ((await line.textContent().catch(() => '')) ?? '').slice(0, 80))
    const card = page.getByTestId('brief')
    if (!(await card.getByTestId('brief-why-panel').isVisible())) await card.getByTestId('brief-why').click()
    const firm = card.getByTestId('brief-firmness')
    check('Why says how firmly the line was said', await seen(firm), ((await firm.textContent().catch(() => '')) ?? '').trim())
    const logged = await rowsOf(page, 'briefLog')
    check('the line is logged with its firmness', logged.some((l) => typeof l.firmness === 'string'), logged.map((l) => l.firmness ?? '-').join(','))
    const asks = await rowsOf(page, 'coachAsks')
    check('no ask was ever filed to travel to Claude', asks.every((a) => a.claude === false), `${asks.length} asks`)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== 'bill6006.github.io')
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || 'only bill6006.github.io')
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
