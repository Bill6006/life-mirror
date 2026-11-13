import { describe, expect, it } from 'vitest'
import { BRAIN_SWITCHES, type BrainSwitch } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import { runBrief, runReview } from './brief'
import { askTaskIds } from '../../src/ask/shared'
import type { Message } from './prompt'
import { factCategories, LOOKUPS } from './retrieval'
import { APP, memoryStore } from './turso'

// The free chain under the owner's switches and the faith rule (2026-11-12). A fact Claude may not read is not read
// by a free model either: the line and the review the free chain writes are built from the sheet as Claude may read
// it, less the families the free chain never reads. With every switch on and faith shown, both prompts are byte for
// byte what they were before the rule: the snapshot below was recorded on the code before it, and holds.
// Everything here is invented; small made-up cards stand in for the library.

const TZ = 'America/New_York'
const DAY = '2026-10-04'
const env = { TIMEZONE: TZ, BRIEF_HOUR: '5', FALLBACK_TIME: '11:00', MODELS: 'model-a', LIBRARY_URL: 'https://example.test/library.json' }
const CARDS: ClaimCard[] = [
  { id: 'plan-a-cue', claim: 'A plan tied to a cue is kept more often.', domain: 'behaviour-change', tags: ['cue', 'plan', 'study'], grade: 'A', replication: 'replicated', effect: 'small', population: 'adults', sources: [{ cite: 'Invented (2025).', doi: '10.0000/x' }], caveats: 'None known.', app: 'One tap says when.', reviewed: '2026-09-24', status: 'admitted' },
]
const fetcher = (async () => new Response(JSON.stringify(CARDS), { headers: { 'content-type': 'application/json' } })) as typeof fetch
/** New York local times (UTC−4). */
const at = (hhmm: string) => new Date(`${DAY}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)

const SAID = 'Veltish: the current skill is Ten words. Pin it to a moment today.'

/** A sheet holding one fact or more of every family the phone can put on it. */
const FACTS: FactSheet['facts'] = [
  { id: 'week.today', tags: ['cue'], text: 'Today is Sunday; not a daycare day; at home; her bedtime 20:00; the hour is 7.', values: { weekday: 'Sunday', daycare: 0, pickup: null, office: 0, church: 0, studyNight: 0, bedtime: '20:00', hour: 7 } },
  { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Monday; a daycare day with pickup at 17:30; at home; her bedtime 20:00.', values: { day: '2026-10-05', weekday: 'Monday', daycare: 1, pickup: '17:30', office: 0, church: 0, studyNight: 0 } },
  { id: 'record', tags: [], text: 'The record holds 36 days.', values: { days: 36 } },
  { id: 'today.shortSleep', tags: ['sleep'], text: 'Sleep hours read “Under 5 hours” this morning.', values: {} },
  { id: 'workout.last', tags: ['workout', 'morning'], text: 'The last workout: Saturday morning, 42 minutes.', values: { day: '2026-10-03', block: 'morning', minutes: 42 } },
  { id: 'assoc.walk', tags: [], text: 'On days with a walk the evening read 6 points higher, over 9 days with one and 12 without.', values: { with: 9, without: 12, diff: 6 }, n: 21 },
  { id: 'aim.1', tags: ['study', 'cue'], text: 'Veltish (learning): the current skill is “Ten words”; 5 sessions on it over 4 days since Sep 28; no plan today.', values: { kind: 'certification', name: 'Veltish', skill: 'Ten words', sessions: 5, days: 4 } },
  { id: 'trajectory.1', tags: ['study', 'habit'], text: 'Veltish: steps started per week over the last four weeks, oldest first: 3, 2, 1, 2.', values: { name: 'Veltish', aimId: 1, w3: 3, w2: 2, w1: 1, w0: 2 }, n: 8 },
  { id: 'study.nights', tags: ['study'], text: 'Study nights this week: Tuesday and Thursday.', values: {} },
  { id: 'path.2', tags: [], text: 'The Partner path is at its second stage.', values: { path: 'partner', stage: 2 } },
  { id: 'aim.2', tags: [], text: 'On the Partner path: one act of care planned this week.', values: {} },
  { id: 'partner.acts', tags: [], text: 'Partner path acts this week: 2 done.', values: { done: 2 } },
  { id: 'path.3', tags: [], text: 'The Social path is at its second stage.', values: { path: 'social', stage: 2 } },
  { id: 'aim.3', tags: ['social'], text: 'On the Social path: two reps planned this week.', values: {} },
  { id: 'note.2026-10-03.evening', tags: ['writing'], text: 'On 2026-10-03, at the evening check-in, you wrote: “long week”.', values: { day: '2026-10-03', block: 'evening', note: 'long week' } },
  { id: 'note.2026-10-02.evening', tags: ['writing'], text: 'On 2026-10-02, at the evening check-in, you wrote: “prayed before bed”.', values: { day: '2026-10-02', block: 'evening', note: 'prayed before bed' } },
  { id: 'private.1', tags: [], text: 'A private item was marked on 3 of the last 7 days.', values: { days: 3 } },
  { id: 'followup', tags: [], text: 'The line of 2026-10-03 asked for a plan, and one was made.', values: {} },
  { id: 'review.change', tags: [], text: 'The last review named one change: an earlier sitting.', values: {} },
  { id: 'memory.2026-10-03', tags: [], text: 'The line seen on 2026-10-03 asked for a plan for Veltish: a plan was made that day.', values: { day: '2026-10-03', ask: 'plan', aimId: 1 } },
  { id: 'weekly.gap', tags: [], text: 'The gap, from the weekly view: typical 52, good 61, best 74.', values: { typical: 52, good: 61, best: 74 } },
  { id: 'weather.today', tags: [], text: 'Today’s weather: dry, 14 degrees at midday.', values: { rain: 0, temp: 14 } },
  { id: 'assoc.weather.rain', tags: [], text: 'On rainy days the evening read 3 points lower, over 6 rainy days and 20 dry.', values: { diff: -3 }, n: 26 },
  { id: 'usage.opens', tags: [], text: 'Life Mirror was opened on 6 of the last 7 days.', values: { days: 6 } },
  { id: 'location.today', tags: [], text: 'Today so far: the morning at home.', values: {} },
  { id: 'becoming', tags: [], text: 'Who you are becoming, in your words: “steady and kind”.', values: {} },
  { id: 'people.seen', tags: [], text: 'People seen in person on 3 of the last 7 days.', values: { days: 3 } },
  { id: 'practice.week', tags: ['faith'], text: 'A faith practice was done on 2 of the last 7 days.', values: { days: 2 } },
]

const SHEET: FactSheet = {
  version: 1,
  day: DAY,
  builtAt: `${DAY}T11:41:00.000Z`,
  hour: 7,
  weeks: 5,
  days: 36,
  direction: 'One line, mine',
  said: [{ day: '2026-10-03', source: 'phone', situationId: 'say-when', text: SAID, feedback: 'useful' }],
  checkedIn: { morning: `${DAY}T11:40:00.000Z` },
  shortlist: [
    { situationId: 'say-when', mode: 'recommendation', text: 'Veltish: the step is Ten words. Say when, one tap.', factIds: ['aim.1'], cardIds: ['plan-a-cue'], score: 0.6 },
    { situationId: 'private-days', mode: 'observation', text: 'A private item came up on several days.', factIds: ['private.1'], cardIds: [], score: 0.5 },
    { situationId: 'practice-days', mode: 'observation', text: 'A practice was kept on two days.', factIds: ['practice.week'], cardIds: [], score: 0.4 },
    { situationId: 'remembered', mode: 'observation', text: 'The line of the day before was followed.', factIds: ['memory.2026-10-03'], cardIds: [], score: 0.3 },
  ],
  facts: FACTS,
}

/** The five families the free chain never reads, whatever the switches say. */
const NEVER = ['memory.2026-10-03', 'weekly.gap', 'weather.today', 'assoc.weather.rain', 'usage.opens', 'location.today']
/** What the free chain reads of this sheet with every switch on and faith shown: everything else, in the sheet's order. */
const ALL_ON = FACTS.map((f) => f.id).filter((id) => !NEVER.includes(id))

/** The facts each switch takes out of the free chain's prompt when it is off, stated here and not computed. */
const GONE: Record<BrainSwitch, string[]> = {
  dayRecord: ['today.shortSleep', 'workout.last', 'assoc.walk', 'practice.week'],
  notes: ['note.2026-10-03.evening', 'note.2026-10-02.evening'],
  journal: [],
  privateItems: ['private.1'],
  commitments: ['aim.1', 'trajectory.1', 'study.nights', 'becoming'],
  socialPath: ['path.3', 'aim.3'],
  partnerPath: ['path.2', 'aim.2', 'partner.acts'],
  reflections: [],
  monthlyCheck: [],
  her: ['becoming'],
  faith: ['note.2026-10-02.evening', 'becoming', 'practice.week'],
  brainHistory: ['followup', 'review.change'],
  usage: [],
  location: [],
}
const FAITH_HIDDEN = GONE.faith

type Store = ReturnType<typeof memoryStore>
type Settings = Record<string, unknown> | null

function record(settings: Settings = { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false }, switches: Partial<Record<BrainSwitch, false>> | null = null, sheet: FactSheet = SHEET): Store {
  const store = memoryStore()
  const put = (s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: sheet.builtAt, deleted: 0, synced_at: sheet.builtAt })
  put('facts', DAY, DAY, { day: DAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet })
  if (settings) put('settings', '1', null, settings)
  if (switches) put('brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches })
  return store
}

const candidate = (text: string) => ({ mode: 'recommendation', text, factIds: ['week.today'], cardIds: [], action: null, firmness: 'balanced' })

/** The first messages the free chain sends for the day's line or the Sunday review, and how the run ended. */
async function asked(store: Store, kind: 'line' | 'review' = 'line', answer: unknown = { candidates: [candidate('Sunday is at home: keep the morning light.')] }) {
  let first: Message[] | null = null
  const run = async (_model: string, messages: Message[]) => {
    first ??= messages
    return { response: JSON.stringify(answer) }
  }
  const result = kind === 'line' ? await runBrief(env, store, run, at('07:45'), { fetcher }) : await runReview(env, store, run, at('05:00'), { fetcher })
  const messages = (first ?? []) as Message[]
  const user = messages[1]?.content ?? ''
  return { result, messages, user, ids: FACTS.map((f) => f.id).filter((id) => user.includes(`[${id}] `)) }
}

describe('what the free chain reads, with every switch on and faith shown', () => {
  it('is byte for byte what it was before the switches bound it, for the line and for the review', async () => {
    const line = await asked(record())
    const review = await asked(record(), 'review')
    expect(line.ids).toEqual(ALL_ON)
    expect(review.ids).toEqual(ALL_ON)
    expect(line.messages).toMatchSnapshot()
    expect(review.messages).toMatchSnapshot()
  })

  it('still never reads how the app is used, where the day was spent, the memory of its lines, the weekly view or the weather', async () => {
    const { user } = await asked(record())
    for (const id of NEVER) expect(user, id).not.toContain(`[${id}]`)
    // Nor a ranked line resting on one of them.
    expect(user).not.toContain('The line of the day before was followed.')
    expect(user).toContain('A private item came up on several days.')
  })
})

describe('what the free chain reads under the owner’s switches', () => {
  it('loses exactly the facts of a category whose switch is off, for each of the fourteen', async () => {
    expect([...BRAIN_SWITCHES]).toEqual(['dayRecord', 'notes', 'journal', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'monthlyCheck', 'her', 'faith', 'brainHistory', 'usage', 'location'])
    for (const sw of BRAIN_SWITCHES) {
      for (const kind of ['line', 'review'] as const) {
        const { ids, user } = await asked(record(undefined, { [sw]: false }), kind)
        expect(ids, `${sw}, ${kind}`).toEqual(ALL_ON.filter((id) => !GONE[sw].includes(id)))
        for (const id of NEVER) expect(user, `${sw}, ${kind}, ${id}`).not.toContain(`[${id}]`)
      }
    }
  })

  it('loses a ranked line that rests on a fact it may not read', async () => {
    expect((await asked(record())).user).toContain('A private item came up on several days.')
    expect((await asked(record(undefined, { privateItems: false }))).user).not.toContain('A private item came up on several days.')
    expect((await asked(record())).user).toContain('Veltish: the step is Ten words. Say when, one tap.')
    expect((await asked(record(undefined, { commitments: false }))).user).not.toContain('Veltish: the step is Ten words. Say when, one tap.')
  })

  it('is not told what was said lately while the Brain’s history is off, and a line that repeats it is still refused', async () => {
    const on = await asked(record())
    expect(on.user).toContain(SAID)
    const repeat = { candidates: [candidate(SAID)] }
    const off = await asked(record(undefined, { brainHistory: false }), 'line', repeat)
    expect(off.user).not.toContain(SAID)
    expect(off.user).toContain('SAID RECENTLY (useful / knew / not is how it landed)\nnothing yet')
    expect(off.result).toMatchObject({ wrote: false, reason: 'no model produced a line that passed' })
    expect(JSON.stringify(off.result.attempts)).toContain('nearly repeats the line said on 2026-10-03')
  })
})

describe('what the free chain reads under the faith rule', () => {
  it('reads no faith practice, no line of who the owner is becoming and no note holding a faith word while faith is hidden', async () => {
    const shown = await asked(record())
    for (const id of FAITH_HIDDEN) expect(shown.ids, id).toContain(id)
    expect(shown.user).toContain('A practice was kept on two days.')
    for (const kind of ['line', 'review'] as const) {
      const hidden = await asked(record({ id: 1, hideFaith: true, showPrivate: false, privateInSelection: false }), kind)
      expect(hidden.ids, kind).toEqual(ALL_ON.filter((id) => !FAITH_HIDDEN.includes(id)))
      expect(hidden.user, kind).not.toContain('prayed')
      expect(hidden.user, kind).not.toContain('A practice was kept on two days.')
    }
  })

  it('reads faith as hidden when no settings row can be read', async () => {
    const { ids } = await asked(record(null))
    expect(ids).toEqual(ALL_ON.filter((id) => !FAITH_HIDDEN.includes(id)))
  })
})

describe('what a lookup served an Ask run', () => {
  it('carries a fact head no fact on the sheet carries: the sheet of every family holds none of the eight', () => {
    const heads = new Set(FACTS.map((f) => f.id.split('.')[0]))
    for (const lookup of LOOKUPS) expect(heads.has(lookup), lookup).toBe(false)
    // The probe that can say yes: a fact named as a lookup's would be read under the category it names, or closed.
    expect(factCategories({ id: 'day.2026-10-04.1', tags: [], text: 'x', values: {} }, new Map())).toEqual(['closed'])
    expect(factCategories({ id: 'today.shortSleep', tags: [], text: 'x', values: {} }, new Map())).toEqual(['dayRecord'])
  })

  it('reaches no free-model prompt: the lookups ride with the Ask run’s own served sheet, never on the day’s', async () => {
    const lookup = { id: 'pattern.chip.dinner.weekday.6', tags: [], text: 'LOOKUP-MARKER: a late dinner, 8 of 8 on Saturdays.', values: { k: 8, n: 8, category: 'dayRecord', standing: 'pattern' } }
    for (const kind of ['line', 'review'] as const) {
      const { messages, ids } = await asked(record(), kind)
      expect(ids).toEqual(ALL_ON)
      const store = record()
      await store.writeBrainRow('served', askTaskIds(DAY)[0], DAY, { taskAt: at('07:00').toISOString(), at: at('07:01').toISOString(), factsUpdatedAt: SHEET.builtAt, sheet: SHEET, lookups: [lookup] }, at('07:01').toISOString())
      const again = await asked(store, kind)
      expect(again.ids).toEqual(ALL_ON)
      expect(JSON.stringify(again.messages)).not.toContain('LOOKUP-MARKER')
      expect(JSON.stringify(again.messages)).not.toContain('pattern.chip')
      // And the prompt is the one a store with no lookup gives, byte for byte.
      expect(again.messages).toEqual(messages)
    }
  })
})
