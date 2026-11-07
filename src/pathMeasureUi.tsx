import { useEffect, useRef, useState } from 'preact/hooks'
import { blockAt, daysBetween } from './blocks'
import { hasMove, moveById, ONE_STRAND, paths, type Path, type PathId } from './catalogue'
import { copy } from './copy'
import { db, EXPECTANCIES, type Aim, type Outcome } from './db'
import { fill } from './format'
import { useLive } from './live'
import { checkRecording, deleteRecording, recordingFor, recordingList, saveRecording, setOtherChecks, setRepSheet, setStrands } from './measureFlow'
import { setExpectancy } from './pathFlow'
import { calibration, measuredReps, recordingsDue, type Behaviour } from './pathMeasure'
import { StageProgress } from './ui'
import type { PathToday } from './pathStage'

// A measured Path on the screen (P2 and P4 of the AI-generated Paths design, 2026-11-06): each strand
// on, with its stage, practice apart from what is shown, and what has come back; one optional line
// before Start; right after Done, the behaviours you did and how hard it was; a recording of yourself,
// kept on this phone and checked the next day or later; the phone handed to someone who was there; and
// why the Path is built as it is. Your own behaviours alone, never anyone's reaction.

export const EFFORTS: readonly NonNullable<Outcome['effort']>[] = [1, 2, 3, 4, 5]

/** Whether a Path measures its reps. Social and Partner do not. */
export function measured(path: Pick<Path, 'measurement'>): boolean {
  return Boolean(path.measurement)
}

/** The behaviours a rep's strand checks, on its Path. */
export function behavioursOf(path: Pick<Path, 'id' | 'measurement'>, moveId: string): readonly Behaviour[] {
  if (!hasMove(moveId)) return []
  const strand = moveById(moveId).path?.[path.id as PathId]?.strand ?? ONE_STRAND
  return path.measurement?.strands.find((s) => s.strand === strand)?.behaviours ?? []
}

/** Whether a rep's strand hands the phone over, and the rep is done with someone there. */
export function handsOver(path: Pick<Path, 'id' | 'measurement'>, moveId: string): boolean {
  if (!hasMove(moveId)) return false
  const m = moveById(moveId)
  const strand = m.path?.[path.id as PathId]?.strand ?? ONE_STRAND
  return Boolean(path.measurement?.strands.find((s) => s.strand === strand)?.handOver) && m.with === 'adult'
}

/** Whether a rep is one you record of yourself, on a strand that records. */
export function records(path: Pick<Path, 'id' | 'measurement'>, moveId: string): boolean {
  if (!hasMove(moveId)) return false
  const m = moveById(moveId)
  const strand = m.path?.[path.id as PathId]?.strand ?? ONE_STRAND
  return Boolean(m.record) && Boolean(path.measurement?.strands.find((s) => s.strand === strand)?.record)
}

/** A day in words beside today: today, yesterday, or so many days ago. */
function whenWords(day: string, today: string): string {
  const n = daysBetween(day, today)
  return n <= 0 ? copy.when.today : n === 1 ? copy.when.yesterday : fill(copy.when.daysAgo, { n: String(n) })
}

/** A size in words: kilobytes below a megabyte, else megabytes to one place. */
export function sizeWords(bytes: number): string {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
}

function minutesAndSeconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A set of toggles, one per choice, each pressed or not. */
function Toggles<T extends string | number>({ label, items, on, words, testid, onTap, narrow = false }: { label: string; items: readonly T[]; on: (x: T) => boolean; words: (x: T) => string; testid: string; onTap: (x: T) => void; narrow?: boolean }) {
  // A chip of one figure is drawn as wide as its tap area, so five of them in a row keep their areas apart.
  const base = narrow ? 'when-chip is-figure' : 'when-chip'
  return (
    <span class="when" role="group" aria-label={label}>
      {items.map((x) => (
        <button key={String(x)} type="button" class={on(x) ? `${base} is-on` : base} aria-pressed={on(x)} data-testid={`${testid}-${x}`} onClick={() => onTap(x)}>
          {words(x)}
        </button>
      ))}
    </span>
  )
}

