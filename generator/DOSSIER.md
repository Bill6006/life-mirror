# The dossier's shape

Generated from `src/pathCompile.ts`, `src/pathMeasure.ts`, `src/catalogue.ts` and `src/pathCompile.fixture.ts` by
`scripts/dossier-md.mjs`; edit those, not this file. Settings are one of recurring, errand, group, oneToOne, remote,
solo; effort is low, medium or high; an origin is one of direct, indirect, mechanism, expert, inference, judgment.

```ts
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

/** Reps a week the floors of the strands that run together may ask in all: the share of three days in seven, a third kept for misses and support reps. */
export const SHARE_FLOOR = 2

/** The decisions every generated Path records: why its shape is as it is, each number included. */
const REQUIRED_DECISIONS = ['structure', 'maintenance', 'rule', 'timeline', 'cap'] as const


/** One behaviour a strand's reps check: in your words, and as it is asked of someone who was there. */
export interface Behaviour {
  id: string
  words: string
  theirs: string
}

/** What a strand checks, and whether its reps can be recorded (yourself alone) or handed over. */
export interface StrandMeasure {
  strand: string
  behaviours: readonly Behaviour[]
  record?: boolean
  handOver?: boolean
}

/** What a stage needs shown, beyond its rule's floor. */
export interface StageGate {
  strand: string
  stage: number
  /** Behaviours a rep must meet. */
  met: number
  /** The behaviours its stage exists for, each shown on every rep that counts (P5); absent, any `met` of them. */
  requires?: readonly string[]
  /** Separate weeks with such a rep. */
  weeks: number
  /** Of them, confirmed from outside the moment: a recording checked later, or someone who was there. */
  confirmed: number
  /** Kinds of setting with such a rep. */
  kinds: number
}

/** A Path's measurement: its strands' behaviours, its stages' gates, the attempt cap, and when a stage shown is checked again. */
export interface PathMeasurement {
  strands: readonly StrandMeasure[]
  gates: readonly StageGate[]
  cap: number
  /** When a stage shown is checked again: days after it was shown, then every so many days after the last. */
  maintenance: { at: readonly number[]; every: number }
}


export interface PathStage {
  n: number
  name: string
  what: string
  notProgress: string
  /** How the stage moves on: by the rule, by the rule or a declared date, or only by your declaration. Absent means by the rule. */
  advance?: 'counts' | 'counts or a date' | 'declared'
}


/** The one rule shape a stage is reached by; its numbers are design judgment, and say so. */
export interface PathRule {
  reps: number
  distinctReps: number
  settingKinds: number
  withinWeeks: number
  smallerAfterRefusals: number
  reentryAfterQuietWeeks: number
  note: string
  sources: readonly Source[]
}


export interface PathStrand {
  id: string
  name: string
  what: string
  stages: readonly PathStage[]
  rule?: PathRule
  /** A strand that waits on someone else's yes (P5): off until you turn it on, your word, and off again when it ends. */
  waits?: boolean
  /** The strands it pauses while it is on, each back with its stages kept when it goes off. */
  pauses?: readonly string[]
}


/** Why one element of a Path is as it is (P3): the decision, its basis, its origin, the cards behind it, its uncertainty and what would change it. */
export interface PathDecision {
  id: string
  /** The element: structure, rule, start, maintenance, reps, strand:<id>, gate:<id> or rep:<id>. */
  element: string
  decision: string
  basis: string
  origin: 'direct' | 'indirect' | 'mechanism' | 'expert' | 'inference' | 'judgment'
  cards: readonly string[]
  uncertainty: string
  change: string
}

```

## How the app reads what you write

- **A rep's record.** After a rep the person checks which of its strand's behaviours they did (`checks`). A recorded
  rep (`record`, the person alone) is checked on its recording the next day or later. A handed-over rep
  (`handOver`) asks someone who was there to mark the behaviours they noticed. Before every start the app asks
  "What do you expect will happen? One line, if you want." and shows that line after; a rep never asks for a
  rating, a score, stars or how it went. The app never stores anyone's reaction.
