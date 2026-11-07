import { expect, test, type Locator, type Page } from '@playwright/test'

// The speaking Path (P4 of the AI-generated Paths design, 2026-11-06), driven as the owner would: read on
// one screen, labelled experimental, before anything runs; Later puts it away; started with its two
// questions, the app's own help on a yes, and where it starts; a rep recorded of yourself on this phone
// with a line written before Start, its sheet right after Done, and the recording checked the next day;
// a stage-2 rep with the phone handed to someone who was there; and the chance after Partly. The
// browser's microphone is Chromium's fake one.

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['microphone'],
})

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {
      // A page without local storage counts as in step anyway.
    }
  })
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

const RECORDED = ['Record one story and listen back once', 'Read one page aloud, as if to a room', 'Record one point']
const TO_FEW = ['One point to a few people you know', 'Explain something you know well', 'A story with a point']

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click()
}

async function details(card: Locator): Promise<void> {
  const toggle = card.getByTestId('path-details')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

/** Every row of a store, read in the page. */
async function rows(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (s) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const all = await new Promise<Record<string, unknown>[]>((res, rej) => {
      const q = dbx.transaction([s], 'readonly').objectStore(s).getAll()
      q.onsuccess = () => res(q.result as Record<string, unknown>[])
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return all.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Blob ? `blob:${v.size}` : v])))
  }, store)
}

