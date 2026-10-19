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

/** Two nights of Let it out (agreed 2026-10-15), one long enough to fold, so the journal's screens are read as they will be. Generic words only. */
async function seedJournal(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['journal'], 'readwrite')
    const long = Array.from({ length: 14 }, (_, i) => `A sentence of the night, number ${i + 1}, set down so the page has something to hold.`).join(' ')
    tx.objectStore('journal').add({ day: '2026-09-21', text: 'A short night. Tired, and glad it is over.', writtenAt: '2026-09-22T01:10:00.000Z', editedAt: null, updatedAt: '2026-09-22T01:10:00.000Z' })
    tx.objectStore('journal').add({ day: '2026-09-22', text: `${long}\n\nAnd a second paragraph after a blank line.`, writtenAt: '2026-09-23T01:20:00.000Z', editedAt: '2026-09-23T01:40:00.000Z', updatedAt: '2026-09-23T01:40:00.000Z' })
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
  await seedJournal(page)
  await seedUse(page)
  await seedLocation(page)
  await page.reload()
  await tab(page, 'Aims')
  const add = () => page.getByRole('button', { name: /^Add a commitment/ }).click()
  await add()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-goal-input').fill('Tamlic')
  await page.getByTestId('aim-method-input').fill('A class')
  await page.getByTestId('aim-learn-add').click()
  // The skill is set on the card, with Set one myself (cleaned up 2026-10-17).
  const tamlic = page.getByTestId('aim-card').filter({ hasText: 'Tamlic' })
  await tamlic.getByTestId('aim-skill-own').click()
  await tamlic.getByTestId('aim-skill-set-name').fill('Ordering at a café')
  await tamlic.getByTestId('aim-skill-set-save').click()
  await add()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-goal-input').fill('Pottery')
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
    if (box && el.matches('[data-testid="move-cue"]')) {
      // The move cue (2026-10-02) floats over the screen, so its own rule, read where it stands on the screen: 48 tall
      // where that meets no control, only as short as a control within that (kept a pixel clear) makes it, never shorter
      // than its pill, and over no control at all.
      const tap = el.getBoundingClientRect()
      const pill = (el.querySelector('.move-cue-pill') as HTMLElement).getBoundingClientRect()
      const under = [...document.querySelectorAll('section.screen :is(button, a[href], input, select, textarea, [role="button"], summary)')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
      const meets = (a: { left: number; top: number; right: number; bottom: number }, r: DOMRect, m = 0) => a.left < r.right + m && a.right > r.left - m && a.top < r.bottom + m && a.bottom > r.top - m
      if (tap.width < 47.5 || tap.height < pill.height - 0.5) issues.push(`cue target ${Math.round(tap.width)}×${Math.round(tap.height)}: "${s}"`)
      if (under.some((r) => meets(tap, r) || meets(pill, r))) issues.push(`cue over a control: "${s}"`)
      const mid = (pill.top + pill.bottom) / 2
      const full = { left: tap.left, right: tap.right, top: mid - 24, bottom: mid + 24 }
      if (tap.height < 47.5 && !under.some((r) => meets(full, r, 1))) issues.push(`cue ${Math.round(tap.height)} tall with no control within 48: "${s}"`)
    } else if (!box || box.h < 47.5 || box.w < 47.5) issues.push(`target ${Math.round(box?.w ?? 0)}×${Math.round(box?.h ?? 0)}: "${s}"`)
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
  // A field's hint is read whole: one cut at the field's edge loses its words, as the evening note's did until
  // 2026-10-18. A hint is no text node, so the runs above never see it; measured in the field's own font.
  const pen = document.createElement('canvas').getContext('2d')
  for (const f of document.querySelectorAll('input[placeholder]')) {
    const field = f as HTMLInputElement
    if (!pen || !field.placeholder || field.value || !field.getClientRects().length || getComputedStyle(field).visibility === 'hidden') continue
    const cs = getComputedStyle(field)
    pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const room = field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = pen.measureText(field.placeholder).width
    if (need > room + 0.5) issues.push(`a field's hint is cut: "${field.placeholder}" needs ${Math.ceil(need)} px of ${Math.floor(room)}`)
  }
  // A phrase a label keeps whole stays on one line ("check-in?", never "check-" and "in?").
  for (const k of document.querySelectorAll('.keep-together')) if (k.getClientRects().length > 1) issues.push(`a phrase kept together breaks across lines: "${k.textContent ?? ''}"`)
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
      for (const id of ['path-dates', 'path-details']) await card.getByTestId(id).click()
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
  // Let it out (agreed 2026-10-15): the history, an entry being edited, and the night's box open.
  { name: 'Journal', tab: 'Mirror', open: click(/^Journal/) },
  {
    name: 'Journal, an entry being edited',
    tab: 'Mirror',
    open: async (p) => {
      await p.getByRole('button', { name: /^Journal/ }).click()
      await p.getByTestId('journal-edit').first().click()
      await expect(p.getByTestId('journal-edit-input')).toBeVisible()
    },
  },
  {
    name: 'Evening extras, Let it out open',
    tab: 'Now',
    open: async (p) => {
      await p.getByRole('button', { name: /Logged/ }).first().click()
      await p.getByRole('button', { name: 'Change the extras' }).click()
      await p.getByTestId('journal-open').click()
      await expect(p.getByTestId('journal-input')).toBeVisible()
    },
  },
  // The deeper diagnostics are closed until opened (final UI polish, 2026-09-26): audited opened, every one.
  {
    name: 'The weekly view, every diagnostic open',
    tab: 'Mirror',
    open: async (p) => {
      await p.getByRole('button', { name: /^The weekly view/ }).click()
      for (const id of ['weekly-best', 'weekly-scorecard', 'weekly-lasts', 'weekly-health', 'weekly-people', 'weekly-extension']) await p.getByTestId(id).click()
      await expect(p.getByTestId('weekly-prompt')).toBeVisible()
      await expect(p.getByTestId('family-health').first()).toBeVisible()
    },
  },
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
      await p.locator('[data-path="partner"]').getByTestId('path-details').click()
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
 * The skill coach (Parts 40 and 41), open since Pass 1B, with a cloud copy set up whose database is
 * never reached: Watercolour asked for a first skill and answered; a physical goal's one question; Cello's
 * review with Claude's view and Guitar's asked neutrally, both after six practice days; Yoga with a
 * suggestion taken, its safety line and likely next kept.
 */
async function seedCoach(page: Page): Promise<void> {
  // An ask travels through the cloud copy: one is set up below, and every request to its host is refused.
  await page.route(/turso\.io/, (route) => route.abort())
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
    const cloud = dbx.transaction(['settings'], 'readwrite').objectStore('settings')
    const settings = await new Promise<Record<string, unknown> & { cloud: Record<string, unknown> }>((res) => {
      const q = cloud.get(1)
      q.onsuccess = () => res(q.result)
    })
    cloud.put({ ...settings, cloud: { ...settings.cloud, token: 'e2e-token-never-real' } })
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
  test(`${theme}: the Pass 1B features read, fit and can be tapped, at three widths (Parts 40–41 and How firm)`, async ({ page }, info) => {
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

/**
 * The two features agreed for after the clean window (home-only moves with Skip's "Not home", and
 * Away from home), open as they ship since stage 1 (2026-10-16; the preview flags set here are no
 * longer needed): a trip set for tomorrow, a day an earlier trip shaped with a move offered on it, and the morning's
 * live move one that needs the house.
 */
async function seedPostWindow(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('life-mirror.preview.homeOnly', '1')
    localStorage.setItem('life-mirror.preview.away', '1')
  })
  await page.clock.setFixedTime(new Date(2026, 9, 14, 10, 0))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await seedRecord(page)
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).first().click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await tab(page, 'Settings')
  await page.getByTestId('settings-away').click()
  await page.getByTestId('away-from').fill('2026-10-15')
  await page.getByTestId('away-to').fill('2026-10-18')
  await page.getByTestId('away-save').click()
  await expect(page.getByTestId('away-status')).toBeVisible()
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const offers = await new Promise<Record<string, unknown>[]>((res) => {
      const q = dbx.transaction(['offers'], 'readonly').objectStore('offers').getAll()
      q.onsuccess = () => res(q.result)
    })
    const live = offers.find((o) => o.kind === 'block' && o.day === '2026-10-14' && o.skippedAt === null)
    if (!live) throw new Error('no live move')
    // The caffeine item stays on (stage 1, item r): its wrapped rows' targets no longer overlap, so this walk measures them too.
    const tx = dbx.transaction(['offers', 'days'], 'readwrite')
    tx.objectStore('offers').put({ ...live, moveId: 'open-windows', cardId: null, whyNot: null, passiveId: null })
    const at = new Date(2026, 9, 12, 19, 40).toISOString()
    tx.objectStore('offers').put({ ...live, id: 7000, day: '2026-10-12', block: 'evening', at, moveId: 'walk-ten', cardId: null, whyNot: null, passiveId: null, closedAt: at })
    const held = { atOffice: false, pickupTime: null, churchDay: false, studyNight: false }
    tx.objectStore('days').put({ day: '2026-10-12', weekday: 1, withHer: true, studyNight: false, churchDay: false, atOffice: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: at, awayFromHome: { held } })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
}

const POST_WINDOW: typeof STATES = [
  {
    name: 'Now, a trip set for tomorrow and a move that needs the house',
    tab: 'Now',
    open: async (p) => {
      await expect(p.getByTestId('away-line')).toBeVisible()
      await expect(p.getByTestId('move-not-home')).toBeVisible()
    },
  },
  { name: 'Moves, a move that needs the house', tab: 'Moves', open: async (p) => expect(p.getByTestId('move-not-home')).toBeVisible() },
  { name: 'Settings, the trip row', tab: 'Settings', open: async (p) => expect(p.getByTestId('settings-away')).toBeVisible() },
  {
    name: 'Away from home, a trip set',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-away').click()
      await expect(p.getByTestId('away-status')).toBeVisible()
    },
  },
  {
    name: 'Away from home, a problem said',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-away').click()
      await p.getByTestId('away-to').fill('2026-12-30')
      await p.getByTestId('away-save').click()
      await expect(p.getByTestId('away-problem')).toBeVisible()
    },
  },
  {
    name: 'Summary, the trip row',
    tab: 'Now',
    open: async (p) => {
      await click(/Logged/)(p)
      await expect(p.getByTestId('chip-away-from-home')).toBeVisible()
    },
  },
  {
    name: 'History, a day a trip shaped',
    tab: 'Moves',
    open: async (p) => {
      await click(/^History/)(p)
      await expect(p.getByText('away from home').first()).toBeVisible()
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: the post-window features read, fit and can be tapped, at three widths (open since stage 1)`, async ({ page }, info) => {
    test.setTimeout(600_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedPostWindow(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, POST_WINDOW, width, found)
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

/** The cue above the tab bar while a move lower on Now is unseen (final UI polish, 2026-09-26). */
const CUED: typeof STATES = [
  {
    name: 'Now, a move below, cued',
    tab: 'Now',
    open: async (p) => {
      await expect(p.getByTestId('move-cue')).toBeVisible()
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: the cue for a move below reads, fits and can be tapped, at three widths`, async ({ page }, info) => {
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
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, CUED, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

/**
 * Let it out in the Brain (agreed 2026-10-15): a line Claude wrote drawing on two nights, its Why naming
 * them as what you wrote, and the week's review with its one follow-up question. Generic words only.
 */
async function seedJournalBrain(page: Page): Promise<void> {
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
    const tx = dbx.transaction(['brainBriefs'], 'readwrite')
    const briefs = tx.objectStore('brainBriefs')
    const common = { mode: 'observation', cardIds: [], model: 'claude-opus-5-5', writer: 'claude', askedModel: 'opus', factsDay: '2026-09-23' }
    briefs.put({ ...common, id: '2026-09-23:brief', day: '2026-09-23', kind: 'brief', text: 'Last night you wrote that the day ran long; a short walk after dinner may suit this evening.', factIds: ['record'], at: '2026-09-23T13:00:00.000Z', facts: [{ id: 'record', text: 'A stand-in fact for the audit, long enough to wrap across the panel at the narrowest width.' }], journal: ['2026-09-22', '2026-09-20'] })
    briefs.put({ ...common, id: '2026-09-23:review', day: '2026-09-23', kind: 'review', mode: 'strategy', text: 'a b c', factIds: [], at: '2026-09-23T13:01:00.000Z', parts: { held: 'The evening walk held on three days.', didNot: 'The morning plans did not start.', change: 'Plan the walk for after dinner.', question: 'On Monday you wrote that the day ran long; what would make the evening after a long day lighter?' }, journal: ['2026-09-22', '2026-09-21', '2026-09-20'] })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
}

const JOURNAL_BRAIN: typeof STATES = [
  { name: 'Now, Why open, from what you wrote', tab: 'Now', open: async (p) => p.getByTestId('brief-why').first().click() },
  { name: 'The weekly view, a question from what you wrote', tab: 'Mirror', open: click(/^The weekly view/) },
  { name: 'Brain, the journal’s own switch', tab: 'Settings', open: async (p) => p.getByTestId('settings-brain').click() },
]

for (const theme of THEMES) {
  test(`${theme}: the journal in the Brain reads, fits and can be tapped, at three widths (Let it out)`, async ({ page }, info) => {
    test.setTimeout(300_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedJournalBrain(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, JOURNAL_BRAIN, width, found)
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

/**
 * Stage 3, group 3, in the moment: the summary's two new states, audited like every other. Twenty-four
 * evenings, every other one with Stress at its top phrase and the morning after it lower; then today a
 * morning two steps down on Mood from last night (Anything behind it?) and an evening with Stress high
 * (Evenings like this one).
 */
async function seedInTheMoment(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 8, 20, 21, 5))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins'], 'readwrite')
    const store = tx.objectStore('checkins')
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const put = (date: Date, block: string, over: Record<string, number>) => {
      const answers: Record<string, number> = {}
      for (const id of blocks[block]) answers[id] = over[id] ?? 3
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
      const done = new Date(at.getTime() + 95_000).toISOString()
      store.add({ day: key(date), block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
    }
    // Evenings from Aug 27 to last night, Sep 19, each with its morning after up to yesterday's.
    for (let i = 0; i < 24; i++) {
      const stressed = i % 2 === 0
      put(new Date(2026, 7, 27 + i), 'evening', stressed ? { stress: 5 } : {})
      if (i < 23) put(new Date(2026, 7, 28 + i), 'morning', stressed ? { mood: 2, energy: 2, focus: 2, stress: 4, overwhelm: 4, irritation: 4 } : {})
    }
    // Today: last night was even on every reading, this morning's Mood two steps down, tonight Stress high.
    put(new Date(2026, 8, 20), 'morning', { mood: 1 })
    put(new Date(2026, 8, 20), 'evening', { stress: 5 })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
}

const IN_THE_MOMENT: typeof STATES = [
  {
    name: 'Summary, Anything behind it?',
    tab: 'Now',
    open: async (p) => {
      await p.getByRole('button', { name: /^Morning Logged/ }).click()
      await expect(p.getByTestId('behind-it')).toBeVisible()
    },
  },
  {
    name: 'Summary, Evenings like this one',
    tab: 'Now',
    open: async (p) => {
      await p.getByRole('button', { name: /^Evening Logged/ }).click()
      await expect(p.getByTestId('pattern-card')).toBeVisible()
    },
  },
]

/**
 * Stage 3, group 4, the owner's record shown back: September's record with its notes, moves done and
 * workouts, so a month ago today and the month's review have something to say; a learning commitment
 * started again after a session that left a line; one of her skills with its rungs so far; and the
 * workouts read, on Cloud.
 */
async function seedRecordBack(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 9, 17, 9, 5))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'outside', 'aims', 'skills', 'herSkills', 'moments'], 'readwrite')
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const put = (date: Date, block: string, p: number, note?: string) => {
      const answers: Record<string, number> = {}
      for (const id of blocks[block]) answers[id] = ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40)
      const done = new Date(at.getTime() + 95_000).toISOString()
      tx.objectStore('checkins').add({ day: key(date), block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000, ...(note ? { extras: { note } } : {}) })
    }
    const notes = ['A long week, and the kitchen still a mess by Friday night', 'Dinner with friends ran late', 'Slept well for once']
    for (let d = 1; d <= 30; d++) {
      const date = new Date(2026, 8, d)
      put(date, 'morning', 2 + (d % 3))
      put(date, 'evening', 2 + ((d + 1) % 3), d % 6 === 5 ? notes[d % 3] : undefined)
      if (d % 2 === 1) {
        const at = new Date(2026, 8, d, 18).toISOString()
        tx.objectStore('offers').add({ id: 700 + d, kind: 'block', day: key(date), block: 'evening', at, situationKey: 'evening:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: d % 4 === 1 ? 'walk-ten' : 'glass-of-water', cardId: null, candidates: ['walk-ten'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: at })
        tx.objectStore('outcomes').add({ offerId: 700 + d, moveId: d % 4 === 1 ? 'walk-ten' : 'glass-of-water', day: key(date), block: 'evening', at, outcome: 'done', why: null, passiveOutcome: null })
      }
      if (d % 4 === 0) tx.objectStore('outside').add({ id: `w${d}`, day: key(date), minutes: 40, at: new Date(2026, 8, d, 18).toISOString(), source: 'workout' })
    }
    for (let d = 1; d <= 16; d++) put(new Date(2026, 9, d), 'evening', 3)
    // Something to learn: yesterday's session left a line, and today's is under way.
    const day = (d: Date) => key(d)
    tx.objectStore('aims').add({ id: 90, kind: 'certification', stepMoveId: null, name: 'Veltish', method: 'A class', currentSkillId: 91, createdAt: new Date(2026, 8, 1, 9).toISOString(), archivedAt: null })
    tx.objectStore('skills').add({ id: 91, aimId: 90, name: 'Ten words', method: 'A class', source: 'you', startedAt: new Date(2026, 8, 1, 9).toISOString(), order: 1, createdAt: new Date(2026, 8, 1, 9).toISOString(), archivedAt: null })
    const session = (id: number, date: Date, closed: boolean) => ({ id, kind: 'step', day: day(date), block: 'morning', at: date.toISOString(), situationKey: 'aim:certification:90', target: 'focus', stance: '', band: '', reading: 0, moveId: 'skill:91', label: 'Ten words', minutes: 30, cardId: null, candidates: ['skill:91'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: closed ? date.toISOString() : null })
    tx.objectStore('offers').add(session(801, new Date(2026, 9, 16, 8), true))
    tx.objectStore('outcomes').add({ offerId: 801, moveId: 'skill:91', day: '2026-10-16', block: 'morning', at: new Date(2026, 9, 16, 9).toISOString(), outcome: 'done', why: null, passiveOutcome: null, ease: 'right', note: 'Start at page 12 next time, and say each word out loud twice' })
    tx.objectStore('offers').add(session(802, new Date(2026, 9, 17, 9), false))
    // Her: one skill with its rungs so far, and a moment counted at each.
    tx.objectStore('herSkills').add({ skillId: 'counts-to-ten', rung: 'needsSupport', addedAt: new Date(2026, 8, 2, 9).toISOString(), rungAt: new Date(2026, 9, 3, 9).toISOString(), archivedAt: null, rungs: [{ rung: 'notIntroduced', at: new Date(2026, 8, 2, 9).toISOString() }, { rung: 'practicingWithDaddy', at: new Date(2026, 8, 20, 9).toISOString() }, { rung: 'needsSupport', at: new Date(2026, 9, 3, 9).toISOString() }] })
    tx.objectStore('moments').add({ day: '2026-09-25', at: new Date(2026, 8, 25, 18).toISOString(), skillId: 'counts-to-ten', help: 'lots' })
    tx.objectStore('moments').add({ day: '2026-10-10', at: new Date(2026, 9, 10, 18).toISOString(), skillId: 'counts-to-ten', help: 'some' })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
}

const RECORD_BACK: typeof STATES = [
  { name: 'Mirror, a month ago today', tab: 'Mirror', open: async (p) => expect(p.getByTestId('month-ago')).toBeVisible() },
  { name: 'The month', tab: 'Mirror', open: async (p) => p.getByTestId('month-door').click() },
  { name: 'Your words', tab: 'Mirror', open: async (p) => p.getByTestId('words-door').click() },
  {
    name: 'A summary with its note',
    tab: 'Mirror',
    open: async (p) => {
      await p.getByTestId('words-door').click()
      await p.getByTestId('words-row').first().click()
      await expect(p.getByTestId('summary-note')).toBeVisible()
    },
  },
  { name: 'Aims, the line left at the next start', tab: 'Aims', open: async (p) => expect(p.getByTestId('aim-last-note')).toBeVisible() },
  { name: 'Now, the line left at the next start', tab: 'Now', open: async (p) => expect(p.getByTestId('aim-last-note')).toBeVisible() },
  {
    name: 'Her, the rungs so far',
    tab: 'Aims',
    open: async (p) => {
      await p.getByRole('button', { name: /^Her/ }).click()
      await p.getByTestId('her-rung-open').first().click()
      await expect(p.getByTestId('her-history')).toBeVisible()
    },
  },
  {
    name: 'Cloud, the workouts read',
    tab: 'Settings',
    open: async (p) => {
      await p.getByRole('button', { name: /^Cloud copy/ }).click()
      await expect(p.getByTestId('cloud-outside-read')).toBeVisible()
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: the record shown back, its new screens and states read, fit and can be tapped, at three widths`, async ({ page }, info) => {
    test.setTimeout(420_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedRecordBack(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, RECORD_BACK, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

for (const theme of THEMES) {
  test(`${theme}: in the moment, the summary's two new states read, fit and can be tapped, at three widths`, async ({ page }, info) => {
    test.setTimeout(300_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedInTheMoment(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, IN_THE_MOMENT, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

/**
 * Stage 3, item 5, the check-in and the readings put to use: a Monday whose morning was short (so the afternoon asked
 * the night's sleep late), its move drawn again when a chip changed the day, caffeine reported with when the last
 * was; an afternoon that carried something sweet; an evening outside, with your own chips, three kept; two weeks of
 * evenings that showed the newer chips; and the Social path, with reps answered against what was expected and
 * today's under way.
 */
async function seedPutToUse(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 9, 19, 19, 30))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['sleepHours', 'sleepQuality', 'mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'aims', 'settings'], 'readwrite')
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const put = (date: Date, block: string, p: number, asked: string[], extras?: Record<string, unknown>) => {
      const answers: Record<string, number> = {}
      for (const id of asked) answers[id] = ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : block === 'afternoon' ? 13 : 19, 10)
      const done = new Date(at.getTime() + 95_000).toISOString()
      tx.objectStore('checkins').add({ day: key(date), block, asked, startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000, ...(extras ? { extras } : {}) })
    }
    const shown = { outside: true, sweet: true, 'own:c1': true, 'own:c2': true, 'own:c3': true }
    for (let d = 1; d <= 18; d++) {
      const date = new Date(2026, 9, d)
      put(date, 'morning', 2 + (d % 3), blocks.morning)
      put(date, 'evening', 2 + ((d + 1) % 3), blocks.evening, { chipsShown: shown, ...(d % 2 ? { outside: true } : {}), ...(d % 3 === 0 ? { sweet: true } : {}), own: d % 2 ? { c1: true } : { c2: true } })
    }
    const today = new Date(2026, 9, 19)
    put(today, 'morning', 3, ['mood', 'energy', 'stress'], { caffeineIntake: { band: 2, at: new Date(2026, 9, 19, 7, 12).toISOString(), since: null, last: 'oneToThree' }, chipsShown: { caffeineLast: true, amongPeople: true }, caffeineShown: true })
    put(today, 'afternoon', 3, blocks.afternoon, { sweet: true, chipsShown: { sweet: true } })
    put(today, 'evening', 4, blocks.evening, { outside: true, own: { c1: true }, chipsShown: shown })
    const move = (id: number, extra: Record<string, unknown>) => ({ id, kind: 'block', day: key(today), block: 'morning', at: new Date(2026, 9, 19, 7, 13).toISOString(), situationKey: 'morning:mood', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', 'glass-of-water'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, ...extra })
    tx.objectStore('offers').add(move(901, { skippedAt: new Date(2026, 9, 19, 7, 14).toISOString(), skipReason: 'dayChanged' }))
    tx.objectStore('offers').add(move(902, { moveId: 'glass-of-water', redrawn: true }))
    // The Social path: three reps done and answered against what was expected, and today's under way since 9:00.
    tx.objectStore('aims').add({ id: 95, kind: 'path', path: 'social', stepMoveId: null, createdAt: new Date(2026, 9, 1, 9).toISOString(), archivedAt: null })
    const rep = (id: number, d: number, closed: boolean) => ({ id, kind: 'step', day: key(new Date(2026, 9, d)), block: 'morning', at: new Date(2026, 9, d, 9).toISOString(), situationKey: 'aim:path:social', target: 'mood', stance: '', band: '', reading: 0, moveId: 'eye-contact-stranger', minutes: 2, cardId: null, candidates: ['eye-contact-stranger'], coinFlip: false, passiveId: null, whyNot: null, paths: ['social'], setting: 'errand', rule: 'draw', chosenBy: 'app', stage: 1, propensity: 1, propensities: { 'eye-contact-stranger': 1 }, skippedAt: null, closedAt: closed ? new Date(2026, 9, d, 9, 30).toISOString() : null })
    ;[[911, 13, 'easier'], [912, 15, 'harder'], [913, 17, 'asExpected']].forEach(([id, d, e]) => {
      tx.objectStore('offers').add(rep(id as number, d as number, true))
      tx.objectStore('outcomes').add({ offerId: id, moveId: 'eye-contact-stranger', day: key(new Date(2026, 9, d as number)), block: 'morning', at: new Date(2026, 9, d as number, 9, 30).toISOString(), outcome: 'done', why: null, passiveOutcome: null, expectancy: e, expectancyAsked: true })
    })
    tx.objectStore('offers').add(rep(920, 19, false))
    const store = tx.objectStore('settings')
    const row = await new Promise<Record<string, unknown>>((res, rej) => {
      const q = store.get(1)
      q.onsuccess = () => res(q.result as Record<string, unknown>)
      q.onerror = () => rej(q.error)
    })
    const c = (id: string, label: string) => ({ id, label, createdAt: new Date(2026, 9, 1, 9).toISOString(), removedAt: null })
    store.put({ ...row, ownChips: [c('c1', 'Stand-in one'), c('c2', 'A stand-in label of forty characters ok'), c('c3', 'Three')] })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
}

/** One of today's check-ins, opened from Now's row for its block. */
const blockSummary = (name: string) => async (p: Page) => {
  await p.getByTestId('block-row').filter({ hasText: name }).click()
  await expect(p.getByTestId('give-back').or(p.getByTestId('reading-row')).first()).toBeVisible()
}

const PUT_TO_USE: typeof STATES = [
  {
    name: 'Summary, the optional taps above a move drawn again',
    tab: 'Now',
    open: async (p) => {
      await blockSummary('Morning')(p)
      await expect(p.getByTestId('move-redrawn')).toBeVisible()
      await expect(p.getByTestId('caffeine-last')).toBeVisible()
      await expect(p.getByTestId('chip-among-people')).toBeVisible()
    },
  },
  {
    name: 'Summary, the night read late and something sweet',
    tab: 'Now',
    open: async (p) => {
      await blockSummary('Afternoon')(p)
      await expect(p.getByTestId('reading-row').filter({ hasText: 'Asked late' }).first()).toBeVisible()
      await expect(p.getByTestId('chip-sweet')).toHaveAttribute('aria-pressed', 'true')
    },
  },
  {
    name: 'Evening extras, the newer chips and your own',
    tab: 'Now',
    open: async (p) => {
      await blockSummary('Evening')(p)
      await p.getByRole('button', { name: 'Change the extras' }).click()
      await expect(p.getByTestId('chip-outside')).toHaveAttribute('aria-pressed', 'true')
      await expect(p.getByTestId('extras').getByRole('button', { name: 'A stand-in label of forty characters ok' })).toBeVisible()
    },
  },
  { name: 'Settings, your own chips, three kept', tab: 'Settings', open: async (p) => p.getByTestId('settings-extras').click() },
  { name: 'Readings and chips, with your own', tab: 'Settings', open: async (p) => p.getByTestId('settings-readings').click() },
  {
    name: 'Evidence, your own chips',
    tab: 'Moves',
    open: async (p) => {
      await p.getByRole('button', { name: /^Evidence/ }).click()
      await expect(p.getByTestId('own-chip-evidence').first()).toBeVisible()
    },
  },
  {
    name: 'Aims, the path’s Details with what was expected',
    tab: 'Aims',
    open: async (p) => {
      const card = p.locator('[data-kind="path"]')
      await card.getByTestId('path-details').click()
      await expect(card.getByTestId('path-expect')).toBeVisible()
    },
  },
  {
    name: 'Now, a People rep done, against what was expected',
    tab: 'Now',
    open: async (p) => {
      // Today's rep under way again, then marked done here: the tap shows where Done was tapped.
      await p.evaluate(async () => {
        const dbx = await new Promise<IDBDatabase>((res, rej) => {
          const r = indexedDB.open('life-mirror')
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
        const tx = dbx.transaction(['offers', 'outcomes'], 'readwrite')
        const all = await new Promise<Array<{ id: number; offerId: number }>>((res) => {
          const q = tx.objectStore('outcomes').getAll()
          q.onsuccess = () => res(q.result)
        })
        for (const x of all.filter((y) => y.offerId === 920)) tx.objectStore('outcomes').delete(x.id)
        const offer = await new Promise<Record<string, unknown>>((res) => {
          const q = tx.objectStore('offers').get(920)
          q.onsuccess = () => res(q.result)
        })
        tx.objectStore('offers').put({ ...offer, closedAt: null })
        await new Promise<void>((res) => (tx.oncomplete = () => res()))
        dbx.close()
      })
      await p.reload()
      await tab(p, 'Now')
      await p.locator('[data-kind="path"]').getByTestId('aim-done').click()
      await expect(p.getByTestId('path-expect-tap')).toBeVisible()
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: the check-in and the readings put to use, their new screens and states read, fit and can be tapped, at three widths`, async ({ page }, info) => {
    test.setTimeout(420_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedPutToUse(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, PUT_TO_USE, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

/**
 * Stage 3, item 6, weather as context: a place typed, sixteen days of record with weather on each day's record, and the
 * weather service answered in the page, never reached. The switch starts off, so its words can be read before it turns on.
 */
async function seedWeather(page: Page): Promise<void> {
  await page.route('https://api.open-meteo.com/**', (route) => {
    const u = new URL(route.request().url())
    const [a, b] = [u.searchParams.get('start_date') ?? '', u.searchParams.get('end_date') ?? '']
    const hours = (d: string) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)
    const body = {
      daily_units: { time: 'iso8601', rain_sum: 'mm', showers_sum: 'mm', sunshine_duration: 's', temperature_2m_max: '°C' },
      daily: { time: [a, b], rain_sum: [0.4, 2.1], showers_sum: [0, 0.2], sunshine_duration: [30_600, 18_000], temperature_2m_max: [17.2, 15.6] },
      hourly_units: { time: 'iso8601', rain: 'mm', showers: 'mm' },
      hourly: { time: [...hours(a), ...hours(b)], rain: Array.from({ length: 48 }, () => 0), showers: Array.from({ length: 48 }, () => 0) },
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  await page.clock.setFixedTime(new Date(2026, 9, 18, 19, 30))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'days', 'settings'], 'readwrite')
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (let d = 2; d <= 17; d++) {
      const date = new Date(2026, 9, d)
      const rainy = d % 3 === 0
      for (const [block, p] of [['morning', 3], ['evening', rainy ? 2 : d % 2 ? 4 : 3]] as const) {
        const answers: Record<string, number> = {}
        for (const id of blocks[block]) answers[id] = ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p
        const at = new Date(2026, 9, d, block === 'morning' ? 7 : 19, 10).toISOString()
        tx.objectStore('checkins').add({ day: key(date), block, asked: blocks[block], startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000 })
      }
      tx.objectStore('days').put({ day: key(date), weekday: date.getDay(), withHer: true, studyNight: false, churchDay: false, atOffice: false, pickupTime: null, soloUntil: '20:00', light: { rise: '07:10', set: '18:20' }, changed: false, createdAt: date.toISOString(), weather: { rain: rainy ? 6.4 : 0.2, sun: d % 2 ? 8.5 : 2.5, high: 15, at: date.toISOString() } })
    }
    const store = tx.objectStore('settings')
    const row = await new Promise<Record<string, unknown>>((res) => {
      const q = store.get(1)
      q.onsuccess = () => res(q.result as Record<string, unknown>)
    })
    store.put({ ...row, place: { lat: 51.5, lon: -0.1 }, weather: { on: false } })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
}

const WEATHER_STATES: typeof STATES = [
  {
    name: 'The week, the weather’s words before it turns on',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-week').click()
      const sw = p.getByTestId('weather-switch')
      if ((await sw.getAttribute('aria-pressed')) === 'true') await sw.click()
      await expect(sw).toHaveAttribute('aria-pressed', 'false')
      await sw.click()
      await expect(p.getByTestId('weather-words')).toBeVisible()
    },
  },
  {
    name: 'The week, the weather on, today’s read',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-week').click()
      const sw = p.getByTestId('weather-switch')
      if ((await sw.getAttribute('aria-pressed')) === 'false') {
        await sw.click()
        await p.getByTestId('weather-on').click()
      }
      await expect(p.getByTestId('weather-status')).toContainText('Today’s forecast')
    },
  },
  {
    name: 'Evidence, the weather',
    tab: 'Moves',
    open: async (p) => {
      await p.getByRole('button', { name: /^Evidence/ }).click()
      await expect(p.getByTestId('weather-rain-line')).toBeVisible()
    },
  },
  {
    name: 'Location Context, with the weather on',
    tab: 'Settings',
    open: async (p) => {
      await p.getByTestId('settings-location').click()
      await expect(p.getByTestId('location-kept')).toContainText('Open-Meteo')
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: weather for your area, its words, its reading and its comparisons read, fit and can be tapped, at three widths`, async ({ page }, info) => {
    test.setTimeout(300_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedWeather(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, WEATHER_STATES, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}

/**
 * The learning repair's week (stage R3), in its preview (only an automated browser holding the preview key opens it): ten
 * days of check-ins, each with a draw between the walk and nothing extra, so a running test has fitted three recent days.
 * The invitation first, never answered; then Yes, and the running week with its Details open.
 */
async function seedLearningWeek(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('life-mirror.preview.learningRepair', '1'))
  await page.clock.setFixedTime(new Date(2026, 8, 24, 13, 30))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.evaluate(async () => {
    const fits = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const hours: Record<string, number> = { morning: 7, afternoon: 13, evening: 19 }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes'], 'readwrite')
    let k = 0
    for (let d = 10; d >= 1; d--) {
      const date = new Date(2026, 8, 24 - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      for (const block of Object.keys(blocks)) {
        k++
        const answers: Record<string, number> = {}
        blocks[block].forEach((id, ri) => {
          answers[id] = 1 + ((k + ri) % 5)
        })
        const done = new Date(new Date(2026, 8, 24 - d, hours[block], 40).getTime() + 95_000).toISOString()
        tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: done, completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
        const moveId = k % 2 ? 'walk-ten' : 'nothing'
        const offerId = await new Promise<number>((res) => {
          const q = tx.objectStore('offers').add({ kind: 'block', day, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done, fits })
          q.onsuccess = () => res(q.result as number)
        })
        tx.objectStore('outcomes').add({ offerId, moveId, day, block, at: done, outcome: 'done', why: null, passiveOutcome: null, seen: true })
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  })
  await page.reload()
}

const WEEK_OFFERED: typeof STATES = [
  {
    name: 'Now, a learning week offered',
    tab: 'Now',
    open: async (p) => {
      await expect(p.getByTestId('week-invite')).toBeVisible()
      await p.getByTestId('week-invite').scrollIntoViewIfNeeded()
    },
  },
]

const WEEK_RUNNING: typeof STATES = [
  {
    name: 'Now, a learning week running, its Details open',
    tab: 'Now',
    open: async (p) => {
      const running = p.getByTestId('week-running')
      await expect(running).toBeVisible()
      await running.locator('summary').click()
      await expect(running.locator('details p')).toBeVisible()
      await running.scrollIntoViewIfNeeded()
    },
  },
]

for (const theme of THEMES) {
  test(`${theme}: the learning week, offered and running, reads, fits and can be tapped, at three widths (the repair's preview)`, async ({ page }, info) => {
    test.setTimeout(300_000)
    await page.addInitScript((t) => localStorage.setItem('life-mirror.theme', t), theme)
    await seedLearningWeek(page)
    const found: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, WEEK_OFFERED, width, found)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('week-yes').click()
    await expect(page.getByTestId('week-running')).toBeVisible()
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.w, height: 844 })
      await walk(page, theme, WEEK_RUNNING, width, found)
    }
    writeFileSync(info.outputPath('audit.txt'), found.join('\n'))
    expect(found, found.join('\n')).toEqual([])
  })
}
