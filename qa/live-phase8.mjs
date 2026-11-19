// The forecast's challenger, on the live site (Phase 8, 2026-11-19), in a fresh throwaway context with stand-in records
// only: nothing touches the owner's data, and no request leaves the browser but to the site itself. The build stamp;
// the writer moving today's morning by a stand-in private item and a stand-in note event the evening before; and the
// Weekly View keeping its UI and naming neither. The Worker's side is checked by its own run by hand.
// node live-phase8.mjs <expected short commit>
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
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

// The stand-in record, drawn as e2e/challengerSeed.ts draws it.
const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']

const SEED_ITEM = { id: 41, name: 'Stand-in private item', createdAt: '2026-01-01T00:00:00.000Z', archived: 0 }
const SEED_TYPE = 'raised-voice'
const SEED_TYPE_LABEL = 'Raised my voice'
const QUOTE = 'raised my voice'

/** A small seeded stream, so the record is the same on every run. */
function stream(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dayKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** The days before `today` (YYYY-MM-DD), oldest first; check-ins numbered from 1, at hours safe in every zone the tests run in. */
function challengerRecord(today, days = 160) {
  const next = stream(20261119)
  const last = days - 1
  const item = Array.from({ length: days }, (_, i) => i === last || next() < 0.4)
  const noted = Array.from({ length: days }, (_, i) => i === last || next() < 0.75)
  const event = noted.map((n, i) => n && (i === last || next() < 0.4))
  const start = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  const checkins = []
  const events = []
  let id = 1
  const key = String(SEED_ITEM.id)
  for (let i = 0; i < days; i++) {
    const day = dayKey(new Date(start - (days - i) * 86_400_000))
    const after = (list) => i > 0 && list[i - 1]
    const morning = Object.fromEntries(MORNING.map((r) => [r, 3]))
    Object.assign(morning, { mood: after(item) ? 1 : 5, focus: after(item) ? 1 : 5, energy: after(event) ? 1 : 5, stress: after(event) ? 5 : 1, sleepHours: 4 })
    const mAt = `${day}T13:00:00.000Z`
    checkins.push({ id: id++, day, block: 'morning', asked: MORNING, answers: morning, startedAt: mAt, completedAt: mAt, updatedAt: mAt, activeMs: 30_000 })
    const eid = id++
    const eAt = `${day}T23:00:00.000Z`
    const extras = { privateShown: { [key]: true } }
    if (item[i]) extras.private = { [key]: true }
    if (noted[i]) extras.note = event[i] ? `Today I ${QUOTE} at work.` : 'A quiet evening.'
    checkins.push({ id: eid, day, block: 'evening', asked: EVENING, answers: Object.fromEntries(EVENING.map((r) => [r, 3])), startedAt: eAt, completedAt: eAt, updatedAt: eAt, activeMs: 30_000, extras })
    if (event[i]) events.push({ id: `ev-${eid}`, type: SEED_TYPE, note: { store: 'checkins', id: String(eid), day, block: 'evening' }, quote: QUOTE, noticedAt: `${day}T23:59:00.000Z`, method: 'stand-in' })
  }
  return { checkins, events }
}

const TODAY = '2026-09-18'
const WHEN = new Date(2026, 8, 18, 8, 0)

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  return { ctx, page }
}

/** Writes rows into one of the phone's stores, or with none given reads every row of it. */
const store = (page, name, rows) =>
  page.evaluate(
    async ({ name, rows }) => {
      const dbx = await new Promise((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([name], rows ? 'readwrite' : 'readonly')
      const s = tx.objectStore(name)
      let out = null
      if (rows) for (const r of rows) s.put(r)
      else
        out = await new Promise((res, rej) => {
          const r = s.getAll()
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
      return out
    },
    { name, rows },
  )

try {
  const { ctx, page } = await fresh()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-about').click()
  const commit = (await page.getByTestId('build-commit').textContent())?.trim()
  check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  const { checkins, events } = challengerRecord(TODAY)
  await store(page, 'checkins', checkins)
  await store(page, 'privateItems', [SEED_ITEM])
  await store(page, 'noteEvents', events)
  await page.reload()
  let morning
  for (let i = 0; i < 60 && !Array.isArray(morning?.adjBy); i++) {
    morning = (await store(page, 'forecasts', null)).find((f) => f.day === TODAY && f.block === 'morning' && f.horizon === 0)
    if (!Array.isArray(morning?.adjBy)) await page.waitForTimeout(1000)
  }
  const by = Array.isArray(morning?.adjBy) ? morning.adjBy.slice().sort() : []
  check('the writer moved today’s morning by the private item and the note event', by.join(',') === [`noticed.${SEED_TYPE}`, `private.${SEED_ITEM.id}`].sort().join(','), `adjBy ${JSON.stringify(by)}, adj ${morning?.adj}`)
  check('the moved row keeps one of the four ways’ names', ['sameBlock', 'weekdayBlock', 'lastValue', 'blend'].includes(morning?.model), `model ${morning?.model}`)
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await page.getByTestId('weekly').waitFor({ state: 'visible' })
  const shown = ((await page.getByTestId('weekly').innerText()) ?? '').toLowerCase()
  check('the Weekly View shows the forecast’s way', await page.getByTestId('week-ahead-model').isVisible())
  const named = [SEED_ITEM.name, SEED_TYPE_LABEL, SEED_TYPE, `private.${SEED_ITEM.id}`, 'noticed.'].filter((w) => shown.includes(w.toLowerCase()))
  check('the Weekly View names neither the private item nor the note event', named.length === 0, named.length ? `names ${named.join(', ')}` : 'neither named')
  await ctx.close()
} finally {
  await browser.close()
}

check('the page reached no host but the site itself', [...hosts].every((h) => h === SITE), `only ${[...hosts].join(', ')}`)
check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
const passed = results.filter((r) => r.startsWith('PASS')).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
