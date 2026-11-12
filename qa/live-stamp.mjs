// The live check for a phase that changes nothing a screen shows: the deployed build is the pushed commit, it opens
// on a fresh phone with no error, and it asks no host but its own. A fresh throwaway context, no record of anyone's.
//
// node live-stamp.mjs <expected short commit>
//
// LIVE_URL points it at another address (the local preview, through run-live-local).
import { chromium, tab } from './common.mjs'

const want = process.argv[2]
if (!want) throw new Error('usage: node live-stamp.mjs <expected short commit>')
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  await page.goto(LIVE)
  await tab(page, 'Now')
  check('Now opens on a fresh phone', await page.getByTestId('screen-fault').count().then((n) => n === 0))
  await tab(page, 'Settings')
  await page.getByTestId('settings-about').click()
  const commit = (await page.getByTestId('build-commit').textContent())?.trim()
  check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  check('no error was thrown', errors.length === 0, errors.slice(0, 2).join(' | '))
  const own = new URL(LIVE).host
  check('no host was asked but its own', [...hosts].every((h) => h === own), [...hosts].join(', '))
  await ctx.close()
} finally {
  await browser.close()
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
