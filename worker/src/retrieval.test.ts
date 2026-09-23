import { describe, expect, it } from 'vitest'
import { BRAIN_SWITCHES, readBrainPrefs } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import catalogueJson from '../../src/catalogue.json'
import { CATEGORIES, lineBriefing, permitted } from './briefing'
import { buildMessages } from './prompt'
import { accessFor, contextFor, FAITH_WORDS, gatesFrom, readCategory, sheetForClaude, type Catalogue } from './retrieval'
import { APP, BRAIN_APP, memoryStore } from './turso'

// The private retrieval layer (Part 30): what Claude may read, closed by default, and every read
// logged without its content. The acceptance list of the plan, item by item.

const DAY = '2026-09-18'
const catalogue: Catalogue = new Map((catalogueJson as { moves: { id: string; name: string; family: string; hiddenWith?: string }[] }).moves.map((m) => [m.id, { name: m.name, family: m.family, ...(m.hiddenWith ? { hiddenWith: m.hiddenWith } : {}) }]))
const f = (id: string, tags: string[] = [], text = id, values: Fact['values'] = {}): Fact => ({ id, tags, text, values })

const sheet: FactSheet = {
  version: 1,
  day: DAY,
  builtAt: `${DAY}T11:41:00.000Z`,
  hour: 7,
  weeks: 3,
  days: 22,
  direction: 'One line, mine',
  said: [{ day: '2026-09-17', source: 'phone', situationId: 'x', text: 'said yesterday', feedback: null }],
  shortlist: [
    { situationId: 'note-led', mode: 'observation', text: 'n', factIds: ['note.2026-09-17.evening'], cardIds: [], score: 1 },
    { situationId: 'sleep-led', mode: 'observation', text: 's', factIds: ['today.shortSleep'], cardIds: [], score: 0.5 },
  ],
  facts: [
    f('week.today', ['cue'], 'Today is Friday.'),
    f('week.tomorrow', ['cue'], 'Tomorrow is Saturday.', { day: '2026-09-19' }),
    f('today.shortSleep', ['sleep'], 'Short sleep.'),
    f('note.2026-09-17.evening', ['writing'], 'You wrote: “work was heavy”.'),
    f('note.2026-09-16.evening', ['writing'], 'You wrote: “church ran long”.'),
    f('private.3', ['evening'], 'Mornings after the item read higher.'),
    f('aim.1', ['study'], 'French.'),
    f('aim.2', ['social'], 'The Partner path.'),
    f('path.2', ['social', 'people'], 'The Partner path: Dating.', { path: 'partner' }),
    f('aim.3', ['plan', 'faith'], 'A faith practice.'),
    f('partner.dateDay', ['dating'], 'A date is declared for today.'),
    f('followup', ['monitoring'], 'Yesterday’s line was about French.'),
    f('becoming', ['monitoring'], 'Under the direction: 2 faith practices, 3 times with her.'),
    f('people.seen', ['social'], 'Weekend afternoons have carried an in-person rep 3 times.'),
  ],
}

const OPEN = gatesFrom({ hideFaith: false, privateInSelection: false })
const idsOf = (s: FactSheet) => s.facts.map((x) => x.id)

