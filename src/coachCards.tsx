import { useState } from 'preact/hooks'
import type { SkillWords } from './aimFlow'
import type { AimCoach, ReviewAnswer } from './coachFlow'
import type { SkillChange, SkillSuggestion } from './coachShared'
import { copy } from './copy'
import type { Skill } from './db'
import { fill } from './format'
import { MAX_PER_WEEK, MAX_REST_DAYS, type Rhythm } from './rhythm'

// Parts 40 and 41 on a learning commitment's card: Claude's suggestion for the current skill with
// Use this, Edit first, Another suggestion and Write my own; the ask still waiting, with your own
// words always possible; and a progression review, Claude's or the phone's neutral question, never
// a modal. Nothing here changes the commitment until you tap.

/** A rhythm in words: "3 a week, with a rest day between". */
export function rhythmWords(r: { perWeek: number; restDays: number } | null | undefined): string | null {
  if (!r) return null
  const c = copy.coach
  return r.restDays > 0 ? fill(c.rhythmRest, { n: String(r.perWeek), rest: c.restWords[r.restDays] ?? c.restWords[2] }) : fill(c.rhythm, { n: String(r.perWeek) })
}

/** What a suggestion or a change proposes, line by line: the practice, its minutes and rhythm, the safety line with its note, and the likely next. */
function Proposed({ method, how, minutes, rhythm, safety, likelyNext }: { method?: string | null; how?: string | null; minutes?: number | null; rhythm?: { perWeek: number; restDays: number } | null; safety?: string | null; likelyNext?: string | null }) {
  const c = copy.coach
  const facts = [method && fill(copy.aims.withMethod, { method: method.replace(/^(A|An|The) /, (w) => w.toLowerCase()) }), minutes && fill(c.minutes, { n: String(minutes) }), rhythmWords(rhythm)].filter(Boolean)
  return (
    <>
      {how && <p class="calc-line">{how}</p>}
      {facts.length > 0 && <p class="calc-line faint">{facts.join(' · ')}</p>}
      {safety && (
        <p class="calc-line" data-testid="coach-safety">
          {fill(c.safety, { safety })} <span class="faint">{c.notMedical}</span>
        </p>
      )}
      {likelyNext && <p class="calc-line faint">{fill(c.likelyNext, { next: likelyNext })}</p>}
    </>
  )
}

/** Your words for the skill, filled from a suggestion or a change: the skill, how it is practised, how to do it, its minutes, and how often. */
function Editor({ initial, rhythm, onSave, onCancel, testid }: { initial: SkillWords; rhythm: Rhythm | null; onSave: (w: SkillWords, r: Rhythm | null) => void; onCancel: () => void; testid: string }) {
  const a = copy.aims
  const c = copy.coach
  const [name, setName] = useState(initial.name)
  const [method, setMethod] = useState(initial.method ?? '')
  const [how, setHow] = useState(initial.how ?? '')
  const [minutes, setMinutes] = useState(initial.minutes ? String(initial.minutes) : '')
  const [per, setPer] = useState(rhythm?.perWeek ?? 0)
  const [rest, setRest] = useState(rhythm?.restDays ?? 0)
  const field = (label: string, value: string, set: (v: string) => void, id: string, max: number) => (
    <>
      <p class="setting-label">{label}</p>
      <input class="input" type="text" maxLength={max} aria-label={label} value={value} data-testid={`${testid}-${id}`} onInput={(e) => set((e.currentTarget as HTMLInputElement).value)} />
    </>
  )
  return (
    <div class="skill-form" data-testid={testid}>
      {field(a.skillName, name, setName, 'name', 80)}
      {field(a.skillMethod, method, setMethod, 'method', 60)}
      {field(a.skillHow, how, setHow, 'how', 240)}
      <p class="setting-label">{a.skillMinutes}</p>
      <input class="input" type="number" inputMode="numeric" min={1} max={240} aria-label={a.skillMinutes} value={minutes} data-testid={`${testid}-minutes`} onInput={(e) => setMinutes((e.currentTarget as HTMLInputElement).value)} />
      <p class="setting-label">{a.rhythmLabel}</p>
      <div class="days" role="group" aria-label={a.rhythmLabel} data-testid={`${testid}-rhythm`}>
        {Array.from({ length: MAX_PER_WEEK + 1 }, (_, n) => (
          <button key={n} type="button" class={per === n ? 'day is-on' : 'day'} aria-pressed={per === n} data-testid={`${testid}-rhythm-${n}`} onClick={() => setPer(n)}>
            {n === 0 ? a.rhythmFlexible : String(n)}
          </button>
        ))}
      </div>
      {per > 0 && (
        <>
          <p class="setting-label">{a.restLabel}</p>
          <div class="days" role="group" aria-label={a.restLabel} data-testid={`${testid}-rest`}>
            {Array.from({ length: MAX_REST_DAYS + 1 }, (_, n) => (
              <button key={n} type="button" class={rest === n ? 'day is-on' : 'day'} aria-pressed={rest === n} data-testid={`${testid}-rest-${n}`} onClick={() => setRest(n)}>
                {a.rest[n]}
              </button>
            ))}
          </div>
        </>
      )}
      <div class="actions">
        <button type="button" class="pill-quiet" data-testid={`${testid}-save`} disabled={!name.trim()} onClick={() => onSave({ name, method, how, minutes: minutes.trim() ? Number(minutes) : null }, per > 0 ? { perWeek: per, restDays: rest } : null)}>
          {c.save}
        </button>
        <button type="button" class="textbtn" data-testid={`${testid}-cancel`} onClick={onCancel}>
          {c.cancel}
        </button>
      </div>
    </div>
  )
}

