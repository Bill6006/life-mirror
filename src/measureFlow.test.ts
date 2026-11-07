import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims } from './aimFlow'
import { findPath, type Path } from './catalogue'
import { SYNCED_STORES } from './cloudOutbox'
import { db, ensureDayContext, getSettings, type Offer } from './db'
import { onTheSheet } from './facts'
import { checkRecording, deleteRecording, recordingFor, recordingList, saveRecording, setAsidePath, setOtherChecks, setRepSheet, setStrands, startPath } from './measureFlow'
import { recordOutcome, recordDoneNow } from './offerFlow'
import { resumePath } from './pathFlow'
import { recordingsDue } from './pathMeasure'
import { minutesLine, stagesNeedingAPlace, strandsFor, weekLine, weekPlaces } from './pathRead'
import { sizeWords } from './pathMeasureUi'
import { DEFAULT_WEEK } from './settings'
import { pathToday, repStageWords, strandOfRep, type RepPick } from './pathStage'
import { aimOffered, offeredNow, standing } from './pathVersions'

// A measured Path's record on the phone (P2 and P4, 2026-11-06), on the speaking Path itself: started
// on a version you read, with the strands you chose and your two answers not kept; the line before
// Start kept with the step; your checks and how hard it was right after; what someone who was there
// noticed; a recording of yourself kept on this phone alone and checked the next day or later; and the
// chance, after Partly or No. Its steps stay off the fact sheet.

const DAY = '2026-11-06'
const MORNING = new Date(2026, 10, 6, 9, 0)
const speaking = findPath('speaking') as Path

async function speakingAim() {
  const aim = (await activeAims()).find((a) => a.kind === 'path' && a.path === 'speaking')
  if (!aim) throw new Error('no speaking path')
  return aim
}

/** A rep of the speaking path's Speaking strand, started at nine: the step it records. */
async function started(prediction?: string, moveId = 'sp-record-point'): Promise<Offer> {
  const aim = await speakingAim()
  const pick: RepPick = { moveId, setting: 'solo', rule: 'only', chosenBy: 'app', candidates: [moveId], propensities: { [moveId]: 1 }, leaning: false }
  return resumePath(aim, pick, 1, MORNING, ['speaking'], prediction)
}

