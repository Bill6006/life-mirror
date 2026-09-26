import { describe, expect, it } from 'vitest'
import type { CoachBlock, FactSheet } from '../../src/factTypes'
import { FIRMNESS_PREFS, type FirmnessPref } from '../../src/firmness'
import type { ClaimCard } from '../../src/libraryTypes'
import { runBrief, runReview } from './brief'
import { handleBriefing, handleLine, taskIdOf } from './claude'
import { runCoach } from './coach'
import { claudeInstructions, firmBlock, lineSystem, rankedLines, reviewSystem } from './prompt'
import { APP, BRAIN_APP, memoryStore } from './turso'

// How firm in the Worker, once its gate is open (Pass 2; opened here by the tests alone, the
// deployed Worker reads the shared constant, which ships closed). Every writer is told the
// person's setting and what it may and may not change, with the prompt otherwise exactly as it
// was; every answer names the delivery it used and is held to it; the rows keep it.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, BRIEF_HOUR: '5', FALLBACK_TIME: '11:00', MODELS: 'model-a', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20', COACH_WRITER: 'on', COACH_LAUNCH: '2026-10-04' }
const CARDS: ClaimCard[] = [{ id: 'plan-a-cue', claim: 'A plan tied to a cue is kept more often.', domain: 'behaviour-change', tags: ['cue', 'plan', 'study'], grade: 'A', replication: 'replicated', effect: 'small', population: 'adults', sources: [{ cite: 'Invented (2025).', doi: '10.0000/x' }], caveats: 'None known.', app: 'One tap says when.', reviewed: '2026-09-24', status: 'admitted' }]
const MOVES = { moves: [{ id: 'greet-by-name', name: 'Greet someone by name', family: 'social', tags: { ingredients: ['connection'] } }, { id: 'ask-one-question', name: 'Ask one question', family: 'social', tags: { ingredients: ['curiosity'] } }] }
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? MOVES : CARDS), { headers: { 'content-type': 'application/json' } })) as typeof fetch
const at = (hhmm: string, day: string) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const DAY = '2026-10-04'
type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown, when = `${DAY}T11:41:00.000Z`) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })

function sheetFor(day: string): FactSheet {
  return {
    version: 1,
    day,
    builtAt: `${day}T11:41:00.000Z`,
    hour: 7,
    weeks: 5,
    days: 36,
    direction: null,
    said: [],
    checkedIn: { morning: `${day}T11:40:00.000Z` },
    shortlist: [{ situationId: 'commitment-fading', mode: 'challenge', text: 'Orrish: 3 sittings in the two weeks before, none in the last two. This is where a commitment is usually let go. Pin the smallest sitting to a moment today.', factIds: ['trajectory.1', 'aim.1'], cardIds: ['plan-a-cue'], score: 0.85, firmness: 'hardCoach' }],
    facts: [
      { id: 'week.today', tags: ['cue'], text: 'Today is Sunday; at home; her bedtime 20:00.', values: { weekday: 'Sunday', daycare: 0, pickup: null, office: 0, church: 0, studyNight: 0, bedtime: '20:00', hour: 7 } },
      { id: 'aim.1', tags: ['study', 'cue'], text: 'Orrish (learning): the current skill is “Twenty words”; no session in the last two weeks.', values: { kind: 'certification', name: 'Orrish', skill: 'Twenty words' } },
      { id: 'trajectory.1', tags: ['study'], text: 'Orrish: 3 sittings three weeks ago, none since.', values: { aimId: 1, name: 'Orrish', w3: 3, w2: 0, w1: 0, w0: 0, d0: 0, ageDays: 30 } },
      { id: 'assoc.napped', tags: ['sleep'], text: 'Mornings after a nap read 6 lower, 5 naps.', values: { times: 5, diff: -6 }, tier: 'promising' },
    ],
  }
}