export interface SetupHandlers {
  onUse: (askId: number) => void
  onEdited: (askId: number, words: SkillWords, rhythm: Rhythm | null) => void
  onAnother: (askId: number) => void
  onOwn: (askId: number) => void
}

/**
 * A setup ask on the card (Part 40): waiting, said plainly with your own words still possible; or
 * Claude's suggestion, whole, with Use this, Edit first, Another suggestion and Write my own.
 */
export function SetupCoach({ coach, h }: { coach: AimCoach; h: SetupHandlers }) {
  const c = copy.coach
  const [editing, setEditing] = useState(false)
  const open = coach.setup
  if (!open) return null
  const askId = open.ask.id as number
  const s: SkillSuggestion | undefined = open.proposal?.suggestion
  if (!s) {
    return (
      <p class="note faint" data-testid="coach-pending">
        {open.ask.after ? c.askingAnother : c.asking}
      </p>
    )
  }
  if (editing) return <Editor initial={{ name: s.skill, method: s.method ?? undefined, how: s.how, minutes: s.minutes }} rhythm={s.rhythm} testid="coach-editor" onCancel={() => setEditing(false)} onSave={(w, r) => h.onEdited(askId, w, r)} />
  return (
    <div class="calc coach" data-testid="coach-suggestion">
      <p class="calc-line">
        <span class="calc-key">{c.suggests}</span>
      </p>
      <p class="calc-line ink" data-testid="coach-suggestion-skill">
        {s.skill}
      </p>
      <Proposed method={s.method} how={s.how} minutes={s.minutes} rhythm={s.rhythm} safety={s.safety} likelyNext={s.likelyNext} />
      <p class="calc-line faint">{fill(c.why, { why: s.why })}</p>
      <div class="actions">
        <button type="button" class="pill-quiet is-primary" data-testid="coach-use" onClick={() => h.onUse(askId)}>
          {c.use}
        </button>
        <button type="button" class="textbtn" data-testid="coach-edit" onClick={() => setEditing(true)}>
          {c.edit}
        </button>
        <button type="button" class="textbtn" data-testid="coach-another" onClick={() => h.onAnother(askId)}>
          {c.another}
        </button>
        <button type="button" class="textbtn" data-testid="coach-own" onClick={() => h.onOwn(askId)}>
          {c.own}
        </button>
      </div>
    </div>
  )
}

/**
 * The ask itself: on a new commitment's card, or from Details once a skill is named; nothing is
 * replaced until you choose. For a physical goal, one safety question comes first, its answer
 * optional, and Claude reads it; asked again, it starts from your last answer.
 */
