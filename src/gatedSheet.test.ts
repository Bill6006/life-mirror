import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addLearning, logSession, planAim, setEase, setRhythm, setSessionNote, studyAims } from './aimFlow'
import { stepFor } from './aims'
import { coachFor, factSheet } from './brainFlow'
import { db, ensureDayContext, getSettings } from './db'

// What the day's sheet and the coach block say of a learning commitment with sessions, eased and
// noted, recorded before Parts 40 and 41 were built and held fixed while their gate is closed: the
// Worker reads this sheet for every monitored prompt, so it must not move by a byte.

const DAY = '2026-10-04'
const NOW = new Date(2026, 9, 4, 7, 45)

describe('the sheet the monitored prompts are built from, held fixed while Parts 40 and 41 are gated', () => {
  beforeAll(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    await addLearning('Learn Veltish', 'A phrasebook', 'Ten words', 'I can read a little', new Date(2026, 8, 20, 9, 0))
    const [aim] = await studyAims()
    await setRhythm(aim.id as number, { perWeek: 3, restDays: 0 })
    const skills = await db.skills.toArray()
    for (const [d, ease] of [[22, 'right'], [24, 'easy'], [26, 'hard'], [29, 'right'], [1, 'easy']] as const) {
      const when = d > 20 ? new Date(2026, 8, d, 20, 0) : new Date(2026, 9, d, 20, 0)
      const id = await logSession(aim, stepFor(aim, skills, [], [aim]), when)
      await setEase(id, ease)
      if (d === 29) await setSessionNote(id, 'the numbers stuck')
    }
    await planAim(aim, 'afterBedtime', '20:00', NOW, 'Ten words')
  })

  it('names the commitment, its skill, its sessions and its plan exactly as before', async () => {
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.facts.filter((f) => f.id.startsWith('aim.') || f.id.startsWith('trajectory.') || f.id === 'followup' || f.id === 'becoming')).toMatchSnapshot()
    expect(sheet.shortlist).toMatchSnapshot()
  })

  it('writes the same coach block', async () => {
    expect(await coachFor(DAY, NOW)).toMatchSnapshot()
  })
})
