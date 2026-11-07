import { expect, test } from '@playwright/test'

// Aims's rows (the owner, 2026-11-07): Earlier proofs, the retired ladder's record, is no longer shown on Aims, though its
// proofs stay stored; Add a commitment, Follow-through, Becoming and Her stay as they were.

test('Aims shows no Earlier proofs row, with a proof stored, and keeps its other rows and the proof itself', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./')
  const mark = { id: 9001, skillId: 9001, rung: 2, at: '2026-09-20T12:00:00.000Z', day: '2026-09-20' }
  await page.evaluate(async (m) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const tx = dbx.transaction(['rungMarks'], 'readwrite')
    tx.objectStore('rungMarks').put(m)
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, mark)
  await page.reload()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  for (const row of [/^Add a commitment/, /^Follow-through/, /^Becoming/, /^Her/]) await expect(page.getByRole('button', { name: row })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Earlier proofs/ })).toHaveCount(0)
  const stored = await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const all = await new Promise<unknown[]>((res, rej) => {
      const q = dbx.transaction(['rungMarks'], 'readonly').objectStore('rungMarks').getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return all
  })
  expect(stored).toEqual([mark])
  expect(errors).toEqual([])
})
