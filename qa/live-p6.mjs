// Personalization (P6, 2026-11-07) on the live site, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set). On the speaking
// Path: the sheet of your stage's reps, a preference taken and undone in place, Not for me refused on the stage's floor,
// a kind of setting you don't have; a rep answered No at the check-in with the Path's own reason, set aside at once when it
// felt unsafe and said in front with the Path's own help; a suggestion from stand-in answers used and undone; and the
// Social path, started fresh, running with no change and nothing suggested.
// node live-p6.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium, tab } from './common.mjs'

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

const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.host)
  })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {}
  })
  return { ctx, page }
}

async function rows(page, store) {
  return page.evaluate(async (s) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const all = await new Promise((res, rej) => {
      const q = dbx.transaction([s], 'readonly').objectStore(s).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return all
  }, store)
}

async function rowsUntil(page, store, ok, ms = 8000) {
  const end = Date.now() + ms
  let last = []
  while (Date.now() < end) {
    last = await rows(page, store).catch(() => [])
    if (ok(last)) return last
    await page.waitForTimeout(200)
  }
  return last
}

async function putAll(page, store, list) {
  await page.evaluate(
    async ({ store, list }) => {
      const dbx = await new Promise((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([store], 'readwrite')
      for (const r of list) tx.objectStore(store).put(r)
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { store, list },
  )
}

const card = (page, path = 'speaking') => page.locator(`[data-path="${path}"][data-kind="path"]`)

async function details(c) {
  const toggle = c.getByTestId('path-details')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

async function startSpeaking(page) {
  await tab(page, 'Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-path-speaking').click()
  await page.getByTestId('path-read-start').click()
  await page.getByTestId('path-start-focus-speaking').click()
  await page.getByTestId('path-start-begin').click()
  await card(page).waitFor()
}

/** One block of checks: a step that cannot run is a FAIL with its reason, and the next block still runs. */
async function block(name, fn) {
  const { ctx, page } = await fresh()
  try {
    await fn(page)
  } catch (e) {
    check(`${name}: every step ran`, false, String(e).split(/\r?\n/)[0].slice(0, 200))
  } finally {
    await ctx.close()
  }
}

try {
  await block('the build stamp', async (page) => {
    await page.goto(LIVE)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  })

  await block('your reps and settings', async (page) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
    await page.goto(LIVE)
    await startSpeaking(page)
    await details(card(page))
    check('a Path started fresh has no change and nothing suggested', (await seen(card(page).getByTestId('path-changes-none'))) && (await card(page).getByTestId('path-suggestion').count()) === 0)
    await card(page).getByTestId('path-fit-open').click()
    const sheet = page.getByTestId('path-fit')
    check('the sheet lists the stage’s reps and where reps happen', (await seen(sheet)) && (await sheet.getByTestId('path-fit-rep').count()) === 3 && (await sheet.getByTestId('path-fit-setting').count()) > 0)
    const rep = (id) => page.locator(`[data-testid="path-fit-rep"][data-rep="${id}"]`)
    await rep('read-aloud').getByTestId('path-fit-prefer').click()
    const prefer = await rowsUntil(page, 'pathAdaptations', (r) => r.length === 1)
    check('I prefer this applies at once, its origin your preference', prefer.length === 1 && prefer[0].kind === 'prefer' && prefer[0].origin === 'preference' && prefer[0].state === 'applied')
    await rep('story-recording').getByTestId('path-fit-aside').click()
    check('Not for me is refused where the stage would lose its floor, nothing written', (await text(rep('story-recording').getByTestId('path-fit-refused'))).startsWith('Kept: without it the stage has too few different reps') && (await rows(page, 'pathAdaptations')).length === 1)
    await page.locator('[data-testid="path-fit-setting"][data-setting="group"]').getByTestId('path-fit-no-setting').click()
    const both = await rowsUntil(page, 'pathAdaptations', (r) => r.length === 2)
    check('I don’t have this is a correction, applied at once', both.some((r) => r.kind === 'noSetting' && r.setting === 'group' && r.origin === 'correction'))
    await shot(sheet, 'p6-sheet')
    await page.getByTestId('path-fit-close').click()
    await tab(page, 'Aims')
    await details(card(page))
    const row = card(page).locator('[data-testid="path-change-row"][data-kind="prefer"]')
    check('the card shows the change with its origin and why', (await text(row)).includes('From your preference') && (await text(row)).includes('You said you prefer it.'))
    await row.getByTestId('path-change-undo').click()
    const undone = await rowsUntil(page, 'pathAdaptations', (r) => r.some((x) => x.kind === 'prefer' && x.state === 'undone'))
    check('Undo keeps the change, marked undone', undone.length === 2 && undone.some((x) => x.kind === 'prefer' && x.state === 'undone') && (await row.getAttribute('data-state')) === 'undone')
  })

  await block('a rep answered No', async (page) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
    await page.goto(LIVE)
    await startSpeaking(page)
    await tab(page, 'Now')
    const now = page.locator('[data-kind="path"]')
    const name = await text(now.getByTestId('aim-step'))
    await now.getByTestId('aim-start').click()
    await now.getByTestId('path-predict-start').click()
    await now.getByTestId('aim-started').waitFor()
    await page.clock.setFixedTime(new Date(2026, 10, 9, 13, 5))
    await page.reload()
    await page.getByRole('button', { name: /Check in/ }).click()
    const ask = page.getByTestId('outcome-ask')
    await ask.getByTestId('outcome').nth(2).click()
    await ask.getByTestId('why').nth(1).click()
    check('after a No and its why, the Path’s own reason is asked, and the chance question no more', (await text(ask)).includes('One optional tap: what got in the way?') && (await ask.getByTestId('chance-yes').count()) === 0)
    await ask.getByTestId('path-why-unsafe').click()
    const outcome = (await rowsUntil(page, 'outcomes', (r) => r.length === 1))[0]
    check('the reason is kept with the answer', outcome?.outcome === 'no' && outcome?.pathWhy === 'unsafe' && outcome?.chance === true)
    const safety = await rowsUntil(page, 'pathAdaptations', (r) => r.length === 1)
    check('a rep that felt unsafe is set aside at once, origin safety', safety.length === 1 && safety[0].kind === 'setAside' && safety[0].origin === 'safety' && safety[0].state === 'applied')
    await page.goto(LIVE)
    await tab(page, 'Aims')
    const line = card(page).getByTestId('path-safety-line')
    check('it is said in front of the card, with the Path’s own help', (await seen(line)) && (await text(line)).startsWith(`${name} is set aside`) && (await seen(card(page).getByTestId('path-safety-help'))))
    await shot(card(page), 'p6-safety')
    await details(card(page))
    await card(page).locator('[data-testid="path-change-row"][data-kind="setAside"]').getByTestId('path-change-undo').click()
    const back = await rowsUntil(page, 'pathAdaptations', (r) => r[0]?.state === 'undone')
    check('its own Undo brings it back, kept as undone', back[0]?.state === 'undone' && (await card(page).getByTestId('path-safety').count()) === 0)
  })

  await block('a suggestion from the record', async (page) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
    await page.goto(LIVE)
    await startSpeaking(page)
    const [aim] = await rows(page, 'aims')
    await putAll(page, 'aims', [{ ...aim, strands: ['speaking', 'nerves'] }])
    const days = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
    await putAll(page, 'offers', days.map((d, k) => ({ id: 800 + k, kind: 'step', day: d, block: 'morning', at: `${d}T14:00:00.000Z`, situationKey: 'aim:path:speaking', target: 'mood', stance: '', band: '', reading: 0, moveId: 'sp-n-no-lines', minutes: 2, cardId: null, candidates: ['sp-n-no-lines'], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { 'sp-n-no-lines': 1 }, chosenBy: 'app', paths: ['speaking'], setting: 'group', rule: 'only', stage: 1, skippedAt: null, closedAt: `${d}T20:00:00.000Z` })))
    await putAll(page, 'outcomes', days.map((d, k) => ({ id: 1800 + k, offerId: 800 + k, moveId: 'sp-n-no-lines', day: d, block: 'evening', at: `${d}T20:00:00.000Z`, outcome: 'no', why: null, passiveOutcome: null, reason: 'noReason', seen: true, chance: false, pathWhy: 'noChance' })))
    await page.reload()
    await tab(page, 'Aims')
    check('the Details row says a suggestion waits', (await text(card(page).getByTestId('path-details'))).includes('A suggestion for you'))
    await details(card(page))
    const s = card(page).getByTestId('path-suggestion')
    check('the suggestion says what, its origin and why with the counts', (await seen(s)) && (await text(s)).includes('From what your week allows') && (await text(s)).includes('No chance came up for it on 4 of its last 4 answered steps.'))
    check('nothing changed before Use it', (await rows(page, 'pathAdaptations')).length === 0)
    await shot(s, 'p6-suggestion')
    await s.getByTestId('path-suggestion-use').click()
    const used = await rowsUntil(page, 'pathAdaptations', (r) => r.length === 1)
    check('Use it applies it, origin feasibility, and it is suggested no more', used[0]?.kind === 'setAside' && used[0]?.origin === 'feasibility' && used[0]?.state === 'applied' && (await card(page).getByTestId('path-suggestion').count()) === 0)
  })

  await block('the Social path as before', async (page) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
    await page.goto(LIVE)
    await tab(page, 'Aims')
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-path-social').click()
    const social = card(page, 'social')
    await social.waitFor()
    await details(social)
    check('the Social path runs with no change and nothing suggested', (await seen(social.getByTestId('path-changes-none'))) && (await social.getByTestId('path-suggestion').count()) === 0 && (await rows(page, 'pathAdaptations')).length === 0)
  })

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
