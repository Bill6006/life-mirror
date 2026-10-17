// Batch 2a (the foundations, the claims log, Let it out) on the live site, in fresh throwaway contexts with stand-in records only: nothing touches the
// owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set).
// node live-b2a.mjs <expected short commit>
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
  // 1. The build, and the two new tables.
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 8, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    const stores = await page.evaluate(async () => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const names = [...dbx.objectStoreNames]
      const v = dbx.version
      dbx.close()
      return { names, v }
    })
    check('the database is version 19 with the claims and journal tables', stores.v === 190 && stores.names.includes('claims') && stores.names.includes('journal'), `version ${stores.v}`)
    // 2. The foundations: the morning's move keeps what its draw knew, and is marked seen on Now.
    await page.goto(LIVE)
    await page.getByRole('button', { name: /Check in/ }).click()
    await tapThrough(page)
    const morning = async () => (await rowsOf(page, 'offers')).find((o) => o.block === 'morning' && o.kind === 'block')
    const drawn = await morning()
    check('a drawn move keeps its draw record', /^engine-/.test(drawn?.draw?.engine ?? '') && Object.keys(drawn?.draw?.beliefs ?? {}).length > 0 && drawn?.draw?.context?.weekday === 1, `engine ${drawn?.draw?.engine}`)
    check('it is not marked seen on the summary', drawn?.seenAt === undefined)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByTestId('move-card').first().waitFor({ state: 'visible' })
    let seenAt = null
    for (let i = 0; i < 40 && !seenAt; i++) {
      await page.waitForTimeout(250)
      seenAt = (await morning())?.seenAt ?? null
    }
    check('it is marked seen once its card has been on Now', Boolean(seenAt))
    await ctx.close()
  }
  // 3. Let it out, end to end.
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 21, 5))
    await page.getByRole('button', { name: /Check in/ }).click()
    for (let i = 0; i < 40 && !(await page.getByTestId('extras').isVisible()); i++) {
      if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(2).click({ timeout: 3000 }).catch(() => {})
      else await page.waitForTimeout(250)
    }
    check('the evening extras open with Let it out closed', (await page.getByTestId('extras').isVisible()) && (await page.getByTestId('journal-input').count()) === 0)
    await page.getByTestId('journal-open').click()
    const box = page.getByTestId('journal-input')
    await box.fill('A stand-in night. The walk after dinner helped.')
    await box.blur()
    let kept = []
    for (let i = 0; i < 20 && !kept.length; i++) {
      await page.waitForTimeout(250)
      kept = await rowsOf(page, 'journal')
    }
    check('the night is kept as written, with when it was written', kept.length === 1 && kept[0].text === 'A stand-in night. The walk after dinner helped.' && Boolean(kept[0].writtenAt) && kept[0].editedAt === null)
    const evening = (await rowsOf(page, 'checkins')).find((c) => c.block === 'evening')
    check('the check-in was complete before the extras', Boolean(evening?.completedAt))
    await page.goto(LIVE)
    await tab(page, 'Mirror')
    await page.getByTestId('journal-door').click()
    check('Journal on Mirror reads it back', ((await page.getByTestId('journal-text').textContent()) ?? '').trim() === 'A stand-in night. The walk after dinner helped.')
    await page.getByTestId('journal-search').fill('dinner WALK')
    const found = await page.getByTestId('journal-entry').count()
    await page.getByTestId('journal-search').fill('breakfast')
    await page.waitForTimeout(200)
    check('search finds every word, any case, and nothing else', found === 1 && (await page.getByTestId('journal-entry').count()) === 0)
    await page.getByTestId('journal-search').fill('')
    await page.getByTestId('journal-edit').click()
    await page.getByTestId('journal-edit-input').fill('A stand-in night. Edited.')
    await page.getByTestId('journal-save').click()
    await page.waitForTimeout(300)
    const edited = (await rowsOf(page, 'journal'))[0]
    check('an edit keeps when it was written and when it was edited', edited?.text === 'A stand-in night. Edited.' && Boolean(edited?.editedAt) && edited?.writtenAt === kept[0].writtenAt)
    await page.getByTestId('journal-delete').click()
    const asks = ((await page.getByTestId('journal-delete').textContent()) ?? '').trim()
    const still = (await rowsOf(page, 'journal')).length
    await page.getByTestId('journal-delete').click()
    await page.waitForTimeout(300)
    check('delete asks twice, then the entry is gone', asks === 'Tap again to delete it' && still === 1 && (await rowsOf(page, 'journal')).length === 0)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== 'bill6006.github.io')
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || 'only bill6006.github.io')
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