describe('a Path the catalogue adds, started on a version you read', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })

  it('is offered nowhere until you start it, and then with the strands you chose, one commitment however often', async () => {
    expect(offeredNow(speaking, await db.pathVersions.toArray())).toBe(false)
    await startPath(speaking, ['speaking', 'nerves'], MORNING)
    await startPath(speaking, ['conversation'], MORNING)
    const aims = (await activeAims()).filter((a) => a.kind === 'path')
    expect(aims).toHaveLength(1)
    expect(aims[0].strands).toEqual(['conversation'])
    const versions = await db.pathVersions.toArray()
    expect(versions.map((v) => [v.path, v.version, v.decision])).toEqual([['speaking', '1', 'started'], ['speaking', '1', 'started']])
    expect(versions[0].cards.map((c) => c.id)).toEqual(speaking.cards)
    expect(versions[0].cards.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.reviewed))).toBe(true)
    expect(offeredNow(speaking, versions)).toBe(true)
  })

  it('offers a commitment on a Path the catalogue adds only on a version you started, and every other as ever', async () => {
    const aim = { kind: 'path' as const, path: 'speaking' }
    expect(aimOffered(aim, [])).toBe(false)
    expect(aimOffered({ kind: 'path', path: 'social' }, [])).toBe(true)
    expect(aimOffered({ kind: 'practice', path: undefined }, [])).toBe(true)
    await startPath(speaking, ['speaking'], MORNING)
    expect(aimOffered(aim, await db.pathVersions.toArray())).toBe(true)
    // Started, but a version that fails the compiler's checks is offered nowhere.
    expect(aimOffered(aim, await db.pathVersions.toArray(), () => false)).toBe(false)
    expect(aimOffered({ kind: 'path', path: 'social' }, [], () => false)).toBe(true)
    await setAsidePath(speaking, 'notThis', undefined, new Date(MORNING.getTime() + 1000))
    expect(aimOffered(aim, await db.pathVersions.toArray())).toBe(false)
  })

  it('puts it away on Later or Not this, with one optional reason, and Start is still yours', async () => {
    await setAsidePath(speaking, 'later', 'ignored on later', MORNING)
    expect(standing(speaking, await db.pathVersions.toArray())).toEqual({ kind: 'proposed', later: true })
    await setAsidePath(speaking, 'notThis', '  not now  ', new Date(MORNING.getTime() + 1000))
    expect(standing(speaking, await db.pathVersions.toArray())).toEqual({ kind: 'declined', reason: 'not now' })
    expect((await db.pathVersions.toArray()).find((v) => v.decision === 'later')?.reason).toBeUndefined()
    await startPath(speaking, ['speaking'], new Date(MORNING.getTime() + 2000))
    expect(offeredNow(speaking, await db.pathVersions.toArray())).toBe(true)
  })

  it('turns on the strand a focus names, or every strand but the one a yes opens, and that one on a yes or by choice', () => {
    expect(strandsFor(speaking, 'conversation', false)).toEqual(['conversation'])
    expect(strandsFor(speaking, 'speaking', true)).toEqual(['speaking', 'nerves'])
    expect(strandsFor(speaking, 'both', false)).toEqual(['conversation', 'speaking'])
    expect(strandsFor(speaking, 'both', true)).toEqual(['conversation', 'speaking', 'nerves'])
    // A focus that names the strand a yes opens is no focus: the rest, with it only when asked for.
    expect(strandsFor(speaking, 'nerves', false)).toEqual(['conversation', 'speaking'])
  })

  it('reads your week against its stages: the ones that ask for a meeting or a group, and where your week holds them', () => {
    expect(stagesNeedingAPlace(speaking)).toEqual(['A voice in a group', 'A meeting or a group', 'The talk you would avoid'])
    const none = { ...DEFAULT_WEEK, churchDay: null, thirdDay: null }
    expect(weekPlaces(none)).toEqual({ office: 0, church: false })
    expect(weekLine(speaking, none)).toBe('By its schedule your week holds no office or church day, so the stages that ask for a meeting or a group would mean going somewhere, such as a class or a club: A voice in a group; A meeting or a group; The talk you would avoid.')
    const office = { ...none, officeDays: { ...none.officeDays, 1: true, 3: true, 5: true } }
    expect(weekLine(speaking, office)).toBe('By its schedule your week holds the office on 3 days, where the stages that ask for a meeting or a group can happen: A voice in a group; A meeting or a group; The talk you would avoid.')
    expect(weekLine(speaking, { ...office, officeDays: { ...none.officeDays, 2: true }, churchDay: 6 })).toContain('holds the office on one day and church, where')
    // The Third Day unset is read as Tuesday, as the week reads it.
    expect(weekPlaces({ ...none, thirdDay: undefined }).church).toBe(true)
  })

  it('says what it asks a week from its reps’ minutes and its share of days, and a recording’s size in words', () => {
    expect(minutesLine(speaking)).toBe('A rep takes 1 to 15 minutes, about 3 as a rule, one a day at most: about 9 minutes a week beside another path, about 21 on its own.')
    expect([sizeWords(300), sizeWords(48_200), sizeWords(2_345_678)]).toEqual(['1 KB', '48 KB', '2.3 MB'])
  })

  it('keeps the strands you change from the card, never none', async () => {
    await startPath(speaking, ['conversation', 'speaking'], MORNING)
    const aim = await speakingAim()
    await setStrands(aim.id as number, [])
    expect((await speakingAim()).strands).toEqual(['conversation', 'speaking'])
    await setStrands(aim.id as number, ['nerves'])
    expect((await speakingAim()).strands).toEqual(['nerves'])
  })

  it('says the rep’s own strand and stage, and the strands you have on alone', async () => {
    await startPath(speaking, ['speaking'], MORNING)
    const aim = await speakingAim()
    const pt = pathToday({ aim, offers: [], outcomes: [], ctx: null, day: DAY, block: 'morning' })
    expect(pt.strands.map((s) => s.strand.id)).toEqual(['speaking'])
    expect(pt.elig.eligible.every((m) => m.path?.speaking?.strand === 'speaking')).toBe(true)
    expect(strandOfRep(pt, 'sp-record-point')?.strand.id).toBe('speaking')
    expect(repStageWords(pt, 'sp-record-point')).toBe('Speaking to several people · Recorded alone')
  })
})

