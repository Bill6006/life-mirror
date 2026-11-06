import { NEGATED_OUTCOME, OUTCOME_WORDS } from './brainShared'
import { ONE_STRAND, strandsOf, type Move, type Path, type PathStrand, type SettingKind } from './catalogue'
import type { ClaimCard } from './libraryTypes'

// The compiler's checks (P1, Paths as data, 2026-11-06). A Path is data, so nothing but these checks
// stands between a Path the catalogue adds and the phone: every rep on a real strand and stage, every
// counted stage reachable by its own rule, no rating or outcome words, a guardrail on every in-person
// rep of a new Path, every card it cites in the library, traits that keep a Path of its own off the
// phone's readers, a version with its change record, and reps offered through the Path alone. The unit
// tests run them over every Path in the catalogue; the phone runs them again before it shows one.

export type PathProblemCode = 'structure' | 'reachable' | 'wording' | 'guardrail' | 'cards' | 'traits' | 'version' | 'status'

export interface PathProblem {
  code: PathProblemCode
  /** Where: the Path, a strand, a stage or a rep. */
  where: string
  what: string
}

/** The kinds of setting another adult is there in person for, as the engine counts them. */
const IN_PERSON: readonly SettingKind[] = ['recurring', 'errand', 'group', 'oneToOne']

/** The Paths Green before P1: built in, and the only ones that may say so. */
const BUILT_IN: readonly string[] = ['social', 'partner']

function texts(path: Path): string[] {
  const strandTexts = (path.strands ?? []).flatMap((s) => [s.name, s.what, ...s.stages.flatMap((st) => [st.name, st.what, st.notProgress])])
  return [path.name, path.what, path.counted, path.rule.note, ...path.stages.flatMap((s) => [s.name, s.what, s.notProgress]), ...strandTexts, ...(path.names ? [path.names.called, path.names.add, path.names.addNote] : [])]
}

function repTexts(m: Move): string[] {
  return [m.name, m.what, m.doneWhen ?? '', m.cue ?? '', m.crutch ?? '', m.guardrail ?? ''].filter(Boolean)
}

const outcomeWords = (t: string) => OUTCOME_WORDS.test(t.replace(NEGATED_OUTCOME, ''))

/** Whether a stage moves on by its rule: by counts, or by counts or a date; a declared stage never does. */
const byRule = (advance: Path['stages'][number]['advance']) => (advance ?? 'counts') !== 'declared'

/** The reps a strand places at a stage, as the engine reads them: offered from their own stage through the last one they name. */
function placedAt(path: Path, strand: PathStrand, stage: number, moves: readonly Move[]): Move[] {
  return moves.filter((m) => {
    const place = m.path?.[path.id]
    return place !== undefined && (place.strand ?? ONE_STRAND) === strand.id && stage >= place.stage && stage <= (place.through ?? place.stage)
  })
}