/** Rows put straight into the phone's store. */
async function putAll(page: Page, store: string, list: Record<string, unknown>[]): Promise<void> {
  await page.evaluate(
    async ({ store, list }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([store], 'readwrite')
      for (const r of list) tx.objectStore(store).put(r)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { store, list },
  )
}

/** Reads and starts the speaking Path from the add sheet, Speaking to several people alone, no Nerves. */
async function startSpeaking(page: Page): Promise<void> {
  await tab(page, 'Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-path-speaking').click()
  await page.getByTestId('path-read-start').click()
  await page.getByTestId('path-start-focus-speaking').click()
  await page.getByTestId('path-start-begin').click()
  await expect(page.locator('[data-path="speaking"][data-kind="path"]')).toHaveCount(1)
}

test('the speaking Path: read on one screen, labelled experimental, set aside, then started with its two questions; a rep recorded of yourself, its sheet right after Done, the recording checked the next day', async ({ page }) => {
  // A Monday morning. No check-in: nothing here needs anyone around.
  await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
  await page.goto('./')

  // Aims: the new Path is there to read, and nothing of it runs.
  await tab(page, 'Aims')
  const fresh = page.getByTestId('path-new')
  await expect(fresh).toHaveCount(1)
  await expect(fresh).toContainText('A new Path to read')
  await expect(fresh).toContainText('experimental. Nothing runs until you start it.')
  await expect(page.locator('[data-kind="path"]')).toHaveCount(0)
  await fresh.getByTestId('path-new-read').click()

  // One screen: what it is, its strands, what counts and never counts, what it leaves out, what it rests on.
  const read = page.getByTestId('path-read')
  await expect(read.getByTestId('path-read-label')).toHaveText('Experimental')
  await expect(read.getByTestId('path-read-strands')).toContainText('Speaking to several people: Recorded alone · A few people you know · A meeting or a group · A short talk')
  await expect(read).toContainText('anyone’s reaction, yes or no; how many people listened; laughs, replies or applause.')
  await expect(read).toContainText('Power posing:')
  await expect(read.getByTestId('path-read-basis')).toContainText('12 decisions, each with its basis: 1 on direct evidence, 3 on indirect evidence, 1 on expert advice, 2 on an inference, 5 on design judgment.')
  await expect(read.getByTestId('path-read-basis')).toContainText('31 claim cards, each source verified; 4 of them disputed, cited only beside what it leaves out.')
  await expect(read.getByTestId('path-read-basis')).toContainText('Least sure: No trial has tested this structure, or any other, for this goal.')
  // What it asks a week, about how long, and your own week read against its stages (a fresh week holds church).
  await expect(read.getByTestId('path-read-asks')).toContainText('A rep takes 1 to 15 minutes, about 3 as a rule, one a day at most: about 9 minutes a week beside another path, about 21 on its own.')
  await expect(read.getByTestId('path-read-asks')).toContainText('Months, step by step, with no fixed end')
  await expect(read.getByTestId('path-read-week')).toContainText('By its schedule your week holds church, where the stages that ask for a meeting or a group can happen: A voice in a group; A meeting or a group; The talk you would avoid.')
  await read.getByTestId('path-read-why').click()
  await expect(read.getByTestId('path-decision')).toHaveCount(12)
  await expect(read.getByTestId('path-decision').first()).toContainText('Rests on design judgment · 3 cards')

  // Later: put away, offered nowhere, still in the add sheet, where it says so.
  await read.getByTestId('path-read-later').click()
  await tab(page, 'Aims')
  await expect(page.getByTestId('path-new')).toHaveCount(0)
  await expect(page.locator('[data-kind="path"]')).toHaveCount(0)
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await expect(page.getByTestId('aim-kind-path-social')).toBeVisible()
  await page.getByTestId('aim-kind-path-speaking').click()
  await expect(page.getByTestId('path-read-set-aside')).toHaveText('Set aside for later: offered nowhere until you start it.')

  // Start: two questions whose answers are not kept; a yes shows the app's own help first and turns Nerves on, yours to turn off.
  await page.getByTestId('path-read-start').click()
  const start = page.getByTestId('path-start')
  await expect(start.getByTestId('path-start-question')).toHaveCount(2)
  await expect(start).toContainText('Your answers are not kept: only the strands you choose.')
  await expect(start.getByTestId('path-start-help')).toHaveCount(0)
  await expect(start.getByTestId('path-start-begin')).toBeDisabled()
  await start.getByTestId('path-start-avoid-yes').click()
  await expect(start.getByTestId('path-start-help')).toContainText('a doctor or a psychologist can help')
  await expect(start.getByTestId('path-start-help')).toContainText('practice, not treatment')
  await expect(start.getByTestId('path-start-nerves')).toHaveAttribute('aria-pressed', 'true')
  await start.getByTestId('path-start-nerves').click()
  await expect(start.getByTestId('path-start-nerves')).toHaveAttribute('aria-pressed', 'false')
  await start.getByTestId('path-start-focus-speaking').click()
  await start.getByTestId('path-start-begin').click()

  // The card: labelled, one strand on, its first stage recorded alone; the answers left no trace.
  const card = page.locator('[data-path="speaking"][data-kind="path"]')
  await expect(card).toHaveCount(1)
  await expect(card.getByTestId('path-label')).toHaveText('Experimental')
  await expect(card.getByTestId('path-strand')).toHaveCount(1)
  await expect(card.getByTestId('path-strand')).toContainText('Speaking to several people')
  await expect(card.getByTestId('strand-numbers')).toHaveText('0 practised · shown in 0 of 1 kind of setting · 0 of 1 checked from outside the moment')
  const aims = await rows(page, 'aims')
  expect(aims.map((a) => a.strands)).toEqual([['speaking']])
  expect(JSON.stringify(aims)).not.toMatch(/avoid|afraid/)
  expect((await rows(page, 'pathVersions')).map((v) => [v.path, v.decision])).toEqual([['speaking', 'later'], ['speaking', 'started']])

  // Now: one People row, said with the rep's own strand and stage.
  await tab(page, 'Now')
  const row = page.locator('[data-kind="path"]')
  await expect(row.getByTestId('path-stage')).toContainText('The Speaking path · Speaking to several people · Recorded alone')
  const rep = ((await row.getByTestId('aim-step').textContent()) ?? '').trim()
  expect(RECORDED).toContain(rep)

  // Start asks one optional line first; the line is kept with the step.
  await row.getByTestId('aim-start').click()
  // One Start at a time: the line's own.
  await expect(row.getByTestId('aim-start')).toHaveCount(0)
  await row.getByTestId('path-predict-input').fill('I will rush the ending')
  await row.getByTestId('path-predict-start').click()
  await expect(row.getByTestId('aim-started')).toBeVisible()
  const offers = await rows(page, 'offers')
  expect(offers.map((o) => [o.moveId, o.prediction, o.paths])).toEqual([[expect.any(String), 'I will rush the ending', ['speaking']]])

  // Record yourself, then Stop: kept on this phone, never queued for the cloud.
  await row.getByTestId('path-record').click()
  await expect(row.getByTestId('path-recording')).toBeVisible()
  await page.waitForTimeout(1500)
  await row.getByTestId('path-record-stop').click()
  await expect(row.getByTestId('path-recorded')).toBeVisible()
  await expect(row.getByTestId('path-record')).toHaveText('Record again')
  const recordings = await rows(page, 'recordings')
  expect(recordings).toHaveLength(1)
  expect(String(recordings[0].audio)).toMatch(/^blob:[1-9]/)
  expect((await rows(page, 'outbox')).map((r) => r.store)).not.toContain('recordings')

  // Done: the sheet asks how hard it was and says the recording waits for tomorrow.
  await row.getByTestId('aim-done').click()
  const sheet = row.getByTestId('path-sheet')
  await expect(sheet.getByTestId('path-sheet-expected')).toHaveText('You expected: I will rush the ending')
  await expect(sheet.getByTestId('path-sheet-recorded')).toContainText('Check it tomorrow or later')
  await expect(sheet.getByTestId('path-check-opening')).toHaveCount(0)
  // A rep recorded alone has no one to hand the phone to.
  await expect(sheet.getByTestId('path-hand-over')).toHaveCount(0)
  await sheet.getByTestId('path-effort-3').click()
  await expect(sheet.getByTestId('path-effort-3')).toHaveAttribute('aria-pressed', 'true')
  // Against what you expected, in the words the app already has.
  await sheet.getByTestId('path-sheet-expect-harder').click()
  await expect.poll(async () => (await rows(page, 'outcomes')).map((x) => [x.effort, x.expectancy])).toEqual([[3, 'harder']])

  // The same day the recording is not yet listed to check.
  await tab(page, 'Aims')
  await expect(card.getByTestId('path-recordings')).toHaveCount(0)

  // The next day: the recording to check, a line first, then the sound, then the behaviours it shows.
  await page.clock.setFixedTime(new Date(2026, 10, 10, 9, 5))
  await page.reload()
  await tab(page, 'Aims')
  await expect(card.getByTestId('path-recording-due')).toContainText(`${rep}, yesterday`)
  await card.getByTestId('path-recording-check').click()
  const check = page.getByTestId('recording-check')
  await expect(check.getByTestId('recording-audio')).toHaveCount(0)
  await check.getByTestId('recording-note').fill('Rushed the end')
  await expect(check.getByTestId('recording-audio')).toBeVisible()
  await expect(check.getByTestId('recording-space')).toHaveText(/^It takes \d+ KB on this phone\.$/)
  for (const b of ['opening', 'pauses', 'example']) await check.getByTestId(`recording-check-${b}`).click()
  await check.getByTestId('recording-save').click()
  await tab(page, 'Aims')
  await expect(card.getByTestId('path-recordings')).toHaveCount(0)
  expect((await rows(page, 'outcomes')).map((x) => [x.recordingChecks, x.recordingNote])).toEqual([[['opening', 'pauses', 'example'], 'Rushed the end']])
  // One rep practised; the stage's behaviours shown once, from outside the moment.
  await expect(card.getByTestId('strand-numbers')).toHaveText('1 practised · shown in 1 of 1 kind of setting · 1 of 1 checked from outside the moment')

  // Details: why it is built this way, and the strands on, never none.
  await details(card)
  await expect(card.getByTestId('path-why-built').getByTestId('path-decision')).toHaveCount(12)
  await card.getByTestId('path-strand-on-nerves').click()
  await expect(card.getByTestId('path-strand')).toHaveCount(2)
  await card.getByTestId('path-strand-on-speaking').click()
  await card.getByTestId('path-strand-on-nerves').click()
  await expect(card.getByTestId('path-strand-on-nerves')).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByTestId('path-strand')).toHaveCount(1)
})

