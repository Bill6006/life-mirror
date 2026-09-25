import { useState } from 'preact/hooks'
import { aimsSnapshot } from './aimFlow'
import { deleteCloudCopy } from './cloudSync'
import { importHypothesis } from './learningFlow'
import { blockAt, dayKey } from './blocks'
import { copy } from './copy'
import { allCheckIns, allWins, db, getSettings, privateItems, updateSettings, wipeEverything } from './db'
import { buildExport } from './export'
import { fill, formatWhen } from './format'
import { useLive } from './live'
import { unsubscribePush } from './push'
import { shareOrDownload } from './share'
import { Disclosure } from './ui'
import { USAGE_TO_CLAUDE } from './brainShared'
import type { Fact } from './factTypes'
import type { UseSummary } from './usageFacts'
import { usageFactsToday, useSummary } from './useRead'

/** Rule 13 of the plan: anything recorded can be exported or deleted. Rule 11: private items stay out unless ticked, and so does the Partner path (Part 27). */
/** A screen's name for the use log's list: a tab, a Settings section, or a sub-screen. */
function screenName(id: string): string {
  const u = copy.useLog
  if (id in copy.tabs) return copy.tabs[id as keyof typeof copy.tabs]
  if (id.startsWith('settings:')) {
    const section = id.slice('settings:'.length)
    return `${copy.tabs.settings} · ${(copy.settingsNav as Record<string, unknown>)[section] ?? section}`
  }
  return (u.screenNames as Record<string, string>)[id] ?? id
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('{n}', String(n)))

/**
 * How you use the app (Part 34; Follow-up F1): counts over four weeks, and what Claude may be given
 * of them, word for word, behind one row. The full list of screens sits behind another.
 */
