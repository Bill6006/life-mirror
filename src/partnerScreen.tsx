import { useState } from 'preact/hooks'
import { addDays, dayKey } from './blocks'
import { NavRow, SwitchRow } from './controls'
import { copy } from './copy'
import { db, getSettings, PARTNER_STEPS, updateSettings, type MonthlyCheck, type PartnerStep, type PathMark, type Reflection } from './db'
import { fill, formatDayShort, formatDayTiny } from './format'
import { useLive } from './live'
import { addMilestone, CHECK_KEYS, checkPromptShown, checkShowsHelp, checkThisMonth, DECIDING, declareDate, declareStage, deleteMark, deleteReflection, monthlyChecks, pathMarks, reflections, saveMonthlyCheck, saveReflection } from './pathFlow'
import { declaredStage, pathById, pathEntries, stageOf, stageWords, type PathToday } from './pathStage'

// The Partner path's own controls (Part 27). On its card: a date declared with its day, the next
// stage declared in one tap, the online channel's switch, and the door to its notes and checks.
// On that screen: what you declared, milestones, reflections, and from Deciding on your values, a
// note before each step and the monthly check, whose fixed help the app shows itself, inside the
// check alone and only on a yes to its safety or its conduct question. Nothing here holds a name,
// a place, a rating or anyone else's answer, and nothing gates a declaration.

const partner = () => pathById('partner')

/** The act's content, from the catalogue: what the screen shows is what you read and Greened. */
function act(id: string) {
  return partner().acts?.find((a) => a.id === id)
}


/** On the Partner card: the date chips, the next stage, the online switch, and Notes and checks. */
export function PartnerExtras({ pt, paused, lightOnly, today, onNotes }: { pt: PathToday; paused: boolean; lightOnly: boolean; today: string; onNotes: () => void }) {
  const marks = useLive(() => pathMarks('partner'), [])
  const settings = useLive(getSettings, [])
  const checks = useLive(monthlyChecks, [])
  if (!marks || !settings || !checks) return null
  const c = copy.path.partner
  const notes = (
    <ul class="rows">
      <NavRow label={c.notes} note={c.notesNote} onClick={onNotes} />
    </ul>
  )
  if (paused) return <div class="calc">{notes}</div>
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const dateOn = (day: string) => marks.find((m) => m.kind === 'date' && m.day === day)
  const stage = pt.state.stage
  const next = pt.path.stages.find((s) => s.n === stage + 1)
  const canDeclare = next !== undefined && (next.advance ?? 'counts') === 'declared' && stage >= (pt.path.stages.find((s) => s.advance === 'declared')?.n ?? Infinity)
  const lastStage = marks.filter((m) => m.kind === 'stage').sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  const checkOpen = checkPromptShown(stage, lightOnly, checks, today)
  return (
    <div class="calc" data-testid="partner-extras">
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
      {(canDeclare || lastStage) && <p class="note faint">{c.declareNote}</p>}

      <SwitchRow label={c.online} note={c.onlineNote} on={settings.partnerOnline} testid="partner-online" onChange={(on) => void updateSettings((s) => ({ ...s, partnerOnline: on }))} />

      {checkOpen && (
        <p class="calc-line" data-testid="partner-check-open">
          {c.checkOpen}
        </p>
      )}
      {notes}
    </div>
  )
}

/** A note typed and saved whole: values, or one step's decide-don't-slide note. Empty and saved, it is removed. */
function NoteEditor({ saved, placeholder, testid, onSave }: { saved: Reflection | undefined; placeholder: string; testid: string; onSave: (text: string) => Promise<void> }) {
  const c = copy.partnerNotes
  const [text, setText] = useState<string | null>(null)
  const value = text ?? saved?.text ?? ''
  const changed = text !== null && text.trim() !== (saved?.text ?? '')
  return (
    <>
      <textarea class="input note-input" rows={4} placeholder={placeholder} value={value} data-testid={testid} onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
      <div class="actions">
        <button type="button" class="pill-quiet" disabled={!changed} data-testid={`${testid}-save`} onClick={() => void onSave(value).then(() => setText(null))}>
          {c.save}
        </button>
        {saved && !changed && <span class="note faint no-gap">{fill(c.saved, { day: formatDayShort(saved.day) })}</span>}
      </div>
    </>
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

/** Notes and checks: what you declared, milestones, reflections, and from Deciding on the rest. */
export function PartnerNotesScreen({ onClose }: { onClose: () => void }) {
  const today = dayKey(new Date())
  const marks = useLive(() => pathMarks('partner'), [])
  const notes = useLive(() => reflections('partner'), [])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const [milestone, setMilestone] = useState('')
  const [reflection, setReflection] = useState('')
  if (!marks || !notes || !offers || !outcomes) return <section class="screen" />
  const c = copy.partnerNotes
  const path = partner()
  const stage = stageOf(path, pathEntries('partner', offers, outcomes), today, declaredStage(path, marks, today)).stage
  const newest = (a: { at?: string; updatedAt?: string }, b: { at?: string; updatedAt?: string }) => ((a.at ?? a.updatedAt ?? '') < (b.at ?? b.updatedAt ?? '') ? 1 : -1)
  const declared = marks.filter((m) => m.kind === 'stage' || m.kind === 'date').sort(newest)
  const milestones = marks.filter((m) => m.kind === 'milestone').sort(newest)
  const stepMark = (s: PartnerStep) => milestones.find((m) => m.note === c.steps[s])
  const kept = notes.filter((r) => r.kind === 'reflection').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const values = notes.find((r) => r.kind === 'values')
  const decide = (s: PartnerStep) => notes.find((r) => r.kind === 'decide' && r.step === s)
  const course = act('relationship-education')
  const markLine = (m: PathMark) => (m.kind === 'date' ? fill(c.dateLine, { day: formatDayShort(m.day) }) : fill(c.stageLine, { stage: stageWords(path, m.stage ?? 1), day: formatDayShort(m.day) }))
  return (
    <section class="screen" data-testid="partner-notes">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{stageWords(path, stage)}</p>
      <p class="note faint">{c.privacy}</p>

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

      {stage >= DECIDING ? (
        <>
          <h2 class="section">{act('values-note')?.name}</h2>
          <div class="card pad" data-testid="partner-values">
            <p class="note faint">{act('values-note')?.what}</p>
            <NoteEditor saved={values} placeholder={c.valuesPlaceholder} testid="partner-values-input" onSave={(text) => saveReflection('partner', 'values', text)} />
          </div>

          <h2 class="section">{act('decide-dont-slide')?.name}</h2>
          <div class="card pad" data-testid="partner-decide">
            <p class="note faint">{act('decide-dont-slide')?.what}</p>
            {PARTNER_STEPS.map((s) => (
              <div key={s} class="calc" data-testid={`partner-decide-${s}`}>
                <p class="calc-line ink">{c.stepNames[s]}</p>
                <NoteEditor saved={decide(s)} placeholder={c.decidePlaceholder} testid={`partner-decide-${s}-input`} onSave={(text) => saveReflection('partner', 'decide', text, s)} />
                {s === 'engagement' && course && (
                  <p class="note faint" data-testid="partner-course">
                    {course.name}: {course.what}
                  </p>
                )}
              </div>
            ))}
          </div>

          <h2 class="section">{act('monthly-check')?.name}</h2>
          <MonthlyCheckCard today={today} />
        </>
      ) : (
        <p class="note faint" data-testid="partner-from-deciding">
          {c.fromDeciding}
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
