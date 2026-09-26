import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// The three themes (Rule 15, revised 2026-09-24): each one checked on every major screen and the
// states its taps open, at the phone's width, a narrower phone, and a width that stands for text
// zoomed to 130 percent. Every run of text must read at 4.8 to 1 or better against what is behind
// it and be at least 11.5 pixels as seen; no two runs of text may collide; nothing may run past the
// phone's edge, be cut off at a container's side, or truncate a label; every control must be a
// 48-by-48 target, drawn or extended, its area its own.
// Then: switching a theme changes the look alone, at once, with nothing lost, and the choice holds.

/** The Private screen's words with nothing named yet. */
const copyNothingNamed = 'Nothing named yet.'

const THEMES = ['nocturne', 'instrument', 'signal'] as const
type Theme = (typeof THEMES)[number]
const GROUNDS: Record<Theme, string> = { nocturne: '#0d111d', instrument: '#14171f', signal: '#0a0c0f' }

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** Nine days of completed check-ins straight into the phone's store, one afternoon unlogged. */
async function seedRecord(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const hours: Record<string, number> = { morning: 9, afternoon: 14, evening: 21 }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins'], 'readwrite')
    const store = tx.objectStore('checkins')
    const now = new Date()
    for (let d = 9; d >= 1; d--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      let bi = 0
      for (const block of Object.keys(blocks)) {
        bi++
        if (d === 2 && block === 'afternoon') continue
        const answers: Record<string, number> = {}
        blocks[block].forEach((id, ri) => (answers[id] = 1 + ((d * 7 + bi * 3 + ri * 3 + (ri % 2) * d) % 5)))
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 10 + d)
        const done = new Date(at.getTime() + 95_000)
        store.add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done.toISOString(), updatedAt: done.toISOString(), answers, activeMs: 60_000 })
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

async function tab(page: Page, name: string): Promise<void> {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
}

/** An older study as the retired ladder left it (Workstream 6): a skill with two proofs, adopted at open as its current skill, its proofs kept to read. */
async function seedOlderStudy(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['aims', 'skills', 'rungMarks'], 'readwrite')
    tx.objectStore('aims').put({ id: 90, kind: 'certification', stepMoveId: null, name: 'Clock repair', ladder: 'technical', createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null })
    tx.objectStore('skills').put({ id: 91, name: 'Gear trains', subject: 'Clock repair', order: 1, createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null })
    tx.objectStore('rungMarks').put({ id: 92, skillId: 91, rung: 1, at: '2026-09-10T20:00:00.000Z', via: 'tap' })
    tx.objectStore('rungMarks').put({ id: 93, skillId: 91, rung: 2, at: '2026-09-12T20:00:00.000Z', via: 'step' })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

/** Three earlier days of use (Follow-up F1), so what Claude may be given has lines to show. */
async function seedUse(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['useLog'], 'readwrite')
    const store = tx.objectStore('useLog')
    for (const [day, n] of [['2026-09-20', 3], ['2026-09-21', 5], ['2026-09-22', 4]] as const) {
      for (let k = 0; k < n; k++) store.add({ day, at: `${day}T1${k}:00:00.000Z`, kind: 'screen', what: k % 2 ? 'aims' : 'now' })
      store.add({ day, at: `${day}T12:30:00.000Z`, kind: 'checkinOpened', what: 'evening' })
      store.add({ day, at: `${day}T12:40:00.000Z`, kind: 'lineWhy' })
      store.add({ day, at: `${day}T12:50:00.000Z`, kind: 'appOpened', what: 'launch' })
    }
    store.add({ day: '2026-09-22', at: '2026-09-22T13:00:00.000Z', kind: 'screen', what: 'evidence' })
    store.add({ day: '2026-09-22', at: '2026-09-22T13:10:00.000Z', kind: 'checkinLeft', what: 'evening' })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

/** Location Context on (Part 43), with an area for the sun, one place named and one asked about on Now. No position is ever read: the audit's browser gives none. */
async function seedLocation(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['settings', 'places', 'placeCandidates'], 'readwrite')
    const settings = tx.objectStore('settings')
    const get = settings.get(1)
    get.onsuccess = () => settings.put({ ...get.result, location: { on: true, area: { lat: 40.7, lon: -74, at: '2026-09-22T12:00:00.000Z' } } })
    tx.objectStore('places').put({ id: 1, kind: 'home', cells: ['seeded-home'], area: { lat: 40.7, lon: -74 }, learnedAt: '2026-09-20T12:00:00.000Z' })
    tx.objectStore('placeCandidates').put({ id: 1, cells: ['seeded-candidate'], area: { lat: 40.7, lon: -74 }, firstDay: '2026-09-20', lastDay: '2026-09-22', days: 3, morning: 0, afternoon: 3, evening: 0, office: 3, church: 0 })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

