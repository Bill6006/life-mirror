import { useEffect, useState } from 'preact/hooks'
import { parseDay, type Block } from './blocks'
import type { Move } from './catalogue'
import { copy } from './copy'
import { getCheckIn, type StudyNight, type StudyReason } from './db'
import { fill } from './format'
import { useLive } from './live'
import { recordStudyNight, studyNightsAll, studyOfferMove } from './offerFlow'
import type { Weekday } from './settings'
import { checkReason, reasonPattern, smallerThan, STUDY_REASONS, type ReasonCheck } from './studyNight'

type Stage = 'offer' | 'why' | 'checked' | 'pattern'

/**
 * The study-night step, after the readings and the extras. Your next version, sized to one
 * sitting, with Start it or Not now. Not now asks why in one optional tap, checks the reason
 * against tonight's readings, says a contradiction plainly and offers the smaller version,
 * and says the pattern when there is one. You always decide.
 */
export function StudyNightStep({ day, block, onDone }: { day: string; block: Block; onDone: () => void }) {
  const record = useLive(() => getCheckIn(day, block), [day, block])
  const history = useLive(studyNightsAll, [])
  const [move, setMove] = useState<Move | null | undefined>(undefined)
  const [stage, setStage] = useState<Stage>('offer')
  const [reason, setReason] = useState<StudyReason | null>(null)
  const [check, setCheck] = useState<ReasonCheck>({ supported: null, evidence: null })
  const [pattern, setPattern] = useState<string | null>(null)
  const c = copy.study

  useEffect(() => {
    void studyOfferMove(day).then(setMove)
  }, [day])

  // Nothing left to offer tonight: step aside without a word.
  useEffect(() => {
    if (move === null) onDone()
  }, [move])

  if (move === undefined || move === null || record === undefined || !history) return <section class="screen" />

  const answers = record?.answers ?? {}
  const smaller = smallerThan(move)
  const weekday = parseDay(day).getDay() as Weekday

  function finish(decision: 'started' | 'smaller' | 'notNow', why: StudyReason | null, result: ReasonCheck) {
    if (!move) return
    void recordStudyNight(day, move, decision, why, result, smaller).then(onDone)
  }

  function chooseReason(why: StudyReason | null) {
    if (!move) return
    if (why === null) return finish('notNow', null, { supported: null, evidence: null })
    const result = checkReason(why, answers)
    const tonight: StudyNight = { day, weekday, offerId: null, offeredMoveId: move.id, decision: 'notNow', reason: why, supported: result.supported, evidence: result.evidence, smallerMoveId: null, at: '' }
    const found = reasonPattern(history ?? [], tonight)
    setReason(why)
    setCheck(result)
    setPattern(found)
    if (result.supported === false && smaller) return setStage('checked')
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
          <h1 class="title">{move.name}</h1>
          <p class="note">{move.what}</p>
          <p class="note faint">{fill(c.sized, { n: String(move.minutes) })}</p>
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
          <h1 class="title">{move.name}</h1>
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

      {stage === 'checked' && reason && smaller && (
        <>
          <div class="calc" data-testid="study-check">
            <p class="calc-line ink">{fill(c.said, { reason: c.reasons[reason].toLowerCase(), evidence: check.evidence ?? '' })}</p>
            {pattern && <p class="calc-line">{pattern}</p>}
          </div>
          <h1 class="title">{fill(c.smaller, { name: smaller.name })}</h1>
          <p class="note">{smaller.what}</p>
          <p class="note faint">{fill(c.sized, { n: String(smaller.minutes) })}</p>
          <button type="button" class="pill-ink" data-testid="study-start-smaller" onClick={() => finish('smaller', reason, check)}>
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
