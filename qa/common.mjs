// Shared by the theme build's scripts: serve the built app from dist (read-only), a browser with a
// persistent generic profile, and the generic seed. Nothing here writes to the repository.
import { spawn, execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The repository root: this folder's parent. */
export const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
export const OUT = `${REPO}/qa/out`
export const PORT = 4798
export const BASE = `http://127.0.0.1:${PORT}/life-mirror/`
const require = createRequire(`${REPO}/package.json`)
export const { chromium } = require('@playwright/test')
mkdirSync(`${OUT}/shots`, { recursive: true })

export async function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' })
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(BASE)
      if (r.ok) return proc
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('preview did not start')
}

export function stopServer(proc) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-proc.pid, 'SIGTERM')
  } catch {}
}

export async function openBrowser(name, fresh = false, width = 390, height = 844) {
  const dir = `${OUT}/profile-${name}`
  if (fresh) rmSync(dir, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  return { ctx, page }
}

export async function tab(page, name) {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(450)
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function idb(page, fn, arg) {
  return page.evaluate(
    async ({ src, arg }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const f = new Function('dbx', 'arg', `return (${src})(dbx, arg)`)
      try {
        return await f(dbx, arg)
      } finally {
        dbx.close()
      }
    },
    { src: fn.toString(), arg },
  )
}

/** The generic profile: nine days of check-ins, one invented private item, two study subjects, a practice, both paths, an evening check-in and a Claude line. Nothing personal. */
export async function seed(page, base = BASE) {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto(base)
  await page.getByTestId('direction-input').fill('Finish what I start, for the people who count on me.')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await idb(page, async (dbx) => {
    const blocks = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const hours = { morning: [9, 13], afternoon: [14, 2], evening: [21, 45] }
    const tx = dbx.transaction(['checkins', 'privateItems', 'settings'], 'readwrite')
    tx.objectStore('privateItems').put({ id: 1, name: 'Late-night scrolling', createdAt: '2026-09-10T12:00:00.000Z', archived: 0 })
    const st = tx.objectStore('settings')
    const got = await new Promise((res) => {
      const q = st.get(1)
      q.onsuccess = () => res(q.result)
    })
    if (got) st.put({ ...got, privateInSelection: true })
    const store = tx.objectStore('checkins')
    const now = new Date()
    for (let d = 9; d >= 1; d--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      let bi = 0
      for (const block of Object.keys(blocks)) {
        bi++
        // One afternoon left unlogged, so the grouped history shows a gap.
        if (d === 2 && block === 'afternoon') continue
        const answers = {}
        blocks[block].forEach((id, ri) => (answers[id] = 1 + ((d * 7 + bi * 3 + ri * 3 + (ri % 2) * d) % 5)))
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block][0], hours[block][1] + d)
        const done = new Date(at.getTime() + 95_000)
        const extras = block === 'evening' && d % 2 === 0 ? { private: { 1: true } } : undefined
        store.add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done.toISOString(), updatedAt: done.toISOString(), answers, activeMs: 60_000, ...(extras ? { extras } : {}) })
      }
    }
    await new Promise((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  })
  await page.reload()

  await tab(page, 'Aims')
  const add = async () => page.getByRole('button', { name: /^Add a commitment/ }).click()
  await add()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('Spanish')
  await page.getByTestId('aim-ladder-language').click()
  await page.getByTestId('aim-name-add').click()
  await add()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('Cloud certification')
  await page.getByTestId('aim-ladder-technical').click()
  await page.getByTestId('aim-name-add').click()
  await add()
  await page.getByTestId('aim-kind-practice').click()
  const hard = page.locator('button.row', { hasText: 'One set of something hard' })
  if (await hard.count()) await hard.first().click()
  else await page.locator('button.row').first().click()
  await add()
  await page.getByTestId('aim-kind-path-social').click()
  await add()
  await page.getByTestId('aim-kind-path-partner').click()
  await page.getByRole('button', { name: /^The proof ladder/ }).click()
  await page.getByTestId('subject-chip').filter({ hasText: 'Spanish' }).click()
  await page.getByTestId('skill-input').fill('Ordering at a café')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: /Done|Close/ }).last().click()

  await tab(page, 'Now')
  await page.getByRole('button', { name: /Check in/ }).first().click()
  const card = page.getByTestId('give-back')
  for (let i = 0; i < 40 && !(await card.isVisible()); i++) {
    if (await page.getByTestId('extras').isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      continue
    }
    if (await page.getByTestId('outcome-ask').isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      continue
    }
    const a = page.getByTestId('anchor').nth(2)
    if (await a.isVisible().catch(() => false)) await a.click().catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {})

  await idb(page, async (dbx) => {
    const tx = dbx.transaction(['brainBriefs'], 'readwrite')
    tx.objectStore('brainBriefs').put({ id: '2026-09-23:brief', day: '2026-09-23', kind: 'brief', text: 'Two Spanish sittings this week so far. Ten minutes after bedtime tonight keeps the run going; the rung is sized to one sitting.', mode: 'strategy', factIds: ['record'], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-23T15:48:00.000Z', factsDay: '2026-09-23', writer: 'claude', askedModel: 'opus' })
    await new Promise((res) => (tx.oncomplete = res))
  })
  await page.reload()
  await page.waitForTimeout(800)
}

/** Opens a seeded profile at the fixed time. */
export async function reopen(page) {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto(BASE)
  await page.waitForTimeout(900)
}

export async function height(page) {
  await page.waitForTimeout(300)
  return page.evaluate(() => document.documentElement.scrollHeight)
}
