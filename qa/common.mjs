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

/** Opens the app at the fixed time the QA tools use. */
export async function reopen(page) {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto(BASE)
  await page.waitForTimeout(900)
}

export async function height(page) {
  await page.waitForTimeout(300)
  return page.evaluate(() => document.documentElement.scrollHeight)
}
