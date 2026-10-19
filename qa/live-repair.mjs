// The learning repair on the live site, in its preview, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set). The preview
// opens only in an automated browser holding its key; the owner's phone sees the repair closed until stage R6.
// Stage R2: a check-in's move drawn by the repair's engine, every chance kept with its version. Stage R3: the learning
// week's invitation on Now, and Yes starting a week. Closed: no week shows.
// node live-repair.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const SHOTS = process.argv[3] ?? null
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
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const FITS = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']

// Today at half past one, so the check-in is the afternoon's whenever the script runs; the stand-in days are the ten before.
const now = new Date()
const WHEN = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 30)

async function fresh(preview) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript((on) => {
    localStorage.setItem('lm.inStep', '1')
    if (on) localStorage.setItem('life-mirror.preview.learningRepair', '1')
  }, preview)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.waitForTimeout(400)
  // Ten stand-in days: each check-in complete, each with a draw between the walk and nothing extra at even chances.
  await page.evaluate(async (fits) => {
    const blocks = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const hours = { morning: 7, afternoon: 13, evening: 19 }
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes'], 'readwrite')
    const now = new Date()
    let k = 0
    for (let d = 10; d >= 1; d--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      for (const block of Object.keys(blocks)) {
        k++
        const answers = {}
        blocks[block].forEach((id, ri) => {
          answers[id] = 1 + ((k + ri) % 5)
        })
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
        const done = new Date(at.getTime() + 95_000).toISOString()
        tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
        const moveId = k % 2 ? 'walk-ten' : 'nothing'
        const offerId = await new Promise((res) => {
          const q = tx.objectStore('offers').add({ kind: 'block', day, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done, fits })
          q.onsuccess = () => res(q.result)
        })
        tx.objectStore('outcomes').add({ offerId, moveId, day, block, at: done, outcome: 'done', why: null, passiveOutcome: null, seen: true })
      }
    }
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, FITS)
  await page.reload()
  return { ctx, page }
}

// Each capture centred on the screen, so the tab bar never covers what it shows.
const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

try {
  {
    const { ctx, page } = await fresh(true)
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.goto(LIVE)
    const invite = page.getByTestId('week-invite')
    const offered = await seen(invite)
    check('in the preview, a learning week is offered on Now once a running test has fitted three recent days', offered)
    if (offered) {
      check('it asks "A learning week?", with Yes and Not now', ((await invite.textContent().catch(() => '')) ?? '').includes('A learning week?') && (await page.getByTestId('week-yes').count()) === 1 && (await page.getByTestId('week-not-now').count()) === 1)
      await shot(invite, 'r3-week-invite')
      await page.getByTestId('week-yes').click()
      const running = page.getByTestId('week-running')
      check('Yes starts a week: "Learning week · day 1 of 7"', await seen(running.filter({ hasText: 'Learning week · day 1 of 7' })))
      check('and the invitation goes', (await page.getByTestId('week-invite').count()) === 0)
      await shot(running, 'r3-week-running')
    } else {
      // Nothing to answer: each check that needs the invitation fails, and the run goes on.
      for (const name of ['it asks "A learning week?", with Yes and Not now', 'Yes starts a week: "Learning week · day 1 of 7"', 'and the invitation goes']) check(name, false, 'no invitation shown')
    }
    // A check-in today: its move drawn by the repair's engine.
    await page.getByRole('button', { name: /Check in/ }).click()
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId('give-back').isVisible()) break
      if (await page.getByTestId('extras').isVisible()) break
      if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(200)
    }
    await page.getByRole('button', { name: 'Done', exact: true }).first().click()
    await page.waitForTimeout(800)
    const offer = await page.evaluate(async () => {
      const n = new Date()
      const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const rows = await new Promise((res) => {
        const q = dbx.transaction(['offers'], 'readonly').objectStore('offers').getAll()
        q.onsuccess = () => res(q.result)
      })
      dbx.close()
      return rows.find((o) => o.day === today) ?? null
    })
    check('today’s check-in move is drawn by the repair’s engine', offer?.draw?.engine === 'repair-1', String(offer?.draw?.engine))
    const sum = offer ? Object.values(offer.propensities ?? {}).reduce((a, b) => a + b, 0) : 0
    check('every chance kept, nothing extra among them, summing to one', !!offer && offer.candidates.includes('nothing') && Math.abs(sum - 1) < 1e-9, `${offer?.candidates?.length} candidates, sum ${sum}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh(false)
    check('closed, Now shows no learning week', (await page.getByTestId('week-invite').count()) === 0 && (await page.getByTestId('week-running').count()) === 0)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
