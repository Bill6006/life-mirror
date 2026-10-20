// The learning repair's stage R7, the honesty checks the record runs on itself, on the live site, in fresh throwaway
// contexts with stand-in records only: nothing touches the owner's data, and nothing is sent anywhere but the site itself
// (no cloud token is ever set). The weekly view's three checks, closed until opened, each saying none on a quiet record;
// two readings that moved together put to you on Settings, your answer kept and a request listed; evenings missing after
// low mornings said at Evidence's head and on the weekly view, with which way the record may lean; and the scorecard
// giving the repair's tests and calls. The browser suite's e2e/honesty.spec.ts, on the deployed build.
// node live-honesty.mjs <expected short commit> [screenshot folder]
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
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()

// Each capture centred on the screen, so the tab bar never covers what it shows.
const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A fixed afternoon, so the stand-in days are the same every run. */
const WHEN = new Date(2026, 8, 24, 13, 30)

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.waitForTimeout(400)
  return { ctx, page }
}

/**
 * Days of complete check-ins written straight into the phone's store, before the fixed day: each day's morning and evening
 * at a level from 1 to 5, or null for a check-in never started. `twins`: Mood and Energy share one position at every
 * check-in while every other reading runs its own course. `apart`: every reading on its own course, so none move together.
 */
async function seed(page, days, pattern, twins = false, apart = false) {
  const plan = Array.from({ length: days }, (_, i) => pattern(i))
  await page.evaluate(
    async ({ plan, twins, apart }) => {
      const own = (i, id) => {
        let h = 0
        for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
        const x = Math.sin(i * 12.9898 + h * 0.0078233) * 43758.5453
        return 1 + Math.floor((x - Math.floor(x)) * 5)
      }
      const down = new Set(['stress', 'irritation', 'overwhelm', 'loneliness', 'hunger'])
      const blocks = {
        morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
        evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
      }
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['checkins'], 'readwrite')
      const today = new Date()
      plan.forEach((p, i) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (i + 1))
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        for (const block of ['morning', 'evening']) {
          const level = p[block]
          if (level === null) continue
          const answers = {}
          for (const id of blocks[block]) answers[id] = apart ? own(i * 2 + (block === 'evening' ? 1 : 0), id) : down.has(id) ? 6 - level : level
          if (twins) for (const id of blocks[block]) if (id !== 'mood' && id !== 'energy') answers[id] = 1 + ((i * 3 + id.length) % 5)
          if (twins) answers.energy = answers.mood
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000 })
        }
      })
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { plan, twins, apart },
  )
  await page.reload()
}

async function weeklyView(page) {
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  return seen(page.getByTestId('weekly'))
}

try {
  {
    const { ctx, page } = await fresh()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }

  // A quiet record: the three checks, closed until opened, each saying none.
  {
    const { ctx, page } = await fresh()
    await seed(page, 25, () => ({ morning: 3, evening: 3 }), false, true)
    check('the weekly view opens', await weeklyView(page))
    const door = page.getByTestId('weekly-honesty')
    check('"Checks on the record" sits among its diagnostics, closed until opened', (await seen(door)) && (await door.getAttribute('aria-expanded')) === 'false')
    await door.click()
    check('readings that move together: none, on a quiet record', (await text(page.getByTestId('honesty-together'))) === 'Readings that move together · No two readings moved together almost always over the last thirty days.', await text(page.getByTestId('honesty-together')))
    check('where the forecast misses is said', (await text(page.getByTestId('honesty-misses'))).startsWith('Where the forecast misses ·'))
    check('what goes missing: counted, and following nothing', /Neither follows the reading before, the block or the day\. Missing stays missing\.$/.test(await text(page.getByTestId('honesty-missing'))), await text(page.getByTestId('honesty-missing')))
    await shot(page.getByTestId('honesty'), 'r7-quiet')
    await ctx.close()
  }

  // Two readings that moved together almost always.
  {
    const { ctx, page } = await fresh()
    await seed(page, 25, (i) => ({ morning: 1 + ((i * 7 + 3) % 5), evening: 1 + ((i * 7 + 1) % 5) }), true)
    await weeklyView(page)
    await page.getByTestId('weekly-honesty').click()
    check('the weekly view names the pair', await seen(page.getByTestId('honesty-together').filter({ hasText: 'Mood and Energy moved together almost always' })))
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-readings').click()
    const pair = page.getByTestId('together-pair').filter({ hasText: 'Mood and Energy' })
    check('Settings puts the pair to you with its correlation and count', /Mood and Energy moved together almost always over the last thirty days: rank correlation 1\.00 over \d+ shared check-ins\./.test(await text(pair)), await text(pair))
    check('with three answers: Keep both, Reword one, Merge them', (await text(pair.getByTestId('together-keep'))) === 'Keep both' && (await text(pair.getByTestId('together-reword'))) === 'Reword one' && (await text(pair.getByTestId('together-merge'))) === 'Merge them')
    await shot(pair, 'r7-together')
    await pair.getByTestId('together-reword').click()
    check('an answer puts the pair away and lists the request', (await pair.waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false)) && /^Mood or Energy: reword one, asked \w{3}, \w{3} \d{1,2}$/.test(await text(page.getByTestId('together-request'))), await text(page.getByTestId('together-request')))
    await page.reload()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-readings').click()
    check('kept across a reload', (await seen(page.getByTestId('together-request'))) && (await page.getByTestId('together-pair').filter({ hasText: 'Mood and Energy' }).count()) === 0)
    await ctx.close()
  }

  // Evenings missing after low mornings.
  {
    const { ctx, page } = await fresh()
    await seed(page, 40, (i) => ({ morning: i % 2 === 0 ? 1 : 5, evening: i % 2 === 0 && i % 10 !== 0 ? null : 3 }))
    await page.getByRole('button', { name: 'Moves', exact: true }).click()
    await page.getByRole('button', { name: /^Evidence/ }).click()
    const line = page.getByTestId('missing-pattern')
    const said = (await seen(line)) ? await text(line) : ''
    check('Evidence says at its head that what goes missing has a pattern', said.startsWith('What goes missing has a pattern: ') && /Check-ins never started after a low reading: \d+ of \d+, against \d+ of \d+ otherwise\./.test(said), said.slice(0, 120))
    check('and which way the record may lean', said.includes('Low moments may be under-recorded, so what the record shows may lean high.'))
    await shot(line, 'r7-missing')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await weeklyView(page)
    await page.getByTestId('weekly-honesty').click()
    const missing = await text(page.getByTestId('honesty-missing'))
    check('the weekly view says it too, and that its treatment is to be revisited', missing.includes('Check-ins never started after a low reading') && missing.includes('How the estimates treat it is to be revisited.'), missing.slice(0, 120))
    await ctx.close()
  }

  // The scorecard follows the repair.
  {
    const { ctx, page } = await fresh()
    await weeklyView(page)
    await page.getByTestId('weekly-scorecard').click()
    const tests = await text(page.getByTestId('scorecard-tests'))
    check('the scorecard gives the repair’s tests and calls', /^Tests under way \d+; calls resolved \d+, held \d+\.$/.test(tests), tests)
    await ctx.close()
  }

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
