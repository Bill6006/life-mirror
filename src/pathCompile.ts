import { type Effort, type Move, type Path, type PathDecision, type PathPlace, type PathRule, type PathStrand, type SettingKind, type Source } from './catalogue'
import type { ClaimCard } from './libraryTypes'
import { ORIGINS } from './libraryRules'
import { isBlocked, methodById } from './methods'
import { checkPath } from './pathCheck'
import type { PathMeasurement } from './pathMeasure'
import { triageGoal } from './pathTriage'

// The generator's compiler (P5 of the AI-generated Paths design, 2026-11-06). The model researches and drafts a
// dossier; this decides what a finished Path may contain. A dossier becomes a Path, its reps and the cards it rests
// on, or is refused with every reason at once, or abstains where the evidence is too thin to build on. Nothing a
// model writes reaches the phone without passing here: the goal's triage by rules, the closed vocabularies, P1's
// checks, the safety rules, the budget, the evidence debt and the start's help, which only the app writes.

/** Goal types, the design's architectures: a goal is usually a mixture. */
export const GOAL_TYPES = ['skill', 'exposure', 'habitOfStarting', 'knowledge', 'lifestyle'] as const
export type GoalType = (typeof GOAL_TYPES)[number]
const SETTINGS: readonly SettingKind[] = ['recurring', 'errand', 'group', 'oneToOne', 'remote', 'solo']
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high']
/** The kinds of setting in the app’s own words, where a dossier names none of its own. */
const SETTING_WORDS: Readonly<Record<SettingKind, string>> = {
  recurring: 'A place your week already holds: work, church, a class, a club.',
  errand: 'Somewhere new to you, among people you have not met.',
  group: 'Three or more people together.',
  oneToOne: 'Just the two of you.',
  remote: 'A call or a message.',
  solo: 'On your own.',
}

export interface DossierRep {
  id: string
  strand: string
  stage: number
  through?: number
  advances: boolean
  name: string
  what: string
  doneWhen: string
  cue: string
  crutch: string
  guardrail?: string
  settings: SettingKind[]
  with?: 'adult'
  minutes: number
  effort: Effort
  method: string
  record?: boolean
  handOver?: boolean
  after?: string[]
}

/** A placement on a rep the catalogue already holds: an overlap composed, counted once, never duplicated. */
export interface DossierShared {
  move: string
  strand: string
  stage: number
  advances: boolean
  guardrail: string
}

export interface Dossier {
  goal: string
  /** The model's own triage: it may only make the route more conservative than the rules'. */
  triage: { route: 'fits' | 'abstain'; types: GoalType[]; why: string }
  name: string
  what: string
  timeline: string
  components: { id: string; skill: string; basis: string; cards: string[] }[]
  links: { from: string; to: string; strength: 'hard' | 'soft'; basis: string; cards: string[] }[]
  contexts: string[]
  strands: (Omit<PathStrand, 'rule'> & { kind: GoalType; components: string[]; rule: Omit<PathRule, 'sources'> })[]
  reps: DossierRep[]
  shared: DossierShared[]
  measurement: PathMeasurement
  /** A start screen from the app's own list, by id: its questions and help are never model-written. */
  start?: { screen: StartScreenId; opens: string; focus: { id: string; words: string }[] }
  decisions: PathDecision[]
  cards: string[]
  counted: string
  neverCounted: string[]
  excluded: { what: string; why: string }[]
  settingKinds: Partial<Record<SettingKind, string>>
  provenance: { run: string; model: string; promptHash: string; retrievedOn: string }
}

/** The app's own start screens, the only ones a generated Path may open with. */
export const START_SCREENS = {
  socialFear: {
    questions: [
      { id: 'avoid', text: 'Do you often avoid social situations or activities?' },
      { id: 'afraid', text: 'Do social situations often leave you afraid or embarrassed?' },
    ],
    help: 'Avoiding social situations, or feeling afraid or embarrassed in them, is common, and a doctor or a psychologist can help with it: talking treatments for it are well tested. This path is practice, not treatment, and it can sit beside help.',
  },
  fear: {
    questions: [{ id: 'stops', text: 'Does this fear often stop you doing things you need or want to do?' }],
    help: 'A fear that often stops you doing things is common, and a doctor or a psychologist can help with it: talking treatments for fears are well tested. This path is practice, not treatment, and it can sit beside help.',
  },
} as const
export type StartScreenId = keyof typeof START_SCREENS

