import { describe, expect, it } from 'vitest'
import libraryJson from '../../src/library.json'
import { dossierForTests } from '../../src/pathCompile.fixture'
import { generatedPathIdOf } from '../../src/pathCompile'
import { pathJobIdOf, pathTaskIdOf, readOf, type GeneratedPathRow, type PathJob } from '../../src/pathJob'
import { handlePathBriefing, handlePathContext, handlePathLine, hashOf, PATH_POSTS, runPaths, type PathsDeps } from './paths'
import { APP, BRAIN_APP, memoryStore } from './turso'

// The generator in the Worker (P5, 2026-11-06). Closed, it reads nothing. Open (in these tests): a request the rules
// route as a Path starts a drafting run on the quarter-hour, never between 9:00 and 11:30, with no personal text in the
// fire; the run reads its briefing, searches with generic words only, and posts a dossier the shared compiler checks,
// every reason back at once; new evidence waits for a second run's reading, bound to the words it read; each version
// is written as the brain's own row, its provenance stamped here. A dry run writes nothing where the phone reads.

const TZ = 'America/New_York'
const DAY = '2026-11-07'
const env = { TIMEZONE: TZ, FALLBACK_TIME: '11:00', LIBRARY_URL: 'https://example.test/src/library.json', CATALOGUE_URL: 'https://example.test/src/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
/** New York local times (UTC−5 in November). */
const at = (hhmm: string, day = DAY) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(hhmm.slice(0, 2)) + 5, Number(hhmm.slice(3))))
const OPEN = { gate: 'open' as const }
const GOAL = 'Grow vegetables in a small garden bed this summer'
const ABSTRACT = 'In a randomised trial of 120 adults, weekly practice sessions improved planting accuracy by 30 percent over twelve weeks compared with reading alone.'
type Mem = ReturnType<typeof memoryStore>

function record(extra: Record<string, unknown> = {}): Mem {
  const store = memoryStore()
  const body = { id: 5, at: `${DAY}T03:00:00.000Z`, goal: GOAL, why: 'my grandmother Rosa grew tomatoes', where: ['the back yard'], minutes: 120, route: 'fits', state: 'queued', ...extra }
  store.put({ app: APP, store: 'pathRequests', id: '5', day: DAY, body: JSON.stringify(body), updated_at: body.at, deleted: 0, synced_at: body.at })
  return store
}

/** The world the Worker reaches: GitHub main, Europe PMC and the routine's fire. */
function world(fires: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === env.CLAUDE_FIRE_URL) {
      fires.push(String(JSON.parse(String(init?.body ?? '{}')).text))
      return new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/s' }), { status: 200 })
    }
    if (url.endsWith('src/library.json')) return new Response(JSON.stringify(libraryJson), { status: 200 })
    if (url.endsWith('generator/PROCEDURE.md')) return new Response('# Drafting a Path\nThe procedure.', { status: 200 })
    if (url.endsWith('generator/DOSSIER.md')) return new Response('# The dossier\nThe guide.', { status: 200 })
    if (url.includes('europepmc') && url.includes('resultType=lite')) return new Response(JSON.stringify({ resultList: { result: [{ doi: '10.1000/garden', title: 'Practice and planting', authorString: 'A B', journalTitle: 'J', pubYear: '2020' }] } }), { status: 200 })
    if (url.includes('europepmc') && url.includes('resultType=core')) return new Response(JSON.stringify({ resultList: { result: [{ abstractText: `<p>${ABSTRACT}</p>` }] } }), { status: 200 })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

const deps = (store: Mem, now: Date, fetcher = world()): PathsDeps => ({ env, store, now, fetcher, ...OPEN })
const jobOf = async (store: Mem, dry = false) => store.readBrainRow<PathJob>(dry ? 'pathJobsDry' : 'pathJobs', pathJobIdOf(5))
const brief = (store: Mem, now: Date, task = 'path') => handlePathBriefing(deps(store, now), new URL(`https://w.test/claude/briefing?task=${task}&day=${DAY}`))

