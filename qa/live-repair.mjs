// The learning repair on the live site, in fresh throwaway contexts with stand-in records only: nothing touches the owner's
// data, and nothing is sent anywhere but the site itself (no cloud token is ever set). Since 2026-10-20 it is the only
// engine: the old test key that closed it closes nothing, and a context holding the stand-in fault key sees every rebuild
// throw, so the failure can be checked: no move offered, the failure said, nothing else drawing.
// Stage R2: a check-in's move drawn by the repair's engine, every chance kept with its version. Stage R3: the learning
// week's invitation on Now, and Yes starting a week. Stage R4: Evidence's tests by rung with the track record at their
// head, the move card's rung and its test's words, the Moves door and the Legend. Stage R5: the sheet the phone keeps for
// the Brain carries the repair's tests and its track record. Stage R4b: a passive item's association at Promising proposes
// a one-tap test, and the tap sets it. Closed: no week, Evidence's cards, and none of the repair's facts on the sheet.
// Stage R6: Now's and Evidence's words are the learning engine's; since 2026-10-20 a rebuild that throws offers no move and says so.
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
const RUNG = /^(No call yet|(Early sign|Likely|Established): (helps|little difference|hurts))( · revised)?$/
const TIERS = ['Little evidence', 'Unclear', 'Promising', 'Holds up', 'Unhelpful here']

// A fixed afternoon, half past one, whatever day the script runs: the stand-in days are the ones before it, so the same record
// and, with a fixed random, the same draw come up every run.
const WHEN = new Date(2026, 8, 24, 13, 30)

/**
 * A fresh context with stand-in days: each check-in complete, each with a draw between the walk and nothing extra at even
 * chances. With `effect`, each draw is a fair coin fixed by its slot and stress reads lowest after a walk; with `seed`, the
 * page's random draws are fixed, so today's check-in draws the same move every run.
 */