test('the speaking Path at its second stage: your checks right after Done, then the phone handed to someone who was there, who marks what they noticed and no name', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 23, 9, 5))
  await page.goto('./')
  await startSpeaking(page)
  // Three weeks of recorded reps: six, of three different reps, in one kind of setting, each meeting three of the four
  // behaviours, one of them confirmed on its recording the next day. The first stage is shown, so the second is today's.
  const aim = (await rows(page, 'aims'))[0]
  const reps = ['sp-record-point', 'story-recording', 'read-aloud']
  const days = [20, 17, 13, 10, 6, 3].map((d) => {
    const x = new Date(2026, 10, 23 - d)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  })
  const offers = days.map((day, k) => ({
    id: 900 + k, kind: 'step', day, block: 'morning', at: `${day}T14:00:00.000Z`, situationKey: 'aim:path:speaking', target: 'mood', stance: '', band: '', reading: 0,
    moveId: reps[k % 3], minutes: 5, cardId: null, candidates: [reps[k % 3]], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { [reps[k % 3]]: 1 },
    chosenBy: 'app', paths: ['speaking'], setting: 'solo', rule: 'only', stage: 1, skippedAt: null, closedAt: `${day}T14:10:00.000Z`,
  }))
  const outcomes = offers.map((o, k) => ({
    id: 1900 + k, offerId: o.id, moveId: o.moveId, day: o.day, block: 'morning', at: `${o.day}T14:10:00.000Z`, outcome: 'done', why: null, passiveOutcome: null, reason: 'done', seen: true,
    checks: ['opening', 'pauses', 'example'], ...(k === 4 ? { recordingChecks: ['opening', 'pauses', 'ending'], recordingCheckedAt: `${days[5]}T14:00:00.000Z` } : {}),
  }))
  await putAll(page, 'offers', offers)
  await putAll(page, 'outcomes', outcomes)
  expect(aim.strands).toEqual(['speaking'])
  await page.reload()
  await tab(page, 'Aims')
  const card = page.locator('[data-path="speaking"][data-kind="path"]')
  await expect(card.getByTestId('strand-progress')).toContainText('A few people you know')
  const rep = ((await card.getByTestId('aim-step').textContent()) ?? '').trim()
  expect(TO_FEW).toContain(rep)

  // Start without a line, then Done: the sheet asks which of the four behaviours you did, and offers the hand-over.
  await card.getByTestId('aim-start').click()
  await card.getByTestId('path-predict-start').click()
  await expect(card.getByTestId('aim-started')).toBeVisible()
  expect((await rows(page, 'offers')).filter((o) => !o.closedAt).map((o) => 'prediction' in o)).toEqual([false])
  await expect(card.getByTestId('path-recorder')).toHaveCount(0)
  await card.getByTestId('aim-done').click()
  const sheet = card.getByTestId('path-sheet')
  await sheet.getByTestId('path-check-opening').click()
  await sheet.getByTestId('path-check-example').click()
  await expect(sheet.getByTestId('path-check-opening')).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByTestId('path-hand-over').click()

  // Handed over: large, in their words, nothing about them kept.
  const hand = page.getByTestId('hand-over')
  await expect(hand.locator('h1')).toHaveText('You were there')
  await expect(hand).toContainText('Nothing about you is kept.')
  await expect(hand.getByTestId('hand-check-opening')).toHaveText('A clear opening')
  await hand.getByTestId('hand-check-opening').click()
  await hand.getByTestId('hand-check-ending').click()
  await hand.getByTestId('hand-done').click()

  // Back: your checks and theirs side by side on the record, the sheet still there, the hand-over marked.
  await tab(page, 'Aims')
  await expect(card.getByTestId('path-sheet').getByTestId('path-check-opening')).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByTestId('path-hand-over')).toContainText('✓')
  const today = (await rows(page, 'outcomes')).find((x) => x.day === '2026-11-23')
  expect(today).toMatchObject({ checks: ['opening', 'example'], otherChecks: ['opening', 'ending'] })
  expect(Object.keys(today ?? {}).filter((k) => /name|who|person/i.test(k))).toEqual([])
  await details(card)
  await expect(card.getByTestId('path-calibration')).toHaveText('Your checks beside an outside view, on 2 reps: 5 by you, 5 from outside.')
})

