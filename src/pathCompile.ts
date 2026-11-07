import { findPath, type Effort, type Move, type Path, type PathCheck, type PathDecision, type PathPlace, type PathRule, type PathStrand, type SettingKind, type Source } from './catalogue'
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
// Round 1 of the known-answer test (2026-11-06) added the rules after "the domain sets the start": a people Path
// opens on the app's screen, a gate names what its stage is for, a rep is feasible and asks you to record only what
// the Path measures, an outside check needs an audience, and a stage that waits on someone else's yes is a strand
// that waits, with the app's own private check where a partner is involved.

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

/** What a rep needs before it can be done, and what doing one gives: a closed list, so feasibility is checked, not hoped. */
export const REP_NEEDS = ['contact', 'acquaintance', 'plan', 'partner'] as const
export type RepNeed = (typeof REP_NEEDS)[number]

/**
 * The least each kind of strand moves a stage on: design judgment held here, so a generated Path never asks less
 * than the app's own (skills move on six reps across three different ones, as on every hand-built Path).
 */
export const FLOORS: Readonly<Record<GoalType, { reps: number; distinctReps: number }>> = {
  skill: { reps: 6, distinctReps: 3 },
  exposure: { reps: 4, distinctReps: 2 },
  habitOfStarting: { reps: 6, distinctReps: 1 },
  knowledge: { reps: 4, distinctReps: 2 },
  lifestyle: { reps: 6, distinctReps: 2 },
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
  /** Someone else is there: an adult in person, or someone reached by a call or a message. */
  with?: 'adult' | 'remote'
  minutes: number
  effort: Effort
  method: string
  record?: boolean
  handOver?: boolean
  after?: string[]
  /** The components it trains, from the task analysis. */
  trains: string[]
  /** What must exist before it can be done. */
  needs?: RepNeed[]
  /** What doing it gives a later rep. */
  gives?: RepNeed[]
  /** It asks one person for something they could refuse (a plan, a date, a favour, their interest): it carries the app's own bar. */
  asks?: boolean
}

/** A placement on a rep the catalogue already holds: an overlap composed, counted once, never duplicated. */
export interface DossierShared {
  move: string
  strand: string
  stage: number
  advances: boolean
  guardrail: string
}

/** How a Path was made, stamped by the harness that ran the model, never written by the model. */
export interface Provenance {
  run: string
  model: string
  promptHash: string
  retrievedOn: string
}

