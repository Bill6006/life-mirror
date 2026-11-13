import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ownChipLine, privateInlineWords, privateLineWords } from './associationWords'
import { addDays } from './blocks'
import { evidenceWithStandings, factSheet, privateLinesFor } from './brainFlow'
import { chipAnswerFrom, ownChipAnswerFrom, sweetAnswerFrom } from './checkinAnswers'
import { addPrivateItem, db, getSettings, privateItems, updateSettings, type CheckIn } from './db'
import { factById } from './facts'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { ownChipsOf, withOwnChipAdded } from './settings'

// The check-in's answers and the move card's private line under the one standard (Phase 3, 2026-11-12): each is the
// sheet's own comparison, read by the one function Evidence reads, so a chip tapped three times says "too few to
// compare yet" at the check-in as on the sheet, and a comparison that stands says its readings with the same standing
// in all three places.

const DAY = '2026-09-30'
const NOW = new Date(2026, 8, 30, 20, 0)

/** A check-in at a level: the readings that read up at p, the ones that read down mirrored. */
function ci(day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn {
  const answers: Answers = Object.fromEntries(blockReadings(block).map((id) => [id, 3]))
  for (const id of Object.keys(answers) as ReadingId[]) {
    if (['stress', 'overwhelm', 'irritation'].includes(id)) answers[id] = (6 - p) as Position
    else if (['mood', 'energy', 'focus'].includes(id)) answers[id] = p
  }
  return { day, block, answers, startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras }
}

/** Eight of four weeks' evenings, in no rhythm: a fortnight that cannot be told from itself turned round would test nothing. */
const eight = (back: number) => [3, 4, 6, 10].includes((back - 1) % 14)

/** Four weeks of evenings that started the same, each with its morning after: `mark` says what an evening carried, and the mornings after a marked evening read high. */
function fourWeeks(mark: (back: number) => CheckIn['extras'] | undefined): CheckIn[] {
  const rows: CheckIn[] = []
  for (let back = 29; back >= 2; back--) {
    const day = addDays(DAY, -back)
    const extras = mark(back)
    rows.push(ci(day, 'evening', 3, extras), ci(addDays(day, 1), 'morning', extras && eight(back) ? 4 : 2))
  }
  return rows
}

describe('the check-in’s answers, read from the sheet’s family', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('shows no answer until the family is read', () => {
    expect(chipAnswerFrom(undefined, 'napped')).toBeNull()
    expect(chipAnswerFrom(null, 'nature')).toBeNull()
    expect(ownChipAnswerFrom(undefined, 'a')).toBeNull()
    expect(sweetAnswerFrom(null)).toBeNull()
  })

  it('says a chip tapped three times is too few to compare, at the check-in as on the sheet', async () => {
    // Three naps among four weeks of evenings that started the same: before 2026-11-12 the answer set 3 mornings against 25.
    await db.checkins.bulkAdd(fourWeeks((back) => ([4, 11, 18].includes(back) ? { napped: true } : undefined)))
    const read = await evidenceWithStandings(DAY)
    expect(read.stood?.get('assoc.napped')).toMatchObject({ standing: 'tooFew' })
    expect(chipAnswerFrom(read, 'napped')).toBe('3 times before: too few to compare yet.')
    const sheet = await factSheet(DAY, NOW)
    expect(factById(sheet, 'assoc.napped')?.values).toMatchObject({ standing: 'tooFew' })
    expect(factById(sheet, 'assoc.napped')?.text).toMatch(/^Too few to compare yet: /)
    // A chip never tapped, and one tapped with no morning after yet, say what they always said.
    expect(chipAnswerFrom(read, 'bigSocial')).toBe('First time recorded.')
    await db.checkins.add(ci(addDays(DAY, -1), 'evening', 3, { bigSocial: true }))
    expect(chipAnswerFrom(await evidenceWithStandings(DAY), 'bigSocial')).toBe('Once before. No readings from the morning after yet.')
  })

  it('says a comparison that stands with its readings, the like-for-like difference and one standing in all three places', async () => {
    await db.checkins.bulkAdd(fourWeeks((back) => (eight(back) ? { napped: true } : undefined)))
    const read = await evidenceWithStandings(DAY)
    expect(read.stood?.get('assoc.napped')).toMatchObject({ standing: 'pattern', direction: 'higher' })
    expect(chipAnswerFrom(read, 'napped')).toBe('8 times before. The morning after read 75, against 25 after evenings that started the same (8 and 20). Like for like, 50 points higher: a steady pattern.')
    const sheet = await factSheet(DAY, NOW)
    expect(factById(sheet, 'assoc.napped')?.values).toMatchObject({ standing: 'pattern', direction: 'higher' })
    expect(factById(sheet, 'assoc.napped')?.text).toBe('A steady pattern: mornings after a nap read 50 points higher, the good direction, like for like (8 with it, 20 without).')
  })

  it('answers cooling off and a big social day from the comparisons Evidence shows, and the others from the last-night line’s', async () => {
    await db.checkins.bulkAdd(fourWeeks((back) => (eight(back) ? { coolingOff: true, hardToSeePoint: true } : undefined)))
    const read = await evidenceWithStandings(DAY)
    // One comparison, one object: the answer's numbers are the very ones Evidence's line reads.
    expect(read.family?.night.coolingOff).toBe(read.ev.coolingOff?.association)
    const said = '8 times before. The morning after read 75, against 25 after evenings that started the same (8 and 20). Like for like, 50 points higher: '
    // Two comparisons, corrected as one family of two, each far past chance: both stand at a steady pattern.
    expect(read.stood?.get('assoc.coolingOff')).toMatchObject({ standing: 'pattern', direction: 'higher', family: 2 })
    expect(read.stood?.get('assoc.hardToSeePoint')).toMatchObject({ standing: 'pattern', direction: 'higher', family: 2 })
    expect(chipAnswerFrom(read, 'coolingOff')).toBe(`${said}a steady pattern.`)
    expect(chipAnswerFrom(read, 'hardToSeePoint')).toBe(`${said}a steady pattern.`)
  })

  it('answers the afternoon’s something sweet from the sheet’s own comparison of the evenings after', async () => {
    // Four weeks of afternoons that started the same and showed the chip: something sweet on eight, their evenings low.
    const rows: CheckIn[] = []
    for (let back = 29; back >= 2; back--) {
      const day = addDays(DAY, -back)
      const sweet = eight(back)
      rows.push(ci(day, 'afternoon', 3, { chipsShown: { sweet: true }, ...(sweet ? { sweet: true as const } : {}) }), ci(day, 'evening', sweet ? 2 : 4))
    }
    await db.checkins.bulkAdd(rows)
    const read = await evidenceWithStandings(DAY)
    expect(read.stood?.get('assoc.sweet')).toMatchObject({ standing: 'pattern', direction: 'lower' })
    expect(sweetAnswerFrom(read)).toBe('8 times before. The evening read 25, against 75 after afternoons that started the same (8 and 20). Like for like, 50 points lower: a steady pattern.')
    const sheet = await factSheet(DAY, NOW)
    expect(factById(sheet, 'assoc.sweet')?.values).toMatchObject({ standing: 'pattern', direction: 'lower' })
  })

  it('answers one of your own chips where it stands among your own chips, as Evidence says it', async () => {
    await updateSettings((s) => withOwnChipAdded(withOwnChipAdded(s, 'Stand-in a'), 'Stand-in b'))
    const [a, b] = ownChipsOf(await getSettings())
    const shown = { chipsShown: { [`own:${a.id}`]: true as const, [`own:${b.id}`]: true as const } }
    // Every evening showed both chips: the first tapped on eight in no rhythm, the mornings after those high; the second on three.
    await db.checkins.bulkAdd(fourWeeks((back) => ({ ...shown, own: { ...(eight(back) ? { [a.id]: true as const } : {}), ...(back > 26 ? { [b.id]: true as const } : {}) } })))
    const read = await evidenceWithStandings(DAY)
    expect(read.own?.stood.get(`own.${a.id}`)).toMatchObject({ standing: 'pattern', direction: 'higher', family: 1 })
    expect(ownChipAnswerFrom(read, a.id)).toBe('8 times before. The morning after read 75, against 25 after evenings that started the same (8 and 20). Like for like, 50 points higher: a steady pattern.')
    expect(ownChipAnswerFrom(read, b.id)).toBe('3 times before: too few to compare yet.')
    // Evidence reads the same family, so its line stands the same.
    expect(ownChipLine('Stand-in a', read.own!.answers.get(a.id)!, read.own!.stood, a.id)).toContain('Like for like, 50 points higher: a steady pattern.')
    expect(ownChipLine('Stand-in b', read.own!.answers.get(b.id)!, read.own!.stood, b.id)).toBe('Stand-in b: 3 evenings marked, too few to compare yet.')
    // A label never reaches the sheet, so its comparison never joins the sheet's family.
    expect([...(read.stood?.keys() ?? [])].some((id) => id.startsWith('own.'))).toBe(false)
  })
})