test('a speaking rep answered Partly at the next check-in asks once whether the chance came up, and keeps the answer', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
  await page.goto('./')
  await startSpeaking(page)
  await tab(page, 'Now')
  const row = page.locator('[data-kind="path"]')
  await row.getByTestId('aim-start').click()
  await row.getByTestId('path-predict-start').click()
  await expect(row.getByTestId('aim-started')).toBeVisible()
  // The afternoon's check-in asks first what happened to it.
  await page.clock.setFixedTime(new Date(2026, 10, 9, 13, 5))
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  const ask = page.getByTestId('outcome-ask')
  await ask.getByTestId('outcome').nth(1).click()
  await expect(ask).toContainText('One optional tap: did the chance come up?')
  await ask.getByTestId('chance-yes').click()
  await expect(page.getByTestId('outcome-ask')).toHaveCount(0)
  await expect.poll(async () => (await rows(page, 'outcomes')).map((x) => [x.outcome, x.chance])).toEqual([['partly', true]])
  // On Aims, the Partly rep keeps its sheet for the rest of the day, Resume beside it.
  await page.goto('./')
  await tab(page, 'Aims')
  const card = page.locator('[data-path="speaking"][data-kind="path"]')
  await expect(card.getByTestId('aim-resume')).toBeVisible()
  await card.getByTestId('path-sheet').getByTestId('path-effort-2').click()
  await expect.poll(async () => (await rows(page, 'outcomes')).map((x) => [x.outcome, x.effort])).toEqual([['partly', 2]])
})