export function AskCoach({ onAsk, physical = false, last = null }: { onAsk: (care?: string) => void; physical?: boolean; last?: string | null }) {
  const c = copy.coach
  const [care, setCare] = useState(last ?? '')
  const row = (
    <div class="actions" data-testid="coach-ask-row">
      <button type="button" class="textbtn" data-testid="coach-ask" onClick={() => onAsk(physical ? care : undefined)}>
        {c.ask}
      </button>
      <span class="note faint no-gap">{c.askNote}</span>
    </div>
  )
  if (!physical) return row
  return (
    <div data-testid="coach-care-ask">
      <p class="setting-label">{c.careQuestion}</p>
      <input class="input" type="text" maxLength={200} aria-label={c.careQuestion} placeholder={c.carePlaceholder} value={care} data-testid="coach-care" onInput={(e) => setCare((e.currentTarget as HTMLInputElement).value)} />
      {row}
    </div>
  )
}

/** The change a review proposes, as the skill's new words: a new skill, or the same one practised differently. */
function changeWords(current: Skill, ch: SkillChange): SkillWords {
  return { name: ch.skill ?? current.name, method: ch.method ?? current.method, how: ch.how ?? current.how, minutes: ch.minutes ?? current.minutes ?? null }
}

const DECIDE: Record<'adjust' | 'progress' | 'simplify', 'adjusted' | 'progressed' | 'simplified'> = { adjust: 'adjusted', progress: 'progressed', simplify: 'simplified' }

/**
 * A progression review on the card (Part 41). Its head says why it is here: six more practice days,
 * or three hard sessions in a row. With Claude's answer: the verdict, its evidence as facts, the
 * change in full and why, with Use this, Edit first, Keep as it is and Write my own. Without one
 * (asked and not yet come, or Claude not asked): the same question, neutrally, with Keep, Edit,
 * Earlier skills and Write the next. Nothing changes until you choose.
 */
