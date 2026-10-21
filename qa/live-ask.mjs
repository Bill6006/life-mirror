// Ask Life Mirror, stage A1 (2026-10-19), on the live site in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set). Open as it
// ships since stage A4 (2026-10-21): every context runs with no test key, as the owner's phone does. The question box and only
// the starters with something to say; "What do you know" answered at once from the repair's read; its thread in Recent; a
// typed question waiting with the findings its words name, and cancelled; "Ask about this" from Evidence, and back.
// Stage A2: Claude's answer with the findings it cited (folded under "What this rests on" until tapped, 2026-10-21), and no
// checked answer said plainly. Stage A3: "Test it" for a question naming one test, with the context it names and the asking
// kept; "Add this as a note", kept, listed under Your words and removed there.
// node live-ask.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium, tab } from './common.mjs'

const want = process.argv[2]
const SHOTS = process.argv[3] ?? null
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const KEY = 'life-mirror.preview.ask'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const seen = async (loc, ms = 8000) => loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
// A fixed afternoon, so the block and the stand-in days are the same whatever hour the check runs.
const WHEN = new Date(2026, 8, 24, 13, 30)

const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A fresh context on the fixed afternoon; with `preview`, the test key set before the page opens. */
async function fresh(preview) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(
    ([key, on]) => {
      try {
        localStorage.setItem('lm.inStep', '1')
        // No test key: Ask runs as the owner's phone runs it (stage A4).
        void key
        void on
      } catch {
        // A page without local storage stays closed.
      }
    },
    [KEY, preview],
  )
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  return { ctx, page }
}

/**
 * Days of a stand-in record written straight into the phone's store: each check-in complete, each with a fair draw between
 * the walk and nothing extra, seen and answered; stress reads lowest after a walk. The same record as the browser tests'.
 */