/** Every problem with a Path, all at once (a checker that stops at its first reason leaves a writer chasing the next). */
export function checkPath(path: Path, moves: readonly Move[], cards: readonly Pick<ClaimCard, 'id' | 'status'>[]): PathProblem[] {
  const out: PathProblem[] = []
  const say = (code: PathProblemCode, where: string, what: string) => out.push({ code, where, what })
  const builtIn = BUILT_IN.includes(path.id)
  const strands = strandsOf(path)
  const reps = moves.filter((m) => m.path?.[path.id] !== undefined)

  // Structure: strands named once, stages counted from one, every rep on a real strand and stage.
  const ids = new Set<string>()
  for (const s of path.strands ?? []) {
    if (!s.id) say('structure', path.id, 'a strand needs an id')
    if (ids.has(s.id)) say('structure', `${path.id}/${s.id}`, 'two strands share an id')
    ids.add(s.id)
  }
  for (const s of strands) {
    s.stages.forEach((st, k) => {
      if (st.n !== k + 1) say('structure', `${path.id}/${s.id || 'stages'}`, `stage ${st.n} out of order: stages count from one`)
    })
  }
  for (const m of reps) {
    const place = m.path?.[path.id]
    if (!place) continue
    const strand = strands.find((s) => s.id === (place.strand ?? ONE_STRAND))
    if (!strand) {
      say('structure', `${path.id}:${m.id}`, `placed on a strand the Path does not have: ${place.strand ?? '(none)'}`)
      continue
    }
    if (!strand.stages.some((st) => st.n === place.stage)) say('structure', `${path.id}:${m.id}`, `placed on stage ${place.stage}, which ${strand.id || 'the Path'} does not have`)
    if (place.through !== undefined && place.through < place.stage) say('structure', `${path.id}:${m.id}`, 'offered through a stage before its own')
  }

  // Reachable: every stage the rule moves on, but a strand's last, holds enough different stage-moving reps in enough kinds of setting.
  for (const s of strands) {
    const rule = s.rule ?? path.rule
    for (const st of s.stages) {
      if (!byRule(st.advance) || st.n >= s.stages.length) continue
      const moving = placedAt(path, s, st.n, reps).filter((m) => m.path?.[path.id]?.advances && m.path?.[path.id]?.stage === st.n && m.status !== 'proposed' && !m.parked)
      const kinds = new Set(moving.flatMap((m) => (m.settings ?? []).filter((k) => IN_PERSON.includes(k))))
      if (moving.length < rule.distinctReps) say('reachable', `${path.id}/${s.id || 'stages'}/${st.n}`, `${moving.length} stage-moving reps, and the rule asks for ${rule.distinctReps} different ones`)
      if (kinds.size < rule.settingKinds) say('reachable', `${path.id}/${s.id || 'stages'}/${st.n}`, `stage-moving reps in ${kinds.size} kinds of in-person setting, and the rule asks for ${rule.settingKinds}`)
    }
  }

  // Wording: no rating or outcome words, a negation struck out first; every counted rep done by your own act.
  for (const t of texts(path)) if (outcomeWords(t)) say('wording', path.id, `rating or outcome words: “${t}”`)
  for (const m of reps) {
    for (const t of repTexts(m)) if (outcomeWords(t)) say('wording', `${path.id}:${m.id}`, `rating or outcome words: “${t}”`)
    if (m.doneWhen !== undefined && !m.doneWhen.startsWith('Done ')) say('wording', `${path.id}:${m.id}`, 'doneWhen must begin “Done ”')
  }

  // A guardrail on every in-person rep of a Path the catalogue adds.
  if (!builtIn) for (const m of reps) if (m.with === 'adult' && !m.guardrail) say('guardrail', `${path.id}:${m.id}`, 'an in-person rep of a new Path needs a guardrail')

  // Cards: each in the library, admitted or disputed; a disputed one is cited only beside something the Path excludes.
  const byId = new Map(cards.map((c) => [c.id, c]))
  const disputed = path.cards.filter((id) => byId.get(id)?.status === 'disputed')
  for (const id of path.cards) {
    const c = byId.get(id)
    if (!c) say('cards', path.id, `cites a card the library does not hold: ${id}`)
    else if (c.status !== 'admitted' && c.status !== 'disputed') say('cards', path.id, `cites a card that is ${c.status}: ${id}`)
  }
  if (disputed.length > path.excluded.length) say('cards', path.id, `${disputed.length} disputed cards and ${path.excluded.length} things excluded: a disputed card stands only beside what it excludes`)

  // Traits: a Path of its own stays off the sheet and out of the coach; only the two built in say they are; a share is a number of days in seven.
  if (path.traits.privacy === 'own' && (path.traits.sheet || path.traits.coach)) say('traits', path.id, 'a Path of its own reaches no reader off the phone: neither the sheet nor the coach')
  if (path.builtIn && !builtIn) say('traits', path.id, 'only Social and Partner are built in')
  if (builtIn && !path.builtIn) say('traits', path.id, 'Social and Partner are built in')
  const share = path.traits.rowShare
  if (share !== undefined && (!Number.isInteger(share) || share < 1 || share > 7)) say('traits', path.id, 'a share of the People row is a whole number of days in seven')

  // A Path the catalogue adds has a version and says what that version is.
  if (!builtIn) {
    if (!path.version) say('version', path.id, 'a new Path needs a version')
    else if (!(path.changes ?? []).some((c) => c.version === path.version)) say('version', path.id, `no change record for version ${path.version}`)
  }

  // Its own reps are offered through it alone, never by the day's draw.
  if (!builtIn) for (const m of reps) {
    const elsewhere = Object.keys(m.path ?? {}).some((id) => id !== path.id && BUILT_IN.includes(id))
    if (!elsewhere && m.status !== 'path') say('status', `${path.id}:${m.id}`, 'a rep only a new Path holds is offered through it alone: status “path”')
  }
  return out
}
