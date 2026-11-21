import { expect, test, type Page } from '@playwright/test'
import { leaveApp } from './closedApp'

// The forecast follow-ups, Batch 3, item 7 (2026-11-21): did the challenger's adjustment help? The forecasts it moved are
// set beside the plain forecasts they were moved from, in the Weekly View's Scorecard fold under its hit rate, in the
// approved contract's words and shape, and read by the rule frozen beforehand. Stand-in rows only, written with no app
// page open. The days are said as a phone set to US English says them.

test.use({ locale: 'en-US' })

const pageErrors: string[] = []
test.beforeEach(({ page }) => {
  pageErrors.length = 0
  page.on('pageerror', (e) => pageErrors.push(e.message))
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

const SLOTS = [
  ['morning', 0],
  ['afternoon', 0],
  ['evening', 0],
  ['morning', 1],
] as const

/**
 * Ten days of moved forecasts from 1 December, four a day, each with its plain forecast and its score, scored the day it
 * was forecast. A day's first forecast carries the day's whole gain (the plain miss less its own), alternately a + 3 and
 * a − 3, and the rest none: over the ten days the clearance is exactly a.
 */
function tenDays(a: number): { forecasts: unknown[]; scores: unknown[] } {
  const forecasts: unknown[] = []
  const scores: unknown[] = []
  for (let i = 0; i < 10; i++) {
    const day = `2026-12-${String(1 + i).padStart(2, '0')}`
    SLOTS.forEach(([block, horizon], slot) => {
      const gain = slot === 0 ? (i % 2 === 0 ? a + 3 : a - 3) : 0
      const actual = 50
      const moved = gain >= 0 ? actual + 1 : actual + 1 - gain
      const plain = gain >= 0 ? actual - 1 - gain : actual - 1
      const madeOn = horizon === 0 ? day : new Date(Date.UTC(2026, 11, i)).toISOString().slice(0, 10)
      forecasts.push({ day, block, horizon, madeOn, model: 'sameBlock', point: moved, lo: moved - 5, hi: moved + 5, whatIf: null, adj: moved - plain, adjBy: ['sleep.short'], plain: { point: plain, lo: plain - 5, hi: plain + 5 } })
      scores.push({ day, block, horizon, model: 'sameBlock', point: moved, lo: moved - 5, hi: moved + 5, actual, error: actual - moved, hit: Math.abs(actual - moved) <= 5, scoredOn: day })
    })
  }
  return { forecasts, scores }
}

/** Writes rows straight into one of the phone's stores, with no app page open. */
async function put(page: Page, store: string, list: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ name, rows }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      for (const row of rows) tx.objectStore(name).put(row)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { name: store, rows: list },
  )
}

/** A fresh phone on 15 December, its moved forecasts written with no app page open, then the app opened again. */
async function seed(page: Page, rows: { forecasts: unknown[]; scores: unknown[] } | null): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 11, 15, 19, 5))
  await page.goto('./')
  if (rows) {
    await leaveApp(page)
    await put(page, 'forecasts', rows.forecasts)
    await put(page, 'forecastScores', rows.scores)
    await page.goto('./')
  }
}

/** The Scorecard's lines for the moved forecasts, read once the fold is opened; the fold closed until then. */
async function scorecard(page: Page): Promise<string[]> {
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('weekly-scorecard')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('moved-check')).toHaveCount(0)
  await page.getByTestId('weekly-scorecard').click()
  await expect(page.getByTestId('moved-check').first()).toBeVisible()
  // Under the hit rate, in the Scorecard's own list of lines.
  const placed = await page.getByTestId('hit-rate').evaluate((hit) => {
    const next = hit.nextElementSibling
    return !!next && next.getAttribute('data-testid') === 'moved-check' && hit.parentElement === next.parentElement
  })
  expect(placed).toBe(true)
  return (await page.getByTestId('moved-check').allTextContents()).map((t) => t.trim())
}

test('the moved forecasts beside the plain ones (2026-11-21): none yet on a fresh phone, said with when they are first read', async ({ page }) => {
  await seed(page, null)
  expect(await scorecard(page)).toEqual(['Forecasts moved and scored: 0', 'They are set beside the plain forecast once 40 are scored, on at least 10 days.'])
})

test('the moved forecasts beside the plain ones (2026-11-21): the first look read, keep watching, in the contract’s shape', async ({ page }) => {
  await seed(page, tenDays(1))
  expect(await scorecard(page)).toEqual([
    'Forecasts moved and scored: 40',
    'Range held: 40 of 40 moved, 40 of 40 plain',
    'Average miss: 1.3 moved, 1.5 plain',
    'Read as written down beforehand: keep watching.',
    'Read on December 11; read again once 80 are scored (40 so far).',
  ])
})

test('the moved forecasts beside the plain ones (2026-11-21): the first look read, switch it off, and from when', async ({ page }) => {
  await seed(page, tenDays(-2.5))
  const lines = await scorecard(page)
  expect(lines.slice(0, 2)).toEqual(['Forecasts moved and scored: 40', 'Range held: 35 of 40 moved, 40 of 40 plain'])
  expect(lines.slice(3)).toEqual(['Read as written down beforehand: switch it off.', 'Read on December 11: forecasts written from then on are not moved.'])
})
