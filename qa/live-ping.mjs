// The ping's address on the live site (2026-10-20), in fresh throwaway contexts with stand-in records only: the
// browser's notification permission and push manager are stand-ins, so no push service is reached, every address is
// made up, and nothing is sent anywhere but the site itself (no cloud token is ever set). Captures go to .qa/live-ping/.
// node live-ping.mjs <expected short commit> [site, for its proof against a local preview first]
import { mkdirSync } from 'node:fs'
import { chromium, REPO } from './common.mjs'

const want = process.argv[2]
const LIVE = process.argv[3] ?? 'https://bill6006.github.io/life-mirror/'
const HOST = new URL(LIVE).host
const SHOTS = `${REPO}/.qa/live-ping`
mkdirSync(SHOTS, { recursive: true })
const TIMES = { morning: '09:30', afternoon: '13:00', evening: '19:30' }
const KEPT = 'https://push.example.test/kept'
const NEW = 'https://push.example.test/new'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch()
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)

/** A fresh phone on the live site, its permission and push manager stood in as the browser tests stand them in. */
async function fresh(permission, live) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(
    ({ permission, live, made }) => {
      let current = permission
      const asked = { permission: 0 }
      const fake = (endpoint) => ({
        endpoint,
        options: { applicationServerKey: null },
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }),
        unsubscribe: async () => {
          held = null
          return true
        },
      })
      let held = live ? fake(live) : null
      window.__asked = asked
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => current })
      Notification.requestPermission = async () => {
        asked.permission++
        if (current === 'default') current = 'granted'
        return current
      }
      PushManager.prototype.getSubscription = async function () {
        return held
      }
      PushManager.prototype.subscribe = async function () {
        held = fake(made)
        return held
      }
      PushManager.prototype.permissionState = async function () {
        return current === 'granted' ? 'granted' : current === 'denied' ? 'denied' : 'prompt'
      }
    },
    { permission, live, made: NEW },
  )
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
/** The settings record, read or merged in the phone's database; then the page is opened again to read it. */
async function settings(page, merge) {
  return page.evaluate(async (m) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const store = dbx.transaction(['settings'], 'readwrite').objectStore('settings')
    const now = await new Promise((res, rej) => {
      const q = store.get(1)
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const next = m ? { ...(now ?? {}), id: 1, ...m } : (now ?? {})
    if (m)
      await new Promise((res, rej) => {
        const q = store.put(next)
        q.onsuccess = () => res()
        q.onerror = () => rej(q.error)
      })
    dbx.close()
    return next
  }, merge)
}
/** The latest settings row queued for the cloud copy, as it would travel. */
async function queuedSettings(page) {
  return page.evaluate(async () => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise((res, rej) => {
      const q = dbx.transaction(['outbox'], 'readonly').objectStore('outbox').getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    const mine = rows.filter((r) => r.store === 'settings')
    return mine.length ? JSON.parse(mine[mine.length - 1].body) : null
  })
}
const askedOf = (page) => page.evaluate(() => window.__asked.permission)

try {
  {
    // The section in Settings, with the page permission undecided, never switching reminders off and on.
    const { ctx, page } = await fresh('default', null)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await settings(page, { reminders: { enabled: true, times: TIMES } })
    await page.reload()
    await page.waitForTimeout(600)
    check('a ping never set up asks for nothing on Now', (await page.getByTestId('ping-lost').count()) === 0)
    await tab(page, 'Settings')
    await page.getByTestId('settings-checkins').click()
    const ping = page.getByTestId('ping')
    check('the ping’s section shows with the permission undecided, without the toggle', await seen(ping))
    check('nothing asked for the permission before a tap', (await askedOf(page)) === 0)
    await ping.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/1-settings-before.png` })
    await ping.getByRole('button', { name: 'Set up the ping' }).click()
    check('Set up the ping asks for the permission once and keeps the address', (await seen(page.getByTestId('ping-details'))) && (await askedOf(page)) === 1)
    const kept = (await settings(page)).push
    check('the address is kept on the phone, marked as sent', kept?.subscription?.endpoint === NEW && kept?.syncedEndpoint === NEW, JSON.stringify({ endpoint: kept?.subscription?.endpoint, synced: kept?.syncedEndpoint }))
    const queued = await queuedSettings(page)
    check('the settings queued for the cloud copy carry the address, and nothing else of the push state', queued?.push?.subscription?.endpoint === NEW && Object.keys(queued?.push ?? {}).sort().join(',') === 'subscribedAt,subscription' && queued?.cloud === undefined, JSON.stringify(Object.keys(queued?.push ?? {})))
    await page.getByTestId('ping-details').click()
    const note = page.getByText('The address travels with your cloud copy', { exact: false })
    check('the note says the address travels with the cloud copy, at your reminder times', (await seen(note)) && ((await note.textContent()) ?? '').includes('at your reminder times'))
    check('nothing to copy by hand', (await page.getByRole('button', { name: 'Copy address' }).count()) === 0 && (await page.getByText('PUSH_SUBSCRIPTION', { exact: false }).count()) === 0)
    await ping.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/2-settings-after.png` })
    await ctx.close()
  }
  {
    // The check at start: the browser lost the address kept, only a tap can allow a new one, and Now offers it.
    const { ctx, page } = await fresh('default', null)
    await settings(page, { reminders: { enabled: true, times: TIMES }, push: { subscription: { endpoint: KEPT, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }, subscribedAt: '2026-10-19T20:30:00.000Z', changed: false, syncedEndpoint: KEPT } })
    await page.reload()
    const line = page.getByTestId('ping-lost')
    check('Now offers one tap when the address was lost', await seen(line), ((await line.textContent().catch(() => '')) ?? '').trim())
    await page.screenshot({ path: `${SHOTS}/3-now-line.png` })
    await line.getByTestId('ping-restore').click()
    await line.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
    const after = (await settings(page)).push
    check('the tap makes the address again and the line goes', (await line.count()) === 0 && after?.subscription?.endpoint === NEW && after?.needsTap === false)
    await ctx.close()
  }
  {
    // A live address kept and synced: nothing asks.
    const { ctx, page } = await fresh('granted', KEPT)
    await settings(page, { reminders: { enabled: true, times: TIMES }, push: { subscription: { endpoint: KEPT, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }, subscribedAt: '2026-10-19T20:30:00.000Z', changed: false, syncedEndpoint: KEPT } })
    await page.reload()
    await page.waitForTimeout(1500)
    const stays = (await settings(page)).push
    check('a live address kept and synced asks for nothing and stays as it was', (await page.getByTestId('ping-lost').count()) === 0 && stays?.subscription?.endpoint === KEPT && stays?.subscribedAt === '2026-10-19T20:30:00.000Z')
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== HOST)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${HOST}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