// How hard, one to five, on Now's narrower row (2026-11-07): the five figures read as one set at every width the phone
// has. One row wherever five 48-pixel targets fit (256 pixels, with 4 between them), three to a row where they do not,
// so no figure is ever left alone on a line; each keeps its full width.
for (const theme of ['nocturne', 'instrument', 'signal'] as const) {
  test(`${theme}: Now's five effort figures read as one set at 390, 360 and 390 at 130 percent, never one alone on a line`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
    await page.goto('./')
    if (process.env.WIDE_FONT && theme === 'instrument') await page.addStyleTag({ content: ':root, [data-theme] { --font: Verdana, "DejaVu Sans", sans-serif }' })
    await startSpeaking(page)
    await tab(page, 'Now')
    const row = page.locator('[data-kind="path"]')
    await row.getByTestId('aim-start').click()
    await row.getByTestId('path-predict-input').fill('I will rush the ending')
    await row.getByTestId('path-predict-start').click()
    await row.getByTestId('aim-done').click()
    const sheet = row.getByTestId('path-sheet')
    await expect(sheet.getByTestId('path-effort-5')).toBeVisible()
    const laid = () =>
      sheet.evaluate((el) => {
        const chips = [1, 2, 3, 4, 5].map((n) => (el.querySelector(`[data-testid="path-effort-${n}"]`) as Element).getBoundingClientRect())
        const tops = [...new Set(chips.map((c) => Math.round(c.top)))].sort((a, b) => a - b)
        const box = ((el.querySelector('[data-testid="path-effort-1"]') as Element).closest('.figures') as Element | null)?.getBoundingClientRect()
        return {
          room: box?.width ?? 0,
          lines: tops.map((t) => chips.filter((c) => Math.round(c.top) === t).length),
          narrowest: Math.min(...chips.map((c) => Math.round(c.width))),
          inOrder: chips.every((c, i) => i === 0 || c.top > chips[i - 1].top + 1 || c.left >= chips[i - 1].right),
          inside: Boolean(box) && chips.every((c) => c.left >= (box?.left ?? 0) - 0.5 && c.right <= (box?.right ?? 0) + 0.5),
        }
      })
    for (const width of [390, 360, 300]) {
      await page.setViewportSize({ width, height: 844 })
      await expect.poll(async () => (await laid()).lines.length).toBeGreaterThan(0)
      const l = await laid()
      expect(l.narrowest, `${width}: a figure narrower than its 48-pixel target`).toBe(48)
      expect(l.inOrder, `${width}: the figures out of order`).toBe(true)
      expect(l.inside, `${width}: a figure past the room it is given`).toBe(true)
      expect(l.lines, `${width} (room ${l.room}): five to a row where they fit, three to a row where they do not`).toEqual(l.room >= 256 ? [5] : [3, 2])
      // At the phone's own width, with its text at its own size, every theme has room for the five in one row.
      if (width === 390) expect(l.lines).toEqual([5])
    }
  })
}