/** The generic profile through the app's own screens: something to learn in its own words, one with no skill named, an older study, a practice, both paths, the evening's check-in. */
async function seedProfile(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await seedRecord(page)
  await seedOlderStudy(page)
  await seedUse(page)
  await seedLocation(page)
  await page.reload()
  await tab(page, 'Aims')
  const add = () => page.getByRole('button', { name: /^Add a commitment/ }).click()
  await add()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-goal-input').fill('Tamlic')
  await page.getByTestId('aim-method-input').fill('A class')
  await page.getByTestId('aim-skill-now-input').fill('Ordering at a café')
  await page.getByTestId('aim-learn-add').click()
  await add()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-goal-input').fill('Pottery')
  await page.getByTestId('aim-method-unsure').click()
  await page.getByTestId('aim-learn-add').click()
  await add()
  await page.getByTestId('aim-kind-practice').click()
  await page.locator('button.row').first().click()
  await add()
  await page.getByTestId('aim-kind-path-social').click()
  await add()
  await page.getByTestId('aim-kind-path-partner').click()
  await tab(page, 'Now')
  await page.getByRole('button', { name: /Check in/ }).first().click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

/** Taps one phrase, then waits for the screen to move on: the next reading, the extras, the question or the card. */
async function tapAnchor(page: Page): Promise<boolean> {
  const title = await page.locator('#ci-title').textContent({ timeout: 1500 }).catch(() => null)
  if (title === null) return false
  try {
    await page.getByTestId('anchor').nth(2).click({ timeout: 3000 })
  } catch {
    return false
  }
  const moved = page.locator('#ci-title', { hasNotText: title }).or(page.getByTestId('give-back')).or(page.getByTestId('extras')).or(page.getByTestId('outcome-ask'))
  await expect(moved.first()).toBeVisible()
  return true
}

/** Every reading tapped until the give-back card shows, the evening extras and any open question passed on the way (as the smoke tests walk it). */
async function tapThrough(page: Page): Promise<void> {
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const ask = page.getByTestId('outcome-ask')
  const anchor = page.getByTestId('anchor').nth(2)
  for (let i = 0; i < 30; i++) {
    await expect(card.or(extras).or(ask).or(anchor).first()).toBeVisible()
    if (await card.isVisible()) break
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      await expect(ask).toBeHidden()
      continue
    }
    if (await extras.isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(extras).toBeHidden()
      continue
    }
    await tapAnchor(page)
  }
  await expect(card).toBeVisible()
}

