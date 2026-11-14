// The monthly write-ups on the live site (Phase 6, 2026-11-13), in fresh throwaway contexts with stand-in records
// only: nothing touches the owner's data, and no request leaves the browser but to the site itself. The phone's side
// alone: the database's new store; the Brain screen's switch for the monthly read, and no row for write-ups while
// there is none; with stand-in write-ups, the months, a month's two labelled parts, a mark and its undo queued as one
// row; a followed pattern counted on what came after the day it was noticed; an observation gone when its day is; the
// forget control; and the Brain screen's names for a month's reads. The Worker's side (the month task) is checked by
// its own run by hand on a stand-in month.
// node live-phase6.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
/** The key an automated browser holds to read two stand-in event types beside the one list, which does not hold them. */
const KEY = 'life-mirror.preview.noticed'
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

/** A fresh phone at a moment; with `key`, an automated browser holding the test key for the stand-in event types. */
async function fresh(when, key = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript((k) => {
    // The phone has read its cloud before, so its ids run from one.
    localStorage.setItem('lm.inStep', '1')
    if (k) localStorage.setItem(k, '1')
  }, key ? KEY : null)
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

/** Eight weeks of evenings and mornings; the first six evenings given a note, each holding the words an event quotes. */
async function seedNoticed(page, today, n = 6) {
  await put(page, 'checkins', eightWeeks(today))
  const evenings = (await rowsOf(page, 'checkins')).filter((r) => r.block === 'evening').sort((a, b) => (a.day < b.day ? -1 : 1))
  const noted = evenings.slice(0, n)
  await put(page, 'checkins', noted.map((r, i) => ({ ...r, extras: { ...(r.extras ?? {}), note: `Evening ${i + 1}: a stand-in thing happened again.` } })))
  await put(page, 'noteEvents', noted.map((r, i) => ({ id: `e${i + 1}`, type: i === 0 ? 'stand-in-first' : 'stand-in-one', note: { store: 'checkins', id: String(r.id), day: r.day, block: 'evening' }, quote: 'a stand-in thing happened again', noticedAt: '2026-11-01T10:00:00.000Z', method: 'stand-in' })))
  return noted
}
const openBrain = async (page) => {
  await tab(page, 'Settings')
  await page.getByRole('button', { name: /^Brain/ }).click()
  await seen(page.getByTestId('brain-reads'))
}
const start = async (page) => {
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
}
/** Waits until the pattern table says what is asked of it, or gives up. */
async function untilTable(page, test, ms = 40000) {
  const stop = Date.now() + ms
  let table = null
  while (Date.now() < stop) {
    ;[table] = await rowsOf(page, 'patterns')
    if (table && test(table)) return table
    await page.waitForTimeout(500)
  }
  return table
}

const isSaturday = (day) => new Date(`${day}T12:00:00`).getDay() === 6
/** Eight weeks of mornings and evenings, a late dinner on each Saturday evening; and a write-up of October with a followed pattern noticed on the 20th. */
async function seedWriteUps(page, today) {
  await put(page, 'checkins', eightWeeks(today))
  const evenings = (await rowsOf(page, 'checkins')).filter((r) => r.block === 'evening').sort((x, y) => (x.day < y.day ? -1 : 1))
  await put(page, 'checkins', evenings.filter((r) => isSaturday(r.day)).map((r) => ({ ...r, extras: { ...(r.extras ?? {}), dinner: true } })))
  const october = evenings.map((r) => r.day).filter((d) => d.startsWith('2026-10-'))
  const at = '2026-10-20T15:00:00.000Z'
  await put(page, 'writeups', [{
    id: '2026-10:1', month: '2026-10', reading: 1, at, day: '2026-10-20', method: 1, model: 'stand-in',
    builtFrom: { counts: { days: 31 }, parts: 1, lines: 90, fingerprint: 'a'.repeat(64), builtAt: at },
    recorded: [
      { text: 'You checked in every evening of the stretch.', days: [october[0], october[1], october[2]], kinds: ['dayRecord'] },
      { text: 'A stand-in thing you recorded twice.', days: [october[3]], kinds: ['dayRecord'] },
    ],
    noticed: [
      { text: 'A late dinner went with Saturdays.', days: [october[4]], kinds: ['dayRecord'], followed: { kind: 'chip.dinner', split: 'weekday', cell: '6', k: 2, n: 2, restK: 0, m: 12 } },
      { text: 'A second stand-in connection.', days: [october[5]], kinds: ['dayRecord'] },
    ],
  }])
  return october
}
const openMonth = async (page) => {
  await openBrain(page)
  await page.getByTestId('brain-writeups-open').click()
  await page.getByTestId('writeups-month').first().click()
  await seen(page.getByTestId('writeup-screen'))
}

try {
  {
    // The build stamp, and the database's new store.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    const store = await shapeOf(page, 'writeups')
    check('the database holds the store of write-ups, from version 30 on', store.has && store.version >= 300, `version ${store.version / 10}, writeups ${store.has ? 'there' : 'missing'}`)
    await ctx.close()
  }
  {
    // Nothing written yet: the switch is there and on, and no row for write-ups.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await start(page)
    await openBrain(page)
    const toggle = page.getByTestId('brain-monthly-read')
    const on = await toggle.getAttribute('aria-pressed')
    const row = await page.getByTestId('brain-writeups-row').count()
    check('the Brain screen has the switch for the monthly read, on, and no row for write-ups while there is none', on === 'true' && row === 0, `switch ${on}, ${row} row`)
    await toggle.click()
    const held = await until(page, 'brainPrefs', 1)
    const prefs = (await rowsOf(page, 'brainPrefs'))[0]
    const queued = (await rowsOf(page, 'outbox')).filter((r) => r.store === 'brainPrefs').length
    check('turned off, the Brain settings hold it and the change is queued for the cloud', held && prefs?.monthlyRead === false && queued >= 1, `monthlyRead ${prefs?.monthlyRead}, ${queued} queued`)
    await ctx.close()
  }
  {
    // Stand-in write-ups: the row, the months, a month's sheet, a mark and its undo.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await start(page)
    const october = await seedWriteUps(page, NOW)
    await page.reload()
    await openBrain(page)
    const open = (await text(page.getByTestId('brain-writeups-open'))) ?? ''
    check('with a write-up to show, the Brain screen shows its row', open === 'Read them (1)', open || 'no row')
    await page.getByTestId('brain-writeups-open').click()
    const month = (await text(page.getByTestId('writeups-month').first())) ?? ''
    check('the months are listed by name, with how much each holds', month.includes('October 2026') && month.includes('4 things'), month.slice(0, 60))
    await page.getByTestId('writeups-month').first().click()
    const sheet = page.getByTestId('writeup-screen')
    await seen(sheet)
    const words = (await text(sheet)) ?? ''
    const cards = sheet.getByTestId('writeup-observation')
    check('a month’s sheet has its two labelled parts, each observation with the days it came from', (await cards.count()) === 4 && words.includes('You recorded') && words.includes('Claude noticed') && (await sheet.getByTestId('writeup-days').count()) === 4, `${await cards.count()} observations`)
    // The followed pattern: three Saturdays since the day noticed, a late dinner on each, counted by the table's own build.
    const table = await untilTable(page, (t) => Array.isArray(t.followed) && t.followed.length === 1)
    const f = table?.followed?.[0]
    check('a followed pattern is counted on what came after the day it was noticed, and nothing before', f?.id === 'obs:2026-10:1:noticed:1' && f?.k === 3 && f?.n === 3 && f?.restK === 0 && f?.m === 17 && f?.standing === 'tooFew', f ? `${f.k} of ${f.n}, ${f.restK} of ${f.m}, ${f.standing}` : 'no followed count')
    await page.reload()
    await openMonth(page)
    const line = (await text(page.getByTestId('writeup-followed').first())) ?? ''
    check('and the sheet says so in the agreed words, with its standing', line.includes('since then: 3 of 3.') && line.includes('Too few to compare yet'), line.slice(0, 90))
    // Marked wrong: kept as the phone's own record and queued as one row; the Worker's rows never queued.
    const again = page.getByTestId('writeup-observation')
    await again.nth(2).getByTestId('writeup-wrong').click()
    const said = await seen(again.nth(2).getByTestId('writeup-marked'))
    const marked = await until(page, 'noteMarks', 1)
    const queued = async (store) => (await rowsOf(page, 'outbox')).filter((r) => r.store === store).map((r) => `${r.key}:${r.op}`)
    const q = await queued('noteMarks')
    check('one marked wrong says so, is kept as the phone’s own record and queued for the cloud as one row', said && marked && q.length === 1 && q[0] === 'obs:2026-10:1:noticed:1:put' && (await queued('writeups')).length === 0, `queued ${q.join(', ') || 'nothing'}`)
    const gone = await untilTable(page, (t) => !Array.isArray(t.followed) || t.followed.length === 0)
    check('a followed pattern marked wrong is counted nowhere at the table’s next build', gone !== null && !(gone.followed ?? []).length, gone ? 'gone' : 'no table')
    await again.nth(2).getByTestId('writeup-undo').click()
    const back = await seen(again.nth(2).getByTestId('writeup-wrong'))
    check('a mark taken back is gone', back && (await until(page, 'noteMarks', 0)), back ? 'undone' : 'not undone')
    // A day deleted: the observation that came from it is gone at once.
    const rows = (await rowsOf(page, 'checkins')).filter((r) => r.day === october[5])
    await page.goto(new URL('icons/life-mirror-192.png', page.url()).href)
    await page.evaluate(async ({ ids, day }) => {
      const dbx = await new Promise((res, rej) => { const q = indexedDB.open('life-mirror'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
      const tx = dbx.transaction(['checkins', 'days'], 'readwrite')
      for (const id of ids) tx.objectStore('checkins').delete(id)
      tx.objectStore('days').delete(day)
      await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
      dbx.close()
    }, { ids: rows.map((r) => r.id), day: october[5] })
    await page.goto(new URL('./', page.url()).href)
    await openMonth(page)
    const left = await page.getByTestId('writeup-observation').count()
    check('an observation whose day holds no record any more is gone', left === 3, `${left} shown`)
    // Forget everything it learned: one step to confirm, and the row is gone from the Brain screen.
    await page.getByTestId('writeup-back').click()
    await page.getByTestId('forget-learned-open').click()
    await page.getByTestId('forget-learned-yes').click()
    const none = await seen(page.getByTestId('writeups-none'))
    const marks = (await rowsOf(page, 'noteMarks')).map((m) => `${m.id}:${m.kind}`)
    const kept = (await rowsOf(page, 'writeups')).length
    check('“Forget everything it learned” takes one step to confirm; nothing is shown after it, and the Worker’s rows stay on record', none && marks.includes('forget:forget') && kept === 1, `marks ${marks.join(', ')}; ${kept} row kept`)
    await ctx.close()
  }
  {
    // What Claude read: a month's reads are named by their task, their count and their size.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const TODAY = dayOf(NOW)
    const { ctx, page } = await fresh(NOW)
    await put(page, 'brainReads', [{ id: 'read:month:1', day: TODAY, at: new Date(2026, 10, 10, 12, 5).toISOString(), task: 'month', category: 'lookup.month', count: 148, bytes: 37888, via: 'context' }])
    await page.reload()
    await openBrain(page)
    const group = (await text(page.getByTestId('brain-read-group').first())) ?? ''
    check('the Brain screen names a month’s reads by their task, their count and their size', group.includes('the monthly read') && group.includes('Lookup: a month of your record 148, 37.0 KB'), group.slice(0, 90))
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
