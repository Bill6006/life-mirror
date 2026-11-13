// The one standard on the live site (Phase 3, 2026-11-12), in fresh throwaway contexts with stand-in records only:
// nothing touches the owner's data, and no request leaves the browser but to the site itself.
// A chip tapped three times says "too few to compare yet" at the check-in, on Evidence and on the day's sheet; a strong
// unhelpful pattern says a steady pattern, read lower, in all three and on the morning's last-night line; "What comes
// before your days" and best days say where each thing stands; Evidence explains the four words.
// node live-phase3.mjs <expected short commit>
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
const rowsOf = (page, store) =>
  page.evaluate(async (name) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return rows
  }, store)

const ASKED = {
  morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
  afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
  evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
}
const HOURS = { morning: 7, afternoon: 13, evening: 19 }
const DOWN = ['irritation', 'stress', 'overwhelm', 'loneliness']
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/** A completed check-in `back` days before a day: every reading in the middle (3), or the block read well (4) or badly (2). */
function row(today, back, block, level, extras, over = {}) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), HOURS[block], 40).toISOString()
  const answers = { ...Object.fromEntries(ASKED[block].map((id) => [id, id === 'hunger' || id.startsWith('sleep') ? 3 : DOWN.includes(id) ? 6 - level : level])), ...over }
  return { day: dayOf(date), block, asked: ASKED[block], startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000, ...(extras ? { extras } : {}) }
}
/** Eight of four weeks' days, in no rhythm. */
const eight = (back) => [3, 4, 6, 10].includes((back - 1) % 14)
/** Four weeks of evenings in one band, each with its morning after: `rattled` says which evenings carried it, with stress at its top phrase, and the mornings after those read badly. */
function fourWeeks(today, rattled) {
  const out = []
  for (let back = 29; back >= 2; back--) out.push(row(today, back, 'evening', 3, rattled(back) ? { coolingOff: true } : undefined, rattled(back) ? { stress: 5 } : {}), row(today, back - 1, 'morning', rattled(back) ? 2 : 4))
  return out
}
/** Opens the block's check-in and answers its readings, as far as the optional taps or the summary. */
async function toSummary(page) {
  await page.getByRole('button', { name: /Check in/ }).click()
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const ask = page.getByTestId('outcome-ask')
  const anchor = page.getByTestId('anchor').nth(2)
  for (let i = 0; i < 40; i++) {
    await card.or(extras).or(ask).or(anchor).first().waitFor({ state: 'visible' })
    if ((await card.isVisible()) || (await extras.isVisible())) return
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      await ask.waitFor({ state: 'hidden' })
      continue
    }
    const title = await page.locator('#ci-title').textContent()
    await anchor.click()
    await page.locator('#ci-title', { hasNotText: title ?? '' }).or(card).or(extras).or(ask).first().waitFor({ state: 'visible' })
  }
}
/** The day's sheet as the phone wrote it for the Worker. */
const sheetOf = async (page, day) => (await rowsOf(page, 'facts')).find((r) => r.day === day)?.sheet ?? null
const coolingAnswer = (page) => page.getByTestId('extras').locator('li[data-chip="coolingOff"]').getByTestId('chip-answer').locator('.calc-line').first()
const openEvidence = async (page) => {
  await tab(page, 'Moves')
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await seen(page.getByTestId('evidence'))
}