/** Runs in the page: every visible run of text and every control, against the universal rules. */
function audit(opts: { zoom: number }) {
  const MIN_TEXT = 11.5 / opts.zoom
  const MIN_CONTRAST = 4.8
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  type C = { r: number; g: number; b: number; a: number }
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const lum = (c: C) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const over = (top: C, bot: C): C => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 })
  const behind = (el: Element): C => {
    const layers: C[] = []
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
    }
    let acc = layers.length && layers[layers.length - 1].a >= 1 ? (layers.pop() as C) : { r: 0, g: 0, b: 0, a: 1 }
    while (layers.length) acc = over(layers.pop() as C, acc)
    return acc
  }
  const opacityOf = (el: Element) => {
    let o = 1
    for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity)
    return o
  }
  const clipTo = (el: Element, r: DOMRect) => {
    let { left, top, right, bottom } = r
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const b = e.getBoundingClientRect()
        left = Math.max(left, b.left)
        top = Math.max(top, b.top)
        right = Math.min(right, b.right)
        bottom = Math.min(bottom, b.bottom)
      }
    }
    return right - left > 0.5 && bottom - top > 0.5 ? { x: left, y: top + scrollY, w: right - left, h: bottom - top } : null
  }
  // What cuts a run at its side: a container that hides past its sides (main itself does), with the
  // run partly inside it. The run has lost words the screen never shows, the same fault as running
  // past the edge, which the clipping would otherwise hide. A run moved wholly out of sight is hidden
  // on purpose, not cut.
  const cutBy = (el: Element, r: DOMRect): Element | null => {
    if (r.width <= 0.5) return null
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') continue
      const b = e.getBoundingClientRect()
      if ((r.right > b.right + 0.5 && r.left < b.right) || (r.left < b.left - 0.5 && r.right > b.left)) return e
    }
    return null
  }
  const named = (e: Element) => e.tagName.toLowerCase() + [...e.classList].map((c) => `.${c}`).join('')
  // A label cut with an ellipsis is the truncation rule's to judge, with its exemptions.
  const ellipsised = (el: Element) => {
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).textOverflow === 'ellipsis') return true
    return false
  }
  const issues: string[] = []
  const runs: { s: string; t: Node; box: Element; bar: boolean; x: number; y: number; w: number; h: number }[] = []
  // The box a run of text is laid out in: its nearest ancestor that is not an inline span of the same line.
  const boxOf = (el: Element) => {
    let e: Element = el
    while (e.parentElement && ['inline', 'contents'].includes(getComputedStyle(e).display)) e = e.parentElement
    return e
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const t = walker.currentNode
    const s = (t.textContent ?? '').trim()
    if (!s) continue
    const el = t.parentElement as Element
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') continue
    const range = document.createRange()
    range.selectNodeContents(t)
    const raw = [...range.getClientRects()]
    const cut = ellipsised(el) ? null : (raw.map((r) => cutBy(el, r)).find((e) => e !== null) ?? null)
    if (cut) issues.push(`cut off at the side of ${named(cut)}: "${s.slice(0, 40)}"`)
    const rects = raw.map((r) => clipTo(el, r)).filter((r): r is NonNullable<typeof r> => r !== null)
    if (!rects.length) continue
    // A disabled control is exempt from contrast, as the guidelines exempt it; its text still may not be tiny.
    const disabled = Boolean(el.closest('button:disabled, input:disabled'))
    const svg = el instanceof SVGElement
    const fg0 = parse(svg ? cs.fill : cs.color) ?? parse(cs.color)
    const bg = behind(el)
    const fg = fg0 ? over({ ...fg0, a: fg0.a * opacityOf(el) }, bg) : null
    const size = svg && (el as SVGGraphicsElement).getScreenCTM ? parseFloat(cs.fontSize) * ((el as SVGGraphicsElement).getScreenCTM()?.a ?? 1) : parseFloat(cs.fontSize)
    if (fg && !disabled) {
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
      const ratio = (hi + 0.05) / (lo + 0.05)
      if (ratio < MIN_CONTRAST) issues.push(`contrast ${ratio.toFixed(2)}:1 at ${size.toFixed(1)}px: "${s.slice(0, 40)}"`)
    }
    if (size < MIN_TEXT - 0.05) issues.push(`tiny ${size.toFixed(1)}px: "${s.slice(0, 40)}"`)
    const bar = Boolean(el.closest('nav.tabs'))
    const box = boxOf(el)
    for (const r of rects) runs.push({ s: s.slice(0, 30), t, box, bar, ...r })
  }
  // Sorted top to bottom, each run is set only against the runs that start before it ends.
  runs.sort((p, q) => p.y - q.y)
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length && runs[j].y < runs[i].y + runs[i].h; j++) {
      const a = runs[i]
      const b = runs[j]
      if (a.t === b.t) continue
      // The tab bar stays at the foot of the screen and the page scrolls under it, as it should: not a collision.
      if (a.bar !== b.bar) continue
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 1 && oy > 1 && ox * oy > 6) issues.push(`collision: "${a.s}" × "${b.s}"`)
      // Two boxes side by side whose words meet on one line with no space between: one has run into the other.
      else if (ox > -2 && oy > Math.min(a.h, b.h) / 2 && a.box !== b.box && !a.box.contains(b.box) && !b.box.contains(a.box)) issues.push(`touching: "${a.s}" × "${b.s}"`)
    }
  const width = document.documentElement.clientWidth
  for (const r of runs) if (r.x < -0.5 || r.x + r.w > width + 0.5) issues.push(`past the edge: "${r.s}"`)
  if (document.documentElement.scrollWidth > width) issues.push('the screen scrolls sideways')
  // A label cut with an ellipsis loses words. Only a list row's one-line summary may truncate: its screen says it whole.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.textOverflow !== 'ellipsis' || el.scrollWidth <= el.clientWidth + 1) continue
    if (el.closest('.settings-list, .doors') && el.classList.contains('sub')) continue
    if (el.classList.contains('d-sub')) continue
    issues.push(`truncated: "${(el.textContent ?? '').trim().slice(0, 40)}"`)
  }
  // Targets: 48 by 48 pixels, as drawn or with the hit area a control extends (its ::after, as the
  // browser laid it out), less whatever a container clips; and no two controls' areas laid over each
  // other, so each keeps the whole of its own.
  const hits: { s: string; el: Element; bar: boolean; x: number; y: number; w: number; h: number }[] = []
  const targets = document.querySelectorAll('button, a[href], input:not([type="checkbox"]), select, textarea, label.check')
  for (const el of targets) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') continue
    let { left, top, right, bottom } = r
    const after = getComputedStyle(el, '::after')
    if (after.content !== 'none' && after.display !== 'none' && after.position === 'absolute' && cs.position !== 'static') {
      const m = new DOMMatrixReadOnly(after.transform === 'none' ? undefined : after.transform)
      const ax = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(after.left) + m.e
      const ay = r.top + parseFloat(cs.borderTopWidth) + parseFloat(after.top) + m.f
      const aw = parseFloat(after.width)
      const ah = parseFloat(after.height)
      if ([ax, ay, aw, ah].every(Number.isFinite)) {
        left = Math.min(left, ax)
        top = Math.min(top, ay)
        right = Math.max(right, ax + aw)
        bottom = Math.max(bottom, ay + ah)
      }
    }
    left = Math.max(left, 0)
    right = Math.min(right, document.documentElement.clientWidth)
    const box = clipTo(el, new DOMRect(left, top, right - left, bottom - top))
    const s = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)
    if (!box || box.h < 47.5 || box.w < 47.5) issues.push(`target ${Math.round(box?.w ?? 0)}×${Math.round(box?.h ?? 0)}: "${s}"`)
    if (box) hits.push({ s, el, bar: Boolean(el.closest('nav.tabs')), ...box })
  }
  hits.sort((p, q) => p.y - q.y)
  for (let i = 0; i < hits.length; i++)
    for (let j = i + 1; j < hits.length && hits[j].y < hits[i].y + hits[i].h; j++) {
      const a = hits[i]
      const b = hits[j]
      if (a.bar !== b.bar || a.el.contains(b.el) || b.el.contains(a.el)) continue
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 2 && oy > 2) issues.push(`targets overlap ${Math.round(ox)}×${Math.round(oy)}: "${a.s}" × "${b.s}"`)
    }
  return issues
}

