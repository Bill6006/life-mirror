import { useState } from 'preact/hooks'
import { addDays, dayKey } from './blocks'
import type { PathAct } from './catalogue'
import { NavRow, SwitchRow } from './controls'
import { copy } from './copy'
import { db, getSettings, MONTHLY_PARTS, PARTNER_STEPS, updateSettings, VALUES_PARTS, type MonthlyCheck, type MonthlyPart, type PartnerStep, type PathMark, type Reflection, type ValuesPart } from './db'
import { fill, formatDayShort, formatDayTiny } from './format'
import { useLive } from './live'
import {
  actOpensAt,
  addMilestone,
  byPart,
  CHECK_KEYS,
  checkPromptShown,
  checkShowsHelp,
  checkThisMonth,
  declareDate,
  declareStage,
  deleteMark,
  deleteReflection,
  monthlyChecks,
  pathMarks,
  recordBeforeDeciding,
  reflectionPromptShown,
  reflections,
  saveMonthlyCheck,
  saveReflection,
} from './pathFlow'
import { declaredStage, pathById, pathEntries, stageOf, stageWords, type PathToday } from './pathStage'

// The Partner path's own controls (Part 27, revised 2026-09-23). On its card: a date declared with
// its day, the next stage declared in one tap, the online channel's switch, the month's reflection
// and check when they are open, and the door to its notes and checks. On that screen: your values
// in three parts from the start; what you declared, milestones and reflections; and from Dating on,
// a note before each step written with your own record in front of you, the monthly reflection,
// and the monthly check, whose fixed help the app shows itself, inside the check alone and only on
// a yes to its safety or its conduct question. Nothing here holds a name, a place, a rating or
// anyone else's answer; nothing gates a declaration; the app never schedules an introduction.

const partner = () => pathById('partner')

/** The act's content, from the catalogue: what the screen shows is what you read and Greened. */
function act(id: string): PathAct | undefined {
  return partner().acts?.find((a) => a.id === id)
}

