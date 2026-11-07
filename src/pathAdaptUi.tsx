import { useState } from 'preact/hooks'
import { addDays, blockAt } from './blocks'
import { moveById, pathReps, type Move, type Path, type PathId, type SettingKind } from './catalogue'
import { copy } from './copy'
import { db, getDayContext, getSettings, type PathAdaptation } from './db'
import { fill, formatDayShort } from './format'
import { useLive } from './live'
import type { Proposal } from './pathAdapt'
import { changeWords, declineProposal, proposalsFor, setTap, stagesShort, undoChange, useProposal } from './pathAdaptFlow'
import { defaultSetting, offerable, pathName, pathToday, socialEnergyOn, stageWords, type PathToday } from './pathStage'

// How a Path runs for you, on its card (P6 of the AI-generated Paths design, 2026-11-07): the changes you took, each with
// its origin, why and Undo; what the record suggests, each with Use it and Not now; a rep set aside for safety said in
// front; and a sheet of your stage's reps and the kinds of setting, where each tap changes how the Path runs at once.

/** Days a rep set aside for safety is said in front of the card. */
const SAFETY_SHOWN_DAYS = 14

/** This Path's rows of the log and what the record suggests now. */
export function useForYou(pt: PathToday, today: string): { rows: PathAdaptation[]; proposals: Proposal[] } | null {
  const rows = useLive(() => db.pathAdaptations.where('path').equals(pt.path.id).toArray(), [pt.path.id])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  if (!rows || !outcomes) return null
  return { rows, proposals: proposalsFor(pt, outcomes, rows, today) }
}

/** The Details row's second line, while the record suggests something. */
export function suggestionsSub(n: number): string | undefined {
  const c = copy.path.adapt.suggestedSub
  return n === 0 ? undefined : n === 1 ? c.one : fill(c.many, { n: String(n) })
}

function originWords(r: Pick<PathAdaptation, 'origin'>): string {
  const c = copy.path.adapt
  return fill(c.origin, { origin: c.origins[r.origin] })
}

/** A rep set aside for safety lately, said in front of the card, with the Path's own fixed help when it has a start. */
export function SafetyNotice({ path, rows, today }: { path: Path; rows: readonly PathAdaptation[]; today: string }) {
  const recent = rows.filter((r) => r.state === 'applied' && r.origin === 'safety' && r.kind === 'setAside' && r.day >= addDays(today, -SAFETY_SHOWN_DAYS))
  if (!recent.length) return null
  return (
    <div data-testid="path-safety">
      {recent.map((r) => (
        <p key={r.id} class="note ink" data-testid="path-safety-line">
          {fill(copy.path.adapt.safetyShown, { rep: r.rep ? moveById(r.rep).name : '' })}
        </p>
      ))}
      {path.start && (
        <p class="note" data-testid="path-safety-help">
          {path.start.help}
        </p>
      )}
    </div>
  )
}