/** Each state: how to reach it from the tab it lives on. */
const STATES: { name: string; tab: string; open?: (page: Page) => Promise<void> }[] = [
  { name: 'Now', tab: 'Now' },
  { name: 'Now, Why open', tab: 'Now', open: async (p) => p.getByTestId('move-why').first().click() },
  { name: 'Now, Earlier days open', tab: 'Now', open: async (p) => p.getByTestId('earlier-more').click() },
  { name: 'Now, Plan open', tab: 'Now', open: async (p) => p.getByTestId('aim-plan-open').first().click() },
  { name: 'Mirror', tab: 'Mirror' },
  { name: 'Moves, Why open', tab: 'Moves', open: async (p) => p.getByTestId('move-why').first().click() },
  { name: 'Aims', tab: 'Aims' },
  {
    name: 'Aims, the Partner card open',
    tab: 'Aims',
    open: async (p) => {
      const card = p.locator('[data-path="partner"]')
      for (const id of ['path-dates', 'path-how', 'path-settings']) await card.getByTestId(id).click()
      // Today's rep unfolded: its whole text and the Less that folds it again.
      await card.getByTestId('path-rep-what-more').click()
      await p.getByTestId('aim-details').first().click()
    },
  },
  {
    // Workstream 6: something to learn opened, with how often it is practised, its skill's words and the skills so far.
    name: 'Aims, something to learn open',
    tab: 'Aims',
    open: async (p) => {
      const card = p.getByTestId('aim-card').filter({ hasText: 'Tamlic' })
      await card.getByTestId('aim-details').click()
      await card.getByTestId('aim-rhythm-3').click()
      await card.getByTestId('aim-skill-edit-open').click()
    },
  },
  { name: 'Settings', tab: 'Settings' },
  { name: 'Settings, the week', tab: 'Settings', open: async (p) => p.getByTestId('settings-week').click() },
  { name: 'Settings, check-ins', tab: 'Settings', open: async (p) => p.getByTestId('settings-checkins').click() },
  { name: 'Settings, theme', tab: 'Settings', open: async (p) => p.getByTestId('settings-theme').click() },
  // Two that change the record, written so they can run again at every width: a session begun, then done with its one optional tap.
  {
    name: 'Now, a session started',
    tab: 'Now',
    open: async (p) => {
      const row = p.locator('li[data-testid="aim-card"]').filter({ hasText: 'Tamlic' })
      await row.getByTestId('aim-start').or(row.getByTestId('aim-another')).or(row.getByTestId('aim-done')).first().click()
      await expect(row.getByTestId('aim-started').or(row.getByTestId('aim-ease')).first()).toBeVisible()
    },
  },
  {
    name: 'Now, done today with how it went',
    tab: 'Now',
    open: async (p) => {
      const row = p.locator('li[data-testid="aim-card"]').filter({ hasText: 'Tamlic' })
      // Wait for the row to draw before reading its state: started (Done), or fresh or done today (Start or Do another).
      await row.getByTestId('aim-done').or(row.getByTestId('aim-start')).or(row.getByTestId('aim-another')).first().waitFor()
      if (await row.getByTestId('aim-done').count()) await row.getByTestId('aim-done').click()
      else {
        await row.getByTestId('aim-start').or(row.getByTestId('aim-another')).first().click()
        await row.getByTestId('aim-done').click()
      }
      await expect(row.getByTestId('aim-ease')).toBeVisible()
    },
  },
]