const COACH = (path: 'social' | 'partner'): CoachBlock & Record<string, unknown> => ({
  eligible: [{ path, ids: ['greet-by-name', 'ask-one-question'] }],
  ineligibleReason: null,
  day: DAY,
  block: 'morning',
  shape: 'People around by today’s shape: at home',
  stages: [{ path, stage: 2, name: 'One step past hello', reentry: false }],
  dateDay: false,
  perRep: [{ path, id: 'greet-by-name', drawn: 3, done: 2, partly: 0, no: 1, last: ['no'], settings: [] }],
  row: { path, candidates: ['greet-by-name', 'ask-one-question'] },
})

function record(firmness?: FirmnessPref, path: 'social' | 'partner' = 'social'): Store {
  const store = memoryStore()
  const sheet = sheetFor(DAY)
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet, coach: COACH(path) }, sheet.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  if (firmness) put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: {}, firmness })
  return store
}
const routine = () => (async () => new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_z' }), { status: 200 })) as typeof fetch
const open = (store: Store, now: Date) => ({ env, store, now, fetcher, howFirm: 'open' as const })
const url = (q: Record<string, string>) => new URL(`https://w.test/claude/briefing?${new URLSearchParams(q)}`)
const briefRow = (store: Store, id: string) => JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|${id}`)?.body ?? 'null')
const answer = (store: Store, task: 'line' | 'review' | 'coach', a: unknown, now: Date) => handleLine(open(store, now), { task, day: DAY, answer: a, askedModel: 'opus', writtenModel: 'claude-opus-5-5', runnerModel: 'claude-haiku-4-5-20251001', subagentError: null })
const FADE = { mode: 'challenge', text: 'Orrish: 3 sittings three weeks ago, none since. Pin the smallest sitting to a moment today.', factIds: ['trajectory.1', 'aim.1'], cardIds: ['plan-a-cue'], action: { kind: 'plan', aimId: 1, cue: 'afterBedtime' }, lacked: [] }
const stripFirm = (s: string) => s.replace(/\n\nHOW FIRM: [\s\S]*?(?=\n\nAnswer with JSON only)/, '').replace('"firmness": "...", ', '').replace(', "firmness": "..."', '')

describe('what each writer is told once How firm’s gate is open', () => {
  it('adds the setting and its rules before the answer and a firmness field to it, and nothing else', () => {
    for (const pref of FIRMNESS_PREFS) {
      expect(stripFirm(lineSystem(pref)), pref).toBe(lineSystem(null))
      expect(stripFirm(reviewSystem(pref)), pref).toBe(reviewSystem(null))
      for (const task of ['line', 'review', 'coach'] as const) {
        expect(stripFirm(claudeInstructions(task, pref)), `${task} ${pref}`).toBe(claudeInstructions(task))
        expect(claudeInstructions(task, pref)).toContain('HOW FIRM: the person')
      }
      expect(lineSystem(pref)).toContain('"text": "...", "firmness": "...", ')
      expect(reviewSystem(pref)).toContain('"change": "...", "firmness": "...", ')
      expect(claudeInstructions('coach', pref)).toContain('"version": "...", "firmness": "..."}')
    }
  })

  it('says what firmness may and may not change, the one natural voice, and the three approved deliveries', () => {
    const b = firmBlock('balanced', 'line')
    for (const s of ['never what is said', 'an association kept an association', 'the advice and its one tap', 'One natural, human voice', 'Natural is not soft', 'lead with what is working', 'even-handed', 'direct and unsparing', 'never about the person', 'never a harder recommendation', 'more certain than the evidence allows']) expect(b).toContain(s)
    expect(firmBlock('hardCoach', 'line')).toContain('Say the line Hard Coach.')
    expect(firmBlock('supportive', 'review')).toContain('Say all three parts Supportive.')
    expect(firmBlock('adaptive', 'candidates')).toContain('Never Hard Coach on anything tentative')
    expect(firmBlock('adaptive', 'candidates')).toContain('Never comfort by default and never push by default.')
    expect(firmBlock('adaptive', 'coach')).toContain('HOW FIRM, BY REP')
    expect(firmBlock('adaptive', 'coach')).not.toContain('Adaptive: choose')
  })

  it('shows the phone’s delivery beside each ranked line, and nothing when the phone gave none', () => {
    const ranked = sheetFor(DAY).shortlist ?? []
    expect(rankedLines(ranked)).toContain('1. commitment-fading (challenge, hardCoach):')
    expect(rankedLines(ranked.map(({ firmness: _f, ...r }) => r))).toContain('1. commitment-fading (challenge):')
  })
})

describe('Claude’s line and Sunday review, once How firm’s gate is open', () => {
  it('serves the setting with the briefing and asks for the delivery used; Adaptive until one is chosen', async () => {
    const store = record()
    await runBrief(env, store, async () => ({ response: '' }), at('07:45', DAY), { fetcher, fireFetcher: routine() })
    const r = (await handleBriefing(open(store, at('07:46', DAY)), url({ task: 'line', day: DAY }))).body as { instructions: string; answer: Record<string, unknown> }
    expect(r.instructions).toContain('HOW FIRM: the person’s setting is Adaptive.'.replace('’', "'"))
    expect(r.answer).toHaveProperty('firmness')
  })

  it('stores a line that passes with the delivery it used, and refuses one without it, softened, or turned on the person', async () => {
    const store = record()
    await runBrief(env, store, async () => ({ response: '' }), at('07:45', DAY), { fetcher, fireFetcher: routine() })
    expect(await answer(store, 'line', { ...FADE }, at('07:50', DAY))).toMatchObject({ status: 422, body: { reason: 'firmness must be supportive, balanced or hardCoach', retry: true } })
    expect(await answer(store, 'line', { ...FADE, firmness: 'supportive' }, at('07:51', DAY))).toMatchObject({ status: 422, body: { reason: expect.stringContaining('never softens'), retry: false } })
    const again = record()
    await runBrief(env, again, async () => ({ response: '' }), at('07:45', DAY), { fetcher, fireFetcher: routine() })
    expect(await answer(again, 'line', { ...FADE, text: `No excuses. ${FADE.text}`, firmness: 'hardCoach' }, at('07:50', DAY))).toMatchObject({ status: 422, body: { reason: expect.stringContaining('never the person') } })
    expect(await answer(again, 'line', { ...FADE, firmness: 'hardCoach' }, at('07:51', DAY))).toMatchObject({ status: 200 })
    expect(briefRow(again, `${DAY}:brief`)).toMatchObject({ text: FADE.text, firmness: 'hardCoach', adaptive: true, writer: 'claude' })
  })

  it('holds a chosen setting to itself, and keeps it on the row without the Adaptive mark', async () => {
    const store = record('balanced')
    await runBrief(env, store, async () => ({ response: '' }), at('07:45', DAY), { fetcher, fireFetcher: routine() })
    expect(await answer(store, 'line', { ...FADE, firmness: 'hardCoach' }, at('07:50', DAY))).toMatchObject({ status: 422, body: { reason: expect.stringContaining('How firm is set to Balanced') } })
    expect(await answer(store, 'line', { ...FADE, firmness: 'balanced' }, at('07:51', DAY))).toMatchObject({ status: 200 })
    const row = briefRow(store, `${DAY}:brief`)
    expect(row).toMatchObject({ firmness: 'balanced' })
    expect(row).not.toHaveProperty('adaptive')
  })

  it('checks the week’s review the same way and keeps its one delivery', async () => {
    const store = record('supportive')
    await runReview(env, store, async () => ({ response: '' }), at('05:00', DAY), { fetcher, fireFetcher: routine() })
    const r = (await handleBriefing(open(store, at('05:01', DAY)), url({ task: 'review', day: DAY }))).body as { instructions: string; answer: Record<string, unknown> }
    expect(r.instructions).toContain('Say all three parts Supportive.')
    const review = { held: 'Orrish had 3 sittings three weeks ago.', didNot: 'None in the last two weeks.', change: 'Pin the smallest sitting to a moment each evening.', factIds: ['trajectory.1'], cardIds: [], lacked: [] }
    // Supportive may be gentle about a real pattern, never silent: this one says its count.
    expect(await answer(store, 'review', { ...review, firmness: 'supportive' }, at('05:05', DAY))).toMatchObject({ status: 200 })
    expect(briefRow(store, `${DAY}:review`)).toMatchObject({ firmness: 'supportive' })
  })
})

describe('the free model chain, once How firm’s gate is open', () => {
  const noClaude = { ...env, CLAUDE_WRITER: 'off' }
  const runner = (candidates: unknown[]) => async () => ({ response: JSON.stringify({ candidates }) })

  it('keeps only candidates said at a delivery the setting allows, and stores the one it wrote with it', async () => {
    const store = record()
    const r = await runBrief(noClaude, store, runner([{ ...FADE, firmness: 'supportive' }, { ...FADE, firmness: 'hardCoach' }]), at('07:45', DAY), { fetcher, howFirm: 'open' })
    expect(r).toMatchObject({ wrote: true, writer: 'free', candidates: 1 })
    expect(r.attempts?.join(' ')).toContain('never softens')
    expect(briefRow(store, `${DAY}:brief`)).toMatchObject({ firmness: 'hardCoach', adaptive: true, writer: 'free' })
  })

  it('writes nothing it cannot check: a chain whose every candidate breaks the setting stores no line', async () => {
    const store = record('supportive')
    const r = await runBrief(noClaude, store, runner([{ ...FADE, firmness: 'hardCoach' }]), at('07:45', DAY), { fetcher, howFirm: 'open' })
    expect(r).toMatchObject({ wrote: false })
    expect(briefRow(store, `${DAY}:brief`)).toBeNull()
  })
})

describe('the coach’s People row wording, once How firm’s gate is open', () => {
  async function coached(store: Store): Promise<{ briefing: string; answer: { picks: Record<string, unknown>[] } }> {
    await store.writeSpot({ id: `spot:${DAY}`, kind: 'spotcheck', day: DAY, at: `${DAY}T11:00:00.000Z`, runs: 3, clean: true })
    await store.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at('07:48', DAY).toISOString(), writer: 'claude', forDay: DAY }, at('07:48', DAY).toISOString())
    await runCoach(env, store, at('07:50', DAY), { fireFetcher: routine() })
    expect((await store.readTask(taskIdOf('coach', DAY)))?.status).toBe('fired')
    return (await handleBriefing(open(store, at('07:51', DAY)), url({ task: 'coach', day: DAY }))).body as { briefing: string; answer: { picks: Record<string, unknown>[] } }
  }
  const pick = (id: string, firmness?: string) => ({ picks: [{ id, version: 'Say the name of one person you greet today, and ask how their day is going.', ...(firmness ? { firmness } : {}) }] })

  it('sets each rep’s firmness itself: warmer after a No under Adaptive, the chosen setting otherwise', async () => {
    const adaptive = await coached(record())
    expect(adaptive.briefing).toContain('HOW FIRM, BY REP')
    expect(adaptive.briefing).toContain('- [greet-by-name] Supportive')
    expect(adaptive.briefing).toContain('- [ask-one-question] Balanced')
    expect(adaptive.answer.picks[0]).toHaveProperty('firmness')
    const hard = await coached(record('hardCoach'))
    expect(hard.briefing).toContain('- [greet-by-name] Hard Coach')
  })

  it('never says a Partner path rep firmer than Balanced', async () => {
    const partner = await coached(record('hardCoach', 'partner'))
    expect(partner.briefing).toContain('- [greet-by-name] Balanced')
    expect(partner.briefing).not.toContain('Hard Coach\n')
  })

  it('stores a version said at its rep’s firmness, and refuses one said at another', async () => {
    const store = record()
    await coached(store)
    expect(await answer(store, 'coach', pick('greet-by-name', 'balanced'), at('07:55', DAY))).toMatchObject({ status: 422, body: { reason: expect.stringContaining('say this version at supportive') } })
    expect(await answer(store, 'coach', pick('greet-by-name', 'supportive'), at('07:56', DAY))).toMatchObject({ status: 200 })
    expect(await store.readCoach(`${DAY}:coach`)).toMatchObject({ ids: ['greet-by-name'], firmness: { 'greet-by-name': 'supportive' } })
  })
})
