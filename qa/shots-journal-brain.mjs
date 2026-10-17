// Screens of the journal's Brain use, from the local preview, with stand-in records only.
// node shots-journal-brain.mjs [base]
import { chromium } from './common.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4179/life-mirror/'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./out', import.meta.url))
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto(BASE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['brainBriefs'], 'readwrite')
    const briefs = tx.objectStore('brainBriefs')
    const common = { mode: 'observation', cardIds: [], model: 'claude-opus-5-5', writer: 'claude', askedModel: 'opus', factsDay: '2026-09-23' }
    briefs.put({ ...common, id: '2026-09-23:brief', day: '2026-09-23', kind: 'brief', text: 'Last night you wrote that the day ran long; a short walk after dinner may suit this evening.', factIds: ['record'], at: '2026-09-23T13:00:00.000Z', facts: [{ id: 'record', text: 'A stand-in fact for the screenshot.' }], journal: ['2026-09-22', '2026-09-20'] })
    briefs.put({ ...common, id: '2026-09-23:review', day: '2026-09-23', kind: 'review', mode: 'strategy', text: 'a b c', factIds: [], at: '2026-09-23T13:01:00.000Z', parts: { held: 'The evening walk held on three days.', didNot: 'The morning plans did not start.', change: 'Plan the walk for after dinner.', question: 'On Monday you wrote that the day ran long; what would make the evening after a long day lighter?' }, journal: ['2026-09-22', '2026-09-21', '2026-09-20'] })
    await new Promise((res) => (tx.oncomplete = res))
    dbx.close()
  })
  await page.reload()
  await page.getByTestId('brief-why').first().click()
  await page.getByTestId('brief-why-panel').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.getByTestId('brief').screenshot({ path: `${OUT}/jb-why.png` })
  await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await page.getByTestId('week-review').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.getByTestId('week-review').screenshot({ path: `${OUT}/jb-review.png` })
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-brain').click()
  await page.getByTestId('brain-switch-journal').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const box = await page.getByTestId('brain-switch-notes').boundingBox()
  const box2 = await page.getByTestId('brain-switch-privateItems').boundingBox()
  await page.screenshot({ path: `${OUT}/jb-brain.png`, clip: { x: 0, y: Math.max(0, box.y - 60), width: 390, height: box2.y + box2.height - box.y + 80 } })
  await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click().catch(() => {})
  console.log('shots written')
} finally {
  await browser.close()
}
