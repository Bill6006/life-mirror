import 'fake-indexeddb/auto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { posix } from 'node:path'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, updateSettings, type Offer } from './db'
import { ensureOffer, ensurePickupOffer, redrawForDay, skipOffer } from './offerFlow'
import { NOTHING } from './offers'
import { blockReadings } from './readings'
import { resetRepairBreaker } from './repair/breaker'
import { engineFailed } from './repair/gate'

// The old engine retired, with no fallback (the owner's requirement of 2026-10-20). Two guards. Statically: no module that
// production runs (the app, its service worker, the Brain's Worker, and everything they import) imports one of the old
// engine's modules, the stress test or a test, names one of its functions, or holds its words. And in use: every
// production draw (a check-in's move, the replacement after a skip, the pickup-time move and its replacement, the draw
// again when the day changes) is the new engine's, with its key that once closed it set. A failing engine offers no move
// at all: repair/breakerFlow.test.ts holds that, and e2e/repair.spec.ts holds it, with the draws, in the built app.

/** Where production starts: the app's page script, its service worker, and the Brain's Worker. */
const ENTRIES = ['src/main.tsx', 'src/sw.ts', 'worker/src/index.ts']

/** The old engine's modules, gone since 2026-10-20 (the last commit with them is c8461d0), as paths without an extension. */
const RETIRED_MODULES = ['src/bandit', 'src/adaptive', 'src/tiers', 'src/learning', 'src/learningFlow', 'src/claims', 'src/hypothesis', 'src/repair/testGate', 'stress/engineA', 'stress/probeA']

/** The old engine's own names, as literals: its draw and its odds, its beliefs, its tiers and claims, its hypotheses, its switch. */
const RETIRED_NAMES = [
  // The draw (bandit.ts, offers.ts, offerFlow.ts) and its odds (adaptive.ts).
  'beliefFor', 'COIN_FLIP_RATE', 'EFFORT_PENALTY', 'chooseFor', 'alternativeFor', 'whyNotThat', 'SIGN_FLIP_BONUS', 'withWindowPenalty', 'onPurpose', 'scheduledMoves', 'withLearning', 'PROPENSITY_DRAWS', 'armEstimate', 'ArmEstimate', 'adaptiveDiff', 'AdaptiveInterval',
  // The beliefs (learning.ts, learningFlow.ts).
  'RECORD_HALF_LIFE_DAYS', 'OBSERVATION_SD', 'TAG_SHRINK_K', 'SIGN_FLIP_MIN_N', 'SIGN_FLIP_MIN_MEAN', 'LEND_MIN_N', 'TagBelief', 'moveBelief', 'MoveBelief', 'nothingBelief', 'signFlips', 'SignFlip', 'energyCost', 'runLearning', 'beliefsFor', 'learningRecords', 'knowsCounts',
  // The tiers and claims (tiers.ts, claims.ts).
  'MIN_PER_ARM', 'REPLICATION_MIN', 'holmLevels', 'evaluateCard', 'evaluateCards', 'hasItsEight', 'declarationsDue', 'CardStats', 'tierOfCard', 'CardEvidence', 'claimsDue', 'CardLevel',
  // The hypotheses (hypothesis.ts) and the line's test tap.
  'parseHypothesis', 'cardFromHypothesis', 'importHypothesis', 'hypothesisOf', 'hypothesisFor', 'testSetWords',
  // Its version, and the switch that chose it.
  'ENGINE_VERSION', 'repairMode', 'RepairMode', 'repairOn', 'useRepairOn', 'LEARNING_REPAIR', 'closeRepair',
]

/** Words only the old engine used: its closed mode's test key, and its version name, which past offers carry as data alone. */
const RETIRED_WORDS = ['life-mirror.preview.learningRepair', 'engine-2026-10-16']

/** The old engine's belief tables, kept with their last rows as past records: production reads and writes neither. */
const BELIEF_TABLES = /\bdb\.(?:beliefs|tagBeliefs)\b/

const COMPUTED = '<computed>'

interface Import {
  spec: string
  /** Where it leads, from the repository's root without a script extension: null for a package. */
  base: string | null
  /** The file it reaches, or null when none exists. */
  file: string | null
}

interface Module {
  file: string
  text: string
  imports: Import[]
  names: Set<string>
  words: string[]
}

