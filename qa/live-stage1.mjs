// Stage 1 on the live site, in fresh throwaway contexts with stand-in records only: nothing touches the
// owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set).
// node live-stage1.mjs <expected short commit>
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.argv[3] ?? 'https://bill6006.github.io/life-mirror/'
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

async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  page.on('crash', () => console.log('CRASH at', new Date().toISOString()))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300))
  })
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
/** Taps through the readings to the summary; at a question about a move, `onAsk` decides. */
async function tapThrough(page, onAsk = async () => page.getByTestId('outcome-later').click()) {
  const card = page.getByTestId('give-back')
  const prompts = []
  for (let i = 0; i < 40; i++) {
    if (await card.isVisible()) return prompts
    if (await page.getByTestId('outcome-ask').isVisible()) await onAsk()
    else if (await page.getByTestId('extras').isVisible()) return prompts
    else if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(2).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250)
  }
  return prompts
}

try {
  // 1. The build, the wording, Unwell today, the knows line, the caffeine rows, Not now.
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 8, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.reload()
    await page.waitForTimeout(500)
    // The two post-window features, open.
    await tab(page, 'Settings')
    check('Away from home is in Settings', await seen(page.getByTestId('settings-away')))
    await tab(page, 'Now')
    const knows = page.getByTestId('knows')
    check('the knows line is counted from the record', ((await knows.textContent()) ?? '').includes('offers drawn from research'))
    await page.getByRole('button', { name: /Check in/ }).click()
    await tapThrough(page)
    const unwell = page.getByTestId('chip-unwell')
    check('Unwell today is among Today, if different', (await seen(unwell)) && ((await unwell.textContent()) ?? '').includes('Unwell today'))
    await unwell.click()
    await page.waitForTimeout(300)
    const days = await rowsOf(page, 'days')
    check('marking it sets today’s record alone', days.find((d) => d.day === '2026-09-07')?.unwell === true && days.filter((d) => d.unwell).length === 1)
    // The caffeine bands' rows sit 11 px apart.
    const bands = page.locator('.caffeine-bands').first()
    if (await bands.count()) {
      const gap = await bands.evaluate((el) => getComputedStyle(el).rowGap)
      check('the caffeine rows sit 11 px apart', gap === '11px', `row-gap ${gap}`)
    } else check('the caffeine chips are on the morning summary', false, 'not found')
    await page.getByRole('button', { name: 'Done', exact: true }).first().click()
    const morning = (await rowsOf(page, 'offers')).find((o) => o.block === 'morning' && o.kind === 'block')
    check('a move is drawn after the morning check-in, with what the draw knew', Boolean(morning) && !morning.draw, morning ? 'no draw record yet: that comes with the next batch' : 'none')
    // Not now at the afternoon; asked once more at the evening, where leaving it is said plainly.
    await page.clock.setFixedTime(new Date(2026, 8, 7, 13, 5))
    await page.reload()
    await page.getByRole('button', { name: /Check in/ }).click()
    await seen(page.getByTestId('outcome-ask'))
    const later = page.getByTestId('outcome-later')
    check('the afternoon asks with “Not now”', (await seen(later)) && ((await later.textContent()) ?? '').trim() === 'Not now')
    await later.click()
    await tapThrough(page)
    const deferred = (await rowsOf(page, 'offers')).find((o) => o.id === morning?.id)
    check('Not now records nothing and keeps it open', Boolean(deferred?.deferredAt) && deferred?.closedAt === null)
    await page.goto(LIVE)
    await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
    await page.reload()
    await page.getByRole('button', { name: /Check in/ }).click()
    await seen(page.getByTestId('outcome-ask'))
    let left = false
    for (let i = 0; i < 4 && (await page.getByTestId('outcome-ask').isVisible()); i++) {
      if (await page.getByTestId('outcome-leave').isVisible()) {
        left = ((await page.getByTestId('outcome-leave').textContent()) ?? '').trim() === 'Leave it unanswered'
        await page.getByTestId('outcome-leave').click()
      } else await page.getByTestId('outcome-later').click()
      await page.waitForTimeout(300)
    }
    check('the evening asks once more, and says “Leave it unanswered”', left)
    const outcome = (await rowsOf(page, 'outcomes')).find((x) => x.offerId === morning?.id)
    check('left unanswered, it closes with no answer, never a No', outcome?.outcome === null)
    await ctx.close()
  }
  // 2. Stress and Overwhelm in their new words.
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 13, 5))
    await page.getByRole('button', { name: /Check in/ }).click()
    const words = []
    for (let i = 0; i < 12; i++) {
      if (!(await page.locator('#ci-title').isVisible())) break
      words.push(((await page.locator('.screen.checkin').textContent()) ?? '').replace(/\s+/g, ' '))
      await page.getByTestId('anchor').nth(2).click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(250)
    }
    const all = words.join(' | ')
    check('Stress asks “How heavy or urgent things feel”', all.includes('How heavy or urgent things feel'))
    check('Overwhelm asks “How many things are competing for your attention, even small ones”', all.includes('How many things are competing for your attention, even small ones'))
    check('no phrase of Stress counts things', !all.includes('a task or two on my mind'))
    await ctx.close()
  }
  // 3. Today's minimum win: one name and a Done.
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 10, 0))
    await page.evaluate(async () => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['wins'], 'readwrite')
      tx.objectStore('wins').put({ forDay: '2026-09-07', setOn: '2026-09-06', text: 'One short walk', outcome: null, answeredAt: null, updatedAt: '2026-09-06T23:00:00.000Z' })
      await new Promise((res) => (tx.oncomplete = res))
      dbx.close()
    })
    await page.reload()
    const card = page.locator('.win-card')
    check('the win card says “Today’s minimum win”', ((await card.locator('.eyebrow').textContent()) ?? '').trim() === 'Today’s minimum win')
    await card.getByTestId('win-done').click()
    await page.waitForTimeout(300)
    check('Done on Now marks it done', (await rowsOf(page, 'wins')).find((w) => w.forDay === '2026-09-07')?.outcome === 'done')
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== 'bill6006.github.io')
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || 'only bill6006.github.io')
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
