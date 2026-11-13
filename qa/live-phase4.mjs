// Lookups as facts and the pattern table on the live site (Phase 4, 2026-11-13), in fresh throwaway contexts with
// stand-in records only: nothing touches the owner's data, and no request leaves the browser but to the site itself.
// The phone's side alone: the database's new store, the pattern table built after the day's sheet as one record and
// queued for the cloud once, never on the sheet; an answer's cited lookup fact shown in its own words; and a lookup's
// read named on the Brain screen. The Worker's side is checked by its own runs by hand.
// node live-phase4.mjs <expected short commit>
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
/** The database's own version and whether it holds a store. */
const shapeOf = (page, store) =>
  page.evaluate(async (name) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const out = { version: dbx.version, has: dbx.objectStoreNames.contains(name) }
    dbx.close()
    return out
  }, store)
/** Waits until a store holds a number of rows, or gives up. */
async function until(page, store, n, ms = 30000) {
  const stop = Date.now() + ms
  while (Date.now() < stop) {
    if ((await rowsOf(page, store)).length === n) return true
    await page.waitForTimeout(500)
  }
  return false
}

const ASKED = {
  morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
  evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
}
const HOURS = { morning: 7, evening: 19 }
const DOWN = ['irritation', 'stress', 'overwhelm', 'loneliness']
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/** A completed check-in `back` days before a day, every reading in the middle. */
function row(today, back, block, extras) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), HOURS[block], 40).toISOString()
  const answers = Object.fromEntries(ASKED[block].map((id) => [id, id === 'hunger' || id.startsWith('sleep') ? 3 : DOWN.includes(id) ? 3 : 3]))
  return { day: dayOf(date), block, asked: ASKED[block], startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000, ...(extras ? { extras } : {}) }
}
/** Eight weeks of mornings and evenings before a day, a late dinner on the Saturdays alone. */
function eightWeeks(today) {
  const out = []
  for (let back = 56; back >= 1; back--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
    out.push(row(today, back, 'morning'), row(today, back, 'evening', date.getDay() === 6 ? { dinner: true } : undefined))
  }
  return out
}