- **A rep's best view.** From outside the moment when there is one (the recording's or the other person's checks,
  when they hold at least as many behaviours as the person's own), else the person's own right after.
- **A stage moves on** when the strand's rule is met (`reps` done within `withinWeeks`, `distinctReps` different
  ones, `settingKinds` kinds of setting), counting only stage-moving reps (`advances`) placed at that stage, and,
  where the stage has a gate, when the gate holds too: reps whose best view shows `met` behaviours and every one
  in `requires`, on `weeks` separate weeks, `confirmed` of them from outside the moment, in `kinds` kinds of
  setting. A strand's last stage is practice: reaching it is the end of the strand.
- **The attempt cap** (`measurement.cap`, four to twelve). An attempt is a done rep of the stage with behaviours
  checked. After `cap` attempts without the gate holding, the stage below's reps come back beside the current
  ones: practice steps back, nothing shown is erased, and nothing is called a demotion.
- **Checks again later** (`measurement.maintenance`). A stage shown is checked again `at` days after it was shown
  (for example 30 and 90), then every `every` days. At each check, the first done rep of that stage on or after
  the day must show its gate's behaviours; one that does not, or none within 14 days, brings the stage's reps back
  until a later rep shows them again.
- **The start screens** (`start.screen`). `socialFear` asks two questions (whether the person often avoids social
  situations, and whether they are often left afraid or embarrassed); `fear` asks one (whether the fear often
  stops them doing things). A yes shows the app's own help, saying this is practice beside help, and turns on the
  strand the start `opens`, which must be an exposure strand; the person may turn it off. The answers are never
  kept. A Path most of whose stage-moving reps are done with someone must open on `socialFear`.
- **Where it starts** (`start.focus`). Each choice is a strand's id (that strand alone), or any other id (every
  strand but the one a yes opens and those that wait). A focus never names the strand a yes opens or one that waits.
- **A strand's last stage** has no gate and is never checked again: reaching it is the end of the strand.
- **The smaller version.** After `smallerAfterRefusals` refusals in a row the app offers the stage's lightest rep, by
  effort and then minutes, so every stage the rule moves holds a rep below high effort.
- **Strands on.** The strand a start opens is off at first without `waits`: a yes turns it on.
  Every strand but the one a yes opens and those that wait is on at first. The person turns strands
  on and off on the Path's card; at least one stays on. A strand that `waits` is off until they turn it on, dated;
  while it is on, the strands it `pauses` are off, and they come back with their stages kept when it goes off. A
  strand that is off offers nothing, and its checks again later wait.
- **An ask** (`asks`): a rep that asks one person for something they could refuse, offering a way to stay in touch
  among them, carries the app's own bar; no stage moves by asks alone, its lightest rep never asks, and nothing offers a
  second approach after a no. The bar,
  appended to its guardrail word for word: never someone who cannot freely say no, one ask, anything but a yes
  final. A strand done with a partner holds a rep of asking in words before anything physical.
- **The app's own private check.** A strand whose reps need a partner carries the app's monthly private check,
  questions and help written by the app, never by you; its answers are never kept.