export interface Dossier {
  goal: string
  /** The model's own triage: it may only make the route more conservative than the rules'. */
  triage: { route: 'fits' | 'abstain'; types: GoalType[]; why: string }
  name: string
  what: string
  timeline: string
  /** What a person must be able to do: each shown by behaviours, or a composite built from its parts by links. */
  components: { id: string; skill: string; basis: string; cards: string[]; composite?: boolean; shows?: string[] }[]
  links: { from: string; to: string; strength: 'hard' | 'soft'; basis: string; cards: string[] }[]
  contexts: string[]
  /** `remote`: calls and messages move this strand's stages, said in its decision; absent, they never do. */
  strands: (Omit<PathStrand, 'rule'> & { kind: GoalType; components: string[]; rule: Omit<PathRule, 'sources'>; remote?: boolean })[]
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

/** The decisions every generated Path records: why its shape is as it is, each number included. */
const REQUIRED_DECISIONS = ['structure', 'maintenance', 'rule', 'timeline', 'cap'] as const

export type Compiled = { ok: true; path: Path; reps: Move[]; shared: { move: string; place: PathPlace }[] } | { ok: false; abstain: boolean; reasons: string[] }

/** Words a generated Path may never say: treatment, cure and diagnosis are not practice. */
const TREATMENT = /\b(treatments?|therap(y|ies|eutic)|cure[sd]?|curing|diagnos\w*|prescri\w*|medicat\w*|dosages?)\b/i
/** A tactic on someone else, or a purpose hidden: never a rep. */
const TACTIC = /\b(trick(s|ed)?|tactic(s)?|manipulat\w*|make (them|her|him|people) (like|want|agree|say yes)|get (them|her|him|people) to (agree|like|want|say yes)|without (them|her|him|people) (knowing|noticing)|so (they|she|he) (can't|cannot) say no)\b/i
/** Something a rep asks you to record that no Path measures: a rating, stars, a tap on how it went, how you felt. Asking someone how their day went is not one. */
const RATING = /\b(rate (it|yourself|them|how|the)|ratings?|out of (five|ten|\d+)|\d+ stars?|(tap|mark|note|log|record|write( down)?|score)( one line)?( on| down)? (how|whether) (it|that|the (talk|call|conversation|date|meeting|evening)) went|how (nervous|anxious|confident) you (felt|were))\b/i
/** A done-when that waits on someone else: their reply, their yes, their coming. A rep is done by your own act. */
const ANSWERED = /\b(they|she|he|someone|the other person|your (friend|partner|date))\s+(has |have |had |is |was )?(agree[sd]?|accept(s|ed)?|repl(y|ies|ied)|answer(s|ed)?|sa(y|ys|id) yes|come|comes|came|show(s|ed)? up|turn(s|ed)? up|respond(s|ed)?)\b|\byou (have |had )?met\b|\b(is|was|gets?|got) (accepted|answered)\b/i
/** "Whatever they answer" says the opposite: struck out before a done-when is read. */
const WHATEVER = /\b(whatever|however|whether or not|no matter (what|how)|even if)\s+(they|she|he|someone|anyone|the other person|your (friend|partner|date))\b[^.,;]*/gi
/** A rep done with a partner or a date, by its words: it must say it needs a partner, so it waits and carries the app's check. */
const PARTNER_WORDS = /\b(your (girlfriend|boyfriend|wife|husband|spouse|fianc[ée]e?)|on (a|the|your) (first |second |next )?date|the person you('re| are) (seeing|dating)|someone you('re| are) (seeing|dating)|romantic partner)\b/i
/** A rep that asks one person for something they could refuse, by its words: it must say so, and carries the app's own bar. */
const ASK_WORDS = /\b(ask (them|him|her|someone|one person) (out|to|for|if|whether)|invite (them|him|her|someone|one person)|suggest (meeting|a (plan|time|date|coffee|walk))|(say|tell (them|him|her)) (that )?you('d| would) like to see)\b/i
/** The app's own words on every ask, never written by the generator: the power bar and the one ask (the design's §4 item 12). */
export const ASK_BAR = 'Never someone who cannot freely say no: someone you supervise or who supervises you, who serves you at work, or whom you teach or care for. One ask, and anything but a yes is final.'
/** A rep of asking before anything physical: the strand done with a partner holds one. */
const CONSENT_WORDS = /\b(consent|ask (in words )?before (any|a|the) (touch|kiss|physical|intimacy)|ask before anything physical)\b/i
const FAITH = /\b(church|pray(er|ing)?|bible|worship|sermon|scripture|sabbath)\b/i
/** The Partner path's own monthly check, in the order of its questions. */
const CHECK_IDS = ['safety', 'conduct', 'doubt'] as const

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

/** A generated Path's id: from its goal and its name, the same on every compile. */
export function generatedPathIdOf(goal: string, name: string): string {
  return `g-${idHash(`${goal}|${name}`)}`
}

/** The source a generated rep shows: the first card its method rests on, as the catalogue's moves cite theirs. */
function sourceOf(method: string, cards: readonly Pick<ClaimCard, 'id' | 'grade' | 'claim' | 'sources'>[]): Source {
  const card = methodById(method)?.cards.map((id) => cards.find((c) => c.id === id)).find(Boolean)
  const cite = card?.sources[0]?.cite ?? ''
  const year = Number((cite.match(/\((\d{4})\)/) ?? [])[1] ?? 0)
  const who = cite.split(/ \(\d{4}\)/)[0] || 'The method library'
  return { who, what: card ? card.claim.replace(/\.$/, '') : 'A method from the library', year, strength: card ? (card.grade === 'A' ? 'strong' : card.grade === 'B' ? 'moderate' : 'weak') : 'practice' }
}

/** The app's own private check for a strand done with a partner: the Partner path's monthly check, its words and help, never generated. */
export function partnerCheck(strand: string): PathCheck | null {
  const act = findPath('partner')?.acts?.find((a) => a.id === 'monthly-check')
  if (!act?.questions?.length || !act.help) return null
  return { strand, name: act.name, questions: act.questions.map((q, k) => ({ ...q, id: CHECK_IDS[k] ?? `q${k + 1}` })), help: act.help }
}

/** Whether a generated Path's start and private check are the app's own, word for word: the phone checks every row again. */
export function appWordsProblems(path: Pick<Path, 'start' | 'check'>): string[] {
  const out: string[] = []
  const start = path.start
  if (start) {
    const own = Object.values(START_SCREENS).find((s) => s.help === start.help && s.questions.length === start.questions.length && s.questions.every((q, k) => q.id === start.questions[k]?.id && q.text === start.questions[k]?.text))
    if (!own) out.push('its start is not one of the app’s own screens, word for word')
  }
  const check = path.check
  if (check) {
    const own = partnerCheck(check.strand)
    const same = own && own.name === check.name && own.help === check.help && own.questions.length === check.questions.length && own.questions.every((q, k) => q.id === check.questions[k]?.id && q.text === check.questions[k]?.text && q.helpOnYes === check.questions[k]?.helpOnYes)
    if (!same) out.push('its private check is not the app’s own, word for word')
  }
  return out
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

/**
 * A dossier, compiled: the Path, its reps and the placements it adds to reps it shares, or every reason it cannot
 * be. `moves` and `cards` are the catalogue and the library as they stand; `minutesPerWeek` is your intake's answer;
 * `provenance` is the harness's stamp of the run.
 */
export function compileDossier(d: Dossier, ctx: { moves: readonly Move[]; cards: readonly ClaimCard[]; minutesPerWeek: number; day: string; provenance: Provenance; knownAnswer?: boolean }): Compiled {
  const reasons: string[] = []
  const abstains: string[] = []
  const say = (why: string) => reasons.push(why)

  // The goal, triaged by rules first; the model's triage may only be more conservative.
  const rules = triageGoal(d.goal)
  // The known-answer test rebuilds Paths that already exist: only there may a goal an existing Path covers compile.
  if (rules.route !== 'fits' && !(rules.route === 'redirect' && rules.practice) && !(ctx.knownAnswer && rules.route === 'existing')) say(`the goal routes as ${rules.route}${rules.to ? ` (${rules.to})` : ''} by the rules, so no Path is made`)
  // The generator's own abstention ends it here: nothing is built, so no shape is asked of it (the stress set's probe,
  // 2026-11-07: an abstention read as a refusal would have been retried and closed as refused). A route the rules
  // refuse stays refused.
  if (d.triage?.route === 'abstain') return { ok: false, abstain: reasons.length === 0, reasons: [...reasons, `the generator abstained: ${d.triage.why}`] }
  if (!d.triage.types.length || d.triage.types.some((t) => !GOAL_TYPES.includes(t))) say('goal types must come from the closed list')
  if (!(ctx.provenance.run && ctx.provenance.model && ctx.provenance.promptHash && ctx.provenance.retrievedOn)) say('the harness stamps the run, the model, the procedure’s hash and the day the evidence was read')

  // Names and the shape: strands of the closed kinds, two to six stages each, derived from the domain.
  if (!d.name.trim() || d.name.length > 40) say('a name of one to forty characters')
  if (!d.strands.length || d.strands.length > 3) say('one to three strands')
  const strandIds = new Set<string>()
  const strandOf = (id: string) => d.strands.find((s) => s.id === id)
  for (const s of d.strands) {
    if (!SLUG.test(s.id) || strandIds.has(s.id)) say(`strand ${s.id}: an id in kebab case, used once`)
    strandIds.add(s.id)
    if (!GOAL_TYPES.includes(s.kind)) say(`strand ${s.id}: kind ${s.kind} outside the list`)
    if (s.stages.length < 2 || s.stages.length > 6) say(`strand ${s.id}: two to six stages, from the domain, never a fixed number`)
    if (!s.components.length || s.components.some((c) => !d.components.some((x) => x.id === c))) say(`strand ${s.id}: its components must come from the task analysis`)
    if (!(s.rule.reps >= 2 && s.rule.distinctReps >= 1 && s.rule.settingKinds >= 1 && s.rule.withinWeeks >= 2 && s.rule.withinWeeks <= 12 && s.rule.reentryAfterQuietWeeks >= 2 && s.rule.smallerAfterRefusals >= 1)) say(`strand ${s.id}: a floor with reps, kinds, two to twelve weeks, re-entry and the smaller version`)
    const floor = FLOORS[s.kind]
    if (floor && (s.rule.reps < floor.reps || s.rule.distinctReps < floor.distinctReps)) say(`strand ${s.id}: a ${s.kind} strand moves a stage on at least ${floor.reps} reps across ${floor.distinctReps} different ones`)
    // A stage that waits on someone else's yes is a strand that waits: no generated stage is declared.
    for (const st of s.stages) if ((st.advance ?? 'counts') !== 'counts') say(`strand ${s.id}, stage ${st.n}: a generated stage moves by its rule alone; one that waits on someone else is a strand that waits`)
    for (const t of [s.name, s.what, ...s.stages.flatMap((st) => [st.name, st.what, st.notProgress])]) if (TREATMENT.test(t)) say(`strand ${s.id}: treatment words: “${t}”`)
    for (const p of s.pauses ?? []) if (p === s.id || !d.strands.some((x) => x.id === p && !x.waits)) say(`strand ${s.id}: it pauses ${p}, which must be another strand that does not wait`)
    if (s.pauses?.length && !s.waits) say(`strand ${s.id}: only a strand that waits pauses others`)
  }

  // The start: an exposure strand, a clinical word and a people Path open on one of the app's own screens.
  if (d.start && !(d.start.screen in START_SCREENS)) say(`the start screen ${d.start.screen} is not one of the app’s own`)
  if (d.strands.some((s) => s.kind === 'exposure') && !d.start) say('an exposure strand opens with one of the app’s own start screens')
  // A clinical word leads with the help: the Path may follow only as practice, opening on the app’s own screen.
  if (rules.route === 'redirect' && !d.start) say('a goal with a clinical word opens with the app’s own help first')
  if (d.start) {
    const opened = strandOf(d.start.opens)
    if (!opened || opened.kind !== 'exposure') say(`the start opens ${d.start.opens}, which must be an exposure strand of the Path`)
    if (opened?.waits) say('the strand a start opens is turned on by a yes, never one that waits')
    if (!d.start.focus.length) say('the start names where it starts: one focus or more')
    for (const f of d.start.focus) if (f.id === d.start.opens || strandOf(f.id)?.waits) say(`the start’s focus ${f.id} names a strand a yes opens or one that waits`)
  }
  if (!d.strands.some((s) => !s.waits && s.id !== d.start?.opens)) say('at least one strand runs from the start: one that neither waits nor is opened by a yes')

  // The task analysis: components with their basis, shown by behaviours or built from parts; links between real components, no cycle.
  const compIds = new Set(d.components.map((c) => c.id))
  const behavioursOf = (strand: string) => d.measurement.strands.find((m) => m.strand === strand)?.behaviours ?? []
  for (const c of d.components) {
    if (!ORIGINS.includes(c.basis as never)) say(`component ${c.id}: its basis must be an origin label`)
    const holders = d.strands.filter((s) => s.components.includes(c.id))
    if (c.composite) {
      if (!d.links.some((l) => l.to === c.id)) say(`component ${c.id}: a composite is built from its parts, by links into it`)
    } else {
      const shown = (c.shows ?? []).filter((b) => holders.some((s) => behavioursOf(s.id).some((x) => x.id === b)))
      if (!shown.length) say(`component ${c.id}: shown by a behaviour its strand checks, or marked composite`)
      if (!d.reps.some((r) => r.trains?.includes(c.id))) say(`component ${c.id}: trained by a rep`)
    }
  }
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
  // A hard prerequisite is trained no later than what depends on it, on the strand that holds both.
  for (const l of d.links.filter((x) => x.strength === 'hard')) {
    for (const s of d.strands.filter((x) => x.components.includes(l.from) && x.components.includes(l.to))) {
      const first = (c: string) => Math.min(...d.reps.filter((r) => r.strand === s.id && r.trains?.includes(c)).map((r) => r.stage))
      if (first(l.to) < first(l.from)) say(`strand ${s.id}: ${l.to} is trained at stage ${first(l.to)}, before ${l.from}, which it needs, at stage ${first(l.from)}`)
    }
  }

  // The reps: concrete, your own acts, from the method library, never a tactic, never treatment; a crutch on each.
  const repIds = new Set<string>()
  const remoteOnly = (r: DossierRep) => r.with === 'remote' || r.settings.includes('remote')
  for (const r of d.reps) {
    const where = `rep ${r.id}`
    const strand = strandOf(r.strand)
    if (!SLUG.test(r.id) || repIds.has(r.id)) say(`${where}: an id in kebab case, used once`)
    repIds.add(r.id)
    if (!strand) say(`${where}: on a strand the Path does not have`)
    if (!r.settings.length || r.settings.some((k) => !SETTINGS.includes(k))) say(`${where}: settings from the closed list`)
    if (!EFFORTS.includes(r.effort)) say(`${where}: effort low, medium or high`)
    if (!(r.minutes >= 1 && r.minutes <= 90)) say(`${where}: one to ninety minutes`)
    if (r.minutes > ctx.minutesPerWeek) say(`${where}: ${r.minutes} minutes is more than the ${ctx.minutesPerWeek} minutes a week you have`)
    if (!r.crutch?.trim()) say(`${where}: the crutch to drop, filled`)
    if (!r.cue?.trim()) say(`${where}: what attention goes on, filled`)
    if (!methodById(r.method) && !isBlocked(r.method)) say(`${where}: method ${r.method} is not in the library`)
    if (r.with && !r.guardrail?.trim()) say(`${where}: a rep with someone there needs a guardrail`)
    if (r.record && r.with) say(`${where}: a recording is of yourself alone`)
    // A hand-over asks someone who was there: only an audience, never the person you talked with.
    if (r.handOver && !(r.with === 'adult' && r.settings.includes('group'))) say(`${where}: a hand-over only where there is an audience (a group, in person), never one to one or remote`)
    if (r.advances && !r.trains?.length) say(`${where}: a stage-moving rep names the components it trains`)
    for (const c of r.trains ?? []) if (strand && !strand.components.includes(c)) say(`${where}: trains ${c}, which its strand does not hold`)
    for (const t of [r.name, r.what, r.doneWhen, r.cue, r.crutch, r.guardrail ?? '']) {
      if (TREATMENT.test(t)) say(`${where}: treatment words: “${t}”`)
      if (TACTIC.test(t)) say(`${where}: a tactic on someone, or a purpose hidden: “${t}”`)
    }
    for (const t of [r.what, r.doneWhen]) if (RATING.test(t)) say(`${where}: it asks you to record what the Path does not measure (a rating, a score, how it went): “${t}”`)
    if ([r.name, r.what, r.doneWhen, r.cue].some((x) => PARTNER_WORDS.test(x)) && !r.needs?.includes('partner')) say(`${where}: it is done with a partner or a date, so it says it needs a partner`)
    if ([r.name, r.what, r.doneWhen].some((x) => ASK_WORDS.test(x)) && !r.asks) say(`${where}: it asks one person for something they could refuse, so it says it asks and carries the app’s own bar`)
    if (ANSWERED.test(r.doneWhen.replace(WHATEVER, ''))) say(`${where}: done by your own act, whatever anyone answers: “${r.doneWhen}”`)
    // Calls and messages move a stage only on a strand that says they do.
    if (r.advances && strand && !strand.remote && remoteOnly(r)) say(`${where}: a call or a message moves no stage of ${strand.id}, which says calls and messages do not`)
    // Feasibility: each need is given at or before its stage, or by a strand that runs beside it.
    for (const n of r.needs ?? []) {
      if (!REP_NEEDS.includes(n)) say(`${where}: a need outside the list: ${n}`)
      if (n === 'plan' && r.advances) say(`${where}: it needs someone's yes to a plan, so it moves no stage`)
      if (n === 'partner' && !strand?.waits) say(`${where}: it needs a partner, so it sits on a strand that waits`)
      if (n === 'contact' || n === 'acquaintance') {
        const given = d.reps.some((g) => g !== r && g.gives?.includes(n) && (g.strand === r.strand ? g.stage <= r.stage : !strandOf(g.strand)?.waits))
        if (!given) say(`${where}: it needs ${n === 'contact' ? 'a way to reach the person' : 'someone talked with before'}, which no rep at or before it gives`)
      }
    }
    for (const n of r.gives ?? []) if (n !== 'contact' && n !== 'acquaintance') say(`${where}: a rep gives a way to reach someone or someone talked with before, never ${n}`)
  }
  // The budget: the median rep on three days in seven within your minutes a week.
  const typical = median(d.reps.map((r) => r.minutes))
  if (typical * 3 > ctx.minutesPerWeek) say(`a typical rep of ${typical} minutes on three days in seven is more than the ${ctx.minutesPerWeek} minutes a week you have`)
  // A partner's strand is one: it carries the app's own check.
  const partnerStrands = [...new Set(d.reps.filter((r) => r.needs?.includes('partner')).map((r) => r.strand))]
  if (partnerStrands.length > 1) say('reps that need a partner sit on one strand, which carries the app’s own check')
  for (const s of partnerStrands) if (!d.reps.some((r) => r.strand === s && [r.name, r.what, r.doneWhen].some((x) => CONSENT_WORDS.test(x)))) say(`strand ${s}: a strand done with a partner holds a rep of asking in words before anything physical`)
  // A people Path opens on the app's social-fear screen, its fear strand opened by a yes: the domain decides, not the wording.
  const moving = d.reps.filter((r) => r.advances)
  const people = moving.length > 0 && moving.filter((r) => r.with).length * 2 >= moving.length
  if (people && d.start?.screen !== 'socialFear') say('most of its stage-moving reps are done with someone, so it opens on the app’s social-fear screen with an exposure strand a yes opens')

  // The share (round of the stress set): beside another Path a generated Path's own reps take the People row three days in
  // seven, so the strands that run together ask at most three reps a week in all; a strand that waits runs with those it
  // does not pause.
  const rate = (s: Dossier['strands'][number]) => s.rule.reps / Math.max(1, s.rule.withinWeeks)
  const together = [d.strands.filter((s) => !s.waits), ...d.strands.filter((s) => s.waits).map((w) => [w, ...d.strands.filter((s) => !s.waits && !(w.pauses ?? []).includes(s.id))])]
  for (const group of together) {
    const total = group.reduce((a, s) => a + rate(s), 0)
    if (total > 3 + 1e-9) say(`strands ${group.map((s) => s.id).join(', ')}: their floors ask ${Math.round(total * 10) / 10} reps a week together, more than the three a Path's reps may take beside another Path`)
  }

  // Stages: each the rule moves keeps its floor with any one of its reps taken away (a newcomer who never comes, a rep dropped).
  for (const s of d.strands) {
    for (const st of s.stages) {
      if (st.n >= s.stages.length) continue
      const here = d.reps.filter((r) => r.strand === s.id && r.advances && r.stage === st.n)
      const kinds = (rs: readonly DossierRep[]) => new Set(rs.flatMap((r) => r.settings)).size
      const short = here.length < s.rule.distinctReps + 1 || here.some((x) => kinds(here.filter((r) => r !== x)) < s.rule.settingKinds)
      if (short) say(`strand ${s.id}, stage ${st.n}: its floor (${s.rule.distinctReps} different reps in ${s.rule.settingKinds} kinds of setting) must hold with any one of its ${here.length} stage-moving reps taken away`)
      // The smaller version after refusals is the stage's lightest rep: one below high effort, or it is no smaller (round 2).
      if (here.length && here.every((r) => r.effort === 'high')) say(`strand ${s.id}, stage ${st.n}: a stage-moving rep below high effort, so the smaller version after refusals is smaller`)
    }
  }

  // Measurement: every gate names what its stage is for; an outside check only where two of its reps can give one; a cap of four to twelve.
  const m = d.measurement
  if (!(m.cap >= 4 && m.cap <= 12)) say(`an attempt cap of four to twelve, not ${m.cap}`)
  if (!m.maintenance.at.length || m.maintenance.at.some((x, k) => x <= (m.maintenance.at[k - 1] ?? 0)) || m.maintenance.every < 30) say('checks again later: days after a stage is shown, rising, then every thirty days or more')
  for (const g of m.gates) {
    const where = `gate ${g.strand}/${g.stage}`
    const bs = behavioursOf(g.strand)
    if (g.stage >= (strandOf(g.strand)?.stages.length ?? 0)) say(`${where}: a strand’s last stage has no gate, as nothing moves on from it`)
    if (!g.requires?.length) say(`${where}: it names the behaviours its stage exists for`)
    for (const b of g.requires ?? []) if (!bs.some((x) => x.id === b)) say(`${where}: it requires ${b}, which its strand does not check`)
    if ((g.requires?.length ?? 0) > g.met) say(`${where}: it requires more behaviours than it asks to be met`)
    const here = d.reps.filter((r) => r.strand === g.strand && r.advances && r.stage === g.stage)
    if (g.confirmed > 0 && g.stage === 1 && !here.some((r) => r.record)) say(`${where}: a first stage's check from outside the moment can always be given alone, a recording of yourself, never only someone else's`)
    if (g.confirmed > 0 && here.filter((r) => r.record || r.handOver).length < 2) say(`${where}: a check from outside the moment needs two or more of its reps that can give one (a recording of yourself, or an audience's)`)
    if (g.kinds > new Set(here.flatMap((r) => r.settings)).size) say(`${where}: it asks for ${g.kinds} kinds of setting, more than its reps hold`)
  }
  // A component its strand trains before the last stage is shown at some gate of that strand (round 2): one no gate requires is never measured.
  for (const s of d.strands) {
    const gated = m.gates.filter((g) => g.strand === s.id)
    if (!gated.length) continue
    const required = new Set(gated.flatMap((g) => g.requires ?? []))
    for (const id of s.components) {
      const c = d.components.find((x) => x.id === id)
      if (!c || c.composite) continue
      const firstStage = Math.min(...d.reps.filter((r) => r.strand === s.id && r.trains?.includes(id)).map((r) => r.stage))
      if (firstStage >= s.stages.length) continue
      if (!(c.shows ?? []).some((b) => required.has(b))) say(`strand ${s.id}: component ${id} is trained before its last stage, and no gate requires a behaviour that shows it`)
    }
  }
  for (const r of d.reps) if (r.record || r.handOver) if (!m.strands.find((x) => x.strand === r.strand)?.[r.record ? 'record' : 'handOver']) say(`rep ${r.id}: ${r.record ? 'a recording' : 'a hand-over'} on a strand whose measurement does not take one`)

  for (const s of d.shared) {
    if (!ctx.moves.some((x) => x.id === s.move)) say(`shared ${s.move}: no such rep in the catalogue`)
    if (!strandIds.has(s.strand)) say(`shared ${s.move}: on a strand the Path does not have`)
  }

  // Decisions: one on each element that needs a reason, every number included; origins from the list; cards the library holds.
  // A decision's basis may describe the studies (a clinical sample); what it decides may never promise treatment.
  const elements = new Set(d.decisions.map((x) => x.element))
  const need = [...REQUIRED_DECISIONS, ...d.strands.map((s) => `strand:${s.id}`), ...[...new Set(m.gates.map((g) => g.strand))].map((s) => `gate:${s}`), ...(d.start ? ['start'] : [])]
  for (const e of need) if (!elements.has(e)) say(`a decision on ${e}: why it is as it is`)
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
  const id = generatedPathIdOf(d.goal, d.name)
  const strands: PathStrand[] = d.strands.map((s) => ({ id: s.id, name: s.name, what: s.what, stages: s.stages, rule: { ...s.rule, sources: [] }, ...(s.waits ? { waits: true } : {}), ...(s.pauses?.length ? { pauses: s.pauses } : {}) }))
  const first = strands[0]
  const check = partnerStrands.length ? partnerCheck(partnerStrands[0]) : null
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
    ...(check ? { check } : {}),
    decisions: d.decisions,
    generated: { goalTypes: d.triage.types, provenance: { ...ctx.provenance } },
  }
  if (partnerStrands.length && !check) return { ok: false, abstain: false, reasons: ['the app’s own private check for a partner’s strand is missing from the catalogue'] }
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
      ...(r.guardrail || r.asks ? { guardrail: [r.guardrail, r.asks ? ASK_BAR : ''].filter(Boolean).join(' ') } : {}),
      ...(r.record ? { record: true } : {}),
      ...(r.handOver ? { handOver: true } : {}),
      ...([r.name, r.what, r.cue].some((t) => FAITH.test(t)) ? { hiddenWith: 'faith' as const } : {}),
    } as Move
  })
  const shared = d.shared.map((s) => ({ move: s.move, place: { stage: s.stage, advances: s.advances, strand: s.strand, guardrail: s.guardrail } as PathPlace }))

  // P1's checks over the whole: structure, reachability, wording, guardrails, cards, traits, version, methods, decisions, measurement.
  const withShared = ctx.moves.map((x) => {
    const s = shared.find((y) => y.move === x.id)
    return s ? { ...x, path: { ...x.path, [id]: s.place } } : x
  })
  const problems = checkPath(path, [...withShared, ...reps], ctx.cards)
  if (problems.length) return { ok: false, abstain: false, reasons: problems.map((p) => `${p.where}: ${p.what}`) }
  return { ok: true, path, reps, shared }
}