try {
  {
    // The build stamp, and the database's new store.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const TODAY = dayOf(NOW)
    const { ctx, page } = await fresh(NOW)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    const shape = await shapeOf(page, 'patterns')
    check('the database holds the pattern table’s store, at version 28', shape.has && shape.version === 280, `version ${shape.version / 10}, store ${shape.has ? 'there' : 'missing'}`)

    // A stand-in record, then the app opened again: the table follows the day's sheet on its own.
    await put(page, 'checkins', eightWeeks(NOW))
    await page.reload()
    const built = await until(page, 'patterns', 1)
    const [table] = await rowsOf(page, 'patterns')
    check('the phone builds the pattern table as one record with a fixed id, for the days before today', built && table?.id === 'table' && table?.format === 1 && table?.builtFor === TODAY, built ? `id ${table?.id}, built for ${table?.builtFor}` : 'no record after thirty seconds')
    const dinner = table?.kinds?.find((k) => k.id === 'chip.dinner')
    const saturday = dinner?.cells?.find((c) => c.split === 'weekday' && c.cell === '6')
    check('a late dinner on the eight Saturdays alone stands as a steady pattern, 8 of 8 against 0 of 48', dinner?.known === 56 && dinner?.occurrences === 8 && saturday?.k === 8 && saturday?.n === 8 && saturday?.restK === 0 && saturday?.m === 48 && saturday?.standing === 'pattern', saturday ? `${saturday.k} of ${saturday.n} against ${saturday.restK} of ${saturday.m}, ${saturday.standing}` : 'no Saturday cell')
    const ids = (table?.kinds ?? []).map((k) => k.id)
    const low = table?.kinds?.find((k) => k.id === 'level.low')
    check('the level is counted as two kinds, with their cut-offs said', ids.includes('level.low') && ids.includes('level.high') && low?.cutoff === 'under 40 out of 100' && low?.occurrences === 0, low ? `level.low: ${low.occurrences} of ${low.known}, cut-off "${low.cutoff}"` : 'no level.low')
    const evening = table?.level?.find((l) => l.split === 'checkin' && l.cell === 'evening')
    check('the level’s averages carry each cell’s check-ins in the five bands', evening?.n === 56 && evening?.mean === 50 && Array.isArray(evening?.bands) && evening.bands.length === 5 && evening.bands[2] === 56, evening ? `evenings: ${evening.n} check-ins, average ${evening.mean}, bands ${evening.bands.join(',')}` : 'no evening cell')
    const queued = async () => (await rowsOf(page, 'outbox')).filter((r) => r.store === 'patterns')
    const first = await queued()
    check('the table is queued for the cloud as one row, like any record', first.length === 1 && first[0].key === 'table' && first[0].op === 'put', `${first.length} queued`)
    const sheet = (await rowsOf(page, 'facts')).find((r) => r.day === TODAY)?.sheet
    const heads = new Set((sheet?.facts ?? []).map((f) => String(f.id).split('.')[0]))
    const onSheet = ['kinds', 'pattern', 'day', 'moves', 'workouts', 'pathSteps', 'lines', 'forecasts'].filter((h) => heads.has(h))
    check('nothing of the table is on the day’s sheet', Boolean(sheet) && sheet.facts.length > 5 && onSheet.length === 0, sheet ? `${sheet.facts.length} facts, lookup heads on it: ${onSheet.join(', ') || 'none'}` : 'no sheet')

    // Opened again the same day: the same table, nothing written, nothing more queued.
    const stamp = table?.updatedAt
    await page.reload()
    await tab(page, 'Mirror')
    await page.waitForTimeout(4000)
    const again = await rowsOf(page, 'patterns')
    check('opened again the same day, the table is not written again and nothing more is queued', again.length === 1 && again[0].updatedAt === stamp && (await queued()).length === 1, `${again.length} record, ${(await queued()).length} queued`)

    // A lookup's read, as the Worker logs it, named on the Brain screen.
    await put(page, 'brainReads', [{ id: 'read:lookup:1', day: TODAY, at: new Date(2026, 10, 10, 12, 5).toISOString(), task: 'ask', category: 'lookup.pattern', count: 9, bytes: 2048, via: 'context' }])
    await page.reload()
    await tab(page, 'Settings')
    await page.getByRole('button', { name: /^Brain/ }).click()
    await seen(page.getByTestId('brain-screen'))
    const group = (await text(page.getByTestId('brain-read-group').first())) ?? ''
    check('the Brain screen names a lookup’s read by its count and size', group.includes('Lookup: when a thing was recorded 9, 2.0 KB'), group || 'no read shown')
    await ctx.close()
  }
  {
    // An answer that cited a lookup's fact: its own words under "What this rests on".
    const NOW = new Date(2026, 10, 10, 13, 30)
    const { ctx, page } = await fresh(NOW)
    await page.getByTestId('direction-input').fill('One line, mine')
    await page.getByRole('button', { name: 'Keep it', exact: true }).click()
    const words = 'A steady pattern: a late or heavy dinner was recorded more often on Saturdays (8 of 8 on Saturdays, against 0 of 48 on other days).'
    const at = NOW.toISOString()
    await put(page, 'askThreads', [{ id: 1, day: dayOf(NOW), at, title: 'When am I most likely to have a late dinner?', from: { kind: 'typed' } }])
    await put(page, 'askTurns', [{ id: 1, threadId: 1, day: dayOf(NOW), at, question: 'When am I most likely to have a late dinner?', tier: 'standard', state: 'waiting', kind: 'typed', version: 'earlier', cited: [], updatedAt: at }])
    await put(page, 'askAnswers', [{ id: 'turn:1', turnId: 1, threadId: 1, day: dayOf(NOW), at, status: 'answered', text: 'Late dinners cluster on Saturdays, and in your record that stands as a steady pattern.\nIt was recorded on 8 of 8 Saturdays, against 0 of 48 other days.', factIds: ['pattern.chip.dinner.weekday.6'], cardIds: [], facts: [{ id: 'pattern.chip.dinner.weekday.6', text: words }], model: 'claude-opus-5-5' }])
    await page.reload()
    await tab(page, 'Mirror')
    await page.getByTestId('ask-open').click()
    await seen(page.getByTestId('ask'))
    await page.getByTestId('ask-thread-row').click()
    const answer = (await text(page.getByTestId('ask-claude'))) ?? ''
    await page.getByTestId('ask-claude-cited-open').click()
    const cited = (await text(page.getByTestId('ask-claude-cited'))) ?? ''
    check('an answer that cited a lookup’s fact shows that fact’s own words under "What this rests on"', answer.includes('Late dinners cluster on Saturdays') && cited.includes(words), cited ? cited.slice(0, 80) : 'nothing cited shown')
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