- **Calls and messages.** On a strand without `remote`, a rep that can be done by a call or a message moves no stage.
- **Feasibility** (`needs`, `gives`): `contact` (a way to reach the person) and `acquaintance` (someone talked
  with before) must be given by a rep at or before the needing rep's stage on its strand, or by a rep on another
  strand that does not wait; `plan` (someone's yes to a plan) never moves a stage; `partner` sits only on a strand
  that waits; a rep that needs a plan is offered like any other, and with no plan the person answers there was no
  chance. Every stage the rule moves must keep its floor with any one of its stage-moving reps taken away.
- **Gates measure every component** a strand trains before its last stage: one of its behaviours is required by a gate.
  Every behaviour a gated strand checks is required by some gate, and a gate's required behaviours are trained
  together by at least one stage-moving rep of its stage (by the components its `trains` names).
- **Floors by kind** (`FLOORS` above): a strand's rule asks at least these reps and different reps.
- **The share.** Beside another Path a Path's own reps take the People row three days in seven, and a third of those
  days goes to misses and support reps, so the strands that run together ask at most two reps a week in all
  (`reps` over `withinWeeks`, added up); a strand that waits runs
  with those it does not pause.
- **Draws.** The app draws a day's rep among all the reps a stage offers (its own, and those carried `through` it), so
  at every stage the rule moves at least half the reps offered move it.
- **A first stage** never waits on someone else: a check from outside the moment there must be one you can give
  alone, a recording of yourself.
- **Minutes.** One to ninety a rep, each within the person's minutes a week; the median rep on three days in seven
  within them, since a Path's own reps take the day's People row at most three days in seven.
- **Decisions** the compiler requires: `structure`, `strand:<id>` for each strand, `gate:<id>` for each strand with
  gates, `start` when there is one, `maintenance`, `rule`, `cap` and `timeline`.
- **An abstention** is `{ goal, triage: { route: 'abstain', types, why } }` alone: the compiler ends there, and the
  person reads the reason and what would be needed.
- **Words the compiler refuses**, each named with its text: rating and outcome words anywhere (rated, rating, score, how
  it went, a win or a result someone gives you), treatment, cure and diagnosis words, a tactic on someone, and a
  done-when that waits on someone's answer.
- **A link's basis** is an origin label alone (direct, indirect, mechanism, expert, inference, judgment); its reasons go
  in the strand's decision.
- **A rep with someone there, or recorded,** has a guardrail: for a recording, that it is of you alone and stays on
  your phone.
- **Provenance** is stamped by the harness that runs you: never write it.

## An example, for its shape only (a garden goal)

```ts
/** A small, well-formed dossier for a garden goal: one skill strand, three stages, solo reps. */
export function dossierForTests(): Dossier {
  const stage = (n: number, name: string) => ({ n, name, what: `${name}, in your own bed.`, notProgress: 'How big anything grew.' })
  const rep = (id: string, n: number, trains: string[], method = 'deliberate-practice'): DossierRep => ({ id, strand: 'bed', stage: n, advances: true, name: id.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase()), what: `${id.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase())}, the way the packet or the guide says.`, doneWhen: 'Done when the job is finished, however the bed looks after.', cue: 'One step at a time, the guide open.', crutch: 'Doing it all in one rushed go.', settings: ['solo'], minutes: 25, effort: 'medium', method, trains })
  return {
    goal: 'Grow vegetables in a small garden bed this summer',
    triage: { route: 'fits', types: ['skill', 'habitOfStarting'], why: 'A practical skill with a weekly cue.' },
    name: 'Garden',
    what: 'Vegetables in a small bed, planted and tended week by week.',
    timeline: 'A summer, crop by crop, with no fixed end.',
    components: [
      { id: 'planting', skill: 'Planting at the right depth and spacing', basis: 'judgment', cards: [], shows: ['spaced'] },
      { id: 'tending', skill: 'Tending the bed each week', basis: 'judgment', cards: [], shows: ['checked'] },
    ],
    links: [{ from: 'planting', to: 'tending', strength: 'hard', basis: 'judgment', cards: [] }],
    contexts: ['how established the bed is'],
    strands: [{ id: 'bed', kind: 'skill', name: 'The bed', what: 'Planting, then tending, then a second crop.', components: ['planting', 'tending'], stages: [stage(1, 'Planting'), stage(2, 'Tending each week'), stage(3, 'A second crop')], rule: { reps: 6, distinctReps: 3, settingKinds: 1, withinWeeks: 6, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 3, note: 'Design judgment: six jobs within six weeks, three different ones, before the next stage.' } }],
    reps: [
      rep('prepare-the-bed', 1, ['planting']),
      rep('sow-a-row', 1, ['planting'], 'spaced-practice'),
      rep('plant-seedlings', 1, ['planting']),
      rep('water-deeply', 1, ['planting'], 'spaced-practice'),
      rep('weed-a-patch', 2, ['tending']),
      rep('check-for-pests', 2, ['tending'], 'spaced-practice'),
      rep('mulch-the-bed', 2, ['tending']),
      rep('thin-the-seedlings', 2, ['tending'], 'spaced-practice'),
      rep('sow-a-second-crop', 3, ['planting', 'tending'], 'varied-contexts'),
      rep('save-some-seed', 3, ['tending'], 'varied-contexts'),
    ],
    shared: [],
    measurement: {
      strands: [{ strand: 'bed', behaviours: [{ id: 'spaced', words: 'Spaced the plants as the packet says', theirs: 'Spaced the plants as the packet says' }, { id: 'checked', words: 'Checked the soil before watering', theirs: 'Checked the soil before watering' }] }],
      gates: [
        { strand: 'bed', stage: 1, met: 1, requires: ['spaced'], weeks: 2, confirmed: 0, kinds: 1 },
        { strand: 'bed', stage: 2, met: 2, requires: ['checked'], weeks: 2, confirmed: 0, kinds: 1 },
      ],
      cap: 8,
      maintenance: { at: [30, 90], every: 180 },
    },
    decisions: [
      { id: 'structure', element: 'structure', decision: 'One skill strand in three stages, by how established the bed is.', basis: 'Practice spread out and varied holds better than massed practice.', origin: 'judgment', cards: ['skill-decay'], uncertainty: 'No trial has tested this order for a garden.', change: 'Your record of which jobs stick.' },
      { id: 'bed-order', element: 'strand:bed', decision: 'Planting first, then tending, then a second crop.', basis: 'Design judgment: a bed is planted before it is tended.', origin: 'judgment', cards: [], uncertainty: 'The order is not tested.', change: 'Your record of where you stall.' },
      { id: 'bed-gate', element: 'gate:bed', decision: 'Each stage’s own behaviour, on two separate weeks.', basis: 'Skills decay without use, so a stage is shown more than once.', origin: 'inference', cards: ['skill-decay'], uncertainty: 'The interval for gardening is not known.', change: 'Your record of what holds.' },
      { id: 'maintenance', element: 'maintenance', decision: 'Checked again about a month and three months after a stage is shown, then about every six.', basis: 'Unpractised skill fades over months.', origin: 'inference', cards: ['skill-decay'], uncertainty: 'The intervals come from other skills.', change: 'Checks you keep passing, or missing.' },
      { id: 'floor', element: 'rule', decision: 'Six jobs across three different ones within six weeks.', basis: 'Design judgment, the app’s floor for a skill.', origin: 'judgment', cards: [], uncertainty: 'The numbers are a guess.', change: 'A stage that comes far too easily or never does.' },
      { id: 'timeline', element: 'timeline', decision: 'A summer, with no fixed end.', basis: 'Design judgment.', origin: 'judgment', cards: [], uncertainty: 'How fast it goes is yours.', change: 'Your record.' },
      { id: 'cap', element: 'cap', decision: 'Eight attempts at a stage before the stage below comes back beside it.', basis: 'Design judgment: enough tries to show a stage, few enough that a stuck stage gets help.', origin: 'judgment', cards: [], uncertainty: 'The number is a guess.', change: 'Stages often stuck at the cap, or never near it.' },
    ],
    cards: ['skill-decay'],
    counted: 'Jobs done in the bed, by job and by the behaviours checked.',
    neverCounted: ['how big anything grew'],
    excluded: [],
    settingKinds: { solo: 'In the garden, on your own.' },
  }
}
```