/** A drafting run started for request 5 at 22:00. */
async function started(store: Mem, fires: string[] = []) {
  const r = await runPaths(env, store, at('22:00'), { ...OPEN, fireFetcher: world(fires) })
  expect(r).toMatchObject({ ran: true, reason: 'Claude is drafting a Path', request: 5 })
  return r
}

describe('the generator’s job', () => {
  it('is closed by default in the tests’ absence, reads nothing while gated, and never fires between 9:00 and 11:30', async () => {
    const store = record()
    expect(await runPaths(env, store, at('22:00'), { gate: 'gated' })).toEqual({ ran: false, reason: 'gated' })
    expect(await runPaths(env, store, at('10:15'), { ...OPEN, fireFetcher: world() })).toMatchObject({ ran: false, reason: 'quiet hours: 9:00 to 11:30 keep the window for the day’s line' })
    expect(await store.readTask(pathTaskIdOf(DAY, 'path'))).toBeNull()
  })

  it('starts a drafting run for a queued request with no personal text in the fire, once a day', async () => {
    const store = record()
    const fires: string[] = []
    await started(store, fires)
    expect(fires).toEqual([`Life Mirror bridge: task=path day=${DAY} model=opus. Read CLAUDE.md in this repository and do exactly what it says, then stop.`])
    expect(fires.join(' ')).not.toContain('garden')
    expect(await jobOf(store)).toMatchObject({ requestId: 5, state: 'drafting' })
    expect(await runPaths(env, store, at('22:15'), { ...OPEN, fireFetcher: world() })).toMatchObject({ ran: false, reason: 'waiting for Claude' })
  })

  it('never drafts a request the rules route elsewhere, whatever the phone stored', async () => {
    const store = record({ goal: 'Make more friends' })
    const fires: string[] = []
    expect(await runPaths(env, store, at('22:00'), { ...OPEN, fireFetcher: world(fires) })).toMatchObject({ ran: false, reason: 'the rules route it elsewhere' })
    expect(fires).toEqual([])
    expect((await jobOf(store))?.state).toBe('refused')
  })

  it('lets a run go past its time, the job failed and said so', async () => {
    const store = record()
    await started(store)
    const r = await runPaths(env, store, new Date(at('22:00').getTime() + 181 * 60_000), { ...OPEN, fireFetcher: world() })
    expect(r.reason).toBe('no answer within 180 minutes')
    expect(await jobOf(store)).toMatchObject({ state: 'failed', reasons: ['no answer within 180 minutes'] })
  })
})