async function seedRecord(page, n) {
  await page.evaluate(async (days) => {
    const fits = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']
    const coin = (slot) => {
      let a = (slot * 7919 + 13) | 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < 0.5
    }
    let last = null
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
    for (let d = days; d >= 1; d--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      for (const block of Object.keys(blocks)) {
        k++
        const answers = {}
        blocks[block].forEach((id, ri) => {
          answers[id] = 1 + ((k + ri) % 5)
        })
        if (last !== null) answers.stress = last === 'walk-ten' ? 1 : 5
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
        const done = new Date(at.getTime() + 95_000).toISOString()
        tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
        const moveId = coin(k - 1) ? 'walk-ten' : 'nothing'
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
  }, n)
}

/** A thread Claude answered and one it could not, written straight into the phone's store, as the brain's rows would leave them (stage A2). */
async function seedClaude(page) {
  await page.evaluate(async () => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['askThreads', 'askTurns', 'askAnswers'], 'readwrite')
    const at = new Date(Date.now() - 86_400_000).toISOString()
    const day = at.slice(0, 10)
    const one = async (question, answer) => {
      const threadId = await new Promise((res) => {
        const q = tx.objectStore('askThreads').add({ day, at, title: question, from: { kind: 'typed' } })
        q.onsuccess = () => res(q.result)
      })
      const turnId = await new Promise((res) => {
        const q = tx.objectStore('askTurns').add({ threadId, day, at, question, tier: 'standard', state: 'waiting', kind: 'typed', version: 'earlier', cited: [], updatedAt: at })
        q.onsuccess = () => res(q.result)
      })
      tx.objectStore('askAnswers').put({ id: `turn:${turnId}`, turnId, threadId, day, at, ...answer })
    }
    await one('Does a nap help my energy?', { status: 'answered', text: 'A stand-in answer, as Claude would write one.\n\nAnd a second paragraph, shorter.', factIds: ['ladder.nap-ten.energy'], cardIds: [], facts: [{ id: 'ladder.nap-ten.energy', text: 'Test: a stand-in fact, as the run read it.' }], model: 'claude-opus-5-5' })
    await one('Why are my mornings flat?', { status: 'failed', reason: 'a stand-in' })
    // Stage A3: an answer that names a test and marks the question as a note.
    await one('The neighbours had a party until two.', { status: 'answered', text: 'A stand-in answer: that is a note of the night, not a reading.', factIds: [], cardIds: [], facts: [], model: 'claude-opus-5-5', test: 'walk-ten|mood|nextBlock', noteOffer: true })
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

try {
  {
    // Open as it ships (stage A4): the Ask button with no test key, as on the owner's phone; and the build is the one pushed.
    const { ctx, page } = await fresh(false)
    await tab(page, 'Mirror')
    await page.getByRole('heading', { name: 'Mirror' }).waitFor()
    check('open as it ships: Mirror has the Ask button with no test key', (await page.getByTestId('ask-open').count()) === 1)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh(true)
    // An empty record: the question box, and no starter, since none has anything to say yet.
    await tab(page, 'Mirror')
    check('in its preview, Mirror’s header holds Ask', (await text(page.getByTestId('ask-open'))) === 'Ask')
    await page.getByTestId('ask-open').click()
    check('its question box comes first', await seen(page.getByTestId('ask-box')))
    check('an empty record shows no starter', (await page.locator('[data-testid^="ask-starter-"]').count()) === 0)
    // A month of stand-in record: the starters with something to say.
    await seedRecord(page, 30)
    await page.reload()
    await tab(page, 'Mirror')
    await page.getByTestId('ask-open').click()
    check('"What do you know" is offered', (await text(page.getByTestId('ask-starter-know'))) === 'What do you know about me so far?')
    check('"What should we test next" is offered', await seen(page.getByTestId('ask-starter-next')))
    check('"What’s changed" waits for a first read', (await page.getByTestId('ask-starter-changed').count()) === 0)
    await shot(page.getByTestId('ask'), 'ask-main')
    await page.getByTestId('ask-starter-know').click()
    const answer = page.getByTestId('ask-answer')
    check('it answers at once, from the repair’s read', (await text(answer)).includes('A ten-minute walk, now, for Stress over the next block'), (await text(answer)).slice(0, 120))
    check('with the tests being run', (await text(answer)).includes('Being tested now'))
    await shot(page.getByTestId('ask-thread'), 'ask-know')
    await page.locator('.sub-head .back').click()
    const row = page.getByTestId('ask-thread-row')
    check('its thread stands in Recent, answered', (await text(row)).includes('What do you know about me so far?') && (await text(row)).includes('answered'), await text(row))
    // A typed question: written at once, waiting, the findings its words name shown; cancelled.
    await page.getByTestId('ask-box').fill('Does a walk help my stress?')
    await page.getByTestId('ask-send').click()
    check('a typed question waits for Claude, saying plainly that this phone keeps no cloud copy', (await text(page.getByTestId('ask-waiting'))).startsWith('Claude’s answers come through your cloud copy'), await text(page.getByTestId('ask-waiting')))
    check('with the findings its words name', (await text(page.getByTestId('ask-matches'))).includes('A ten-minute walk, now, for Stress over the next block'))
    await shot(page.getByTestId('ask-thread'), 'ask-waiting')
    await page.getByTestId('ask-cancel').click()
    check('and it can be cancelled', await seen(page.getByTestId('ask-cancelled')))
    // "Ask about this" on Evidence: a thread with the test attached, answered at once; back returns to Evidence.
    await page.locator('.sub-head .back').click()
    await page.locator('.sub-head .back').click()
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click()
    await page.getByTestId('repair-test').filter({ hasText: 'Stress' }).first().getByTestId('repair-ask').click()
    check('"Ask about this" on Evidence asks about that test', (await text(page.getByTestId('ask-question'))) === 'About A ten-minute walk, now, for Stress over the next block', await text(page.getByTestId('ask-question')))
    const about = await text(page.getByTestId('ask-answer'))
    check('and gives it whole: an established call, its counts, and nothing of what would settle it', about.includes('Established: helps') && about.includes('Offered') && !about.includes('What would settle it'), about.slice(0, 80))
    await shot(page.getByTestId('ask-thread'), 'ask-about')
    await page.locator('.sub-head .back').click()
    await page.locator('.sub-head .back').click()
    check('back returns to Evidence', await seen(page.getByTestId('repair-test')))
    // Stage A2: Claude's answer, when it comes, with the findings it cited; and no checked answer, said plainly.
    await seedClaude(page)
    await page.reload()
    await tab(page, 'Mirror')
    await page.getByTestId('ask-open').click()
    await page.getByTestId('ask-past-open').click()
    await page.getByTestId('ask-thread-row').filter({ hasText: 'Does a nap help my energy?' }).click()
    check('Claude’s answer shows in its words', (await text(page.getByTestId('ask-claude'))).includes('A stand-in answer, as Claude would write one.'))
    check('in its own paragraphs', (await page.getByTestId('ask-claude').locator('.ask-claude-text').count()) === 2)
    // What it rests on starts folded (2026-10-21): the coaching leads, and the findings it cited are one tap away.
    const fold = page.getByTestId('ask-claude-cited-open')
    check('what it rests on starts folded', (await text(fold)) === 'What this rests on' && (await fold.getAttribute('aria-expanded')) === 'false' && (await page.getByTestId('ask-claude-cited').count()) === 0, await text(fold))
    await shot(page.getByTestId('ask-thread'), 'ask-claude-folded')
    await fold.click()
    check('and unfolds to the findings it cited', (await text(page.getByTestId('ask-claude-cited'))).includes('Test: a stand-in fact, as the run read it.'))
    await shot(page.getByTestId('ask-thread'), 'ask-claude')
    await page.getByTestId('ask-delete').click()
    check('deleting a thread a run read says a copy stays on claude.ai', (await text(page.getByTestId('ask-delete-copy'))).includes('claude.ai'))
    await page.getByTestId('ask-delete-no').click()
    await page.locator('.sub-head .back').click()
    await page.getByTestId('ask-past-open').click()
    await page.getByTestId('ask-thread-row').filter({ hasText: 'Why are my mornings flat?' }).click()
    check('no checked answer is said plainly, never an unchecked one', (await text(page.getByTestId('ask-no-checked'))).startsWith('Couldn’t produce a checked answer.') && (await page.getByTestId('ask-claude').count()) === 0)
    // Stage A3: a question naming one test and a context; "Test it" opens its card.
    await page.locator('.sub-head .back').click()
    await page.getByTestId('ask-box').fill('Does a walk help my mood on office days?')
    await page.getByTestId('ask-send').click()
    await page.getByTestId('ask-test-it').click()
    const card = await text(page.getByTestId('ask-test-card'))
    check('"Test it" opens the test’s card: against nothing extra, its unit, the second measure, the fixed thresholds, pre-registered', card.startsWith('The test this asks about') && card.includes('A ten-minute walk, now, for Mood over the next block') && card.includes('compared with nothing extra') && card.includes('Each check-in where it fits is its own draw.') && card.includes('as a second measure') && card.includes('the same thresholds for every test') && card.includes('or for 45 days, longer while it shows at least an early sign of helping') && card.includes('Pre-registered on'), card.slice(0, 100))
    check('the context the question names is the test’s own, read on those days', (await text(page.getByTestId('ask-test-context'))).startsWith('At the office: no call of its own yet.'))
    check('the question itself asked about the test today: said, and no second tap offered today', (await text(page.getByTestId('ask-sooner-done'))).startsWith('Asked about on') && (await page.getByTestId('ask-sooner').count()) === 0)
    await shot(page.getByTestId('ask-test-card'), 'ask-test-card')
    // "Add this as a note" under an answer that marks a stated fact; kept, it is listed under Your words, and removed there.
    await page.locator('.sub-head .back').click()
    await page.getByTestId('ask-past-open').click()
    await page.getByTestId('ask-thread-row').filter({ hasText: 'The neighbours had a party' }).click()
    check('an answer marking a stated fact offers "Add this as a note", and "Test it" for the test it names', (await seen(page.getByTestId('ask-note'))) && (await seen(page.getByTestId('ask-test-it'))))
    await page.getByTestId('ask-note').click()
    check('the note starts as the question’s own words', (await page.getByTestId('ask-note-text').inputValue()) === 'The neighbours had a party until two.')
    await shot(page.getByTestId('ask-note-edit'), 'ask-note-edit')
    await page.getByTestId('ask-note-keep').click()
    check('kept, it says so and where it is', (await text(page.getByTestId('ask-note-kept'))).includes('with your words under Mirror'), await text(page.getByTestId('ask-note-kept')))
    // Back to Mirror: each screen drawn before it is read, the words row or a way back.
    for (let i = 0; i < 4; i++) {
      const door = page.getByTestId('words-door')
      const back = page.locator('.sub-head .back')
      await door.or(back).first().waitFor({ state: 'visible' })
      if (await door.isVisible()) break
      await back.click()
    }
    await page.getByTestId('words-door').click()
    check('Your words lists the kept note', (await text(page.getByTestId('words-kept-note'))).includes('The neighbours had a party until two.'))
    await shot(page.getByTestId('words'), 'ask-words-kept')
    await page.getByTestId('words-kept-remove').click()
    check('removing it asks for a second tap', (await text(page.getByTestId('words-kept-remove'))) === 'Tap again to remove it')
    await page.getByTestId('words-kept-remove').click()
    check('and then it is gone', await page.getByTestId('words-kept').first().waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false))
    await ctx.close()
  }

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
