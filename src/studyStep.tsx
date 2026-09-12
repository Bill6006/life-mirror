import { useEffect, useState } from 'preact/hooks'
import { parseDay, type Block } from './blocks'
import { copy } from './copy'
import { getCheckIn, type StudyNight, type StudyReason } from './db'
import { fill } from './format'
import type { Sitting } from './ladder'
import { useLive } from './live'
import { recordStudyNight, studyNightsAll, studyOfferSitting } from './offerFlow'
import type { Weekday } from './settings'
import { checkReason, reasonPattern, smallerOf, STUDY_REASONS, type ReasonCheck } from './studyNight'

type Stage = 'offer' | 'why' | 'checked' | 'pattern'

const MINUTE_WORDS: Record<number, string> = { 5: 'Five', 10: 'Ten', 15: 'Fifteen', 20: 'Twenty' }

/** "Ten minutes of it instead?" for a rung of the ladder; "{version} instead?" for a catalogue version. */
function smallerTitle(smaller: Sitting): string {
  if (smaller.kind === 'rung') return fill(copy.study.smallerMinutes, { n: MINUTE_WORDS[smaller.minutes] ?? String(smaller.minutes) })
  return fill(copy.study.smaller, { name: smaller.name })
}

/**
 * The study-night step, after the readings and the extras. Your next sitting: the proof
 * ladder's next rung when the certification is among your aims, else a study version, sized
 * to one sitting, with Start it or Not now. Not now asks why in one optional tap, checks the
 * reason against tonight's readings, says a contradiction plainly and offers the smaller
 * version, and says the pattern when there is one. You always decide.
 */
export function StudyNightStep({ day, block, onDone }: { day: string; block: Block; onDone: () => void }) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const history = useLive(studyNightsAll, [])
  const [sitting, setSitting] = useState<Sitting | null | undefined>(undefined)
  const [stage, setStage] = useState<Stage>('offer')
  const [reason, setReason] = useState<StudyReason | null>(null)
  const [check, setCheck] = useState<ReasonCheck>({ supported: null, evidence: null })
  const [pattern, setPattern] = useState<string | null>(null)
  const c = copy.study

  useEffect(() => {
    void studyOfferSitting(day).then(setSitting)
  }, [day])

  // Nothing left to offer tonight: step aside without a word.
  useEffect(() => {
    if (sitting === null) onDone()
  }, [sitting])

  if (sitting === undefined || sitting === null || record === undefined || !history) return <section class="screen" />

  const answers = record?.answers ?? {}
  const smaller = smallerOf(sitting)
  const weekday = parseDay(day).getDay() as Weekday

  function finish(decision: 'started' | 'smaller' | 'notNow', why: StudyReason | null, result: ReasonCheck) {
    if (!sitting) return
    void recordStudyNight(day, sitting, decision, why, result, smaller).then(onDone)
  }

  function chooseReason(why: StudyReason | null) {
    if (!sitting) return
    if (why === null) return finish('notNow', null, { supported: null, evidence: null })
    const result = checkReason(why, answers)
    const tonight: StudyNight = { day, weekday, offerId: null, offeredMoveId: sitting.id, decision: 'notNow', reason: why, supported: result.supported, evidence: result.evidence, smallerMoveId: null, at: '' }
    const found = reasonPattern(history ?? [], tonight)
    setReason(why)
    setCheck(result)
    setPattern(found)
    if (result.supported === false) return setStage('checked')
    if (found) return setStage('pattern')
    finish('notNow', why, result)
  }

  return (
    <section class="screen" data-testid="study-step">
      <header class="screen-head">
        <p class="eyebrow">{c.eyebrow}</p>
      </header>

      {stage === 'offer' && (
        <>
          <h1 class="title">{sitting.name}</h1>
          <p class="note">{sitting.what}</p>
          <p class="note faint">{fill(c.sized, { n: String(sitting.minutes) })}</p>
          <button type="button" class="pill-ink" data-testid="study-start" onClick={() => finish('started', null, { supported: null, evidence: null })}>
            {c.start}
          </button>
          <div class="actions">
            <button type="button" class="textbtn" data-testid="study-not-now" onClick={() => setStage('why')}>
              {c.notNow}
            </button>
          </div>
        </>
      )}

      {stage === 'why' && (
        <>
          <h1 class="title">{sitting.name}</h1>
          <p class="note">{c.whyQuestion}</p>
          <div class="card">
            <ul class="rows">
              {STUDY_REASONS.map((r) => (
                <li key={r}>
                  <button type="button" class="row anchor" data-testid={`study-reason-${r}`} onClick={() => chooseReason(r)}>
                    <span class="anchor-mark" aria-hidden="true" />
                    <span class="row-main">{c.reasons[r]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="textbtn" onClick={() => chooseReason(null)}>
              {c.leave}
            </button>
          </div>
        </>
      )}

      {stage === 'checked' && reason && (
        <>
          <div class="calc" data-testid="study-check">
            <p class="calc-line ink">{fill(c.said, { reason: c.reasons[reason].toLowerCase(), evidence: check.evidence ?? '' })}</p>
            {pattern && <p class="calc-line">{pattern}</p>}
          </div>
          {smaller ? (
            <>
              <h1 class="title">{smallerTitle(smaller)}</h1>
              <p class="note">{smaller.what}</p>
              <p class="note faint">{fill(c.sized, { n: String(smaller.minutes) })}</p>
            </>
          ) : (
            <>
              <h1 class="title">{sitting.name}</h1>
              <p class="note faint">{c.smallest}</p>
            </>
          )}
          <button type="button" class="pill-ink" data-testid="study-start-smaller" onClick={() => finish(smaller ? 'smaller' : 'started', reason, check)}>
            {c.start}
          </button>
          <div class="actions">
            <button type="button" class="textbtn" data-testid="study-not-now-final" onClick={() => finish('notNow', reason, check)}>
              {c.notNow}
            </button>
          </div>
        </>
      )}

      {stage === 'pattern' && reason && (
        <>
          <div class="calc" data-testid="study-pattern">
            <p class="calc-line ink">{pattern}</p>
          </div>
          <div class="actions">
            <button type="button" class="pill-quiet" onClick={() => finish('notNow', reason, check)}>
              {c.continue}
            </button>
          </div>
        </>
      )}

      <p class="note faint">{c.note}</p>
    </section>
  )
}