/** Each strand you have on: its stage, practice apart from what the stage has shown, and what has come back. */
export function StrandsBlock({ pt }: { pt: PathToday }) {
  const c = copy.path.measure
  const cap = pt.path.measurement?.cap ?? 0
  return (
    <div class="strands" data-testid="path-strands">
      {pt.strands.map((s) => {
        const st = s.strand.stages.find((x) => x.n === s.state.stage)
        const next = s.strand.stages.find((x) => x.n === s.state.stage + 1)?.name ?? null
        const m = s.measure
        const last = s.state.stage >= s.strand.stages.length
        return (
          <div key={s.strand.id} class="strand" data-testid="path-strand" data-strand={s.strand.id}>
            <p class="calc-line ink">{s.strand.name}</p>
            <StageProgress n={s.state.stage} of={s.strand.stages.length} name={st?.name ?? ''} next={next} testid="strand-progress" />
            {m && (
              <p class="calc-line" data-testid="strand-numbers">
                {m.gate ? fill(m.of === 1 ? c.numbersOne : c.numbers, { practised: String(m.practised), shown: String(m.shownIn), of: String(m.of) }) : fill(c.practised, { practised: String(m.practised) })}
                {m.gate && m.gate.confirmed > 0 && m.reading && ` · ${fill(c.outside, { c: String(Math.min(m.reading.confirmed, m.gate.confirmed)), need: String(m.gate.confirmed) })}`}
              </p>
            )}
            {m && last && (
              <p class="calc-line" data-testid="strand-last">
                {c.lastStage}
              </p>
            )}
            {m?.stuck && (
              <p class="note" data-testid="strand-stuck">
                {fill(c.stuck, { cap: String(cap) })}
              </p>
            )}
            {m && m.refresh.length > 0 && (
              <p class="note" data-testid="strand-refresh">
                {fill(c.refresh, { stages: m.refresh.map((n) => fill(c.refreshStage, { n: String(n) })).join(', ') })}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Before Start on a measured Path: one optional line, what you expect will happen. */
export function PredictBox({ onStart }: { onStart: (prediction: string) => void }) {
  const c = copy.path.measure
  const [line, setLine] = useState('')
  return (
    <div class="ease" data-testid="path-predict">
      <span class="sub">{c.predict}</span>
      <div class="add">
        <input class="input" type="text" maxLength={140} aria-label={c.predict} placeholder={c.predictPlaceholder} value={line} data-testid="path-predict-input" onInput={(e) => setLine((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="path-predict-start" onClick={() => onStart(line.trim())}>
          {c.startNow}
        </button>
      </div>
    </div>
  )
}

/**
 * Right after Done on a measured Path: the behaviours of the rep's strand you did, how hard it was, and
 * for a rep with someone there on a strand that hands over, the phone handed to them. A recorded rep is
 * checked on its recording the next day or later, so it asks only how hard it was.
 */
export function RepSheet({ path, offerId, moveId, onHandOver }: { path: Path; offerId: number; moveId: string; onHandOver?: (offerId: number) => void }) {
  const c = copy.path.measure
  const outcome = useLive(() => db.outcomes.where('offerId').equals(offerId).first().then((x) => x ?? null), [offerId])
  const offer = useLive(() => db.offers.get(offerId).then((x) => x ?? null), [offerId])
  if (outcome === undefined || offer === undefined) return null
  const behaviours = behavioursOf(path, moveId)
  const recorded = records(path, moveId)
  const checks = new Set(outcome?.checks ?? [])
  return (
    <div class="ease" data-testid="path-sheet">
      {offer?.prediction && (
        <span class="sub" data-testid="path-sheet-expected">
          {fill(c.expected, { line: offer.prediction })}
        </span>
      )}
      {!recorded && behaviours.length > 0 && (
        <>
          <span class="sub">{c.checksQuestion}</span>
          <Toggles
            label={c.checksQuestion}
            items={behaviours.map((b) => b.id)}
            on={(id) => checks.has(id)}
            words={(id) => behaviours.find((b) => b.id === id)?.words ?? id}
            testid="path-check"
            onTap={(id) => {
              const next = new Set(checks)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              void setRepSheet(offerId, { checks: behaviours.map((b) => b.id).filter((x) => next.has(x)) })
            }}
          />
        </>
      )}
      {recorded && (
        <span class="sub" data-testid="path-sheet-recorded">
          {c.recordedNote}
        </span>
      )}
      {/* Against what you expected: the words the app already has (stage 3, item 5), reflection only. */}
      <span class="sub">{copy.path.expect.question}</span>
      <Toggles label={copy.path.expect.question} items={EXPECTANCIES} on={(e) => outcome?.expectancy === e} words={(e) => copy.path.expect.options[e]} testid="path-sheet-expect" onTap={(e) => void setExpectancy(offerId, outcome?.expectancy === e ? null : e)} />
      <span class="sub">{c.effortQuestion}</span>
      <Toggles label={c.effortQuestion} items={EFFORTS} on={(n) => outcome?.effort === n} words={(n) => String(n)} testid="path-effort" narrow onTap={(n) => void setRepSheet(offerId, { effort: outcome?.effort === n ? null : n })} />
      {onHandOver && handsOver(path, moveId) && (
        <div class="actions">
          <button type="button" class="textbtn" data-testid="path-hand-over" onClick={() => onHandOver(offerId)}>
            {outcome?.otherAt ? `${c.handOver} ✓` : c.handOver}
          </button>
        </div>
      )}
    </div>
  )
}

/** While a rep you record is started: Record, then Stop; the sound is kept on this phone alone. */
export function Recorder({ offerId }: { offerId: number }) {
  const c = copy.path.measure
  const saved = useLive(() => recordingFor(offerId).then((r) => (r ? { ms: r.ms } : null)), [offerId])
  const [state, setState] = useState<'idle' | 'recording' | 'unavailable'>('idle')
  const [ms, setMs] = useState(0)
  const live = useRef<{ recorder: MediaRecorder; stream: MediaStream; t0: number } | null>(null)
  useEffect(() => {
    if (state !== 'recording') return
    const t = setInterval(() => setMs(performance.now() - (live.current?.t0 ?? performance.now())), 250)
    return () => clearInterval(t)
  }, [state])
  // Leaving the screen stops a recording: what was said so far is kept.
  useEffect(() => () => {
    if (live.current?.recorder.state === 'recording') live.current.recorder.stop()
  }, [])
  const start = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setState('unavailable')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      const t0 = performance.now()
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        void saveRecording(offerId, audio, audio.type, Math.round(performance.now() - t0))
        live.current = null
        setState('idle')
      }
      live.current = { recorder, stream, t0 }
      recorder.start()
      setMs(0)
      setState('recording')
    } catch {
      setState('unavailable')
    }
  }
  if (saved === undefined) return null
  return (
    <div class="ease" data-testid="path-recorder">
      {state === 'unavailable' ? (
        <span class="sub" data-testid="path-recorder-none">
          {c.noMic}
        </span>
      ) : state === 'recording' ? (
        <>
          <span class="sub ink" data-testid="path-recording">
            {fill(c.recordingNow, { time: minutesAndSeconds(ms) })}
          </span>
          <div class="actions">
            <button type="button" class="pill-ink" data-testid="path-record-stop" onClick={() => live.current?.recorder.stop()}>
              {c.stop}
            </button>
          </div>
        </>
      ) : (
        <>
          {saved && (
            <span class="sub ink" data-testid="path-recorded">
              {fill(c.recorded, { time: minutesAndSeconds(saved.ms) })}
            </span>
          )}
          <span class="sub">{c.recordNote}</span>
          <div class="actions">
            <button type="button" class={saved ? 'textbtn' : 'pill-quiet'} data-testid="path-record" onClick={() => void start()}>
              {saved ? c.again : c.record}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** The recordings of this Path's reps waiting to be checked: recorded before today, the rep answered, not checked yet. */
export function RecordingsDue({ pt, today, onCheck }: { pt: PathToday; today: string; onCheck: (offerId: number) => void }) {
  const c = copy.path.measure
  const list = useLive(recordingList, [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  if (!list || !outcomes) return null
  const mine = new Set(pt.entries.map((e) => e.offerId))
  const due = recordingsDue(list.filter((r) => mine.has(r.offerId)), outcomes, today, (at) => blockAt(new Date(at)).day)
  if (!due.length) return null
  return (
    <div class="calc" data-testid="path-recordings">
      <p class="calc-line ink">{c.recordings}</p>
      {due.map((r) => {
        const e = pt.entries.find((x) => x.offerId === r.offerId)
        return (
          <p key={r.offerId} class="calc-line" data-testid="path-recording-due">
            {fill(c.recordingLine, { rep: e && hasMove(e.moveId) ? moveById(e.moveId).name : '', when: whenWords(blockAt(new Date(r.at)).day, today) })}
            {' · '}
            <button type="button" class="textbtn inline" data-testid="path-recording-check" onClick={() => onCheck(r.offerId)}>
              {c.checkIt}
            </button>
          </p>
        )
      })}
    </div>
  )
}

/** The rep a recording or a hand-over is for: its offer, its answer and its Path. */
function useRep(offerId: number) {
  const offer = useLive(() => db.offers.get(offerId).then((x) => x ?? null), [offerId])
  const outcome = useLive(() => db.outcomes.where('offerId').equals(offerId).first().then((x) => x ?? null), [offerId])
  const path = offer ? (paths.find((p) => p.measurement && offer.paths?.includes(p.id)) ?? null) : null
  return { offer, outcome, path }
}

/** A recording checked, the next day or later: one line first on what you think went wrong, then the sound, then the behaviours it shows. */
export function RecordingCheckScreen({ offerId, onClose }: { offerId: number; onClose: () => void }) {
  const c = copy.path.measure
  const { offer, outcome, path } = useRep(offerId)
  const rec = useLive(() => recordingFor(offerId).then((x) => x ?? null), [offerId])
  const [note, setNote] = useState('')
  const [play, setPlay] = useState(false)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!rec) return
    const u = URL.createObjectURL(rec.audio)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [rec?.id])
  if (offer === undefined || outcome === undefined || rec === undefined) return <section class="screen" />
  if (!offer || !path) {
    onClose()
    return <section class="screen" />
  }
  const behaviours = behavioursOf(path, offer.moveId)
  const chosen = picked ?? new Set(outcome?.recordingChecks ?? [])
  return (
    <section class="screen" data-testid="recording-check">
      <header class="screen-head">
        <p class="eyebrow">{c.checkTitle}</p>
      </header>
      <h1 class="title">{hasMove(offer.moveId) ? moveById(offer.moveId).name : ''}</h1>
      {rec ? (
        <>
          <p class="setting-label">{c.checkFirst}</p>
          <div class="add">
            <input class="input" type="text" maxLength={140} aria-label={c.checkFirst} value={note} data-testid="recording-note" onInput={(e) => setNote((e.currentTarget as HTMLInputElement).value)} />
          </div>
          <p class="setting-label">{c.checkPlay}</p>
          {play || note.trim() ? (
            url && <audio class="rec-audio" controls src={url} data-testid="recording-audio" />
          ) : (
            <div class="actions">
              <button type="button" class="textbtn" data-testid="recording-play" onClick={() => setPlay(true)}>
                {c.checkPlay}
              </button>
            </div>
          )}
        </>
      ) : null}
      <p class="setting-label">{c.checkWhich}</p>
      <Toggles
        label={c.checkWhich}
        items={behaviours.map((b) => b.id)}
        on={(id) => chosen.has(id)}
        words={(id) => behaviours.find((b) => b.id === id)?.words ?? id}
        testid="recording-check"
        onTap={(id) => {
          const next = new Set(chosen)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          setPicked(next)
        }}
      />
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="recording-save" onClick={() => void checkRecording(offerId, note, behaviours.map((b) => b.id).filter((x) => chosen.has(x))).then(onClose)}>
          {c.save}
        </button>
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
      {rec && (
        <div class="actions">
          <span class="sub" data-testid="recording-space">
            {fill(c.space, { size: sizeWords(rec.audio.size) })}
          </span>
          {deleting ? (
            <>
              <span class="sub">{c.deleteNote}</span>
              <button type="button" class="textbtn faint" data-testid="recording-delete-confirm" onClick={() => void deleteRecording(rec.id as number).then(onClose)}>
                {c.deleteRecording}
              </button>
            </>
          ) : (
            <button type="button" class="textbtn faint" data-testid="recording-delete" onClick={() => setDeleting(true)}>
              {c.deleteRecording}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** The phone handed to someone who was there: which of the behaviours they noticed, in large type, and no name kept. */
export function HandOverScreen({ offerId, onClose }: { offerId: number; onClose: () => void }) {
  const c = copy.path.measure
  const { offer, outcome, path } = useRep(offerId)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  if (offer === undefined || outcome === undefined) return <section class="screen" />
  if (!offer || !path) {
    onClose()
    return <section class="screen" />
  }
  const behaviours = behavioursOf(path, offer.moveId)
  const chosen = picked ?? new Set(outcome?.otherChecks ?? [])
  return (
    <section class="screen hand-over" data-testid="hand-over">
      <header class="screen-head">
        <h1 class="title">{c.handTitle}</h1>
      </header>
      <p class="note">{c.handLead}</p>
      <Toggles
        label={c.handLead}
        items={behaviours.map((b) => b.id)}
        on={(id) => chosen.has(id)}
        words={(id) => behaviours.find((b) => b.id === id)?.theirs ?? id}
        testid="hand-check"
        onTap={(id) => {
          const next = new Set(chosen)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          setPicked(next)
        }}
      />
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="hand-done" onClick={() => void setOtherChecks(offerId, behaviours.map((b) => b.id).filter((x) => chosen.has(x))).then(onClose)}>
          {c.handDone}
        </button>
      </div>
    </section>
  )
}

/** Your own checks beside an outside view, on the reps that have both: counts alone, side by side, once there is one. */
export function CalibrationLine({ pt }: { pt: PathToday }) {
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const m = pt.path.measurement
  if (!m || !outcomes) return null
  const reps = measuredReps(pt.entries, outcomes)
  const all = m.strands.flatMap((s) => s.behaviours)
  const cal = calibration(reps, all)
  if (!cal.reps) return null
  return (
    <p class="calc-line" data-testid="path-calibration">
      {fill(copy.path.measure.calibration, { n: String(cal.reps), yours: String(cal.yours), outside: String(cal.outside) })}
    </p>
  )
}

/** Why the Path is built as it is: each decision with what it rests on, how sure it is and what would change it. */
export function WhyBuilt({ path }: { path: Path }) {
  const c = copy.path.read
  if (!path.decisions?.length) return null
  return (
    <div class="calc evidence" data-testid="path-why-built">
      {path.decisions.map((d) => (
        <div key={d.id} class="ev" data-testid="path-decision">
          <span class="calc-key">{d.decision}</span>
          <span class="calc-line">{fill(c.restsOn, { origin: c.origins[d.origin] ?? d.origin, n: String(d.cards.length) })}</span>
          <span class="calc-line">{d.basis}</span>
          <span class="calc-line">{fill(c.unsure, { text: d.uncertainty })}</span>
          <span class="calc-line">{fill(c.wouldChange, { text: d.change })}</span>
        </div>
      ))}
    </div>
  )
}

/** The strands on, changed from the card's settings: never none. */
export function StrandsSetting({ aim, path, on }: { aim: Aim; path: Path; on: readonly string[] }) {
  const c = copy.path.measure
  const all = (path.strands ?? []).map((s) => s.id)
  return (
    <div class="ease" data-testid="path-strands-setting">
      <span class="sub">{c.strandsOn}</span>
      <Toggles
        label={c.strandsOn}
        items={all}
        on={(id) => on.includes(id)}
        words={(id) => path.strands?.find((s) => s.id === id)?.name ?? id}
        testid="path-strand-on"
        onTap={(id) => {
          const next = on.includes(id) ? on.filter((x) => x !== id) : all.filter((x) => x === id || on.includes(x))
          void setStrands(aim.id as number, next)
        }}
      />
      <span class="sub">{c.strandsNote}</span>
    </div>
  )
}
