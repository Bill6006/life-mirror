// The speaking Path (P4, 2026-11-06) on the live site, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set; the microphone
// is Chromium's fake one). The new Path is there to read, labelled experimental, and offered nowhere; Later puts it
// away; started with its two questions, a yes shows the app's own help, and the answers leave no trace; a rep recorded
// of yourself is kept on this phone and never queued for the cloud, the line written before Start kept with the step;
// the sheet after Done asks how hard it was; the next day the recording is checked, a line first.
// node live-speaking.mjs <expected short commit> [screenshot folder]
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
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args } : { args })
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
const pressed = async (loc) => (await loc.getAttribute('aria-pressed', { timeout: 8000 }).catch(() => null)) === 'true'

const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.grantPermissions(['microphone'], { origin: new URL(LIVE).origin })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  // Only the network counts: a recording played back is a blob: address, never a host.
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.host)
  })
  return { ctx, page }
}

/** Every row of a store, read in the page; a recording's sound as its size. */
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
    return all.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Blob ? `blob:${v.size}` : v])))
  }, store)
}

/** Waits until a store says what is wanted, as a tap's write takes a moment. */
async function rowsUntil(page, store, ok, ms = 8000) {
  const end = Date.now() + ms
  let last = []
  while (Date.now() < end) {
    last = await rows(page, store)
    if (ok(last)) return last
    await page.waitForTimeout(200)
  }
  return last
}