function baseOf(from: string, spec: string): string | null {
  if (spec === COMPUTED) return COMPUTED
  const clean = spec.replace(/[?#].*$/, '')
  if (!clean.startsWith('.')) return null
  return posix.normalize(posix.join(posix.dirname(from), clean)).replace(/\.(?:tsx?|jsx?|mjs)$/, '')
}

function fileOf(base: string | null): string | null {
  if (base === null || base === COMPUTED) return null
  for (const f of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (existsSync(f) && statSync(f).isFile()) return f
  return null
}

/** One module as the TypeScript parser reads it: its imports (static, re-exported, dynamic, type), every name and every word. Comments never count. */
function readModule(file: string, text: string): Module {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const specs: string[] = []
  const names = new Set<string>()
  const words: string[] = []
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) specs.push(n.moduleSpecifier.text)
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0]
      specs.push(arg && ts.isStringLiteralLike(arg) ? arg.text : COMPUTED)
    }
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) specs.push(n.argument.literal.text)
    if (ts.isIdentifier(n)) names.add(n.text)
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) words.push(n.text)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { file, text, imports: specs.map((spec) => ({ spec, base: baseOf(file, spec), file: fileOf(baseOf(file, spec)) })), names, words }
}

/** Every module production runs, from its entry points through every import into the repository. */
function productionGraph(): Map<string, Module> {
  const seen = new Map<string, Module>()
  const queue = [...ENTRIES]
  while (queue.length) {
    const file = queue.shift() as string
    if (seen.has(file)) continue
    const text = readFileSync(file, 'utf8')
    const m = /\.tsx?$/.test(file) ? readModule(file, text) : { file, text: '', imports: [], names: new Set<string>(), words: [] }
    seen.set(file, m)
    for (const i of m.imports) if (i.file) queue.push(i.file)
  }
  return seen
}

