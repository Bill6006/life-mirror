import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addLearning } from './aimFlow'
import { getBrainPrefs, setBrainSwitch, setFirmness, setWriterModel } from './brainPrefs'
import { chooseAndLog, factSheet, todaysLine } from './brainFlow'
import { coachMode } from './coachFlow'
import { db, ensureDayContext, getSettings } from './db'
import { firmPrefNow } from './firmFlow'

// How firm on the phone, against the real store (Pass 2): the choice is kept in the synced Brain
// row and survives every other Brain change; while the gate is closed a saved choice changes
// nothing, not the sheet the Worker reads, not the phone's own line; opened, the phone's line is
// said at the setting and said again as soon as the setting changes.

const DAY = '2026-09-21'
const NOW = new Date(2026, 8, 21, 9, 0)

async function fresh(): Promise<void> {
  await db.delete()
  await db.open()
  await ensureDayContext(DAY, await getSettings())
  // Something to learn with no skill named yet: the phone's line says so, with delivery choices.
  await addLearning('Learn Italian', 'An audio course', '', '', new Date(2026, 8, 20, 9, 0))
}

describe('the How firm setting', () => {
  beforeEach(fresh)

  it('is Adaptive until chosen, keeps the one chosen, refuses anything else, and survives the other Brain settings', async () => {
    expect((await getBrainPrefs()).firmness).toBeUndefined()
    expect(await firmPrefNow('open')).toBe('adaptive')
    expect(await setFirmness('Hard Coach')).toBe(false)
    expect(await setFirmness('hardCoach')).toBe(true)
    expect((await getBrainPrefs()).firmness).toBe('hardCoach')
    await setWriterModel('sonnet')
    await setBrainSwitch('notes', false)
    expect(await getBrainPrefs()).toMatchObject({ firmness: 'hardCoach', writerModel: 'sonnet', switches: { notes: false } })
    expect(await firmPrefNow('open')).toBe('hardCoach')
    // Kept in the synced row, where the Worker reads it.
    expect((await db.brainPrefs.get('prefs'))?.firmness).toBe('hardCoach')
  })

  it('is read by nothing while the gate is closed: not the setting, and not for the sheet or the phone’s line', async () => {
    await setFirmness('supportive')
    const reads = vi.spyOn(db.brainPrefs, 'get')
    try {
      expect(await firmPrefNow('gated')).toBeNull()
      expect(await firmPrefNow()).toBeNull()
      await factSheet(DAY, NOW)
      await chooseAndLog(DAY, NOW)
      expect(reads).not.toHaveBeenCalled()
      await firmPrefNow('open')
      expect(reads).toHaveBeenCalled()
    } finally {
      reads.mockRestore()
    }
  })
})

describe('a saved choice while the gate is closed', () => {
  beforeEach(fresh)

  it('changes nothing: the ranking the Worker reads and the phone’s own line are the same with it and without it', async () => {
    const before = await factSheet(DAY, NOW)
    await chooseAndLog(DAY, NOW)
    const lineBefore = await todaysLine(DAY, NOW)
    for (const pref of ['hardCoach', 'supportive', 'adaptive']) {
      await setFirmness(pref)
      expect((await factSheet(DAY, NOW)).shortlist, pref).toEqual(before.shortlist)
      await chooseAndLog(DAY, NOW)
      expect(await todaysLine(DAY, NOW), pref).toEqual(lineBefore)
    }
    expect(before.shortlist?.[0]?.situationId).toBe('first-skill')
    expect(before.shortlist?.every((r) => r.firmness === undefined)).toBe(true)
    expect(lineBefore?.text).toBe('Learn Italian has no current skill yet. Name the one thing to work on now on its card under Aims; it stays until you change it.')
    expect(lineBefore?.firmness).toBeUndefined()
    // Not even an empty key: the rows are stored as they always were.
    expect((await db.briefLog.toArray()).every((l) => !('firmness' in l) && !('adaptive' in l))).toBe(true)
  })
})