try {
  {
    const { ctx, page } = await fresh()
    await page.goto(LIVE)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }

  {
    const { ctx, page } = await fresh()
    await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
    await page.goto(LIVE)
    await tab(page, 'Aims')
    const card = page.getByTestId('path-new')
    check('Aims shows a new Path to read, labelled experimental, and nothing of it runs', (await seen(card)) && (await text(card)).includes('experimental. Nothing runs until you start it.') && (await page.locator('[data-kind="path"]').count()) === 0, await text(card))
    await shot(card, 'speaking-new')
    await card.getByTestId('path-new-read').click()
    const read = page.getByTestId('path-read')
    check('the one screen says its label, strands, what is never counted and what it rests on', (await text(read.getByTestId('path-read-label'))) === 'Experimental' && (await text(read)).includes('anyone’s reaction, yes or no') && (await text(read.getByTestId('path-read-basis'))).includes('12 decisions, each with its basis'))
    await read.getByTestId('path-read-why').click()
    check('it says what it asks a week, about how long, and reads your week against its stages', (await text(read.getByTestId('path-read-asks'))).includes('one a day at most') && (await text(read.getByTestId('path-read-asks'))).includes('Months, step by step') && (await text(read.getByTestId('path-read-week'))).includes('By its schedule your week holds'))
    check('its decisions open, twelve of them', (await read.getByTestId('path-decision').count()) === 12)
    await shot(read, 'speaking-read')
    await read.getByTestId('path-read-later').click()
    await tab(page, 'Aims')
    check('Later puts it away, offered nowhere', (await page.getByTestId('path-new').count()) === 0 && (await page.locator('[data-kind="path"]').count()) === 0)
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-path-speaking').click()
    check('the add sheet still has it, saying it was set aside', (await text(page.getByTestId('path-read-set-aside'))).startsWith('Set aside for later'))
    await page.getByTestId('path-read-start').click()
    const start = page.getByTestId('path-start')
    await seen(start.getByTestId('path-start-question').first())
    check('the start asks two questions and says the answers are not kept', (await start.getByTestId('path-start-question').count()) === 2 && (await text(start)).includes('Your answers are not kept'))
    check('no help shows before a yes', (await start.getByTestId('path-start-help').count()) === 0)
    await start.getByTestId('path-start-avoid-yes').click()
    check('a yes shows the app’s own help first and turns Nerves on', (await text(start.getByTestId('path-start-help'))).includes('practice, not treatment') && (await pressed(start.getByTestId('path-start-nerves'))))
    await shot(start, 'speaking-start')
    await start.getByTestId('path-start-nerves').click()
    await start.getByTestId('path-start-focus-speaking').click()
    await start.getByTestId('path-start-begin').click()
    const path = page.locator('[data-path="speaking"][data-kind="path"]')
    check('started: its card, labelled, one strand on', (await seen(path)) && (await text(path.getByTestId('path-label'))) === 'Experimental' && (await path.getByTestId('path-strand').count()) === 1)
    const aims = await rows(page, 'aims')
    check('the answers left no trace: the commitment holds the strands alone', JSON.stringify(aims.map((a) => a.strands)) === '[["speaking"]]' && !/avoid|afraid/.test(JSON.stringify(aims)))
    await shot(path, 'speaking-card')

    await tab(page, 'Now')
    const row = page.locator('[data-kind="path"]')
    check('Now’s row says the rep’s own strand and stage', (await text(row.getByTestId('path-stage'))).includes('The Speaking path · Speaking to several people · Recorded alone'), await text(row.getByTestId('path-stage')))
    await row.getByTestId('aim-start').click()
    check('Start asks one optional line first, one Start at a time', (await seen(row.getByTestId('path-predict'))) && (await row.getByTestId('aim-start').count()) === 0)
    await row.getByTestId('path-predict-input').fill('I will rush the ending')
    await row.getByTestId('path-predict-start').click()
    const offers = await rowsUntil(page, 'offers', (o) => o.length === 1)
    check('the line is kept with the step', offers[0]?.prediction === 'I will rush the ending' && JSON.stringify(offers[0]?.paths) === '["speaking"]')
    await row.getByTestId('path-record').click()
    check('Record yourself: recording', await seen(row.getByTestId('path-recording')))
    await page.waitForTimeout(1500)
    await row.getByTestId('path-record-stop').click()
    check('Stop: recorded', await seen(row.getByTestId('path-recorded')))
    const recs = await rowsUntil(page, 'recordings', (r) => r.length === 1)
    check('one recording, kept on this phone', recs.length === 1 && /^blob:[1-9]/.test(String(recs[0]?.audio)), String(recs[0]?.audio))
    const outbox = await rows(page, 'outbox')
    check('never queued for the cloud', !outbox.some((r) => r.store === 'recordings'), `${outbox.length} queued, none a recording`)
    await row.getByTestId('aim-done').click()
    const sheet = row.getByTestId('path-sheet')
    check('the sheet after Done shows the line and says the recording waits for tomorrow', (await text(sheet.getByTestId('path-sheet-expected'))) === 'You expected: I will rush the ending' && (await text(sheet.getByTestId('path-sheet-recorded'))).includes('Check it tomorrow or later'))
    check('and asks no behaviours of a rep recorded alone, nor a hand-over', (await sheet.getByTestId('path-check-opening').count()) === 0 && (await sheet.getByTestId('path-hand-over').count()) === 0)
    await sheet.getByTestId('path-effort-3').click()
    const effort = await rowsUntil(page, 'outcomes', (o) => o[0]?.effort === 3)
    check('how hard it was is kept', effort[0]?.effort === 3)
    await shot(sheet, 'speaking-sheet')

    await page.clock.setFixedTime(new Date(2026, 10, 10, 9, 5))
    await page.reload()
    await tab(page, 'Aims')
    const due = path.getByTestId('path-recording-due')
    check('the next day the recording waits to be checked', (await seen(due)) && (await text(due)).includes('yesterday'), await text(due))
    await path.getByTestId('path-recording-check').click()
    const chk = page.getByTestId('recording-check')
    check('the sound shows only after a line is written', (await chk.getByTestId('recording-audio').count()) === 0)
    await chk.getByTestId('recording-note').fill('Rushed the end')
    check('then the sound', await seen(chk.getByTestId('recording-audio')))
    for (const b of ['opening', 'pauses', 'example']) await chk.getByTestId(`recording-check-${b}`).click()
    await shot(chk, 'speaking-check')
    await chk.getByTestId('recording-save').click()
    const checked = await rowsUntil(page, 'outcomes', (o) => Boolean(o[0]?.recordingCheckedAt))
    check('the recording’s checks and the line are kept', JSON.stringify(checked[0]?.recordingChecks) === '["opening","pauses","example"]' && checked[0]?.recordingNote === 'Rushed the end')
    await tab(page, 'Aims')
    check('the stage’s behaviours shown once, from outside the moment', (await text(path.getByTestId('strand-numbers'))) === '1 practised · shown in 1 of 1 kind of setting · 1 of 1 checked from outside the moment', await text(path.getByTestId('strand-numbers')))
    await ctx.close()
  }

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