export function ReviewCoach({ coach, current, rhythm, earlier, onAnswer }: { coach: AimCoach; current: Skill; rhythm: Rhythm | null; earlier: readonly { skill: Skill; sessions: number }[]; onAnswer: (askId: number, a: ReviewAnswer) => void }) {
  const c = copy.coach
  const [mode, setMode] = useState<'edit' | 'write' | 'earlier' | 'editChange' | null>(null)
  const open = coach.review
  if (!open) return null
  const askId = open.ask.id as number
  const struggle = open.ask.reason === 'struggle'
  const head = struggle ? fill(c.reviewStruggle, { skill: current.name }) : fill(c.reviewOrdinary, { n: String(open.ask.days ?? 0), skill: current.name })
  const r = open.proposal?.review
  const answer = (a: ReviewAnswer) => onAnswer(askId, a)
  const neutral = (
    <div class="actions">
      <button type="button" class="pill-quiet" data-testid="coach-review-keep" onClick={() => answer({ decision: 'kept' })}>
        {c.keep}
      </button>
      <button type="button" class="textbtn" data-testid="coach-review-edit" onClick={() => setMode('edit')}>
        {c.editNow}
      </button>
      {earlier.length > 0 && (
        <button type="button" class="textbtn" data-testid="coach-review-earlier" onClick={() => setMode('earlier')}>
          {c.earlier}
        </button>
      )}
      <button type="button" class="textbtn" data-testid="coach-review-write" onClick={() => setMode('write')}>
        {c.writeNext}
      </button>
    </div>
  )
  let body
  if (mode === 'edit') body = <Editor initial={{ name: current.name, method: current.method, how: current.how, minutes: current.minutes }} rhythm={rhythm} testid="coach-review-editor" onCancel={() => setMode(null)} onSave={(w, rh) => answer({ decision: 'adjusted', change: { ...(w.method ? { method: w.method } : {}), ...(w.how ? { how: w.how } : {}), ...(w.minutes ? { minutes: w.minutes } : {}), ...(w.name.trim().toLowerCase() !== current.name.toLowerCase() ? { skill: w.name } : {}), rhythm: rh } })} />
  else if (mode === 'write') body = <Editor initial={{ name: '', method: current.method }} rhythm={rhythm} testid="coach-review-writer" onCancel={() => setMode(null)} onSave={(w, rh) => answer({ decision: 'wroteNext', words: w, rhythm: rh })} />
  else if (mode === 'earlier')
    body = (
      <div class="calc" data-testid="coach-review-earlier-list">
        {earlier.map(({ skill }) => (
          <div key={skill.id} class="history-row">
            <p class="calc-line">{skill.name}</p>
            <button type="button" class="textbtn" data-testid="coach-review-make-current" onClick={() => answer({ decision: 'earlier', skillId: skill.id as number })}>
              {c.makeCurrent}
            </button>
          </div>
        ))}
        <button type="button" class="textbtn" onClick={() => setMode(null)}>
          {c.cancel}
        </button>
      </div>
    )
  else if (mode === 'editChange' && r?.change) body = <Editor initial={changeWords(current, r.change)} rhythm={r.change.rhythm === undefined ? rhythm : r.change.rhythm} testid="coach-review-editor" onCancel={() => setMode(null)} onSave={(w, rh) => answer({ decision: DECIDE[r.verdict === 'keep' ? 'adjust' : r.verdict], change: { ...(w.method ? { method: w.method } : {}), ...(w.how ? { how: w.how } : {}), ...(w.minutes ? { minutes: w.minutes } : {}), ...(w.name.trim().toLowerCase() !== current.name.toLowerCase() ? { skill: w.name } : {}), rhythm: rh, ...(r.change?.safety ? { safety: r.change.safety } : {}) } })} />
  else if (r && r.verdict !== 'keep' && r.change) {
    const ch = r.change
    body = (
      <>
        <p class="calc-line ink" data-testid="coach-review-verdict">
          {fill(c.verdicts[r.verdict], { skill: ch.skill ?? current.name })}
        </p>
        {r.evidence.map((e) => (
          <p key={e} class="calc-line" data-testid="coach-review-evidence">
            {e}
          </p>
        ))}
        {ch.skill && <p class="calc-line ink">{ch.skill}</p>}
        <Proposed method={ch.method} how={ch.how} minutes={ch.minutes} rhythm={ch.rhythm} safety={ch.safety} />
        <p class="calc-line faint">{fill(c.why, { why: r.why })}</p>
        <div class="actions">
          <button type="button" class="pill-quiet is-primary" data-testid="coach-review-use" onClick={() => answer({ decision: DECIDE[r.verdict as 'adjust' | 'progress' | 'simplify'], change: ch })}>
            {c.use}
          </button>
          <button type="button" class="textbtn" data-testid="coach-review-edit" onClick={() => setMode('editChange')}>
            {c.edit}
          </button>
          <button type="button" class="textbtn" data-testid="coach-review-keep" onClick={() => answer({ decision: 'kept' })}>
            {c.keepAsIs}
          </button>
          <button type="button" class="textbtn" data-testid="coach-review-write" onClick={() => setMode('write')}>
            {c.own}
          </button>
        </div>
      </>
    )
  } else if (r) {
    body = (
      <>
        <p class="calc-line ink" data-testid="coach-review-verdict">
          {c.verdicts.keep}
        </p>
        {r.evidence.map((e) => (
          <p key={e} class="calc-line" data-testid="coach-review-evidence">
            {e}
          </p>
        ))}
        <p class="calc-line faint">{fill(c.why, { why: r.why })}</p>
        {neutral}
      </>
    )
  } else {
    body = (
      <>
        <p class="calc-line ink" data-testid="coach-review-question">
          {struggle ? c.reviewQuestionStruggle : c.reviewQuestion}
        </p>
        {open.ask.claude && (
          <p class="note faint no-gap" data-testid="coach-review-pending">
            {c.reviewAsking}
          </p>
        )}
        {neutral}
      </>
    )
  }
  return (
    <div class="calc coach" data-testid="coach-review">
      <p class="calc-line">
        <span class="calc-key" data-testid="coach-review-head">
          {head}
        </span>
      </p>
      {body}
      <p class="note faint no-gap">{c.reviewNote}</p>
    </div>
  )
}