describe('a private item’s line on the move card', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  /** One private item, on screen every evening of four weeks and logged on eight of them, the mornings after those low. */
  async function seed(): Promise<number> {
    await addPrivateItem('A stand-in item')
    const id = (await privateItems())[0].id as number
    const rows: CheckIn[] = []
    for (let back = 29; back >= 2; back--) {
      const day = addDays(DAY, -back)
      const logged = eight(back)
      rows.push(ci(day, 'evening', 3, { privateShown: { [String(id)]: true }, ...(logged ? { private: { [String(id)]: true as const } } : {}) }), ci(addDays(day, 1), 'morning', logged ? 2 : 4))
    }
    await db.checkins.bulkAdd(rows)
    return id
  }

  it('is read only while private items are in selection', async () => {
    await seed()
    expect((await getSettings()).privateInSelection).toBe(false)
    expect(await privateLinesFor(DAY, 'evening')).toEqual({ privates: [], stood: null })
  })

  it('says its readings with where the comparison stands in the sheet’s family, as Evidence does, and only at its own check-in', async () => {
    const id = await seed()
    await updateSettings((s) => ({ ...s, privateInSelection: true }))
    const lines = await privateLinesFor(DAY, 'evening')
    expect(lines.privates.map((p) => [p.itemId, p.block])).toEqual([[id, 'evening']])
    expect(lines.stood?.get(`private.${id}`)).toMatchObject({ standing: 'pattern', direction: 'lower' })
    const [p] = lines.privates
    expect(privateInlineWords(p, 'A ten-minute walk, now', false, lines.stood)).toBe('Your record: evenings with a private item logged, the morning after read 25 against 75 after evenings that started the same (8 and 20). Like for like, 50 points lower: a steady pattern. An alternative: A ten-minute walk, now.')
    // Evidence's line for the same item reads the same standing.
    const read = await evidenceWithStandings(DAY)
    expect(privateLineWords(read.ev.privates[0], 'A ten-minute walk, now', false, read.stood)).toContain('Like for like, 50 points lower: a steady pattern.')
    // Not placed in the morning: no line on the morning's card.
    expect((await privateLinesFor(DAY, 'morning')).privates).toEqual([])
  })

  it('says too few to compare where three evenings used to set two readings side by side', async () => {
    await addPrivateItem('A stand-in item')
    const id = (await privateItems())[0].id as number
    await updateSettings((s) => ({ ...s, privateInSelection: true }))
    await db.checkins.bulkAdd(fourWeeks((back) => ({ privateShown: { [String(id)]: true }, ...([4, 11, 18].includes(back) ? { private: { [String(id)]: true as const } } : {}) })))
    const lines = await privateLinesFor(DAY, 'evening')
    expect(lines.privates[0].association).toMatchObject({ withEvent: { n: 3 }, without: { n: 25 } })
    expect(privateInlineWords(lines.privates[0], 'A ten-minute walk, now', false, lines.stood)).toBe('Your record: evenings with a private item logged, too few to compare yet. An alternative: A ten-minute walk, now.')
  })
})
