// Notes: exact words, and a home for what is noticed in notes, on the live site (Phase 5, 2026-11-13), in fresh
// throwaway contexts with stand-in records only: nothing touches the owner's data, and no request leaves the browser
// but to the site itself. The phone's side alone: the database's two new stores; with no test key, as on every phone
// in a hand, nothing noticed stands and the Brain screen shows no row; with it, the sheet lists each stand-in event
// with its quoted words, one is marked wrong and the mark taken back, the mark queued as one row; an event whose note
// lost its words is gone; five standing events make a kind in the pattern table, and a mark that leaves four takes it
// away; and the Brain screen names a search of the notes among what Claude read. The Worker's side (the note-words
// lookup) is checked by its own run by hand; the pull of the Worker's rows by the browser test on a stand-in cloud.
// node live-phase5.mjs <expected short commit>
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

try {
  {
    // The build stamp, and the database's two new stores.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    const events = await shapeOf(page, 'noteEvents')
    const marks = await shapeOf(page, 'noteMarks')
    check('the database holds the two stores for what is noticed, at version 29', events.has && marks.has && events.version === 290, `version ${events.version / 10}, noteEvents ${events.has ? 'there' : 'missing'}, noteMarks ${marks.has ? 'there' : 'missing'}`)
    await ctx.close()
  }
  {
    // No test key, as on every phone in a hand: the one list does not hold the stand-in types, so nothing of them stands.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW)
    await start(page)
    await seedNoticed(page, NOW)
    await page.reload()
    await openBrain(page)
    const stored = (await rowsOf(page, 'noteEvents')).length
    const row = await page.getByTestId('brain-noticed').count()
    check('with no test key nothing of a stand-in type stands: six stored events, and no row on the Brain screen', stored === 6 && row === 0, `${stored} stored, ${row} row`)
    const table = await untilTable(page, (t) => Array.isArray(t.kinds) && t.kinds.length > 0)
    const noticed = (table?.kinds ?? []).filter((k) => String(k.id).startsWith('noticed.')).length
    check('and the pattern table holds no kind for it', table !== null && noticed === 0, table ? `${table.kinds.length} kinds, ${noticed} noticed` : 'no table')
    await ctx.close()
  }
  {
    // An automated browser holding the test key: the stand-in types are read, and the sheet shows what stands.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const { ctx, page } = await fresh(NOW, true)
    await start(page)
    const noted = await seedNoticed(page, NOW)
    await page.reload()
    // Five standing events of one type make a kind in the pattern table; the sixth is the same type under its earlier id.
    const table = await untilTable(page, (t) => (t.kinds ?? []).some((k) => k.id === 'noticed.stand-in-one'))
    const kind = table?.kinds?.find((k) => k.id === 'noticed.stand-in-one')
    check('six standing events of one type, one stored under its earlier id, are one kind in the pattern table, private, among the check-ins with a note', kind?.occurrences === 6 && kind?.known === 6 && kind?.private === true && kind?.category === 'notes' && String(kind?.label).startsWith('Claude noticed in a note: A stand-in thing'), kind ? `${kind.occurrences} of ${kind.known}, private ${kind.private}` : 'no such kind')
    await openBrain(page)
    const open = (await text(page.getByTestId('brain-noticed-open'))) ?? ''
    check('the Brain screen shows the row, with how many there are to read', open === 'Read them (6)', open || 'no row')
    await page.getByTestId('brain-noticed-open').click()
    await seen(page.getByTestId('noticed-screen'))
    const cards = page.getByTestId('noticed-event')
    const quotes = await page.getByTestId('noticed-quote').allTextContents()
    check('the sheet lists each with the words quoted from its note', (await cards.count()) === 6 && quotes.every((q) => q.trim() === '“a stand-in thing happened again”'), `${await cards.count()} listed`)
    // Marked wrong: said on the card, kept as the phone's own record, queued as one row; nothing of the Worker's rows queued.
    await cards.nth(0).getByTestId('noticed-wrong').click()
    const said = await seen(cards.nth(0).getByTestId('noticed-marked'))
    const marked = await until(page, 'noteMarks', 1)
    const queued = async (store) => (await rowsOf(page, 'outbox')).filter((r) => r.store === store).map((r) => `${r.key}:${r.op}`)
    const q1 = await queued('noteMarks')
    check('one marked wrong says so, is kept as the phone’s own record and queued for the cloud as one row', said && marked && q1.length === 1 && q1[0].endsWith(':put') && (await queued('noteEvents')).length === 0, `queued ${q1.join(', ') || 'nothing'}`)
    // The count follows: five stand, still a kind; a second mark leaves four, and the kind is gone at the table's next build.
    await cards.nth(1).getByTestId('noticed-wrong').click()
    await until(page, 'noteMarks', 2)
    const after = await untilTable(page, (t) => !(t.kinds ?? []).some((k) => k.id === 'noticed.stand-in-one'))
    check('two marked wrong leave four standing, under the five a kind needs: the kind leaves the pattern table', after !== null && !(after.kinds ?? []).some((k) => k.id === 'noticed.stand-in-one'), after ? 'gone' : 'no table')
    // Taken back: the control returns and the mark is gone.
    await cards.nth(0).getByTestId('noticed-undo').click()
    const back = await seen(cards.nth(0).getByTestId('noticed-wrong'))
    const one = await until(page, 'noteMarks', 1)
    const again = await untilTable(page, (t) => (t.kinds ?? []).some((k) => k.id === 'noticed.stand-in-one'))
    check('a mark taken back is gone, and with five standing again the kind returns', back && one && (again?.kinds ?? []).some((k) => k.id === 'noticed.stand-in-one' && k.occurrences === 5), back && one ? 'undone' : 'not undone')
    // A note edited so it no longer holds the quoted words: its event is gone from the sheet at once.
    const victim = (await rowsOf(page, 'checkins')).find((r) => r.id === noted[5].id)
    await put(page, 'checkins', [{ ...victim, extras: { ...(victim.extras ?? {}), note: 'A calm evening.' } }])
    await page.reload()
    await openBrain(page)
    const fewer = (await text(page.getByTestId('brain-noticed-open'))) ?? ''
    check('an event whose note no longer holds its quoted words is gone', fewer === 'Read them (5)', fewer || 'no row')
    await ctx.close()
  }
  {
    // What Claude read: a search of the notes is named by its count and size.
    const NOW = new Date(2026, 10, 10, 19, 5)
    const TODAY = dayOf(NOW)
    const { ctx, page } = await fresh(NOW)
    await put(page, 'brainReads', [{ id: 'read:lookup:9', day: TODAY, at: new Date(2026, 10, 10, 12, 5).toISOString(), task: 'ask', category: 'lookup.noteWords', count: 14, bytes: 3072, via: 'context' }])
    await page.reload()
    await openBrain(page)
    const group = (await text(page.getByTestId('brain-read-group').first())) ?? ''
    check('the Brain screen names a search of the notes by its count and size', group.includes('Lookup: words in your notes 14, 3.0 KB'), group.slice(0, 90))
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