/** Every other screen, each in every theme: the ones the redesign did not restructure still wear the theme and keep its rules. */
const click = (name: RegExp | string) => async (p: Page) => p.getByRole('button', { name }).first().click()
const MORE: typeof STATES = [
  { name: 'Summary', tab: 'Now', open: click(/Logged/) },
  {
    name: 'Check-in, one reading',
    tab: 'Now',
    open: async (p) => {
      await p.getByRole('button', { name: /Logged/ }).first().click()
      await p.getByTestId('reading-row').first().click()
    },
  },
  {
    name: 'Check-in, Loneliness and what it does not ask',
    tab: 'Now',
    open: async (p) => {
      await p.getByRole('button', { name: /Logged/ }).first().click()
      await p.getByTestId('reading-row').filter({ hasText: 'Loneliness' }).first().click()
      await expect(p.getByTestId('reading-help')).toBeVisible()
    },
  },
  { name: 'Change the rep', tab: 'Now', open: async (p) => p.getByTestId('path-change').first().click() },
  { name: 'The weekly view', tab: 'Mirror', open: click(/^The weekly view/) },
  { name: 'Evidence', tab: 'Moves', open: click(/^Evidence/) },
  { name: 'History', tab: 'Moves', open: click(/^History/) },
  { name: 'The catalogue', tab: 'Moves', open: click(/^Read the catalogue/) },
  { name: 'Add a commitment', tab: 'Aims', open: click(/^Add a commitment/) },
  { name: 'Earlier proofs', tab: 'Aims', open: click(/^Earlier proofs/) },
  {
    // The preferred study days with their part of the day, which shows once a day is chosen.
    name: 'Settings, preferred study days',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-week').click()
      const thu = p.getByTestId('study-days').getByRole('button', { name: 'Thursday' })
      if ((await thu.getAttribute('aria-pressed')) !== 'true') await thu.click()
    },
  },
  { name: 'Follow-through', tab: 'Aims', open: click(/^Follow-through/) },
  { name: 'Becoming', tab: 'Aims', open: click(/^Becoming/) },
  { name: 'Her', tab: 'Aims', open: click(/^Her /) },
  {
    name: 'Partner notes',
    tab: 'Aims',
    open: async (p) => {
      await p.locator('[data-path="partner"]').getByTestId('path-settings').click()
      await p.getByRole('button', { name: /^Notes and checks/ }).click()
    },
  },
  { name: 'Settings, evening extras', tab: 'Settings', open: async (p) => p.getByTestId('settings-extras').click() },
  {
    name: 'Settings, moves and private items',
    tab: 'Settings',
    open: async (p) => p.getByTestId('settings-moves').click(),
  },
  {
    name: 'Private items',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-moves').click()
      await p.getByTestId('settings-private').click()
    },
  },
  // Pass 3: an item named and placed at the morning and the evening, its chips measured; run again at every width, it adds nothing twice.
  {
    name: 'Private items, one placed',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-moves').click()
      await p.getByTestId('settings-private').click()
      const row = p.getByTestId('private-item-row')
      // The list reads its items first: count only once it shows a row or says nothing is named.
      await expect(row.or(p.getByText(copyNothingNamed)).first()).toBeVisible()
      if (!(await row.count())) {
        await p.getByPlaceholder('Name it').fill('Item one')
        await p.getByRole('button', { name: 'Add', exact: true }).click()
        await expect(row).toHaveCount(1)
      }
      if ((await row.getByTestId('private-place-morning').getAttribute('aria-pressed')) !== 'true') await row.getByTestId('private-place-morning').click()
      await expect(row.getByTestId('private-place-morning')).toHaveAttribute('aria-pressed', 'true')
    },
  },
  { name: 'Settings, your direction', tab: 'Settings', open: async (p) => p.getByTestId('settings-direction').click() },
  { name: 'Brain', tab: 'Settings', open: async (p) => p.getByTestId('settings-brain').click() },
  { name: 'Cloud copy', tab: 'Settings', open: async (p) => p.getByTestId('settings-cloud').click() },
  { name: 'Data and privacy', tab: 'Settings', open: async (p) => p.getByTestId('settings-data').click() },
  { name: 'Settings, Location Context', tab: 'Settings', open: async (p) => p.getByTestId('settings-location').click() },
  {
    name: 'Data and privacy, what Claude may be given',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-data').click()
      await p.getByTestId('use-given').click()
      await expect(p.getByTestId('use-given-list').locator('li').first()).toBeVisible()
    },
  },
  { name: 'Readings and chips', tab: 'Settings', open: async (p) => p.getByTestId('settings-readings').click() },
  { name: 'Wording', tab: 'Settings', open: async (p) => p.getByTestId('settings-wording').click() },
  { name: 'Legend', tab: 'Settings', open: async (p) => p.getByTestId('settings-legend').click() },
  { name: 'About', tab: 'Settings', open: async (p) => p.getByTestId('settings-about').click() },
]

const WIDTHS: { w: number; zoom: number; label: string }[] = [
  { w: 390, zoom: 1, label: '390' },
  { w: 360, zoom: 1, label: '360' },
  // A 390-pixel phone with its text zoomed to 130 percent lays out as 300 pixels, every size drawn 1.3 times larger.
  { w: 300, zoom: 1.3, label: '390 at 130%' },
]

/** Each state, reloaded, reached and audited at one width; what it breaks is added to found. */
async function walk(page: Page, theme: Theme, states: typeof STATES, width: (typeof WIDTHS)[number], found: string[]): Promise<void> {
  for (const s of states) {
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    // WIDE_FONT=1 stands in a wide system face (Verdana, as wide as the runner's fallback) for the phone's own
    // type, which Instrument alone uses; Nocturne and Signal carry their fonts with them.
    if (process.env.WIDE_FONT && theme === 'instrument') await page.addStyleTag({ content: ':root, [data-theme] { --font: Verdana, "DejaVu Sans", sans-serif }' })
    await tab(page, s.tab)
    if (s.open) await s.open(page)
    await page.waitForTimeout(250)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const issues = await page.evaluate(audit, { zoom: width.zoom })
    for (const i of issues) found.push(`${width.label} · ${s.name} · ${i}`)
  }
}