function UseCard({ use, given }: { use: UseSummary; given: readonly Fact[] }) {
  const u = copy.useLog
  const top = use.screens.slice(0, 3).map((s) => fill(u.screenItem, { what: screenName(s.what), n: String(s.n) })).join(' · ')
  return (
    <>
      <h2 class="section">{u.title}</h2>
      <div class="card pad" data-testid="use-log">
        <p class="note">{u.note}</p>
        <p class="calc-line" data-testid="use-checkins">
          {fill(u.checkins, { opened: String(use.checkins.opened), left: String(use.checkins.left) })}
        </p>
        <p class="calc-line" data-testid="use-line">
          {use.line.withAction ? fill(u.line, { taken: String(use.line.taken), days: String(use.line.withAction), why: String(use.line.why) }) : fill(u.lineNone, { why: String(use.line.why) })}
        </p>
        <p class="calc-line" data-testid="use-coach">
          {use.coach.picked ? fill(u.coach, { notTaken: String(use.coach.notTaken), picked: String(use.coach.picked) }) : u.coachNone}
        </p>
        <p class="calc-line" data-testid="use-opened">
          {fill(u.opened, { times: plural(use.opened.times, 'once', '{n} times'), days: plural(use.opened.days, 'one day', '{n} days') })}
        </p>
        <p class="calc-line">{fill(u.notifications, { n: String(use.notifications) })}</p>
        <p class="calc-line" data-testid="use-change">
          {fill(u.change, {
            opened: use.change.opened ? fill(u.changeOpened, { times: plural(use.change.opened, 'once', '{n} times') }) : u.changeNot,
            picked: use.change.picked ? fill(u.changePicked, { times: plural(use.change.picked, 'once', '{n} times') }) : use.change.opened ? u.changeNone : '',
          })}
        </p>
        <Disclosure label={u.screens} sub={top || u.screensNone} testid="use-screens">
          <ul class="plain" data-testid="use-screen-list">
            {use.screens.map((s) => (
              <li key={s.what} class="calc-line">
                {fill(u.screenItem, { what: screenName(s.what), n: String(s.n) })}
              </li>
            ))}
          </ul>
        </Disclosure>
        <Disclosure label={u.given} sub={given.length ? fill(u.givenSub, { n: String(given.length) }) : u.givenSubNone} testid="use-given">
          <p class="note faint" data-testid="use-given-note">
            {USAGE_TO_CLAUDE === 'open' ? u.givenOpen : u.givenGated}
          </p>
          {given.length === 0 && <p class="calc-line">{u.givenNone}</p>}
          <ul class="plain" data-testid="use-given-list">
            {given.map((f) => (
              <li key={f.id} class="calc-line">
                {f.text}
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </>
  )
}

export function DataScreen({ onClose }: { onClose: () => void }) {
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const wins = useLive(allWins, [])
  const items = useLive(privateItems, [])
  const aims = useLive(aimsSnapshot, [])
  const [includePrivate, setIncludePrivate] = useState(false)
  const [includePartner, setIncludePartner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [word, setWord] = useState('')
  const [cloudFailed, setCloudFailed] = useState(false)
  const [hypothesis, setHypothesis] = useState('')
  const [imported, setImported] = useState<string | null>(null)
  const records = useLive(async () => ({ offers: await db.offers.toArray(), outcomes: await db.outcomes.toArray(), cards: await db.cards.toArray(), declarations: await db.declarations.toArray(), forecasts: await db.forecasts.toArray(), forecastScores: await db.forecastScores.toArray(), anchorSwaps: await db.anchorSwaps.toArray(), herSkills: await db.herSkills.toArray(), moments: await db.moments.toArray(), outside: await db.outside.toArray(), brain: { log: await db.briefLog.toArray(), feedback: await db.briefFeedback.toArray(), briefs: await db.brainBriefs.toArray() }, pathMarks: await db.pathMarks.toArray(), reflections: await db.reflections.toArray(), monthlyChecks: await db.monthlyChecks.toArray(), useLog: await db.useLog.toArray(), days: await db.days.toArray(), places: await db.places.toArray() }), [])
  const use = useLive(() => useSummary(blockAt(new Date()).day), [])
  const given = useLive(() => usageFactsToday(blockAt(new Date()).day), [])
  if (!settings || !all || !wins || !items || !aims || !records) return <section class="screen" />

  async function exportAll() {
    if (!settings || !all || !wins || !items || !aims || !records) return
    setBusy(true)
    setFailed(false)
    try {
      const bundle = buildExport(all, wins, items, settings, { includePrivate, includePartner }, aims, records ? { ...records, usage: given ?? [] } : records)
      const stamp = dayKey(new Date())
      const files = [
        new File([bundle.json], `life-mirror-${stamp}.json`, { type: 'application/json' }),
        new File([bundle.csv], `life-mirror-${stamp}.csv`, { type: 'text/csv' }),
        new File([bundle.offersCsv], `life-mirror-offers-${stamp}.csv`, { type: 'text/csv' }),
      ]
      await shareOrDownload(files, copy.appName)
      await updateSettings((s) => ({ ...s, lastExportAt: new Date().toISOString() }))
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAll() {
    // Rule 21: the cloud copy's rows go first; if they cannot be reached, nothing is deleted.
    setCloudFailed(false)
    if (!(await deleteCloudCopy())) {
      setCloudFailed(true)
      return
    }
    try {
      await unsubscribePush()
    } catch {
      // The address may already be gone; the record goes regardless.
    }
    await wipeEverything()
    location.replace(import.meta.env.BASE_URL)
  }

  const typed = word.trim().toLowerCase() === copy.data.deleteWord

  return (
    <section class="screen">
      <header class="screen-head">
        <p class="eyebrow">{copy.data.title}</p>
      </header>

      <h2 class="section">{copy.data.export}</h2>
      <div class="card pad">
        <p class="note">{copy.data.exportNote}</p>
        <label class="check">
          <input type="checkbox" checked={includePrivate} data-testid="include-private" onChange={(e) => setIncludePrivate((e.currentTarget as HTMLInputElement).checked)} />
          <span>{copy.data.includePrivate}</span>
        </label>
        <label class="check">
          <input type="checkbox" checked={includePartner} data-testid="include-partner" onChange={(e) => setIncludePartner((e.currentTarget as HTMLInputElement).checked)} />
          <span>{copy.data.includePartner}</span>
        </label>
        <div class="actions">
          <button type="button" class="pill-quiet" disabled={busy} onClick={() => void exportAll()}>
            {busy ? copy.data.exporting : copy.data.exportButton}
          </button>
        </div>
        <p class="note faint no-gap">{settings.lastExportAt ? fill(copy.data.lastExport, { when: formatWhen(settings.lastExportAt) }) : copy.data.neverExported}</p>
        {failed && <p class="note no-gap">{copy.data.exportFailed}</p>}
      </div>

      <h2 class="section">{copy.data.importTitle}</h2>
      <div class="card pad">
        <p class="note">{copy.data.importNote}</p>
        <input class="input" type="text" placeholder={copy.data.importPlaceholder} value={hypothesis} data-testid="hypothesis-input" onInput={(e) => setHypothesis((e.currentTarget as HTMLInputElement).value)} />
        <div class="actions">
          <button
            type="button"
            class="pill-quiet"
            data-testid="hypothesis-add"
            disabled={!hypothesis.trim()}
            onClick={() =>
              void importHypothesis(hypothesis).then((r) => {
                setImported(r.ok ? copy.data.importDone : copy.data.importErrors[r.error])
                if (r.ok) setHypothesis('')
              })
            }
          >
            {copy.data.importButton}
          </button>
        </div>
        {imported && (
          <p class="note no-gap" data-testid="hypothesis-result">
            {imported}
          </p>
        )}
      </div>

      <h2 class="section">{copy.data.deleteTitle}</h2>
      <div class="card pad">
        <p class="note">{copy.data.deleteNote}</p>
      {settings.cloud.token && <p class="note faint">{copy.data.deleteCloudFirst}</p>}
      {cloudFailed && (
        <p class="note" data-testid="delete-cloud-failed">
          {copy.data.deleteCloudFailed}
        </p>
      )}
        {!deleting ? (
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="delete-start" onClick={() => setDeleting(true)}>
              {copy.data.deleteStart}
            </button>
          </div>
        ) : (
          <>
            <p class="note">{fill(copy.data.deletePrompt, { word: copy.data.deleteWord })}</p>
            <input
              class="input"
              type="text"
              autocapitalize="none"
              autocomplete="off"
              data-testid="delete-word"
              placeholder={copy.data.deleteWord}
              value={word}
              onInput={(e) => setWord((e.currentTarget as HTMLInputElement).value)}
            />
            <div class="actions">
              <button type="button" class="pill-quiet" disabled={!typed} data-testid="delete-confirm" onClick={() => void deleteAll()}>
                {copy.data.deleteConfirm}
              </button>
              <button
                type="button"
                class="textbtn"
                onClick={() => {
                  setDeleting(false)
                  setWord('')
                }}
              >
                {copy.data.deleteCancel}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Who reads what: moved here from the foot of Settings when Settings became a list of sections. */}
      <h2 class="section">{copy.settings.data}</h2>
      <div class="card pad" data-testid="data-who-reads">
        <p class="note no-gap">{copy.settings.dataNote}</p>
      </div>

      {use && given && <UseCard use={use} given={given} />}

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}
