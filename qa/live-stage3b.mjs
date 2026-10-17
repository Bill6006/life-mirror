// Stage 3, groups 1 and 2, on the live site, in fresh throwaway contexts with stand-in records only:
// nothing touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is
// ever set). Group 1: the day's sheet carries the memory of a line seen, the weekly view's analyses and
// trends read by the week. Group 2: the Plan when chips in the order the record keeps them, and a plan's
// reminder at the moment its steps have started after that cue.
// node live-stage3b.mjs <expected short commit>
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
const DAY = '2026-09-08'

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

/**
 * Stand-in records for the commitment just added: twenty-four days of check-ins; three plans at the next
 * check-in kept, each started thirty minutes after its cue; one after her bedtime never started; and on
 * Sep 7 a line seen asking for a plan at the next check-in, the plan made and a session started that day.
 * A fresh install numbers its ids from a base taken from the clock, so the commitment's own id is used.
 */
async function seed(page, aimId) {
  await page.evaluate(async (aimId) => {
    const blocks = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'intentions', 'offers', 'briefLog'], 'readwrite')
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (let i = 1; i <= 24; i++) {
      const date = new Date(2026, 8, 8 - i)
      for (const block of ['morning', 'evening']) {
        const answers = {}
        for (const id of blocks[block]) answers[id] = 1 + ((i + id.length) % 5)
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
        const done = new Date(at.getTime() + 95_000).toISOString()
        tx.objectStore('checkins').add({ day: key(date), block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
      }
    }
    // Closed, as a step whose question has been asked, so nothing stands open on the card today.
    const step = (id, d, h, m) => ({ id, kind: 'step', day: `2026-09-0${d}`, block: 'afternoon', at: new Date(2026, 8, d, h, m).toISOString(), situationKey: 'aim:certification', target: 'focus', stance: '', band: '', reading: 0, moveId: 'skill:1', cardId: null, candidates: ['skill:1'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: new Date(2026, 8, d, 21).toISOString() })
    for (const d of [1, 2, 3]) {
      tx.objectStore('offers').add(step(100 + d, d, 13, 30))
      tx.objectStore('intentions').add({ aimId, day: `2026-09-0${d}`, cue: 'nextCheckIn', time: '13:00', setAt: new Date(2026, 8, d, 9).toISOString(), offerId: 100 + d })
    }
    tx.objectStore('intentions').add({ aimId, day: '2026-09-04', cue: 'afterBedtime', time: '20:00', setAt: new Date(2026, 8, 4, 9).toISOString(), offerId: null })
    tx.objectStore('offers').add(step(107, 7, 14, 0))
    tx.objectStore('intentions').add({ aimId, day: '2026-09-07', cue: 'nextCheckIn', time: '13:00', setAt: new Date(2026, 8, 7, 8, 5).toISOString(), offerId: 107 })
    tx.objectStore('briefLog').add({ day: '2026-09-07', situationId: 'say-when', mode: 'recommendation', text: 'A stand-in line.', factIds: [`aim.${aimId}`], cardIds: [], action: { kind: 'plan', aimId, cue: 'nextCheckIn' }, at: new Date(2026, 8, 7, 7, 30).toISOString(), shownAt: new Date(2026, 8, 7, 8, 0).toISOString() })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, aimId)
  await page.reload()
  await page.waitForTimeout(1500)
}

try {
  {
    // A Tuesday morning: her bedtime and the next check-in are still ahead, and no pickup is set.
    const { ctx, page } = await fresh(new Date(2026, 8, 8, 9, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    // About is a screen of its own, with no tabs: back to them.
    await page.reload()
    await page.waitForTimeout(600)
    await tab(page, 'Aims')
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId('aim-kind-certification').click()
    await page.getByTestId('aim-goal-input').fill('Veltish')
    await page.getByTestId('aim-learn-add').click()
    const added = page.getByTestId('aim-card').filter({ hasText: 'Veltish' })
    await seen(added)
    // Its skill set by hand, so it has a step to plan.
    await added.getByTestId('aim-skill-own').click()
    await added.getByTestId('aim-skill-set-name').fill('Ten words')
    await added.getByTestId('aim-skill-set-save').click()
    await seen(added.getByTestId('aim-step').filter({ hasText: 'Ten words' }))
    const aimId = (await rowsOf(page, 'aims')).find((a) => a.name === 'Veltish')?.id
    await seed(page, aimId)

    // Group 1: the sheet the app writes for the day, as the Worker would read it, once it has been written from the seeded record.
    let facts = []
    for (let i = 0; i < 20 && !facts.some((f) => f.id.startsWith('trend.')); i++) {
      await page.waitForTimeout(500)
      facts = (await rowsOf(page, 'facts')).find((r) => r.day === DAY)?.sheet?.facts ?? []
    }
    const byId = (id) => facts.find((f) => f.id === id)
    const memory = byId('memory.2026-09-07')
    check('the sheet remembers the line seen: what it asked and that the plan was made and kept', Boolean(memory?.text?.startsWith('The line seen on 2026-09-07 asked for a plan for Veltish at the next check-in: a plan was made that day, and a step was started that day')), memory?.text ?? `${facts.length} facts, none of its memory`)
    const weekly = facts.filter((f) => f.id.startsWith('weekly.'))
    check('the sheet carries the weekly view’s analyses, with no tags', ['weekly.scorecard', 'weekly.gap', 'weekly.moved', 'weekly.best', 'weekly.lasts', 'weekly.health'].every((id) => byId(id)) && weekly.every((f) => f.tags.length === 0), weekly.map((f) => f.id).join(', ') || 'none')
    check('trends are read by the week', Boolean(byId('trend.mood')?.text?.startsWith('Mood: the 7 days to yesterday average')), byId('trend.mood')?.text ?? 'no trend.mood')

    // Group 2: the chips in the order the record keeps them, and the reminder at the moment the record says.
    await page.reload()
    await tab(page, 'Aims')
    const card = page.getByTestId('aim-card').filter({ hasText: 'Veltish' })
    const opened = await card.getByTestId('aim-plan-open').click({ timeout: 8000 }).then(() => true, () => false)
    await seen(card.getByTestId('aim-cue-nextCheckIn'))
    const order = await card.locator('[data-testid^="aim-cue-"]:not([data-testid="aim-cue-count"])').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    check('Plan when shows the cue the record keeps first', opened && order[0] === 'aim-cue-nextCheckIn' && order.includes('aim-cue-afterBedtime'), order.join(', '))
    await card.getByTestId('aim-cue-nextCheckIn').click({ timeout: 8000 }).catch(() => undefined)
    let plan
    for (let i = 0; i < 10 && !plan; i++) {
      await page.waitForTimeout(300)
      plan = (await rowsOf(page, 'intentions')).filter((p) => p.day === DAY).pop()
    }
    const plus30 = (t) => {
      const [h, m] = t.split(':').map(Number)
      const at = h * 60 + m + 30
      return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`
    }
    check('the plan keeps its cue’s time and is reminded thirty minutes on, as its starts were', Boolean(plan && plan.remindAt === plus30(plan.time)), plan ? `time ${plan.time}, remindAt ${plan.remindAt ?? 'none'}` : 'no plan made')
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