for (const theme of THEMES) {
  test(`${theme}: every screen and opened state reads, fits and can be tapped, at three widths`, async ({ page }, info) => {
    // Seeding walks a whole evening check-in; the walk through forty-three states at three widths follows. One limit for all of it.
    test.setTimeout(1_200_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedProfile(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      // The other screens at the phone's width and at zoomed text; the narrower phone adds nothing they do not already meet.
      await walk(page, theme, width.w === 360 ? STATES : [...STATES, ...MORE], width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

/**
 * The skill coach (Parts 40 and 41), previewed as a test browser alone may (their gate stays
 * closed): Watercolour asked for a first skill and answered; a physical goal's one question; Cello's
 * review with Claude's view and Guitar's asked neutrally, both after six practice days; Yoga with a
 * suggestion taken, its safety line and likely next kept.
 */
async function seedCoach(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('life-mirror.preview.skillCoach', '1')
    // How firm (Pass 2), previewed the same way: its setting under Brain.
    localStorage.setItem('life-mirror.preview.howFirm', '1')
  })
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['aims', 'skills', 'offers', 'outcomes'], 'readwrite')
    const aims = tx.objectStore('aims')
    const skills = tx.objectStore('skills')
    const at = (d: number, h = 18) => new Date(2026, 8, d, h, 0).toISOString()
    const aim = (id: number, name: string, method: string, currentSkillId: number | null, extra: Record<string, unknown> = {}) => aims.put({ id, kind: 'certification', stepMoveId: null, name, method, currentSkillId, createdAt: at(10, 9), archivedAt: null, ...extra })
    const skill = (id: number, aimId: number, name: string, method: string, order: number, extra: Record<string, unknown> = {}) => skills.put({ id, aimId, name, method, source: 'you', startedAt: at(10, 9), order, createdAt: at(10, 9), archivedAt: null, ...extra })
    aim(80, 'Cello', 'A teacher', 81)
    skill(81, 80, 'Scale of C', 'A teacher', 1, { how: 'Hands separately, slowly, then together.', minutes: 20 })
    aim(82, 'Guitar', 'A book', 83, { rhythm: { perWeek: 4, restDays: 0 } })
    skill(84, 82, 'Tuning by ear', 'A book', 2, { startedAt: at(1, 9), endedAt: at(10, 9) })
    skill(83, 82, 'Open chords', 'A book', 3)
    aim(85, 'Cartwheel', 'A video course', null)
    aim(86, 'Yoga', 'A class', 87, { rhythm: { perWeek: 3, restDays: 1 } })
    skill(87, 86, 'Sun salutations', 'A class', 4, { source: 'claude', how: 'Five slow rounds, breath leading each move.', minutes: 15, safety: 'Warm up first, keep the knees soft, and stop at sharp pain in the back or wrists.', likelyNext: 'Longer standing holds' })
    aim(88, 'Watercolour', '', null)
    // Six practice days on Cello's and Guitar's current skills, a week and more behind them.
    let id = 800
    for (const sk of [81, 83])
      for (let d = 12; d <= 17; d++) {
        const offer = { id: ++id, kind: 'step', day: `2026-09-${d}`, block: 'evening', at: at(d), situationKey: `aim:certification:${sk === 81 ? 80 : 82}`, target: 'focus', stance: '', band: '', reading: 0, moveId: `skill:${sk}`, label: '', cardId: null, candidates: [`skill:${sk}`], coinFlip: false, passiveId: null, whyNot: null, logged: true, skippedAt: null, closedAt: at(d) }
        tx.objectStore('offers').put(offer)
        tx.objectStore('outcomes').put({ id, offerId: id, moveId: offer.moveId, day: offer.day, block: 'evening', at: at(d), outcome: 'done', why: null, passiveOutcome: null, ease: d % 3 === 0 ? 'hard' : 'easy' })
      }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  // Opened: the two reviews fall due. Watercolour asks for its first skill.
  await page.reload()
  await tab(page, 'Aims')
  await expect(page.getByTestId('coach-review')).toHaveCount(2)
  await page.getByTestId('aim-card').filter({ hasText: 'Watercolour' }).getByTestId('coach-ask').click()
  await expect(page.getByTestId('coach-pending')).toBeVisible()
  // Claude's answers, as the brain's pull writes them: Watercolour's suggestion and Cello's review; Guitar's stays neutral.
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const asks = await new Promise<{ id: number; aimId: number; kind: string; revision: string; day: string }[]>((res) => {
      const q = dbx.transaction(['coachAsks'], 'readonly').objectStore('coachAsks').getAll()
      q.onsuccess = () => res(q.result)
    })
    const tx = dbx.transaction(['coachProposals'], 'readwrite')
    const put = (aimId: number, kind: string, answer: Record<string, unknown>) => {
      const a = asks.find((x) => x.aimId === aimId && x.kind === kind)
      if (!a) throw new Error(`no ${kind} ask for ${aimId}`)
      tx.objectStore('coachProposals').put({ id: `ask:${a.id}`, askId: a.id, aimId, kind, revision: a.revision, day: a.day, at: `${a.day}T21:00:00.000Z`, model: 'claude-opus-5-5', askedModel: 'opus', ...answer })
    }
    put(88, 'setup', { suggestion: { skill: 'Flat washes in one colour', method: 'A pad and three brushes', how: 'Lay one colour evenly across a small square, keeping the edge wet.', minutes: 15, rhythm: { perWeek: 4, restDays: 0 }, why: 'Control of water comes before mixing colours.', physical: false, safety: null, likelyNext: 'Graded washes' } })
    put(80, 'review', { review: { verdict: 'progress', evidence: ['6 sessions on 6 different days.', '4 of the 6 marked Easy.'], why: 'The scale of C holds; the next scale builds on it.', change: { skill: 'Scale of G', how: 'Hands separately, then together, slowly.', minutes: 20 } } })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

/** The skill coach's states: each card, and each form its taps open. */
const COACH: typeof STATES = [
  { name: 'Aims, the skill coach', tab: 'Aims' },
  { name: 'Aims, Claude’s suggestion, Edit first open', tab: 'Aims', open: async (p) => p.getByTestId('aim-card').filter({ hasText: 'Watercolour' }).getByTestId('coach-edit').click() },
  { name: 'Aims, Claude’s review, Edit first open', tab: 'Aims', open: async (p) => p.getByTestId('aim-card').filter({ hasText: 'Cello' }).getByTestId('coach-review-edit').click() },
  { name: 'Aims, a review asked neutrally, Earlier skills open', tab: 'Aims', open: async (p) => p.getByTestId('aim-card').filter({ hasText: 'Guitar' }).getByTestId('coach-review-earlier').click() },
  { name: 'Aims, a review asked neutrally, Write the next open', tab: 'Aims', open: async (p) => p.getByTestId('aim-card').filter({ hasText: 'Guitar' }).getByTestId('coach-review-write').click() },
  { name: 'Aims, a kept safety line and the likely next', tab: 'Aims', open: async (p) => p.getByTestId('aim-card').filter({ hasText: 'Yoga' }).getByTestId('aim-details').click() },
  { name: 'Now, reviews marked on their rows', tab: 'Now' },
  // How firm under Settings → Brain, each setting chosen so each description is measured; Adaptive last, as the line's Why reads it next.
  ...(['supportive', 'balanced', 'hardCoach', 'adaptive'] as const).map((f) => ({
    name: `Brain, How firm (${f})`,
    tab: 'Settings',
    open: async (p: Page) => {
      await p.getByTestId('settings-brain').click()
      await p.getByTestId(`brain-firm-${f}`).click()
      await expect(p.getByTestId(`brain-firm-${f}`)).toHaveAttribute('aria-pressed', 'true')
    },
  })),
  // The line's Why, which names how firmly the line was said: under Adaptive (chosen just before), its longest form.
  {
    name: 'Now, the line’s Why open, how firmly it was said',
    tab: 'Now',
    open: async (p) => {
      const card = p.getByTestId('brief')
      await expect(card.getByTestId('brief-line')).toBeVisible({ timeout: 15_000 })
      await card.getByTestId('brief-why').click()
      await expect(card.getByTestId('brief-firmness')).toContainText('as Adaptive chose for this line')
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: the dormant features read, fit and can be tapped, at three widths (Parts 40–41 and How firm, previewed)`, async ({ page }, info) => {
    test.setTimeout(600_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedCoach(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, COACH, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

/** A move left from the afternoon's check-in, waiting for the evening's question (final UI polish, 2026-09-26): closed, and opened. */
const WAITING: typeof STATES = [
  {
    name: 'Now, a move waiting for the next check-in',
    tab: 'Now',
    open: async (p) => {
      await expect(p.locator('[data-testid="move-card"][data-waiting]')).toBeVisible()
    },
  },
  {
    name: 'Now, a move waiting, opened',
    tab: 'Now',
    open: async (p) => {
      const card = p.locator('[data-testid="move-card"][data-waiting]')
      await card.getByTestId('move-why').click()
      await expect(card.locator('.move-what')).toBeVisible()
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: a move waiting for the next check-in reads, fits and can be tapped, closed and opened, at three widths`, async ({ page }, info) => {
    test.setTimeout(300_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await page.clock.setFixedTime(new Date(2026, 8, 24, 14, 10))
    await page.goto('./')
    await page.getByTestId('direction-input').fill('One line, mine')
    await page.getByRole('button', { name: 'Keep it', exact: true }).click()
    await seedRecord(page)
    await page.reload()
    await page.getByRole('button', { name: /Check in/ }).first().click()
    await tapThrough(page)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.clock.setFixedTime(new Date(2026, 8, 24, 17, 40))
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, WAITING, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

test('a theme switch changes the look alone: at once, no reload, the same screen, the same record', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto('./')
  // New and current installs open in Nocturne, the browser's colour its ground.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nocturne')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', GROUNDS.nocturne)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await seedRecord(page)
  await page.reload()
  // What the screen says, without the date (the one thing a theme writes its own way on Now).
  const said = () =>
    page.evaluate(() => {
      const main = (document.querySelector('#main') as HTMLElement).cloneNode(true) as HTMLElement
      for (const d of main.querySelectorAll('.date')) d.remove()
      return (main.textContent ?? '').replace(/\s+/g, ' ').trim()
    })
  // Now draws once its reads return, and its Brief chooses the day's line each time it opens: read the
  // screen only once the line is on it and nothing has changed for a moment, or two reads of a screen
  // not yet drawn compare equal and prove nothing, and a read taken before the line reads differently.
  const settled = async (): Promise<string> => {
    await expect(page.getByTestId('brief-line')).toBeVisible({ timeout: 15_000 })
    let last = ''
    await expect
      .poll(
        async () => {
          const now = await said()
          const steady = now !== '' && now === last
          last = now
          return steady
        },
        { intervals: [400], timeout: 15_000 },
      )
      .toBe(true)
    return last
  }
  const before = await settled()
  expect(before).toContain('Check in')
  // A mark on the window: a reload would lose it.
  await page.evaluate(() => ((window as unknown as { mark: number }).mark = 42))
  await tab(page, 'Settings')
  await expect(page.getByTestId('settings-theme')).toContainText('Nocturne')
  await page.getByTestId('settings-theme').click()
  for (const t of ['signal', 'instrument', 'nocturne'] as const) {
    await page.getByTestId(`theme-${t}`).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', t)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', GROUNDS[t])
    await expect(page.getByTestId(`theme-${t}`)).toHaveAttribute('aria-checked', 'true')
    // Still on the same screen, in the same page: nothing reloaded.
    await expect(page.getByTestId('settings-section-theme')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { mark?: number }).mark)).toBe(42)
  }
  // The record reads the same in any theme: switch, go back to Now, compare the words.
  await page.getByTestId('theme-signal').click()
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await tab(page, 'Now')
  expect(await settled()).toBe(before)
})

test('the choice holds across a relaunch and offline; a missing or unknown value is Nocturne', async ({ page, context }) => {
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await tab(page, 'Settings')
  await page.getByTestId('settings-theme').click()
  await page.getByTestId('theme-instrument').click()
  await page.reload()
  // Set before the first paint: the attribute is there as the page loads.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'instrument')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', GROUNDS.instrument)
  expect(await page.evaluate(() => localStorage.getItem('life-mirror.theme'))).toBe('instrument')

  // Offline after one load, the theme and its fonts come from the phone.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.evaluate(() => localStorage.setItem('life-mirror.theme', 'signal'))
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'signal')
  const fonts = await page.evaluate(async () => {
    await document.fonts.load('16px "Space Grotesk"')
    await document.fonts.load('16px "JetBrains Mono"')
    await document.fonts.load('16px "Manrope"')
    return [document.fonts.check('16px "Space Grotesk"'), document.fonts.check('16px "JetBrains Mono"'), document.fonts.check('16px "Manrope"')]
  })
  expect(fonts).toEqual([true, true, true])
  await context.setOffline(false)

  for (const bad of ['', 'neon', 'Nocturne']) {
    await page.evaluate((v) => localStorage.setItem('life-mirror.theme', v), bad)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nocturne')
  }
  await page.evaluate(() => localStorage.removeItem('life-mirror.theme'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nocturne')
})

test('words folded to two lines show More, and More shows them whole: nothing is cut', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 18, 30))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await tab(page, 'Aims')
  for (const kind of ['path-partner', 'practice']) {
    await page.getByRole('button', { name: /^Add a commitment/ }).click()
    await page.getByTestId(`aim-kind-${kind}`).click()
    if (kind === 'practice') await page.locator('button.row').first().click()
  }
  const card = page.locator('[data-path="partner"]')
  const what = card.getByTestId('path-rep-what')
  const more = card.getByTestId('path-rep-what-more')
  await expect(what).toBeVisible()
  await expect(page.getByTestId('aim-what')).toBeVisible()
  // More shows exactly where words are folded, in every card, and nowhere else.
  const folds = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('p.move-what')].map((p) => ({
        folded: p.scrollHeight > p.clientHeight + 1,
        more: p.nextElementSibling?.classList.contains('clamp-more') ?? false,
      })),
    )
  const seen = await folds()
  expect(seen.length).toBeGreaterThanOrEqual(2)
  expect(seen.some((f) => f.folded)).toBe(true)
  for (const f of seen) expect(f.more).toBe(f.folded)
  // The Partner rep's words run past two lines: More opens them whole, and Less folds them again.
  const whole = (await what.textContent()) ?? ''
  await expect(more).toHaveText('More')
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  expect(await what.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true)
  await more.click()
  await expect(more).toHaveText('Less')
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  expect(await what.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  await expect(what).toHaveText(whole)
  await more.click()
  await expect(more).toHaveText('More')
  expect(await what.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true)
})