describe('once the gate is open (as a preview or at the owner’s word)', () => {
  beforeEach(fresh)

  it('says the phone’s own line at the setting, and again as soon as the setting changes, its facts and its one tap unchanged', async () => {
    await setFirmness('hardCoach')
    await chooseAndLog(DAY, NOW, 'open')
    const hard = await todaysLine(DAY, NOW)
    expect(hard).toMatchObject({ situationId: 'first-skill', firmness: 'hardCoach', text: 'Learn Italian has no current skill yet. Name the one thing to work on now, on its card under Aims.' })
    expect(hard?.adaptive).toBeUndefined()
    await setFirmness('supportive')
    await chooseAndLog(DAY, NOW, 'open')
    const warm = await todaysLine(DAY, NOW)
    expect(warm).toMatchObject({ key: hard?.key, firmness: 'supportive', text: 'Learn Italian has no current skill yet. Naming one is the first step: the one thing to work on now, on its card under Aims; it stays until you change it.' })
    expect({ factIds: warm?.factIds, cardIds: warm?.cardIds, action: warm?.action }).toEqual({ factIds: hard?.factIds, cardIds: hard?.cardIds, action: hard?.action })
    await setFirmness('adaptive')
    await chooseAndLog(DAY, NOW, 'open')
    // Nothing firm to say about a missing skill: Adaptive says it even-handedly, and says it chose.
    expect(await todaysLine(DAY, NOW)).toMatchObject({ firmness: 'balanced', adaptive: true, text: 'Learn Italian has no current skill yet. Name the one thing to work on now on its card under Aims; it stays until you change it.' })
  })

  it('keeps Why honest when only the chooser changes: the same words, marked Adaptive or not as the setting now says', async () => {
    await setFirmness('balanced')
    await chooseAndLog(DAY, NOW, 'open')
    const chosen = await todaysLine(DAY, NOW)
    expect(chosen).toMatchObject({ firmness: 'balanced' })
    expect(chosen?.adaptive).toBeUndefined()
    await setFirmness('adaptive')
    await chooseAndLog(DAY, NOW, 'open')
    expect(await todaysLine(DAY, NOW)).toMatchObject({ text: chosen?.text, firmness: 'balanced', adaptive: true })
    await setFirmness('balanced')
    await chooseAndLog(DAY, NOW, 'open')
    const back = await todaysLine(DAY, NOW)
    expect(back).toMatchObject({ text: chosen?.text, firmness: 'balanced' })
    expect(back?.adaptive).toBeUndefined()
  })

  it('leaves a kept line as it always read once the gate is closed again: the balanced words, no firmness, no mark', async () => {
    await setFirmness('adaptive')
    await chooseAndLog(DAY, NOW, 'open')
    expect(await todaysLine(DAY, NOW)).toMatchObject({ firmness: 'balanced', adaptive: true })
    await setFirmness('hardCoach')
    await chooseAndLog(DAY, NOW, 'open')
    const hard = await todaysLine(DAY, NOW)
    expect(hard).toMatchObject({ firmness: 'hardCoach' })
    await chooseAndLog(DAY, NOW, 'gated')
    const closed = await todaysLine(DAY, NOW)
    expect(closed).toMatchObject({ key: hard?.key, text: 'Learn Italian has no current skill yet. Name the one thing to work on now on its card under Aims; it stays until you change it.' })
    expect(closed?.firmness).toBeUndefined()
    expect(closed?.adaptive).toBeUndefined()
    expect((await db.briefLog.toArray()).every((l) => !('firmness' in l) && !('adaptive' in l))).toBe(true)
  })

  it('writes the ranking the Worker reads at the setting, each line with the delivery it used', async () => {
    await setFirmness('hardCoach')
    const sheet = await factSheet(DAY, NOW, coachMode(), 'open')
    expect(sheet.shortlist?.[0]).toMatchObject({ situationId: 'first-skill', firmness: 'hardCoach', text: 'Learn Italian has no current skill yet. Name the one thing to work on now, on its card under Aims.' })
  })
})