export type Compiled = { ok: true; path: Path; reps: Move[]; shared: { move: string; place: PathPlace }[] } | { ok: false; abstain: boolean; reasons: string[] }

/** Words a generated Path may never say: treatment, cure and diagnosis are not practice. */
const TREATMENT = /\b(treatments?|therap(y|ies|eutic)|cure[sd]?|curing|diagnos\w*|prescri\w*|medicat\w*|dosages?)\b/i
/** A tactic on someone else, or a purpose hidden: never a rep. */
const TACTIC = /\b(trick(s|ed)?|tactic(s)?|manipulat\w*|make (them|her|him|people) (like|want|agree|say yes)|get (them|her|him|people) to (agree|like|want|say yes)|without (them|her|him|people) (knowing|noticing)|so (they|she|he) (can't|cannot) say no)\b/i
const FAITH = /\b(church|pray(er|ing)?|bible|worship|sermon|scripture|sabbath)\b/i

/** A short stable hash for ids: FNV-1a in hex. */
function idHash(text: string): string {
  let h = 2166136261
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The source a generated rep shows: the first card its method rests on, as the catalogue's moves cite theirs. */
function sourceOf(method: string, cards: readonly Pick<ClaimCard, 'id' | 'grade' | 'claim' | 'sources'>[]): Source {
  const card = methodById(method)?.cards.map((id) => cards.find((c) => c.id === id)).find(Boolean)
  const cite = card?.sources[0]?.cite ?? ''
  const year = Number((cite.match(/\((\d{4})\)/) ?? [])[1] ?? 0)
  const who = cite.split(/ \(\d{4}\)/)[0] || 'The method library'
  return { who, what: card ? card.claim.replace(/\.$/, '') : 'A method from the library', year, strength: card ? (card.grade === 'A' ? 'strong' : card.grade === 'B' ? 'moderate' : 'weak') : 'practice' }
}

/**
 * A dossier, compiled: the Path, its reps and the placements it adds to reps it shares, or every reason it cannot
 * be. `moves` and `cards` are the catalogue and the library as they stand; `minutesPerWeek` is your intake's answer.
 */
export function compileDossier(d: Dossier, ctx: { moves: readonly Move[]; cards: readonly ClaimCard[]; minutesPerWeek: number; day: string }): Compiled {
  const reasons: string[] = []
  const abstains: string[] = []
  const say = (why: string) => reasons.push(why)

  // The goal, triaged by rules first; the model's triage may only be more conservative.
  const rules = triageGoal(d.goal)
  if (rules.route !== 'fits' && !(rules.route === 'redirect' && rules.practice)) say(`the goal routes as ${rules.route}${rules.to ? ` (${rules.to})` : ''} by the rules, so no Path is made`)
  if (d.triage.route === 'abstain') abstains.push(`the generator abstained: ${d.triage.why}`)
  if (!d.triage.types.length || d.triage.types.some((t) => !GOAL_TYPES.includes(t))) say('goal types must come from the closed list')

  // Names and the shape: strands of the closed kinds, two to six stages each, derived from the domain.
  if (!d.name.trim() || d.name.length > 40) say('a name of one to forty characters')
  if (!d.strands.length || d.strands.length > 3) say('one to three strands')
  const strandIds = new Set<string>()
  for (const s of d.strands) {
    if (!SLUG.test(s.id) || strandIds.has(s.id)) say(`strand ${s.id}: an id in kebab case, used once`)
    strandIds.add(s.id)
    if (!GOAL_TYPES.includes(s.kind)) say(`strand ${s.id}: kind ${s.kind} outside the list`)
    if (s.stages.length < 2 || s.stages.length > 6) say(`strand ${s.id}: two to six stages, from the domain, never a fixed number`)
    if (!s.components.length || s.components.some((c) => !d.components.some((x) => x.id === c))) say(`strand ${s.id}: its components must come from the task analysis`)
    if (!(s.rule.reps >= 2 && s.rule.distinctReps >= 1 && s.rule.settingKinds >= 1 && s.rule.withinWeeks >= 2 && s.rule.reentryAfterQuietWeeks >= 2 && s.rule.smallerAfterRefusals >= 1)) say(`strand ${s.id}: a floor with reps, kinds, weeks, re-entry and the smaller version`)
  }
  if (d.strands.some((s) => s.kind === 'exposure') && !d.start) say('an exposure strand opens with one of the app’s own start screens')
  // A clinical word leads with the help: the Path may follow only as practice, opening on the app’s own screen.
  if (rules.route === 'redirect' && !d.start) say('a goal with a clinical word opens with the app’s own help first')
  if (d.start && !(d.start.screen in START_SCREENS)) say(`the start screen ${d.start.screen} is not one of the app’s own`)

  // The task analysis: components with their basis, prerequisite links between real components, no cycle.
  const compIds = new Set(d.components.map((c) => c.id))
  for (const c of d.components) if (!ORIGINS.includes(c.basis as never)) say(`component ${c.id}: its basis must be an origin label`)
  for (const l of d.links) {
    if (!compIds.has(l.from) || !compIds.has(l.to)) say(`link ${l.from} → ${l.to}: both ends must be components`)
    if (!ORIGINS.includes(l.basis as never)) say(`link ${l.from} → ${l.to}: its basis must be an origin label`)
  }
  const after = new Map<string, string[]>()
  for (const l of d.links) after.set(l.to, [...(after.get(l.to) ?? []), l.from])
  const seen = new Set<string>()
  const cycle = (id: string, trail: Set<string>): boolean => {
    if (trail.has(id)) return true
    if (seen.has(id)) return false
    seen.add(id)
    const next = new Set(trail).add(id)
    return (after.get(id) ?? []).some((x) => cycle(x, next))
  }
  if ([...compIds].some((id) => cycle(id, new Set()))) say('prerequisite links must not form a cycle')

  // The reps: concrete, your own acts, from the method library, never a tactic, never treatment; a crutch on each.
  const repIds = new Set<string>()
  for (const r of d.reps) {
    const where = `rep ${r.id}`
    if (!SLUG.test(r.id) || repIds.has(r.id)) say(`${where}: an id in kebab case, used once`)
    repIds.add(r.id)
    if (!strandIds.has(r.strand)) say(`${where}: on a strand the Path does not have`)
    if (!r.settings.length || r.settings.some((k) => !SETTINGS.includes(k))) say(`${where}: settings from the closed list`)
    if (!EFFORTS.includes(r.effort)) say(`${where}: effort low, medium or high`)
    if (!(r.minutes >= 1 && r.minutes <= 30)) say(`${where}: one to thirty minutes`)
    if (!r.crutch?.trim()) say(`${where}: the crutch to drop, filled`)
    if (!r.cue?.trim()) say(`${where}: what attention goes on, filled`)
    if (!methodById(r.method) && !isBlocked(r.method)) say(`${where}: method ${r.method} is not in the library`)
    for (const t of [r.name, r.what, r.doneWhen, r.cue, r.crutch, r.guardrail ?? '']) {
      if (TREATMENT.test(t)) say(`${where}: treatment words: “${t}”`)
      if (TACTIC.test(t)) say(`${where}: a tactic on someone, or a purpose hidden: “${t}”`)
    }
    if (r.minutes * 3 > ctx.minutesPerWeek) say(`${where}: ${r.minutes} minutes on three days in seven is more than the ${ctx.minutesPerWeek} minutes a week you have`)
  }
  for (const s of d.shared) {
    if (!ctx.moves.some((m) => m.id === s.move)) say(`shared ${s.move}: no such rep in the catalogue`)
    if (!strandIds.has(s.strand)) say(`shared ${s.move}: on a strand the Path does not have`)
  }

  // Decisions: one on the structure, origins from the list, cards the Path cites; every card admitted or disputed.
  // A decision's basis may describe the studies (a clinical sample); what it decides may never promise treatment.
  for (const dec of d.decisions) if (TREATMENT.test(dec.decision)) say(`decision ${dec.id}: treatment words: “${dec.decision}”`)
  for (const t of [d.name, d.what, d.timeline, d.counted]) if (TREATMENT.test(t)) say(`treatment words: “${t}”`)
  for (const id of d.cards) if (!ctx.cards.some((c) => c.id === id)) say(`cites a card the library does not hold: ${id}`)

  // Evidence debt: a strand nothing admitted stands behind is too thin to build on.
  const admitted = new Set(ctx.cards.filter((c) => c.status === 'admitted').map((c) => c.id))
  for (const s of d.strands) {
    const behind = [...d.decisions.filter((x) => x.element === `strand:${s.id}` || x.element === `gate:${s.id}`).flatMap((x) => x.cards), ...d.reps.filter((r) => r.strand === s.id).flatMap((r) => methodById(r.method)?.cards ?? [])]
    if (!behind.some((id) => admitted.has(id))) abstains.push(`strand ${s.id}: no admitted card stands behind it`)
  }

  if (reasons.length || abstains.length) return { ok: false, abstain: !reasons.length && abstains.length > 0, reasons: [...reasons, ...abstains] }

  // Built: the Path in the catalogue's shape, its own and off the phone's readers, labelled experimental.
  const id = `g-${idHash(`${d.goal}|${d.name}`)}`
  const strands: PathStrand[] = d.strands.map((s) => ({ id: s.id, name: s.name, what: s.what, stages: s.stages, rule: { ...s.rule, sources: [] } }))
  const first = strands[0]
  const path: Path = {
    id,
    name: d.name,
    what: d.what,
    timeline: d.timeline,
    stages: first.stages,
    rule: first.rule as PathRule,
    strands,
    settingKinds: { ...SETTING_WORDS, ...d.settingKinds },
    counted: d.counted,
    neverCounted: d.neverCounted,
    excluded: d.excluded,
    cards: d.cards,
    traits: { sheet: false, coach: false, privacy: 'own', rowShare: 3, icon: 'practice' },
    version: '1',
    changes: [{ version: '1', day: ctx.day, reason: 'design', major: true, what: 'The first version, generated from the evidence and compiled.' }],
    label: 'experimental',
    names: { called: `The ${d.name} path`, add: `The ${d.name} path`, addNote: `Made for your goal: ${d.what}`, plan: `${d.name} rep` },
    measurement: d.measurement,
    ...(d.start ? { start: { questions: [...START_SCREENS[d.start.screen].questions], help: START_SCREENS[d.start.screen].help, opens: d.start.opens, focus: d.start.focus } } : {}),
    decisions: d.decisions,
    generated: { goalTypes: d.triage.types, provenance: d.provenance },
  }
  const reps: Move[] = d.reps.map((r) => {
    const place: PathPlace = { stage: r.stage, advances: r.advances, ...(r.through ? { through: r.through } : {}), ...(r.after?.length ? { after: r.after.map((a) => `${id}-${a}`) } : {}), strand: r.strand }
    return {
      id: `${id}-${r.id}`,
      name: r.name,
      family: id,
      what: r.what,
      source: sourceOf(r.method, ctx.cards),
      minutes: r.minutes,
      effort: r.effort,
      needs: r.with === 'adult' ? ['anotherPerson'] : [],
      ...(r.with ? { with: r.with } : {}),
      targets: [{ reading: 'mood', direction: 'up', window: 'laterToday' }],
      conflicts: [],
      replaces: [],
      countsToward: [],
      when: ['morning', 'afternoon', 'evening'],
      tags: { ingredients: [...(r.with === 'adult' ? ['withPeople' as const] : []), ...(r.minutes <= 5 ? ['short' as const] : [])], reward: ['mastery'], intensity: r.effort },
      costToAssign: r.effort,
      prior: { effect: 0, note: 'A generated Path’s rep, offered through the Path alone and never by the day’s draw: no starting belief.' },
      status: 'path',
      path: { [id]: place },
      settings: r.settings,
      cue: r.cue,
      crutch: r.crutch,
      doneWhen: r.doneWhen,
      method: r.method,
      ...(r.guardrail ? { guardrail: r.guardrail } : {}),
      ...(r.record ? { record: true } : {}),
      ...(r.handOver ? { handOver: true } : {}),
      ...([r.name, r.what, r.cue].some((t) => FAITH.test(t)) ? { hiddenWith: 'faith' as const } : {}),
    } as Move
  })
  const shared = d.shared.map((s) => ({ move: s.move, place: { stage: s.stage, advances: s.advances, strand: s.strand, guardrail: s.guardrail } as PathPlace }))

  // P1's checks over the whole: structure, reachability, wording, guardrails, cards, traits, version, methods, decisions, measurement.
  const withShared = ctx.moves.map((m) => {
    const s = shared.find((x) => x.move === m.id)
    return s ? { ...m, path: { ...m.path, [id]: s.place } } : m
  })
  const problems = checkPath(path, [...withShared, ...reps], ctx.cards)
  if (problems.length) return { ok: false, abstain: false, reasons: problems.map((p) => `${p.where}: ${p.what}`) }
  return { ok: true, path, reps, shared }
}