describe('what the sheet shows Claude', () => {
  it('shows every fact while every switch is on and faith is shown', () => {
    const s = sheetForClaude(sheet, accessFor('line', OPEN, readBrainPrefs({})))
    expect(idsOf(s)).toEqual(idsOf(sheet))
    expect(s.said).toHaveLength(1)
    expect(s.shortlist).toHaveLength(2)
  })

  it('takes out every fact of a category switched off, and any ranked line that cites one', () => {
    const off = (sw: string) => sheetForClaude(sheet, accessFor('line', OPEN, readBrainPrefs({ switches: { [sw]: false } })))
    expect(idsOf(off('notes')).filter((id) => id.startsWith('note.'))).toEqual([])
    expect(off('notes').shortlist?.map((r) => r.situationId)).toEqual(['sleep-led'])
    expect(idsOf(off('privateItems'))).not.toContain('private.3')
    expect(idsOf(off('partnerPath'))).toEqual(expect.not.arrayContaining(['aim.2', 'path.2', 'partner.dateDay']))
    expect(idsOf(off('partnerPath'))).toContain('aim.1')
    expect(idsOf(off('commitments'))).toEqual(expect.not.arrayContaining(['aim.1', 'becoming']))
    expect(idsOf(off('brainHistory'))).not.toContain('followup')
    expect(off('brainHistory').said).toEqual([])
    expect(idsOf(off('her'))).not.toContain('becoming')
    const noDay = idsOf(off('dayRecord'))
    expect(noDay).not.toContain('today.shortSleep')
    // The day's shape and the frame stay: without them no line can be held to its day.
    expect(noDay).toEqual(expect.arrayContaining(['week.today', 'week.tomorrow']))
  })

  it('keeps faith out while the faith family is hidden: faith’s facts, the counts that carry faith, and a note about it', () => {
    const s = sheetForClaude(sheet, accessFor('line', gatesFrom({ hideFaith: true }), readBrainPrefs({})))
    expect(idsOf(s)).toEqual(expect.not.arrayContaining(['aim.3', 'becoming', 'note.2026-09-16.evening']))
    expect(idsOf(s)).toContain('note.2026-09-17.evening')
    // The same with the faith switch off, faith shown.
    expect(idsOf(sheetForClaude(sheet, accessFor('line', OPEN, readBrainPrefs({ switches: { faith: false } }))))).not.toContain('aim.3')
    expect(FAITH_WORDS.test('prayed before work')).toBe(true)
    expect(FAITH_WORDS.test('a heavy day at work')).toBe(false)
  })
})

describe('the permission check, for Claude', () => {
  it('names only categories the layer knows, and every switch is one of them', () => {
    for (const sw of BRAIN_SWITCHES) expect(CATEGORIES as readonly string[]).toContain(sw)
    expect(permitted('line', 'claude', 'everything', OPEN)).toBe(false)
    expect(permitted('line', 'claude', 'monthlyCheck', OPEN)).toBe(false)
    expect(permitted('review', 'claude', 'monthlyCheck', OPEN)).toBe(false)
  })

  it('never lets private items inform a pick while their switch in Settings is off (Rule 11)', () => {
    expect(permitted('coach', 'claude', 'privateItems', gatesFrom({ privateInSelection: false }))).toBe(false)
    expect(permitted('coach', 'claude', 'privateItems', gatesFrom({ privateInSelection: true }))).toBe(true)
  })

  it('reads the Brain settings the same way on both sides: Opus unless one of the four, a switch off only when it says so', () => {
    expect(readBrainPrefs(null)).toEqual({ writerModel: 'opus', switches: {} })
    expect(readBrainPrefs({ writerModel: 'best', switches: { notes: false, faith: true, invented: false } })).toEqual({ writerModel: 'opus', switches: { notes: false } })
    expect(readBrainPrefs({ writerModel: 'sonnet' }).writerModel).toBe('sonnet')
  })

  it('closes when the settings row cannot be read: faith hidden, private items out of picks', () => {
    expect(gatesFrom(null)).toEqual({ faithHidden: true, privateInSelection: false, claudeMayRead: true })
  })
})

describe('the free model chain', () => {
  it('reads the fact sheet alone: no private context can be added to its briefing, and its prompt carries none', () => {
    expect(lineBriefing({ task: 'line', writer: 'free', sheet, forDay: DAY, cards: [], said: [], context: 'a note' })).toEqual({ ok: false, reason: 'the free chain reads the fact sheet alone' })
    const b = lineBriefing({ task: 'line', writer: 'free', sheet, forDay: DAY, cards: [], said: [] })
    if (!b.ok) throw new Error(b.reason)
    expect(b.briefing.context).toBe('')
    expect(JSON.stringify(buildMessages(b.briefing))).not.toContain('PRIVATE CONTEXT')
  })
})

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: '', deleted: 0, synced_at: '' })

