// Batch 2b (Let it out in the Brain, the coach's stated limits, the location note) on the live site, in fresh throwaway contexts with stand-in records only: nothing touches the
// owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set).
// node live-b2b.mjs <expected short commit>
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



async function putBriefs(page, rows) {
  await page.evaluate(async (list) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['brainBriefs'], 'readwrite')
    for (const row of list) tx.objectStore('brainBriefs').put(row)
    await new Promise((res) => (tx.oncomplete = res))
    dbx.close()
  }, rows)
}

try {
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 23, 18, 30))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.goto(LIVE)
    // 1. Settings → Brain: the journal's own switch, after the check-in notes, on.
    await tab(page, 'Settings')
    await page.getByTestId('settings-brain').click()
    await seen(page.getByTestId('brain-switch-location'))
    const ids = await page.locator('[data-testid^="brain-switch-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    check('Settings → Brain lists 14 switches, Journal right after the check-in notes', ids.length === 14 && ids[1] === 'brain-switch-notes' && ids[2] === 'brain-switch-journal', ids.slice(0, 3).join(', '))
    check('the Journal switch is on and says it is never evidence', (await page.getByTestId('brain-switch-journal').getAttribute('aria-pressed')) === 'true' && ((await page.getByTestId('brain-switch-journal').textContent()) ?? '').includes('Never evidence'))
    // 2. Why names the nights a line drew on; the review shows its question and the nights.
    const common = { mode: 'observation', cardIds: [], model: 'claude-opus-5-5', writer: 'claude', askedModel: 'opus', factsDay: '2026-09-23' }
    await putBriefs(page, [
      { ...common, id: '2026-09-23:brief', day: '2026-09-23', kind: 'brief', text: 'Last night you wrote that the day ran long; a short walk after dinner may suit this evening.', factIds: ['record'], at: '2026-09-23T13:00:00.000Z', facts: [{ id: 'record', text: 'A stand-in fact for the live check.' }], journal: ['2026-09-22'] },
      { ...common, id: '2026-09-23:review', day: '2026-09-23', kind: 'review', mode: 'strategy', text: 'a b c', factIds: [], at: '2026-09-23T13:01:00.000Z', parts: { held: 'The evening walk held.', didNot: 'The morning plans did not start.', change: 'Plan the walk for after dinner.', question: 'On Monday you wrote that the day ran long; what would make the evening lighter?' }, journal: ['2026-09-22', '2026-09-21'] },
    ])
    await page.goto(LIVE)
    await page.getByTestId('brief-why').first().click()
    const appeared = await seen(page.getByTestId('brief-why-journal').first())
    const why = ((await page.getByTestId('brief-why-panel').textContent()) ?? '')
    if (!appeared) console.log('WHY PANEL:', why.slice(0, 400))
    check('Why names the night drawn on as what you wrote', why.includes('From what you wrote') && /Your journal, the night of .*Sep 22/.test(why))
    await tab(page, 'Mirror')
    await page.getByRole('button', { name: /^The weekly view/ }).click()
    const q = ((await page.getByTestId('week-review-question').textContent()) ?? '').trim()
    const nights = ((await page.getByTestId('week-review-journal').textContent()) ?? '').trim()
    check('the week’s review shows its follow-up question', q === 'On Monday you wrote that the day ran long; what would make the evening lighter?')
    check('and the nights behind it, kept apart by semicolons', /^Drew on what you wrote: .*Sep 22; .*Sep 21\.$/.test(nights), nights)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    // 3. The location note follows its open gate.
    await tab(page, 'Settings')
    await page.getByTestId('settings-location').click()
    const kept = ((await page.getByTestId('location-kept').textContent()) ?? '')
    check('the Location screen says Claude reads the kinds of place while its switch is on', kept.includes('where Claude reads them while Settings → Brain → Where your day was spent is on') && !kept.includes('Claude reads none of them yet'))
    await ctx.close()
  }
  // 4. The journal box says who may read it.
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 7, 21, 5))
    await page.getByRole('button', { name: /Check in/ }).click()
    for (let i = 0; i < 40 && !(await page.getByTestId('extras').isVisible()); i++) {
      if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(2).click({ timeout: 3000 }).catch(() => {})
      else await page.waitForTimeout(250)
    }
    await page.getByTestId('journal-open').click()
    const extras = ((await page.getByTestId('extras').textContent()) ?? '')
    check('the Let it out box says Claude may read it while its switch is on', extras.includes('Claude’s to read while Settings → Brain → Journal is on'))
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== 'bill6006.github.io')
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || 'only bill6006.github.io')
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