/** Under Details: what the record suggests, then the changes you took, newest first, each kept as undone once undone. */
export function PathChanges({ path, rows, proposals, onFit }: { path: Path; rows: readonly PathAdaptation[]; proposals: readonly Proposal[]; onFit?: () => void }) {
  const c = copy.path.adapt
  const kept = rows.filter((r) => r.state !== 'declined').sort((a, b) => (a.state === b.state ? (a.at < b.at ? 1 : -1) : a.state === 'applied' ? -1 : 1))
  return (
    <div class="calc evidence" data-testid="path-for-you">
      {proposals.length > 0 && (
        <>
          <p class="calc-line ink">{c.suggested}</p>
          {proposals.map((p) => (
            <div key={p.key} class="ev" data-testid="path-suggestion" data-kind={p.kind}>
              <span class="calc-key">{changeWords(path, p)}</span>
              <span class="calc-line">{originWords(p)}</span>
              <span class="calc-line">{p.why}</span>
              <div class="actions">
                <button type="button" class="pill-quiet" data-testid="path-suggestion-use" onClick={() => void useProposal(path, p)}>
                  {c.use}
                </button>
                <button type="button" class="textbtn" data-testid="path-suggestion-not-now" onClick={() => void declineProposal(path, p)}>
                  {c.notNow}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      <p class="calc-line ink">{c.changes}</p>
      {kept.length === 0 ? (
        <p class="calc-line" data-testid="path-changes-none">
          {c.changesNone}
        </p>
      ) : (
        kept.map((r) => (
          <div key={r.id} class="ev" data-testid="path-change-row" data-state={r.state} data-kind={r.kind}>
            <span class="calc-key">{changeWords(path, r)}</span>
            <span class="calc-line">
              {originWords(r)} · {formatDayShort(r.day)}
            </span>
            <span class="calc-line">{r.why}</span>
            {r.state === 'applied' ? (
              <div class="actions">
                <button type="button" class="textbtn" data-testid="path-change-undo" onClick={() => void undoChange(r.id as number)}>
                  {c.undo}
                </button>
              </div>
            ) : (
              <span class="calc-line" data-testid="path-change-undone">
                {c.undone} · {formatDayShort(blockAt(new Date(r.stateAt)).day)}
              </span>
            )}
          </div>
        ))
      )}
      {onFit && (
        <div class="actions">
          <button type="button" class="textbtn" data-testid="path-fit-open" onClick={onFit}>
            {c.fit}
          </button>
        </div>
      )}
    </div>
  )
}

/** A rep's state on the sheet, from the applied rows alone. */
function repState(rows: readonly PathAdaptation[], id: string): { safety: boolean; aside: boolean; prefer: boolean } {
  const on = rows.filter((r) => r.state === 'applied' && r.rep === id)
  const safety = on.some((r) => r.kind === 'setAside' && r.origin === 'safety')
  const aside = on.some((r) => r.kind === 'setAside')
  return { safety, aside, prefer: !aside && on.some((r) => r.kind === 'prefer') }
}

/** A kind of setting's name, said on its own: its first letter capital. */
function capitalised(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Every kind of setting the Path's reps can happen in, in the catalogue's order. */
function kindsOf(path: Path): SettingKind[] {
  const used = new Set(pathReps(path.id as PathId).flatMap((m) => (m.settings?.length ? m.settings : [defaultSetting(m)])))
  return (Object.keys(copy.catalogue.paths.settingNames) as SettingKind[]).filter((k) => used.has(k))
}

/** The sheet: your stage's reps, each preferred or not for you, and the kinds of setting, each one you don't have. */
export function PathFitScreen({ aimId, onClose }: { aimId: number; onClose: () => void }) {
  const now = new Date()
  const { day, block } = blockAt(now)
  const aim = useLive(() => db.aims.get(aimId).then((a) => a ?? null), [aimId])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const marks = useLive(() => db.pathMarks.toArray(), [])
  const settings = useLive(getSettings, [])
  const ctx = useLive(() => getDayContext(day), [day])
  const todays = useLive(() => db.checkins.where('day').equals(day).toArray(), [day])
  const adaptations = useLive(() => db.pathAdaptations.toArray(), [])
  const [refused, setRefused] = useState<{ rep: string; words: string } | null>(null)
  if (aim === undefined || !offers || !outcomes || !marks || !settings || ctx === undefined || !todays || !adaptations) return <section class="screen" />
  if (aim === null || aim.kind !== 'path') {
    onClose()
    return <section class="screen" />
  }
  const c = copy.path.adapt
  const pt = pathToday({ aim, offers, outcomes, ctx, day, block, socialEnergy: socialEnergyOn(todays, day), marks, online: settings.partnerOnline, faithHidden: settings.hideFaith, adaptations })
  const mine = adaptations.filter((r) => r.path === pt.path.id)
  const strands = pt.strands.map((t) => ({ t, reps: pathReps(pt.path.id, t.state.stage, pt.path.strands?.length ? t.strand.id : undefined).filter((m) => offerable(m) && !(settings.hideFaith && m.hiddenWith === 'faith')) }))
  const tapPrefer = async (m: Move, on: boolean) => {
    setRefused(null)
    if (on && repState(mine, m.id).aside) await setTap(pt, 'setAside', { rep: m.id }, false)
    await setTap(pt, 'prefer', { rep: m.id }, on)
  }
  const tapAside = async (m: Move, on: boolean) => {
    const words = await setTap(pt, 'setAside', { rep: m.id }, on)
    if (words) return setRefused({ rep: m.id, words })
    setRefused(null)
    if (on && repState(mine, m.id).prefer) await setTap(pt, 'prefer', { rep: m.id }, false)
  }
  const none = new Set(mine.filter((r) => r.state === 'applied' && r.kind === 'noSetting').map((r) => r.setting))
  // What your changes leave a stage on: too few different reps to move on, said plainly, never refused (a kind you don't have is a fact).
  const short = stagesShort(pt)
  return (
    <section class="screen" data-testid="path-fit">
      <header class="screen-head">
        <p class="eyebrow">{c.fitTitle}</p>
      </header>
      <h1 class="title">{pathName(pt.path)}</h1>
      <p class="note faint">{c.fitNote}</p>
      <p class="setting-label">{c.fitReps}</p>
      {strands.map(({ t, reps }) => (
        <div key={t.strand.id} class="card pad" data-testid="path-fit-strand" data-strand={t.strand.id}>
          <p class="calc-line ink">{pt.path.strands?.length ? `${t.strand.name} · ${t.strand.stages.find((s) => s.n === t.state.stage)?.name ?? ''}` : stageWords(pt.path, t.state.stage)}</p>
          {reps.map((m) => {
            const s = repState(mine, m.id)
            return (
              <div key={m.id} class="ease" data-testid="path-fit-rep" data-rep={m.id}>
                <span class="sub ink">{m.name}</span>
                {s.safety ? (
                  <span class="sub" data-testid="path-fit-safety">
                    {fill(c.safetyShown, { rep: m.name })}
                  </span>
                ) : (
                  <span class="when" role="group" aria-label={m.name}>
                    <button type="button" class={s.prefer ? 'when-chip is-on' : 'when-chip'} aria-pressed={s.prefer} data-testid="path-fit-prefer" onClick={() => void tapPrefer(m, !s.prefer)}>
                      {c.prefer}
                    </button>
                    <button type="button" class={s.aside ? 'when-chip is-on' : 'when-chip'} aria-pressed={s.aside} data-testid="path-fit-aside" onClick={() => void tapAside(m, !s.aside)}>
                      {c.notForMe}
                    </button>
                  </span>
                )}
                {refused?.rep === m.id && (
                  <span class="sub" data-testid="path-fit-refused">
                    {refused.words}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <p class="setting-label">{c.fitSettings}</p>
      <div class="card pad" data-testid="path-fit-settings">
        {kindsOf(pt.path).map((k) => (
          <div key={k} class="ease" data-testid="path-fit-setting" data-setting={k}>
            <span class="sub ink">{capitalised(copy.catalogue.paths.settingNames[k])}</span>
            <span class="when" role="group" aria-label={copy.catalogue.paths.settingNames[k]}>
              <button type="button" class={none.has(k) ? 'when-chip is-on' : 'when-chip'} aria-pressed={none.has(k)} data-testid="path-fit-no-setting" onClick={() => void setTap(pt, 'noSetting', { setting: k }, !none.has(k))}>
                {c.noSetting}
              </button>
            </span>
          </div>
        ))}
        {short.length > 0 && (
          <p class="note" data-testid="path-fit-short">
            {fill(c.short, { stages: short.join(', ') })}
          </p>
        )}
      </div>
      <div class="actions">
        <button type="button" class="textbtn" data-testid="path-fit-close" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}
