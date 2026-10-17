// Stage 3, group 4, the owner's record shown back, on the live site, in fresh throwaway contexts with
// stand-in records only: nothing touches the owner's data, and nothing is sent anywhere but the site itself
// (no cloud token is ever set). A month ago today and the month's review on Mirror, Your words with each
// line beside its reading, a check-in's note on its summary, the line left after a session at the next
// start, Her counted from the current rung with its rungs so far, and the workouts read on Cloud.
// node live-stage3c.mjs <expected short commit>
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

/** Reads every row of one table of the phone's store. */
const rowsOf = (page, table) =>
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
  }, table)

/** September's record with notes, moves and workouts; a session that left a line, the next one started; her skill with its rungs. */
async function seed(page) {
  await page.evaluate(async () => {
    const blocks = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'outside', 'aims', 'skills', 'herSkills', 'moments'], 'readwrite')
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const put = (date, block, p, note) => {
      const answers = {}
      for (const id of blocks[block]) answers[id] = ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
      const done = new Date(at.getTime() + 95_000).toISOString()
      tx.objectStore('checkins').add({ day: key(date), block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000, ...(note ? { extras: { note } } : {}) })
    }
    for (let d = 1; d <= 30; d++) {
      const date = new Date(2026, 8, d)
      put(date, 'morning', 3)
      put(date, 'evening', 3, d === 17 ? 'Dinner with friends' : undefined)
      if (d <= 3) {
        const at = new Date(2026, 8, d, 18).toISOString()
        tx.objectStore('offers').add({ id: 700 + d, kind: 'block', day: key(date), block: 'evening', at, situationKey: 'evening:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: at })
        tx.objectStore('outcomes').add({ offerId: 700 + d, moveId: 'walk-ten', day: key(date), block: 'evening', at, outcome: 'done', why: null, passiveOutcome: null })
      }
      if (d % 10 === 2) tx.objectStore('outside').add({ id: `w${d}`, day: key(date), minutes: 40, at: new Date(2026, 8, d, 18).toISOString(), source: 'workout' })
    }
    tx.objectStore('aims').add({ id: 90, kind: 'certification', stepMoveId: null, name: 'Veltish', method: 'A class', currentSkillId: 91, createdAt: new Date(2026, 8, 1, 9).toISOString(), archivedAt: null })
    tx.objectStore('skills').add({ id: 91, aimId: 90, name: 'Ten words', method: 'A class', source: 'you', startedAt: new Date(2026, 8, 1, 9).toISOString(), order: 1, createdAt: new Date(2026, 8, 1, 9).toISOString(), archivedAt: null })
    const session = (id, date, closed) => ({ id, kind: 'step', day: key(date), block: 'morning', at: date.toISOString(), situationKey: 'aim:certification:90', target: 'focus', stance: '', band: '', reading: 0, moveId: 'skill:91', label: 'Ten words', minutes: 30, cardId: null, candidates: ['skill:91'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: closed ? date.toISOString() : null })
    tx.objectStore('offers').add(session(801, new Date(2026, 9, 16, 8), true))
    tx.objectStore('outcomes').add({ offerId: 801, moveId: 'skill:91', day: '2026-10-16', block: 'morning', at: new Date(2026, 9, 16, 9).toISOString(), outcome: 'done', why: null, passiveOutcome: null, ease: 'right', note: 'Start at page 12 next time' })
    tx.objectStore('offers').add(session(802, new Date(2026, 9, 17, 9), false))
    tx.objectStore('herSkills').add({ skillId: 'counts-to-ten', rung: 'needsSupport', addedAt: new Date(2026, 8, 2, 9).toISOString(), rungAt: new Date(2026, 9, 3, 9).toISOString(), archivedAt: null, rungs: [{ rung: 'notIntroduced', at: new Date(2026, 8, 2, 9).toISOString() }, { rung: 'needsSupport', at: new Date(2026, 9, 3, 9).toISOString() }] })
    tx.objectStore('moments').add({ day: '2026-09-25', at: new Date(2026, 8, 25, 18).toISOString(), skillId: 'counts-to-ten', help: 'lots' })
    tx.objectStore('moments').add({ day: '2026-10-10', at: new Date(2026, 9, 10, 18).toISOString(), skillId: 'counts-to-ten', help: 'some' })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
  await page.waitForTimeout(800)
}
const text = async (loc) => ((await loc.textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()

try {
  {
    const { ctx, page } = await fresh(new Date(2026, 9, 17, 9, 35))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await seed(page)

    await tab(page, 'Mirror')
    const ago = page.getByTestId('month-ago')
    check('Mirror shows a month ago today, its note in its own words', (await seen(ago)) && (await text(ago)).includes('Evening, you wrote: “Dinner with friends”'), await text(ago))
    const month = await page.getByTestId('month-door').click({ timeout: 8000 }).then(() => true, () => false)
    const reading = await text(page.getByTestId('month-reading'))
    check('The month reviews September from the record: check-ins and the day reading', month && reading.includes('Check-ins completed: 60, on 30 of its 30 days.') && reading.includes('The day reading averaged 50 over 30 days'), reading)
    check('…and the moves done, the most done named', (await text(page.getByTestId('month-moves'))).includes('Done most: A ten-minute walk, now (3).'), await text(page.getByTestId('month-moves')))

    await page.reload()
    await tab(page, 'Mirror')
    await page.getByTestId('words-door').click({ timeout: 8000 }).catch(() => undefined)
    const row = page.getByTestId('words-row').first()
    check('Your words lists the line beside its reading', (await seen(row)) && (await text(row)).includes('Evening · 50, getting by') && (await text(row)).includes('“Dinner with friends”'), await text(row))
    await row.click({ timeout: 8000 }).catch(() => undefined)
    check('its summary shows the note, and Done comes back to Your words', (await text(page.getByTestId('summary-note'))).includes('“Dinner with friends”') && (await page.getByRole('button', { name: 'Done', exact: true }).click({ timeout: 8000 }).then(() => seen(page.getByTestId('words')), () => false)))

    await page.reload()
    await tab(page, 'Aims')
    const last = page.getByTestId('aim-last-note').first()
    check('the line left after the last session shows while the next is under way', (await seen(last)) && (await text(last)) === 'Last time you wrote: “Start at page 12 next time”', await text(last))
    await page.getByRole('button', { name: /^Her/ }).click({ timeout: 8000 }).catch(() => undefined)
    const counts = await text(page.getByTestId('her-counts').first())
    await page.getByTestId('her-rung-open').first().click({ timeout: 8000 }).catch(() => undefined)
    const history = await text(page.getByTestId('her-history'))
    check('Her counts from the current rung, with its rungs so far dated', counts.startsWith('Since ') && counts.includes(': did it 1 · on her own 0 · a little help 1 · a lot of help 0') && history.includes('Needs support, from') && history.includes('Not introduced, from') && history.includes('In all: did it 2'), `${counts} | ${history}`)

    await page.reload()
    await tab(page, 'Settings')
    await page.getByRole('button', { name: /^Cloud copy/ }).click({ timeout: 8000 }).catch(() => undefined)
    const read = await text(page.getByTestId('cloud-outside-read'))
    check('Cloud counts the workouts read', read.startsWith('Read so far: 3 workouts on 3 days, the last on'), read || 'no line')
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
