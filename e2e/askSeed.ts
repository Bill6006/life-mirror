import type { Page } from '@playwright/test'

// Stand-in records for Ask Life Mirror's browser tests and its themes audit (stage A1, 2026-10-19): a record the repair
// reads, and threads as an earlier read would have left them. Nothing here is a test.

const FITS = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']

/**
 * Days of a record written straight into the phone's store: each check-in complete, each with a fair draw between the walk
 * and nothing extra, seen and answered; stress reads lowest at the check-in after a walk, so the walk's stress test reaches
 * a call as the record grows.
 */
export async function seedRecord(page: Page, days: number): Promise<void> {
  await page.evaluate(
    async ({ n, fits }) => {
      const coin = (slot: number) => {
        let a = (slot * 7919 + 13) | 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < 0.5
      }
      let last: string | null = null
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
      const now = new Date()
      let k = 0
      for (let d = n; d >= 1; d--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        for (const block of Object.keys(blocks)) {
          k++
          const answers: Record<string, number> = {}
          blocks[block].forEach((id, ri) => {
            answers[id] = 1 + ((k + ri) % 5)
          })
          if (last !== null) answers.stress = last === 'walk-ten' ? 1 : 5
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
          const done = new Date(at.getTime() + 95_000).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
          const moveId = coin(k - 1) ? 'walk-ten' : 'nothing'
          last = moveId
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
    },
    { n: days, fits: FITS },
  )
}

/** A thread and its one answered turn, written straight into the phone's store, as an earlier read would have left them. */
export async function seedThread(page: Page, title: string, kind: string, cited: unknown[], at: string): Promise<void> {
  await page.evaluate(
    async ({ title, kind, cited, at }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['askThreads', 'askTurns'], 'readwrite')
      const day = at.slice(0, 10)
      const id = await new Promise<number>((res) => {
        const q = tx.objectStore('askThreads').add({ day, at, title, from: { kind: 'starter', starter: kind } })
        q.onsuccess = () => res(q.result as number)
      })
      tx.objectStore('askTurns').add({ threadId: id, day, at, question: title, tier: 'quick', state: 'answered', kind, version: 'earlier', quick: { sections: [{ title: null, lines: ['As it stood then.'] }] }, cited, updatedAt: at })
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { title, kind, cited, at },
  )
}


/** A turn as a stand-in thread holds it: a question, and, for one Claude answered, what came back. */
export interface SeedTurn {
  question: string
  tier?: 'quick' | 'standard' | 'deep'
  kind?: string
  state?: 'answered' | 'waiting' | 'cancelled'
  claude?: { status: 'answered' | 'failed'; text?: string; facts?: { id: string; text: string }[]; model?: string }
}

/** A thread with its turns written straight into the phone's store, and Claude's answers into the brain's rows the phone keeps (stage A2). */
export async function seedTurns(page: Page, title: string, turns: SeedTurn[], at: string): Promise<void> {
  await page.evaluate(
    async ({ title, turns, at }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['askThreads', 'askTurns', 'askAnswers'], 'readwrite')
      const day = at.slice(0, 10)
      const threadId = await new Promise<number>((res) => {
        const q = tx.objectStore('askThreads').add({ day, at, title, from: { kind: 'typed' } })
        q.onsuccess = () => res(q.result as number)
      })
      for (const [i, t] of turns.entries()) {
        const when = new Date(Date.parse(at) + i * 60_000).toISOString()
        const turnId = await new Promise<number>((res) => {
          const q = tx.objectStore('askTurns').add({ threadId, day, at: when, question: t.question, tier: t.tier ?? 'standard', state: t.state ?? 'waiting', kind: t.kind ?? 'typed', version: 'earlier', cited: [], updatedAt: when })
          q.onsuccess = () => res(q.result as number)
        })
        if (t.claude) tx.objectStore('askAnswers').put({ id: `turn:${turnId}`, turnId, threadId, day, at: when, status: t.claude.status, ...(t.claude.text ? { text: t.claude.text, factIds: (t.claude.facts ?? []).map((f) => f.id), cardIds: [], facts: t.claude.facts ?? [] } : {}), ...(t.claude.model ? { model: t.claude.model } : {}) })
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { title, turns, at },
  )
}