function record(): Store {
  const store = memoryStore()
  put(store, 'checkins', '1', '2026-09-17', { id: 1, day: '2026-09-17', block: 'evening', answers: { mood: 2 }, extras: { note: 'long talk with a friend', closeToGod: true, caffeineIntake: { band: 2, at: '', since: null } } })
  put(store, 'checkins', '2', '2026-09-16', { id: 2, day: '2026-09-16', block: 'evening', answers: {}, extras: { note: 'church ran long' } })
  put(store, 'reflections', '5', '2026-09-15', { id: 5, path: 'partner', kind: 'values', part: 'nonNegotiables', day: '2026-09-15', text: 'Honesty.' })
  put(store, 'reflections', '6', '2026-09-15', { id: 6, path: 'social', kind: 'reflection', day: '2026-09-15', text: 'A neighbour stopped to talk.' })
  put(store, 'offers', '10', '2026-09-17', { id: 10, day: '2026-09-17', moveId: 'talk-faith', paths: ['partner'], skippedAt: null })
  put(store, 'offers', '11', '2026-09-17', { id: 11, day: '2026-09-17', moveId: 'talk-ordinary-week', paths: ['partner'], skippedAt: null })
  put(store, 'outcomes', '20', '2026-09-17', { id: 20, offerId: 10, day: '2026-09-17', outcome: 'done' })
  put(store, 'outcomes', '21', '2026-09-17', { id: 21, offerId: 11, day: '2026-09-17', outcome: 'done' })
  put(store, 'pathMarks', '30', DAY, { id: 30, path: 'partner', kind: 'date', day: DAY })
  return store
}
const week = { from: '2026-09-11', to: DAY, limit: 20 }

describe('the readers', () => {
  it('read faith’s records only while faith may be read', async () => {
    const store = record()
    const shown = accessFor('line', OPEN, readBrainPrefs({}))
    const hidden = accessFor('line', gatesFrom({ hideFaith: true }), readBrainPrefs({}))
    const texts = async (a: typeof shown, c: Parameters<typeof readCategory>[1]) => ((await readCategory({ store, catalogue, a }, c, week)) ?? []).map((i) => i.text).join(' | ')
    expect(await texts(shown, 'partnerPath')).toContain('Talk about faith and how you live it, done')
    expect(await texts(hidden, 'partnerPath')).not.toContain('faith')
    expect(await texts(hidden, 'partnerPath')).toContain('Talk about a good ordinary week, done')
    expect(await texts(shown, 'dayRecord')).toContain('felt close to God')
    expect(await texts(hidden, 'dayRecord')).not.toContain('God')
    expect(await texts(hidden, 'dayRecord')).toContain('caffeine 100 to 199 mg')
    expect(await texts(hidden, 'notes')).not.toContain('church')
    expect(await texts(shown, 'notes')).toContain('church ran long')
  })

  it('read a path’s reflections only while its path may be read', async () => {
    const store = record()
    const noPartner = accessFor('line', OPEN, readBrainPrefs({ switches: { partnerPath: false } }))
    const out = ((await readCategory({ store, catalogue, a: noPartner }, 'reflections', week)) ?? []).map((i) => i.text)
    expect(out).toEqual(['a note you kept: “A neighbour stopped to talk.”'])
  })

  it('never serve a category a switch turned off, in the briefing or its read log', async () => {
    const store = record()
    const a = accessFor('line', OPEN, readBrainPrefs({ switches: { reflections: false, notes: false } }))
    const ctx = await contextFor(store, catalogue, a, DAY, 'task:x', new Date('2026-09-18T11:45:00Z'))
    expect(ctx.text).not.toMatch(/Honesty|neighbour|long talk|church/)
    const logged = [...store.rows.values()].filter((r) => r.app === BRAIN_APP && r.store === 'reads').map((r) => JSON.parse(r.body ?? '{}').category)
    expect(logged).toEqual(expect.not.arrayContaining(['reflections', 'notes']))
    // With them on, the same record is read, and logged.
    const b = await contextFor(record(), catalogue, accessFor('line', OPEN, readBrainPrefs({})), DAY, 'task:y', new Date('2026-09-18T11:45:00Z'))
    expect(b.text).toContain('Honesty.')
    expect(b.text).toContain('a date, declared for this day')
  })
})