/** What, in a set of modules, reaches the old engine: an import of it, the stress test or a test; one of its names or words; its belief tables. */
function reachesOldEngine(mods: Iterable<Module>): string[] {
  const out: string[] = []
  for (const m of mods) {
    for (const i of m.imports) {
      if (i.base === COMPUTED) out.push(`${m.file}: an import whose path is computed`)
      else if (i.base !== null && (RETIRED_MODULES.includes(i.base) || RETIRED_MODULES.includes(i.base.replace(/\/index$/, '')))) out.push(`${m.file}: imports ${i.spec}`)
      else if (i.base !== null && /^(?:stress|qa|e2e|scripts)\//.test(i.base)) out.push(`${m.file}: imports ${i.spec}, outside production`)
      else if (i.base !== null && /\.(?:test|spec)$/.test(i.base)) out.push(`${m.file}: imports a test, ${i.spec}`)
    }
    for (const n of RETIRED_NAMES) if (m.names.has(n)) out.push(`${m.file}: names ${n}`)
    for (const w of RETIRED_WORDS) if (m.words.some((x) => x.includes(w))) out.push(`${m.file}: says ${w}`)
    if (BELIEF_TABLES.test(m.text)) out.push(`${m.file}: reads or writes the old engine's belief tables`)
  }
  return out
}

describe('no production path can call, import or route through the old engine', () => {
  const graph = productionGraph()

  it('reads the whole production graph from its three entry points, every import into the repository reaching a file', () => {
    expect(graph.size).toBeGreaterThan(150)
    for (const f of ['src/main.tsx', 'src/sw.ts', 'worker/src/index.ts', 'src/offerFlow.ts', 'src/offers.ts', 'src/repair/engine.ts', 'src/repair/flow.ts', 'src/repair/record.ts', 'src/repair/breaker.ts', 'src/evidenceFlow.ts', 'src/observe.ts', 'src/brainFlow.ts', 'src/now.tsx', 'src/evidenceScreen.tsx', 'worker/src/prompt.ts', 'worker/src/engineReport.ts']) expect(graph.has(f), f).toBe(true)
    expect([...graph.values()].flatMap((m) => m.imports.filter((i) => i.base !== null && i.file === null).map((i) => `${m.file}: ${i.spec}`))).toEqual([])
    // The scan sees names and words: the draws' own, and the new engine's version.
    expect(graph.get('src/offerFlow.ts')?.names.has('repairDraw')).toBe(true)
    expect(graph.get('src/offerFlow.ts')?.names.has('repairAside')).toBe(true)
    expect(graph.get('src/repair/record.ts')?.words).toContain('repair-1')
  })

  it('would find an import of the old engine, one of its names or words, or its tables, wherever one is written', () => {
    // A probe that could say yes: the same check, over modules written to reach the old engine, and one that only mentions it.
    const probe = [
      readModule('src/offers.ts', "import { choose } from './bandit'\nexport const x = 1"),
      readModule('src/now.tsx', 'export const y = (s: never) => chooseFor(s)'),
      readModule('worker/src/x.ts', "export const k = 'life-mirror.preview.learningRepair'"),
      readModule('src/a.ts', "export const t = () => import('../stress/engineA')"),
      readModule('src/b.ts', "export * from './repair/testGate'"),
      readModule('src/c.ts', 'export const rows = () => db.beliefs.toArray()'),
      readModule('src/d.ts', "export const e = () => import('./offers.test')"),
      readModule('src/e.ts', '// chooseFor, in a comment, reaches nothing\nexport const fine = 1'),
    ]
    expect(reachesOldEngine(probe)).toEqual([
      'src/offers.ts: imports ./bandit',
      'src/now.tsx: names chooseFor',
      'worker/src/x.ts: says life-mirror.preview.learningRepair',
      'src/a.ts: imports ../stress/engineA',
      'src/b.ts: imports ./repair/testGate',
      "src/c.ts: reads or writes the old engine's belief tables",
      'src/d.ts: imports a test, ./offers.test',
    ])
  })

  it('has none of the old engine’s modules, and nothing production runs imports one, the stress test or a test', () => {
    for (const m of RETIRED_MODULES) for (const f of [`${m}.ts`, `${m}.tsx`, `${m}/index.ts`]) expect(existsSync(f), f).toBe(false)
    expect(reachesOldEngine(graph.values()).filter((x) => x.includes(' imports '))).toEqual([])
  })

  it('names none of its functions, holds none of its words, and touches none of its belief tables', () => {
    expect(reachesOldEngine(graph.values())).toEqual([])
  })
})

const DAY = '2026-09-18'
const AFTERNOON = new Date(2026, 8, 18, 14, 0)
const asked = blockReadings('afternoon')

/** An offer drawn by the new engine, as the store keeps it: its version, no coin and no card, every chance kept, summing to one. */
async function drawnByNewEngine(o: Offer | null): Promise<Offer> {
  expect(o).not.toBeNull()
  const stored = (await db.offers.get((o as Offer).id as number)) as Offer
  expect(stored.draw?.engine).toBe('repair-1')
  expect(stored.coinFlip).toBe(false)
  expect(stored.cardId).toBeNull()
  const chances = stored.propensities ?? {}
  expect(Object.keys(chances).sort()).toEqual([...stored.candidates].sort())
  expect(Object.values(chances).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
  expect(stored.propensity).toBe(chances[stored.moveId])
  return stored
}

/** Nothing of the old engine's kind was written: no card for any draw (a passive item's own card aside), no belief row. */
async function nothingOfTheOldKind(): Promise<void> {
  expect(await db.cards.filter((c) => c.origin !== 'passive').count()).toBe(0)
  expect(await db.beliefs.count()).toBe(0)
  expect(await db.tagBeliefs.count()).toBe(0)
  expect(engineFailed()).toBe(false)
}

describe('every production draw is the new engine’s', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ now: AFTERNOON, toFake: ['Date'] })
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
    // The key that once closed the new engine, set as an automated test browser could set it: it closes nothing now.
    const store = new Map<string, string>([
      ['lm.inStep', '1'],
      ['life-mirror.preview.learningRepair', '0'],
    ])
    vi.stubGlobal('navigator', { webdriver: true })
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    resetRepairBreaker()
  })

  async function checkedIn(): Promise<void> {
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
  }

  it('draws a check-in’s move, nothing extra among its candidates', async () => {
    await checkedIn()
    const o = await drawnByNewEngine(await ensureOffer(DAY, 'afternoon', () => 0.3))
    expect(o.kind).toBe('block')
    expect(o.candidates).toContain(NOTHING)
    await nothingOfTheOldKind()
  })

  it('draws the replacement after a skip among real moves alone, the skipped move left out', async () => {
    await checkedIn()
    const first = (await ensureOffer(DAY, 'afternoon', () => 0.3)) as Offer
    const next = await drawnByNewEngine(await skipOffer(first))
    expect(next.id).not.toBe(first.id)
    expect(next.candidates.length).toBeGreaterThan(0)
    expect(next.candidates).not.toContain(NOTHING)
    expect(next.candidates).not.toContain(first.moveId)
    await nothingOfTheOldKind()
  })

  it('draws the pickup-time move, and another after its skip, never nothing extra', async () => {
    const before = new Date(2026, 8, 18, 16, 0)
    vi.setSystemTime(before)
    await updateSettings((st) => ({ ...st, week: { ...st.week, pickupTime: '17:00' } }))
    await db.days.clear()
    await ensureDayContext(DAY, await getSettings())
    const o = await drawnByNewEngine(await ensurePickupOffer(before, () => 0.3))
    expect(o.kind).toBe('pickup')
    expect(o.candidates).not.toContain(NOTHING)
    const next = await drawnByNewEngine(await skipOffer(o))
    expect(next.kind).toBe('pickup')
    expect(next.candidates).not.toContain(NOTHING)
    expect(next.candidates).not.toContain(o.moveId)
    await nothingOfTheOldKind()
  })

  it('draws again when the day changes under an untouched move', async () => {
    await checkedIn()
    const first = (await ensureOffer(DAY, 'afternoon', () => 0.3)) as Offer
    await setDayContext(DAY, { atOffice: true })
    const next = await drawnByNewEngine(await redrawForDay(DAY, 'afternoon', AFTERNOON, () => 0.3))
    expect(next.id).not.toBe(first.id)
    expect(next.redrawn).toBe(true)
    expect(next.candidates).toContain(NOTHING)
    await nothingOfTheOldKind()
  })
})