describe('a measured rep’s record', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    await startPath(speaking, ['speaking'], MORNING)
  })

  it('keeps the line written before Start with the step, and none when it was left empty', async () => {
    const o = await started('  I will rush the ending  ')
    expect((await db.offers.get(o.id as number))?.prediction).toBe('I will rush the ending')
    const p = await started('   ')
    expect('prediction' in ((await db.offers.get(p.id as number)) ?? {})).toBe(false)
  })

  it('keeps your checks and how hard it was right after Done, a second answer replacing the first, null taking effort back', async () => {
    const o = await started()
    expect(await recordDoneNow(o, new Date(MORNING.getTime() + 60_000))).toBe(true)
    await setRepSheet(o.id as number, { checks: ['opening', 'example'], effort: 4 })
    await setRepSheet(o.id as number, { checks: ['opening'] })
    let x = await db.outcomes.where('offerId').equals(o.id as number).first()
    expect(x?.checks).toEqual(['opening'])
    expect(x?.effort).toBe(4)
    await setRepSheet(o.id as number, { effort: null })
    x = await db.outcomes.where('offerId').equals(o.id as number).first()
    expect(x?.effort).toBeUndefined()
  })

  it('keeps what someone who was there noticed, the behaviours and the moment alone', async () => {
    const o = await started()
    await recordDoneNow(o, new Date(MORNING.getTime() + 60_000))
    await setOtherChecks(o.id as number, ['opening', 'ending'], new Date(MORNING.getTime() + 120_000))
    const x = await db.outcomes.where('offerId').equals(o.id as number).first()
    expect(x?.otherChecks).toEqual(['opening', 'ending'])
    expect(x?.otherAt).toBe(new Date(MORNING.getTime() + 120_000).toISOString())
    expect(Object.keys(x ?? {}).filter((k) => /name|who|person/i.test(k))).toEqual([])
  })

  it('keeps one recording a rep on this phone, checked the next day or later; deleting it keeps what you checked', async () => {
    const o = await started()
    await saveRecording(o.id as number, new Blob(['first']), 'audio/webm', 40_000, MORNING)
    await saveRecording(o.id as number, new Blob(['second take']), 'audio/webm', 62_000, MORNING)
    expect(await db.recordings.count()).toBe(1)
    expect((await recordingFor(o.id as number))?.ms).toBe(62_000)
    await recordDoneNow(o, new Date(MORNING.getTime() + 60_000))
    const list = await recordingList()
    const outcomes = await db.outcomes.toArray()
    // Not on the day it was made; from the next day on, until it is checked.
    expect(recordingsDue(list, outcomes, DAY, () => DAY)).toEqual([])
    expect(recordingsDue(list, outcomes, '2026-11-07', () => DAY).map((r) => r.offerId)).toEqual([o.id])
    await checkRecording(o.id as number, '  rushed the ending ', ['opening', 'pauses', 'example'], new Date(2026, 10, 7, 9))
    const x = await db.outcomes.where('offerId').equals(o.id as number).first()
    expect(x).toMatchObject({ recordingChecks: ['opening', 'pauses', 'example'], recordingNote: 'rushed the ending' })
    expect(recordingsDue(await recordingList(), await db.outcomes.toArray(), '2026-11-07', () => DAY)).toEqual([])
    await deleteRecording(list[0].id as number)
    expect(await db.recordings.count()).toBe(0)
    expect((await db.outcomes.where('offerId').equals(o.id as number).first())?.recordingChecks).toEqual(['opening', 'pauses', 'example'])
  })

  it('never lists a recording whose rep was answered No, or not answered yet', () => {
    const recs = [{ offerId: 1, at: '2026-11-05T09:00:00.000Z' }, { offerId: 2, at: '2026-11-05T09:00:00.000Z' }]
    expect(recordingsDue(recs, [{ offerId: 1, outcome: 'no' }], DAY, () => '2026-11-05')).toEqual([])
    expect(recordingsDue(recs, [{ offerId: 2, outcome: 'partly' }], DAY, () => '2026-11-05').map((r) => r.offerId)).toEqual([2])
  })

  it('keeps the chance after Partly or No, and never after Done or with no answer', async () => {
    const asked = { day: DAY, block: 'afternoon' as const }
    const a = await started()
    await recordOutcome(a, 'partly', null, null, asked, null, false)
    const b = await started()
    await recordOutcome(b, 'no', 'noTime', null, asked, null, true)
    const c = await started()
    await recordOutcome(c, 'done', null, null, asked, null, true)
    const d = await started()
    await recordOutcome(d, 'no', null, null, asked, null, null)
    const by = async (o: Offer) => (await db.outcomes.where('offerId').equals(o.id as number).first())?.chance
    expect([await by(a), await by(b), await by(c), await by(d)]).toEqual([false, true, undefined, undefined])
  })

  it('stays on this phone: recordings never sync, and its steps stay off the fact sheet', () => {
    expect(SYNCED_STORES).not.toContain('recordings')
    expect(SYNCED_STORES).toContain('pathVersions')
    expect(onTheSheet({ paths: ['speaking'] })).toBe(false)
    expect(onTheSheet({ paths: ['social', 'speaking'] })).toBe(true)
    expect(speaking.traits).toMatchObject({ sheet: false, coach: false, privacy: 'own' })
  })
})