describe('the drafting run', () => {
  it('is briefed with the procedure, the guide, the request in its own words, the library and the methods', async () => {
    const store = record()
    await started(store)
    const r = await brief(store, at('22:05'))
    expect(r.status).toBe(200)
    const b = r.body as Record<string, unknown>
    expect(b).toMatchObject({ task: 'path', procedure: '# Drafting a Path\nThe procedure.', guide: '# The dossier\nThe guide.', request: { goal: GOAL, minutesPerWeek: 120 } })
    expect((b.library as unknown[]).length).toBeGreaterThan(100)
    expect((await store.readTask(pathTaskIdOf(DAY, 'path')))?.procedureHash).toBe(await hashOf('# Drafting a Path\nThe procedure.'))
  })

  it('searches with generic words only: never a word from your why or your where, never a name', async () => {
    const store = record()
    await started(store)
    const search = (q: string) => handlePathContext(deps(store, at('22:06')), new URL(`https://w.test/claude/context?task=path&day=${DAY}&category=search&q=${encodeURIComponent(q)}`))
    expect((await search('vegetable garden practice skill')).status).toBe(200)
    expect(await search('grandmother tomatoes gardening')).toMatchObject({ status: 422, body: { error: 'the query carries a word from your own answers: “grandmother”' } })
    expect(await search('Rosa garden')).toMatchObject({ status: 422 })
  })

  it('compiles the dossier with the shared compiler, stamps its provenance, and writes the version and the job', async () => {
    const store = record()
    await started(store)
    await brief(store, at('22:05'))
    const d = { ...dossierForTests(), goal: GOAL }
    const r = await handlePathLine(deps(store, at('22:40')), { task: 'path', day: DAY, answer: JSON.stringify({ dossier: d, cards: [] }), writtenModel: 'claude-opus-5-5' })
    expect(r).toMatchObject({ status: 200, body: { ok: true, version: '1' } })
    const pathId = generatedPathIdOf(GOAL, d.name)
    const row = await store.readBrainRow<GeneratedPathRow>('generated', `${pathId}:1`)
    expect(row?.path.generated?.provenance).toEqual({ run: pathTaskIdOf(DAY, 'path'), model: 'claude-opus-5-5', promptHash: await hashOf('# Drafting a Path\nThe procedure.'), retrievedOn: DAY })
    expect(await jobOf(store)).toMatchObject({ state: 'ready', pathId, version: '1' })
  })

  it('refuses a dossier with every reason at once, lets the run try again, and ends the job after its last attempt', async () => {
    const store = record()
    await started(store)
    const broken = { ...dossierForTests(), goal: GOAL, measurement: { ...dossierForTests().measurement, cap: 20 }, decisions: [] }
    const post = () => handlePathLine(deps(store, at('22:40')), { task: 'path', day: DAY, answer: { dossier: broken, cards: [] } })
    const first = await post()
    expect(first.status).toBe(422)
    expect((first.body as { reasons: string[] }).reasons).toEqual(expect.arrayContaining(['an attempt cap of four to twelve, not 20', 'a decision on structure: why it is as it is']))
    expect((first.body as { retry: boolean }).retry).toBe(true)
    for (let k = 1; k < PATH_POSTS; k++) await post()
    expect(await jobOf(store)).toMatchObject({ state: 'refused' })
    // A dossier for another goal is never drafted for this request.
    const store2 = record()
    await started(store2)
    expect((await handlePathLine(deps(store2, at('22:40')), { task: 'path', day: DAY, answer: { dossier: { ...dossierForTests(), goal: 'Keep a tidy shed' }, cards: [] } })).body).toMatchObject({ reasons: ['the dossier’s goal is not the request’s, word for word'] })
  })
})