try {
  {
    // The build stamp; then a chip tapped three times.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await put(page, 'checkins', fourWeeks(NOW, (back) => [5, 12, 19].includes(back)))
    await page.reload()
    await tab(page, 'Now')
    await toSummary(page)
    await page.getByTestId('chip-coolingOff').click()
    const answer = await text(coolingAnswer(page))
    check('three taps: the check-in says too few to compare yet, and no reading', answer === '3 times before: too few to compare yet.', answer ?? 'no answer')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await seen(page.getByTestId('give-back'))
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await openEvidence(page)
    const evidence = (await text(page.getByTestId('evidence'))) ?? ''
    check('three taps: Evidence says the same of it', evidence.includes('3 evenings marked: too few to compare yet.'), /Cooling off[^.]*\.[^.]*\./.exec(evidence)?.[0] ?? 'no line')
    await page.waitForTimeout(1500)
    const fact = (await sheetOf(page, dayOf(NOW)))?.facts.find((f) => f.id === 'assoc.coolingOff')
    check('three taps: the day’s sheet says too few, where it said Promising or Unclear', fact?.values?.standing === 'tooFew' && fact?.tier === 'little' && /^Too few to compare yet/.test(fact?.text ?? ''), fact ? `${fact.tier} · ${fact.text}` : 'no fact')
    // Evidence explains the four words, and names the day the rule changed.
    await page.getByTestId('evidence-standard').click()
    const words = (await text(page.getByTestId('evidence-standard-words'))) ?? ''
    check('Evidence explains the four words and names the day the rule changed', ['Since 13 November 2026', 'Too few to compare yet', 'No clear pattern yet', 'A lead, not yet a pattern', 'A steady pattern'].every((w) => words.includes(w)), words.slice(0, 90))
    await ctx.close()
  }
  {
    // A strong unhelpful pattern: something rattled on eight of four weeks' evenings, the mornings after them low.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await put(page, 'checkins', fourWeeks(NOW, eight))
    await page.reload()
    await toSummary(page)
    await page.getByTestId('chip-coolingOff').click()
    const answer = (await text(coolingAnswer(page))) ?? ''
    const clause = /Like for like, \d+ points lower: a steady pattern\./.exec(answer)?.[0] ?? null
    check('a strong unhelpful pattern: the check-in says its readings, the difference and a steady pattern, read lower', /^8 times before\. The morning after read \d+, against \d+ after evenings that started the same \(8 and 20\)\. Like for like, \d+ points lower: a steady pattern\.$/.test(answer), answer || 'no answer')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await seen(page.getByTestId('give-back'))
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await openEvidence(page)
    const evidence = (await text(page.getByTestId('evidence'))) ?? ''
    check('Evidence says the same standing for it, in the same words', clause !== null && evidence.includes(`after evenings that started the same. ${clause}`), clause ?? 'no clause')
    await page.waitForTimeout(1500)
    const fact = (await sheetOf(page, dayOf(NOW)))?.facts.find((f) => f.id === 'assoc.coolingOff')
    check('the day’s sheet says a steady pattern, read lower, where the old word stays Unclear', fact?.values?.standing === 'pattern' && fact?.values?.direction === 'lower' && fact?.tier === 'unclear' && /^A steady pattern: /.test(fact?.text ?? ''), fact ? `${fact.tier} · ${fact.text}` : 'no fact')
    // "What comes before your days": every pair shown says where it stands. Evidence is a screen of its own, so the app is opened again first.
    await page.reload()
    await tab(page, 'Mirror')
    await seen(page.getByTestId('before-card'))
    const standings = await page.getByTestId('before-standing').allTextContents()
    check('“What comes before your days” says where each pair shown stands', standings.length > 0 && standings.every((s) => /^(No clear pattern yet|A lead, not yet a pattern · \d+ looked at|A steady pattern)$/.test(s.trim())), standings.slice(0, 3).join(' | ') || 'no pair shown')
    await ctx.close()
  }
  {
    // The next morning, after an evening that carried it: the brief's last-night line says the same standing.
    const NOW = new Date(2026, 10, 11, 8, 5)
    const { ctx, page } = await fresh(NOW)
    const TODAY = new Date(2026, 10, 11)
    // The same four weeks, as that morning finds them, with last night carrying it too.
    const rows = []
    for (let back = 30; back >= 3; back--) rows.push(row(TODAY, back, 'evening', 3, eight(back - 1) ? { coolingOff: true } : undefined), row(TODAY, back - 1, 'morning', eight(back - 1) ? 2 : 4))
    rows.push(row(TODAY, 1, 'evening', 3, { coolingOff: true }))
    await put(page, 'checkins', rows)
    await page.reload()
    const card = page.getByTestId('brief')
    await seen(card)
    // With a line for the day the readings sit behind Why; with none they are on the card itself.
    if (!(await seen(card.getByTestId('brief-last-night'), 4000))) await card.getByTestId('brief-why').click()
    const night = (await text(card.getByTestId('brief-last-night'))) ?? ''
    check('the morning’s last-night line says the difference with a steady pattern, read lower', /^Last night carried .+\. Mornings after evenings like it have read \d+ points lower than after evenings that started the same \(8 against 20\)\. A steady pattern\.$/.test(night), night || 'no line')
    await ctx.close()
  }
  {
    // Best days: ninety days, a nap on eight of the nine best and on few of the others.
    const NOW = new Date(2026, 10, 10, 13, 30)
    const { ctx, page } = await fresh(NOW)
    const GOOD = [3, 12, 20, 29, 37, 46, 54, 65, 78]
    const rows = []
    for (let back = 90; back >= 1; back--) {
      const best = GOOD.includes(back)
      const napped = best ? back !== 78 : back % 9 === 0
      rows.push(row(NOW, back, 'morning', best ? 4 : 3), row(NOW, back, 'evening', best ? 4 : 3, napped ? { napped: true } : undefined))
    }
    await put(page, 'checkins', rows)
    await page.reload()
    await tab(page, 'Mirror')
    await page.getByRole('button', { name: /^The weekly view/ }).click()
    await page.getByTestId('weekly-best').click()
    await seen(page.getByTestId('best-days'))
    const rule = (await text(page.getByTestId('best-rule'))) ?? ''
    const lines = await page.getByTestId('best-line').allTextContents()
    const nap = lines.find((l) => l.includes('a nap')) ?? ''
    check('best days says how many things were compared', /: \d+ compared\. One shows here only at a lead, the most this list says\.$/.test(rule), rule || 'no rule')
    check('best days says a thing only at a lead, with its counts, and never a steady pattern', /^a nap: 8 of 9 best days, \d+ of 81 others\s*A lead, not yet a pattern · \d+ looked at$/.test(nap.trim()) && !lines.some((l) => l.includes('A steady pattern')), nap || lines.join(' | ') || 'no line')
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