async function fresh(mode, { days = 10, effect = false, seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(
    ({ mode, seed }) => {
      localStorage.setItem('lm.inStep', '1')
      // 'owner': no test key, as the owner's phone runs it; 'closed': the old closed key at 0, which closes nothing now;
      // 'fault': every rebuild throws.
      if (mode === 'closed') localStorage.setItem('life-mirror.preview.learningRepair', '0')
      if (mode === 'fault') localStorage.setItem('life-mirror.test.repairFault', '1')
      if (seed !== null) {
        let x = seed
        Math.random = () => {
          x = (x * 16807) % 2147483647
          return x / 2147483647
        }
      }
    },
    { mode, seed },
  )
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.waitForTimeout(400)
  await page.evaluate(
    async ({ fits, days, effect }) => {
      const coin = (slot) => {
        let a = (slot * 7919 + 13) | 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < 0.5
      }
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
      const today = new Date()
      let k = 0
      let last = null
      for (let d = days; d >= 1; d--) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d)
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        for (const block of Object.keys(blocks)) {
          k++
          const answers = {}
          blocks[block].forEach((id, ri) => {
            answers[id] = 1 + ((k + ri) % 5)
          })
          if (effect && last !== null) answers.stress = last === 'walk-ten' ? 1 : 5
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
          const done = new Date(at.getTime() + 95_000).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
          const moveId = effect ? (coin(k - 1) ? 'walk-ten' : 'nothing') : k % 2 ? 'walk-ten' : 'nothing'
          last = moveId
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
    },
    { fits: FITS, days, effect },
  )
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

/** A check-in today, every reading at its second anchor, then Done. */
async function checkIn(page) {
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('give-back').isVisible()) break
    if (await page.getByTestId('extras').isVisible()) break
    if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  await page.waitForTimeout(800)
}

/** The ids on the fact sheet the phone keeps for the Worker today, once the app has written it (stage R5). */
async function sheetIds(page) {
  for (let i = 0; i < 30; i++) {
    const ids = await page.evaluate(async () => {
      const n = new Date()
      const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const row = await new Promise((res) => {
        const q = dbx.transaction(['facts'], 'readonly').objectStore('facts').get(today)
        q.onsuccess = () => res(q.result)
        q.onerror = () => res(null)
      })
      dbx.close()
      return row?.sheet?.facts?.map((f) => f.id) ?? null
    })
    if (ids) return ids
    await page.waitForTimeout(300)
  }
  return null
}

/** Today's offers, as the phone holds them. */
async function todaysOffer(page) {
  return page.evaluate(async () => {
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
}

const tab = async (page, name) => {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
}

try {
  {
    const { ctx, page } = await fresh('owner')
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.goto(LIVE)
    const invite = page.getByTestId('week-invite')
    const offered = await seen(invite)
    check('with no test key, as the owner’s phone runs it, a learning week is offered on Now once a running test has fitted three recent days', offered)
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
    await checkIn(page)
    const offer = await todaysOffer(page)
    check('today’s check-in move is drawn by the repair’s engine', offer?.draw?.engine === 'repair-1', String(offer?.draw?.engine))
    const sum = offer ? Object.values(offer.propensities ?? {}).reduce((a, b) => a + b, 0) : 0
    check('every chance kept, nothing extra among them, summing to one', !!offer && offer.candidates.includes('nothing') && Math.abs(sum - 1) < 1e-9, `${offer?.candidates?.length} candidates, sum ${sum}`)
    // Stage R6: Now says how the repair picks, and counts its tests under way.
    const knows = page.getByTestId('knows')
    await knows.getByTestId('knows-more').click().catch(() => {})
    const knowsText = (await knows.textContent().catch(() => '')) ?? ''
    check('Now says how the repair picks: every move that fits keeps a chance, and its tests under way', knowsText.includes('Every move that fits keeps a chance of being drawn') && /(\d+ tests|one test) under way/.test(knowsText), knowsText.slice(0, 60))
    await shot(knows, 'r6-knows')
    await ctx.close()
  }
  {
    // Stage R4: fourteen days of a strong walk effect on stress, and today's draw fixed on a real move.
    const { ctx, page } = await fresh('owner', { days: 14, effect: true, seed: 11 })
    await checkIn(page)
    const offer = await todaysOffer(page)
    const card = page.getByTestId('move-card').first()
    let words = ''
    let testing = ''
    if (offer && offer.moveId !== 'nothing' && (await seen(card))) {
      await card.getByTestId('move-why').click()
      words = ((await card.getByTestId('move-tier').textContent().catch(() => '')) ?? '').trim()
      testing = ((await card.locator('.calc-line.testing').textContent().catch(() => '')) ?? '').trim()
      await shot(card, 'r4-move-card')
    }
    check('the move card names its move’s own test by its rung, never a tier', RUNG.test(words) && !TIERS.includes(words), words || `drew ${offer?.moveId}`)
    check('and its test is the repair’s own: a fair draw each time the move fits', testing.includes('a fair draw decides whether it is offered') && !/Card \d+/.test(testing), testing.slice(0, 60))
    await tab(page, 'Moves')
    const door = page.getByRole('button', { name: /^Evidence/ })
    check('the Moves door speaks of tests and rungs', ((await door.textContent().catch(() => '')) ?? '').includes('Every test with its rung, counts and interval'))
    await door.click()
    const track = page.getByTestId('track-record')
    const hasTrack = await seen(track)
    // Stage R4, part 2: Evidence opens with what helps you, then the tests nearest finishing, each with the day it began.
    const firstSection = hasTrack ? ((await page.locator('h2.section').first().textContent()) ?? '').trim() : ''
    const walkHelps = page.getByTestId('helps-reading').filter({ hasText: 'Stress' }).getByTestId('helps-move').filter({ hasText: 'A ten-minute walk, now:' })
    check('Evidence opens with what helps you: the walk under Stress, its record pooled with research, research beside it', firstSection === 'What helps you' && /your record pooled with research \(\+0\.40\)/.test(((await walkHelps.textContent().catch(() => '')) ?? '')), firstSection)
    check('then the tests nearest finishing, each with the day it began', / · since \w{3}, \w{3} \d{1,2} · /.test(((await page.getByTestId('nearest-test').filter({ hasText: 'A ten-minute walk, now, for Stress' }).textContent().catch(() => '')) ?? '')))
    if (hasTrack) await shot(page.getByTestId('what-helps'), 'r4-what-helps')
    check('the track record, in requirement 15’s words', hasTrack && /^(No early sign has resolved yet\.|Of \d+ early signs?, \d+ held\.)/.test(((await page.getByTestId('track-early').textContent().catch(() => '')) ?? '').trim()))
    const walk = page.getByTestId('repair-test').filter({ hasText: 'A ten-minute walk, now' }).filter({ hasText: 'for Stress over the next block' })
    const rung = hasTrack ? ((await walk.getByTestId('repair-rung').textContent().catch(() => '')) ?? '').trim() : ''
    check('the walk’s test on stress, run by the queue, calls that it helps', /^(Early sign|Likely|Established): helps/.test(rung) && ((await walk.textContent().catch(() => '')) ?? '').includes('being tested now'), rung)
    // The cards' section and their tiers are gone; only a passive item's card stays, under Rode alongside (stage R4b).
    const cardTexts = await page.getByTestId('evidence-card').allTextContents()
    check('no test card and no tier on Evidence while the repair is on; only passive items’ cards, under Rode alongside', hasTrack && (await page.getByRole('heading', { name: 'Cards', exact: true }).count()) === 0 && cardTexts.every((t) => t.includes('a passive item')), `${cardTexts.length} passive cards`)
    if (hasTrack) await shot(walk, 'r4-evidence-walk')
    // Stage R6: Nothing today keeps its counts and says what nothing extra is now; today's tag lending is not shown.
    const nothingLine = ((await page.getByTestId('nothing-line').textContent().catch(() => '')) ?? '').trim()
    check('Nothing today says what nothing extra is now, and today’s tag lending is not shown', /Every move’s test compares the move with nothing extra\.$/.test(nothingLine) && (await page.getByRole('heading', { name: 'What the tags have learned' }).count()) === 0, nothingLine.slice(-50))
    await page.reload()
    await tab(page, 'Settings')
    await page.getByTestId('settings-legend').click()
    check('the Legend names the rungs', await seen(page.getByText(/always with its rung/), 5000))
    // Stage R5: the sheet the phone keeps for the Worker carries the repair's tests and its track record.
    const ids = (await sheetIds(page)) ?? []
    check('the sheet for the Brain carries the walk’s test on the ladder and the track record', ids.includes('ladder.walk-ten.stress') && ids.includes('track'), `${ids.filter((x) => x.startsWith('ladder.')).length} ladder facts`)
    await ctx.close()
  }
  {
    // The old closed key, set: it closes nothing since the old engine was retired (2026-10-20).
    const { ctx, page } = await fresh('closed', { days: 14, effect: true })
    const keptKnows = page.getByTestId('knows')
    await keptKnows.getByTestId('knows-more').click().catch(() => {})
    check('with the old closed key set, Now still says how the learning engine picks', ((await keptKnows.textContent().catch(() => '')) ?? '').includes('Every move that fits keeps a chance of being drawn') && !((await keptKnows.textContent().catch(() => '')) ?? '').includes('one offer in five'))
    const keptIds = (await sheetIds(page)) ?? []
    check('and the sheet for the Brain still carries the engine’s track record', keptIds.includes('track'), `${keptIds.length} facts`)
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click()
    check('and Evidence shows its tests and track record, no Cards and no tags', (await seen(page.getByTestId('track-record'))) && (await page.getByRole('heading', { name: 'Cards', exact: true }).count()) === 0 && (await page.getByRole('heading', { name: 'What the tags have learned' }).count()) === 0)
    await ctx.close()
  }
  {
    // A skip's replacement and the pickup-time move, drawn by the new engine (2026-10-20).
    const { ctx, page } = await fresh('owner', { days: 10 })
    await checkIn(page)
    const offersToday = () =>
      page.evaluate(async () => {
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
        return rows.filter((o) => o.day === today)
      })
    const first = (await offersToday()).find((o) => o.kind === 'block')
    await page.getByTestId('move-skip').first().click().catch(() => {})
    let next = null
    for (let i = 0; i < 20 && !next; i++) {
      next = (await offersToday()).find((o) => o.kind === 'block' && o.id !== first?.id) ?? null
      if (!next) await page.waitForTimeout(250)
    }
    check('a skip’s replacement is drawn by the new engine, among real moves alone, the skipped one left out', next?.draw?.engine === 'repair-1' && !next.candidates.includes('nothing') && !next.candidates.includes(first?.moveId), `${next?.draw?.engine} · ${next?.candidates?.length} candidates`)
    await ctx.close()
  }
  {
    // The pickup-time move, on a day with no move offered before it, so the day's rule leaves its candidates whole.
    const { ctx, page } = await fresh('owner', { days: 10 })
    const offersToday = () =>
      page.evaluate(async () => {
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
        return rows.filter((o) => o.day === today)
      })
    await page.evaluate(async () => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['settings', 'days'], 'readwrite')
      const s = await new Promise((res) => {
        const q = tx.objectStore('settings').get(1)
        q.onsuccess = () => res(q.result)
      })
      tx.objectStore('settings').put({ ...s, week: { ...s.week, pickupTime: '17:00' } })
      tx.objectStore('days').delete('2026-09-24')
      await new Promise((res) => (tx.oncomplete = res))
      dbx.close()
    })
    await page.clock.setFixedTime(new Date(2026, 8, 24, 16, 0))
    await page.reload()
    let pickup = null
    for (let i = 0; i < 20 && !pickup; i++) {
      pickup = (await offersToday()).find((o) => o.kind === 'pickup') ?? null
      if (!pickup) await page.waitForTimeout(250)
    }
    check('the pickup-time move is drawn by the new engine, never nothing extra', pickup?.draw?.engine === 'repair-1' && !pickup.candidates.includes('nothing') && pickup.candidates.includes(pickup.moveId), `${pickup?.draw?.engine} · ${pickup?.moveId}`)
    await ctx.close()
  }
  {
    // The engine failing (2026-10-20: no fallback): the test browsers' stand-in for a record no test foresaw, every rebuild throwing.
    const { ctx, page } = await fresh('fault', { days: 10 })
    check('with every rebuild throwing, Now offers no learning week', (await page.getByTestId('week-invite').count()) === 0)
    await checkIn(page)
    const offer = await todaysOffer(page)
    const nowLine = page.getByTestId('engine-failed-now')
    check('a check-in draws no move, by this engine or any other, and Now says so where the move would be', offer === null && (await seen(nowLine)) && ((await nowLine.textContent().catch(() => '')) ?? '').startsWith('No move this time: the learning engine could not read your record.'), String(offer?.draw?.engine ?? 'no offer'))
    if (await nowLine.isVisible()) await shot(nowLine, 'retire-now-failed')
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click()
    const fault = page.getByTestId('repair-fault')
    const said = await seen(fault)
    check('Evidence says the engine failed in place of its tests, with no Cards, and the day’s count kept', said && (await seen(page.getByTestId('engine-failed'))) && (await page.getByRole('heading', { name: 'Cards', exact: true }).count()) === 0 && /^The learning engine could not read your record 2 times on \w{3}, \w{3} \d{1,2}\. Each time, no move was offered/.test(((await fault.textContent().catch(() => '')) ?? '').trim()))
    if (said) await shot(fault, 'retire-fault-line')
    await ctx.close()
  }
  {
    // Stage R4b: a passive item's association at Promising proposes a one-tap test. Fourteen days that read alike, the
    // recovery gap riding alongside on alternate evenings with social energy high the morning after, and its card.
    const { ctx, page } = await fresh('owner', { days: 0 })
    await page.evaluate(async () => {
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
      const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'cards'], 'readwrite')
      const today = new Date()
      let k = 0
      let gapYesterday = false
      for (let d = 14; d >= 1; d--) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d)
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        for (const block of Object.keys(blocks)) {
          k++
          const answers = {}
          for (const id of blocks[block]) answers[id] = 3
          if (block === 'morning') answers.socialEnergy = gapYesterday ? 5 : 1
          const done = new Date(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40).getTime() + 95_000).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: done, completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
          const moveId = k % 2 ? 'walk-ten' : 'nothing'
          const gap = block === 'evening' && d % 2 === 0
          const offerId = await new Promise((res) => {
            const q = tx.objectStore('offers').add({ kind: 'block', day, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: gap ? 'recovery-gap' : null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done })
            q.onsuccess = () => res(q.result)
          })
          tx.objectStore('outcomes').add({ offerId, moveId, day, block, at: done, outcome: 'done', why: null, passiveOutcome: gap ? 'done' : null, seen: true })
          if (block === 'evening') gapYesterday = gap
        }
      }
      tx.objectStore('cards').add({ createdAt: new Date(today.getTime() - 14 * 86_400_000).toISOString(), situationKey: 'passive:evening', block: 'evening', target: 'socialEnergy', moveId: 'recovery-gap', alternativeId: 'nothing', window: 'nextMorning', worthwhile: 1, origin: 'passive' })
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    })
    await page.reload()
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click()
    const gapCard = page.getByTestId('evidence-card').filter({ hasText: 'Keep the evening after a big social day empty' })
    const offer = gapCard.getByTestId('passive-test-offer')
    const proposed = await seen(offer)
    check('Rode alongside: the recovery gap’s association at Promising proposes a one-tap test on energy the next morning', proposed && ((await offer.textContent().catch(() => '')) ?? '').includes('Test it on Energy over the next morning'))
    if (proposed) {
      await shot(gapCard, 'r4b-proposed')
      await offer.getByTestId('passive-test-start').click()
    }
    check('one tap sets it, and the card says it is being tested', await seen(gapCard.getByTestId('passive-test-running').filter({ hasText: 'Being tested since Thu, Sep 24' })))
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