describe('new evidence and its reading', () => {
  /** A card drafted from the abstract this Worker fetched, its spans found by the locate read. */
  async function drafted(store: Mem) {
    const ctx = (q: string) => handlePathContext(deps(store, at('22:10')), new URL(`https://w.test/claude/context?task=path&day=${DAY}&${q}`))
    expect((await ctx('category=abstract&source=10.1000/garden')).status).toBe(200)
    const claim = (await ctx(`category=locate&source=10.1000/garden&passage=${encodeURIComponent('weekly practice sessions improved planting accuracy')}`)).body as { at: number; length: number; hash: string }
    const effect = (await ctx(`category=locate&source=10.1000/garden&passage=${encodeURIComponent('by 30 percent over twelve weeks')}`)).body as { at: number; length: number; hash: string }
    return { id: 'garden-practice', claim: 'Weekly practice sessions improved planting accuracy.', domain: 'skill', tags: [], grade: 'C', replication: 'untested', effect: '30 percent over twelve weeks.', population: 'Adults in one trial.', caveats: 'One trial.', origin: 'direct', sources: [{ cite: 'A B (2020)', doi: '10.1000/garden' }], spans: [{ field: 'claim', source: '10.1000/garden', via: 'europepmc', ...claim }, { field: 'effect', source: '10.1000/garden', via: 'europepmc', ...effect }] }
  }

  it('checks each new card’s spans at their place in an abstract this Worker fetched, then waits for a reading', async () => {
    const store = record()
    await started(store)
    const card = await drafted(store)
    const d = { ...dossierForTests(), goal: GOAL, cards: ['skill-decay', 'garden-practice'] }
    // A span off its place, and a number standing in no passage, are refused.
    const bad = await handlePathLine(deps(store, at('22:40')), { task: 'path', day: DAY, answer: { dossier: d, cards: [{ ...card, effect: '45 percent.', spans: [{ ...card.spans[0], at: card.spans[0].at + 1 }, card.spans[1]] }] } })
    expect((bad.body as { reasons: string[] }).reasons).toEqual(expect.arrayContaining(['card garden-practice: a span on 10.1000/garden that is not at its place in the abstract', 'card garden-practice: the number 45 in its effect stands in no passage it spans']))
    const ok = await handlePathLine(deps(store, at('22:41')), { task: 'path', day: DAY, answer: { dossier: d, cards: [card] } })
    const pathId = generatedPathIdOf(GOAL, d.name)
    expect(ok.body).toMatchObject({ ok: true, reading: [`${pathId}-garden-practice`] })
    expect(await jobOf(store)).toMatchObject({ state: 'reading' })
    // The reading run starts on a later tick, the same day.
    expect(await runPaths(env, store, at('23:00'), { ...OPEN, fireFetcher: world() })).toMatchObject({ ran: true, reason: 'Claude is reading the new evidence' })
  })

  it('admits a card only on a supports bound to the words served, and leaves out the rest with why', async () => {
    const store = record()
    await started(store)
    const card = await drafted(store)
    const d = { ...dossierForTests(), goal: GOAL, cards: ['skill-decay', 'garden-practice'], decisions: dossierForTests().decisions.map((x) => (x.element === 'structure' ? { ...x, cards: ['skill-decay', 'garden-practice'] } : x)) }
    await handlePathLine(deps(store, at('22:41')), { task: 'path', day: DAY, answer: { dossier: d, cards: [card] } })
    await runPaths(env, store, at('23:00'), { ...OPEN, fireFetcher: world() })
    const reading = await brief(store, at('23:05'), 'pathRead')
    const served = (reading.body as { cards: { id: string; read: string; passages: { text: string }[] }[] }).cards
    expect(served[0].passages.map((p) => p.text)).toEqual(['weekly practice sessions improved planting accuracy', 'by 30 percent over twelve weeks'])
    // A verdict for other words than those served is refused.
    const wrong = await handlePathLine(deps(store, at('23:20')), { task: 'pathRead', day: DAY, answer: { verdicts: [{ id: served[0].id, read: 'other', verdict: 'supports', why: 'x' }] } })
    expect((wrong.body as { reasons: string[] }).reasons).toEqual([`card ${served[0].id}: the verdict is for other words than those served`])
    const r = await handlePathLine(deps(store, at('23:21')), { task: 'pathRead', day: DAY, answer: { verdicts: [{ id: served[0].id, read: served[0].read, verdict: 'supports', why: 'The trial says it.' }] }, writtenModel: 'claude-sonnet-5-5' })
    expect(r.body).toMatchObject({ ok: true, version: '1', admitted: [served[0].id], dropped: [] })
    const row = await store.readBrainRow<GeneratedPathRow>('generated', `${generatedPathIdOf(GOAL, d.name)}:1`)
    expect(row?.cards.map((c) => [c.id, c.status, c.tags, c.support?.verdict])).toEqual([[served[0].id, 'admitted', [generatedPathIdOf(GOAL, d.name)], 'supports']])
    expect(readOf(row?.cards[0] as never)).toBe(served[0].read)
  })
})

describe('a dry run', () => {
  it('goes the whole way on a stand-in goal and writes nothing where the phone reads', async () => {
    const store = memoryStore()
    const fires: string[] = []
    const r = await runPaths(env, store, at('22:00'), { ...OPEN, dry: { goal: GOAL, minutes: 120 }, fireFetcher: world(fires) })
    expect(r).toMatchObject({ ran: true })
    await brief(store, at('22:05'))
    const done = await handlePathLine(deps(store, at('22:40')), { task: 'path', day: DAY, answer: { dossier: { ...dossierForTests(), goal: GOAL }, cards: [] } })
    expect(done.body).toMatchObject({ ok: true, dry: true })
    const phoneReads = [...store.rows.values()].filter((x) => x.app === BRAIN_APP && (x.store === 'generated' || x.store === 'pathJobs'))
    expect(phoneReads).toEqual([])
    expect([...store.rows.values()].filter((x) => x.store === 'generatedDry')).toHaveLength(1)
  })
})