/** "September 2026", for a month's reflection. */
function monthName(ym: string): string {
  return new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** On the Partner card's face: this month's reflection and check, while they are open. Time-bound, so never behind a tap. */
export function PartnerPrompts({ pt, lightOnly, today }: { pt: PathToday; lightOnly: boolean; today: string }) {
  const checks = useLive(monthlyChecks, [])
  const notesAll = useLive(() => reflections('partner'), [])
  if (!checks || !notesAll) return null
  const c = copy.path.partner
  const stage = pt.state.stage
  const checkOpen = checkPromptShown(stage, lightOnly, checks, today)
  const reflectionOpen = reflectionPromptShown(stage, lightOnly, notesAll, today)
  if (!checkOpen && !reflectionOpen) return null
  return (
    <div class="calc" data-testid="partner-prompts">
      {reflectionOpen && (
        <p class="calc-line" data-testid="partner-reflection-open">
          {c.reflectionOpen}
        </p>
      )}
      {checkOpen && (
        <p class="calc-line" data-testid="partner-check-open">
          {c.checkOpen}
        </p>
      )}
    </div>
  )
}

/** Declare a date: the seven day chips and their note; the next stage declared in one tap, and Undo. */
export function PartnerDates({ pt, today }: { pt: PathToday; today: string }) {
  const marks = useLive(() => pathMarks('partner'), [])
  if (!marks) return null
  const c = copy.path.partner
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const dateOn = (day: string) => marks.find((m) => m.kind === 'date' && m.day === day)
  const stage = pt.state.stage
  const next = pt.path.stages.find((s) => s.n === stage + 1)
  const canDeclare = next !== undefined && (next.advance ?? 'counts') === 'declared' && stage >= (pt.path.stages.find((s) => s.advance === 'declared')?.n ?? Infinity)
  const lastStage = marks.filter((m) => m.kind === 'stage').sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  return (
    <div data-testid="partner-extras">
      <p class="calc-line ink">{c.datesTitle}</p>
      <div class="when" role="group" aria-label={c.datesTitle}>
        {days.map((day) => {
          const on = dateOn(day)
          return (
            <button
              key={day}
              type="button"
              class={on ? 'when-chip is-on' : 'when-chip'}
              aria-pressed={Boolean(on)}
              data-testid={`partner-date-${day}`}
              onClick={() => void (on?.id !== undefined ? deleteMark(on.id) : declareDate('partner', day))}
            >
              {day === today ? c.today : formatDayTiny(day)}
            </button>
          )
        })}
      </div>
      <p class="note faint">{c.datesNote}</p>

      {canDeclare && next && (
        <div class="actions">
          <button type="button" class="textbtn ink" data-testid="partner-declare" onClick={() => void declareStage('partner', next.n)}>
            {fill(c.declareNext, { stage: stageWords(pt.path, next.n) })}
          </button>
        </div>
      )}
      {lastStage?.id !== undefined && lastStage.stage !== undefined && (
        <p class="calc-line" data-testid="partner-declared">
          {fill(copy.partnerNotes.stageLine, { stage: stageWords(pt.path, lastStage.stage), day: formatDayShort(lastStage.day) })}
          {' · '}
          <button type="button" class="textbtn inline" data-testid="partner-declared-undo" onClick={() => void deleteMark(lastStage.id as number)}>
            {copy.partnerNotes.undo}
          </button>
        </p>
      )}
      {(canDeclare || lastStage) && <p class="note faint no-gap">{c.declareNote}</p>}
    </div>
  )
}

/** Path settings for the Partner path: the online channel's switch, and the door to its notes and checks. */
export function PartnerSettings({ paused, onNotes }: { paused: boolean; onNotes: () => void }) {
  const settings = useLive(getSettings, [])
  if (!settings) return null
  const c = copy.path.partner
  return (
    <>
      {!paused && <SwitchRow label={c.online} note={c.onlineNote} on={settings.partnerOnline} testid="partner-online" onChange={(on) => void updateSettings((s) => ({ ...s, partnerOnline: on }))} />}
      <ul class="rows">
        <NavRow label={c.notes} note={c.notesNote} onClick={onNotes} />
      </ul>
    </>
  )
}

function NoteEditor({ saved, placeholder, testid, rows = 4, onSave }: { saved: Reflection | undefined; placeholder: string; testid: string; rows?: number; onSave: (text: string) => Promise<void> }) {
  const c = copy.partnerNotes
  const [text, setText] = useState<string | null>(null)
  const value = text ?? saved?.text ?? ''
  const changed = text !== null && text.trim() !== (saved?.text ?? '')
  return (
    <>
      <textarea class="input note-input" rows={rows} placeholder={placeholder} value={value} data-testid={testid} onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
      <div class="actions">
        <button type="button" class="pill-quiet" disabled={!changed} data-testid={`${testid}-save`} onClick={() => void onSave(value).then(() => setText(null))}>
          {c.save}
        </button>
        {saved && !changed && <span class="note faint no-gap">{fill(c.saved, { day: formatDayShort(saved.day) })}</span>}
      </div>
    </>
  )
}

/** A part of a note: its name, its prompt, and its editor. */
function PartEditor({ name, prompt, saved, testid, onSave }: { name: string; prompt: string; saved: Reflection | undefined; testid: string; onSave: (text: string) => Promise<void> }) {
  return (
    <div class="calc" data-testid={testid}>
      <p class="calc-line ink">{name}</p>
      <p class="note faint no-gap">{prompt}</p>
      <NoteEditor saved={saved} placeholder={copy.partnerNotes.valuesPlaceholder} testid={`${testid}-input`} rows={3} onSave={onSave} />
    </div>
  )
}

/** The monthly check: three yes-or-no questions, answered again in place; the help shows inside it on a yes to a question the content marks. */
function MonthlyCheckCard({ today }: { today: string }) {
  const checks = useLive(monthlyChecks, [])
  if (!checks) return null
  const c = copy.partnerNotes
  const check = act('monthly-check')
  if (!check?.questions) return null
  const current = checkThisMonth(checks, today)
  const answers: MonthlyCheck['answers'] = current?.answers ?? { safety: null, conduct: null, doubt: null }
  const answer = (k: (typeof CHECK_KEYS)[number], v: boolean) => void saveMonthlyCheck({ ...answers, [k]: answers[k] === v ? null : v })
  return (
    <div class="card pad" data-testid="monthly-check">
      <p class="note faint">{check.what}</p>
      {check.questions.map((q, i) => {
        const k = CHECK_KEYS[i]
        return (
          <div key={k} class="check-question" data-testid={`check-${k}`}>
            <p class="calc-line">{q.text}</p>
            <div class="when" role="group" aria-label={q.text}>
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" class={answers[k] === v ? 'when-chip is-on' : 'when-chip'} aria-pressed={answers[k] === v} data-testid={`check-${k}-${v ? 'yes' : 'no'}`} onClick={() => answer(k, v)}>
                  {v ? c.yes : c.no}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {checkShowsHelp(answers) && check.help && (
        <p class="calc-line ink check-help" role="note" data-testid="check-help">
          {check.help}
        </p>
      )}
      {current && <p class="note faint">{fill(c.answered, { day: formatDayShort(current.day) })}</p>}
    </div>
  )
}

/** The monthly reflection: this month's three parts, rewritten in place within the month, and earlier months as you wrote them. */
function MonthlyReflectionCard({ notes, today }: { notes: readonly Reflection[]; today: string }) {
  const c = copy.partnerNotes
  const reflection = act('monthly-reflection')
  if (!reflection?.parts) return null
  const month = today.slice(0, 7)
  const monthly = notes.filter((r) => r.kind === 'monthly')
  const thisMonth = (part: MonthlyPart) => monthly.find((r) => r.part === part && r.day.slice(0, 7) === month)
  const earlier = [...new Set(monthly.map((r) => r.day.slice(0, 7)).filter((m) => m < month))].sort().reverse()
  const partName = (id: string | undefined) => reflection.parts?.find((p) => p.id === id)?.name ?? ''
  return (
    <div class="card pad" data-testid="partner-reflection-monthly">
      <p class="note faint">{reflection.what}</p>
      <p class="calc-line ink">{c.thisMonth}</p>
      {MONTHLY_PARTS.map((part) => {
        const p = reflection.parts?.find((x) => x.id === part)
        return p ? <PartEditor key={part} name={p.name} prompt={p.prompt} saved={thisMonth(part)} testid={`partner-monthly-${part}`} onSave={(text) => saveReflection('partner', 'monthly', text, { part })} /> : null
      })}
      {earlier.length > 0 && (
        <details class="calc">
          <summary class="calc-line">{c.earlierMonths}</summary>
          {earlier.map((m) => (
            <div key={m} class="calc">
              <p class="calc-line ink">{monthName(m)}</p>
              {monthly
                .filter((r) => r.day.slice(0, 7) === m)
                .sort(byPart(MONTHLY_PARTS))
                .map((r) => (
                  <p key={r.id} class="calc-line pre">
                    <span class="calc-key">{partName(r.part)}</span> · {r.text}
                  </p>
                ))}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

/** Your own record before a decision: read-only, as you wrote it, chosen by kind and date alone. */
function RecordPanel({ all, step, today }: { all: readonly Reflection[]; step: PartnerStep; today: string }) {
  const c = copy.partnerNotes
  const record = recordBeforeDeciding(all, step, today)
  const values = act('values-note')
  const reflection = act('monthly-reflection')
  const partName = (a: PathAct | undefined, id: string | undefined) => a?.parts?.find((p) => p.id === id)?.name ?? c.legacyValues
  const empty = <p class="calc-line faint">{c.recordEmpty}</p>
  return (
    <div class="calc" data-testid="partner-record">
      <p class="calc-line ink">{c.recordTitle}</p>
      <p class="note faint no-gap">{c.recordNote}</p>
      <p class="calc-line ink">{c.recordValues}</p>
      {record.values.length
        ? record.values.map((r) => (
            <p key={r.id} class="calc-line pre">
              <span class="calc-key">{partName(values, r.part)}</span> · {r.text}
            </p>
          ))
        : empty}
      <p class="calc-line ink">{c.recordMonthly}</p>
      {record.monthly.length
        ? record.monthly.map((r) => (
            <p key={r.id} class="calc-line pre">
              <span class="calc-key">
                {monthName(r.day.slice(0, 7))} · {partName(reflection, r.part)}
              </span>{' '}
              · {r.text}
            </p>
          ))
        : empty}
      <p class="calc-line ink">{c.recordNotes}</p>
      {record.notes.length
        ? record.notes.map((r) => (
            <p key={r.id} class="calc-line pre">
              <span class="calc-key">{formatDayShort(r.day)}</span> · {r.text}
            </p>
          ))
        : empty}
      <p class="calc-line ink">{c.recordDecided}</p>
      {record.decided.length
        ? record.decided.map((r) => (
            <p key={r.id} class="calc-line pre">
              <span class="calc-key">{r.step ? c.stepNames[r.step] : ''}</span> · {r.text}
            </p>
          ))
        : empty}
    </div>
  )
}

/** One step's note: your record first, what a parent may weigh before an introduction, the course before an engagement, then the note. */
function StepPanel({ step, all, today, onBack }: { step: PartnerStep; all: readonly Reflection[]; today: string; onBack: () => void }) {
  const c = copy.partnerNotes
  const child = act('introducing-a-child')
  const course = act('relationship-education')
  const saved = all.find((r) => r.kind === 'decide' && r.step === step)
  return (
    <div class="card pad" data-testid="partner-decide-panel">
      <p class="calc-line ink">{c.stepNames[step]}</p>
      <RecordPanel all={all} step={step} today={today} />
      {step === 'child' && child && (
        <div class="calc" data-testid="partner-considerations">
          <p class="calc-line">{child.what}</p>
          <p class="calc-line ink">{c.considerations}</p>
          {child.considerations?.map((x) => (
            <p key={x.text} class="calc-line">
              {x.text} <span class="faint">({c.basis[x.basis]}: {x.source})</span>
            </p>
          ))}
        </div>
      )}
      {step === 'engagement' && course && (
        <p class="note faint" data-testid="partner-course">
          {course.name}: {course.what}
        </p>
      )}
      <NoteEditor saved={saved} placeholder={c.decidePlaceholder} testid={`partner-decide-${step}-input`} onSave={(text) => saveReflection('partner', 'decide', text, { step })} />
      <div class="actions">
        <button type="button" class="textbtn" data-testid="partner-decide-back" onClick={onBack}>
          {c.backToSteps}
        </button>
      </div>
    </div>
  )
}

/** The notes and checks that open with a stage, each named for the line that says what opens later. */
const STAGED = ['values-note', 'decide-dont-slide', 'monthly-reflection', 'monthly-check'] as const

/** "From Dating on, this screen also holds a note before each step, the monthly reflection and the monthly check." */
function laterLine(path: ReturnType<typeof partner>, stage: number): string | null {
  const c = copy.partnerNotes
  const groups = new Map<number, string[]>()
  for (const id of STAGED) {
    const at = actOpensAt(id)
    if (at > stage) groups.set(at, [...(groups.get(at) ?? []), c.opensLater[id]])
  }
  const join = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0])
  const parts = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, items], i) => fill(i === 0 ? c.laterFirst : c.laterNext, { stage: path.stages.find((s) => s.n === at)?.name ?? '', items: join(items) }))
  return parts.length ? `${parts.join('; ')}.` : null
}

/** Notes and checks: your values from the start, what you declared, milestones, reflections, and the rest from the stage each opens at. */
export function PartnerNotesScreen({ onClose }: { onClose: () => void }) {
  const today = dayKey(new Date())
  const marks = useLive(() => pathMarks('partner'), [])
  const notes = useLive(() => reflections('partner'), [])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const [milestone, setMilestone] = useState('')
  const [reflection, setReflection] = useState('')
  const [openStep, setOpenStep] = useState<PartnerStep | null>(null)
  if (!marks || !notes || !offers || !outcomes) return <section class="screen" />
  const c = copy.partnerNotes
  const path = partner()
  const stage = stageOf(path, pathEntries('partner', offers, outcomes), today, declaredStage(path, marks, today)).stage
  const newest = (a: { at?: string; updatedAt?: string }, b: { at?: string; updatedAt?: string }) => ((a.at ?? a.updatedAt ?? '') < (b.at ?? b.updatedAt ?? '') ? 1 : -1)
  const declared = marks.filter((m) => m.kind === 'stage' || m.kind === 'date').sort(newest)
  const milestones = marks.filter((m) => m.kind === 'milestone').sort(newest)
  const stepMark = (s: PartnerStep) => milestones.find((m) => m.note === c.steps[s])
  const kept = notes.filter((r) => r.kind === 'reflection').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const valuesAct = act('values-note')
  const valuePart = (part: ValuesPart) => notes.find((r) => r.kind === 'values' && r.part === part)
  const legacy = notes.find((r) => r.kind === 'values' && !r.part)
  const decided = (s: PartnerStep) => notes.find((r) => r.kind === 'decide' && r.step === s)
  const later = laterLine(path, stage)
  const markLine = (m: PathMark) => (m.kind === 'date' ? fill(c.dateLine, { day: formatDayShort(m.day) }) : fill(c.stageLine, { stage: stageWords(path, m.stage ?? 1), day: formatDayShort(m.day) }))
  return (
    <section class="screen" data-testid="partner-notes">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{stageWords(path, stage)}</p>
      <p class="note faint">{c.privacy}</p>

      {valuesAct?.parts && stage >= actOpensAt('values-note') && (
        <>
          <h2 class="section">{valuesAct.name}</h2>
          <div class="card pad" data-testid="partner-values">
            <p class="note faint">{valuesAct.what}</p>
            {VALUES_PARTS.map((part) => {
              const p = valuesAct.parts?.find((x) => x.id === part)
              return p ? <PartEditor key={part} name={p.name} prompt={p.prompt} saved={valuePart(part)} testid={`partner-values-${part}`} onSave={(text) => saveReflection('partner', 'values', text, { part })} /> : null
            })}
            {legacy && (
              <div class="calc" data-testid="partner-values-legacy">
                <p class="calc-line ink">{c.legacyValues}</p>
                <p class="calc-line pre">{legacy.text}</p>
                <button type="button" class="textbtn faint" onClick={() => void deleteReflection(legacy.id as number)}>
                  {c.delete}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <h2 class="section">{c.declared}</h2>
      <div class="card pad" data-testid="partner-declared-list">
        {declared.length === 0 ? (
          <p class="calc-line">{c.declaredNone}</p>
        ) : (
          declared.map((m) => (
            <p key={m.id} class="calc-line" data-testid="partner-mark">
              {markLine(m)}
              {' · '}
              <button type="button" class="textbtn inline" onClick={() => void deleteMark(m.id as number)}>
                {c.undo}
              </button>
            </p>
          ))
        )}
      </div>

      <h2 class="section">{c.milestones}</h2>
      <div class="card pad" data-testid="partner-milestones">
        <p class="note faint">{c.milestonesNote}</p>
        <div class="when" role="group" aria-label={c.milestones}>
          {PARTNER_STEPS.map((s) => {
            const on = stepMark(s)
            return (
              <button key={s} type="button" class={on ? 'when-chip is-on' : 'when-chip'} aria-pressed={Boolean(on)} data-testid={`partner-step-${s}`} onClick={() => void (on?.id !== undefined ? deleteMark(on.id) : addMilestone('partner', c.steps[s]))}>
                {c.steps[s]}
              </button>
            )
          })}
        </div>
        <div class="add">
          <input class="input" type="text" maxLength={200} placeholder={c.milestonePlaceholder} value={milestone} data-testid="partner-milestone-input" onInput={(e) => setMilestone((e.currentTarget as HTMLInputElement).value)} />
          <button type="button" class="pill-quiet" disabled={!milestone.trim()} data-testid="partner-milestone-add" onClick={() => void addMilestone('partner', milestone).then(() => setMilestone(''))}>
            {c.keep}
          </button>
        </div>
        {milestones.map((m) => (
          <p key={m.id} class="calc-line" data-testid="partner-milestone">
            {fill(c.milestoneLine, { note: m.note ?? '', day: formatDayShort(m.day) })}
            {' · '}
            <button type="button" class="textbtn inline" onClick={() => void deleteMark(m.id as number)}>
              {c.undo}
            </button>
          </p>
        ))}
      </div>

      <h2 class="section">{c.reflections}</h2>
      <div class="card pad" data-testid="partner-reflections">
        <p class="note faint">{c.reflectionsNote}</p>
        <textarea class="input note-input" rows={4} placeholder={c.reflectionPlaceholder} value={reflection} data-testid="partner-reflection-input" onInput={(e) => setReflection((e.currentTarget as HTMLTextAreaElement).value)} />
        <div class="actions">
          <button type="button" class="pill-quiet" disabled={!reflection.trim()} data-testid="partner-reflection-keep" onClick={() => void saveReflection('partner', 'reflection', reflection).then(() => setReflection(''))}>
            {c.keepNote}
          </button>
        </div>
        {kept.map((r) => (
          <div key={r.id} class="calc" data-testid="partner-reflection">
            <p class="calc-line faint">{formatDayShort(r.day)}</p>
            <p class="calc-line pre">{r.text}</p>
            <button type="button" class="textbtn faint" onClick={() => void deleteReflection(r.id as number)}>
              {c.delete}
            </button>
          </div>
        ))}
      </div>

      {stage >= actOpensAt('decide-dont-slide') && (
        <>
          <h2 class="section">{act('decide-dont-slide')?.name}</h2>
          {openStep ? (
            <StepPanel step={openStep} all={notes} today={today} onBack={() => setOpenStep(null)} />
          ) : (
            <div class="card" data-testid="partner-decide">
              <p class="note faint pad">{act('decide-dont-slide')?.what}</p>
              <ul class="rows">
                {PARTNER_STEPS.map((s) => {
                  const note = decided(s)
                  return (
                    <li key={s}>
                      <button type="button" class="row" data-testid={`partner-decide-step-${s}`} onClick={() => setOpenStep(s)}>
                        <span class="row-main">
                          {c.stepNames[s]}
                          {note && <span class="sub">{fill(c.stepWritten, { day: formatDayShort(note.day) })}</span>}
                        </span>
                        <span class="chev" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {stage >= actOpensAt('monthly-reflection') && (
        <>
          <h2 class="section">{act('monthly-reflection')?.name}</h2>
          <MonthlyReflectionCard notes={notes} today={today} />
        </>
      )}

      {stage >= actOpensAt('monthly-check') && (
        <>
          <h2 class="section">{act('monthly-check')?.name}</h2>
          <MonthlyCheckCard today={today} />
        </>
      )}

      {later && (
        <p class="note faint" data-testid="partner-later">
          {later}
        </p>
      )}

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}
