import { useEffect, useRef, useState } from 'preact/hooks'
import { AddAimScreen, AimsScreen, BecomingScreen, FollowScreen, LadderScreen, PickStepScreen } from './aimsScreen'
import { PathChangeScreen } from './pathCard'
import { PartnerNotesScreen } from './partnerScreen'
import { HerPickScreen, HerScreen } from './herScreen'
import { blockAt, type Block } from './blocks'
import { CatalogueScreen } from './catalogueScreen'
import { CheckInScreen, SummaryScreen } from './checkin'
import { BrainScreen } from './brainScreen'
import { CloudScreen } from './cloudScreen'
import { EvidenceScreen } from './evidenceScreen'
import { runForecasting } from './forecastFlow'
import { WeeklyScreen } from './weeklyScreen'
import { adoptOrphanSubjects, alignLadders } from './aimFlow'
import { writeFactsRow } from './brainFlow'
import { refreshPushIfKeyChanged } from './push'
import { loadAudits, runLearning } from './learningFlow'
import { ReadingsScreen } from './readingsScreen'
import { startCloud } from './cloudSync'
import { copy } from './copy'
import { DataScreen } from './dataScreen'
import { allCheckIns, getDayContext, getSettings, updateSettings } from './db'
import { ExtrasScreen } from './extras'
import { LegendScreen } from './legend'
import { useLive } from './live'
import { MirrorScreen } from './mirror'
import { HistoryScreen, MovesScreen } from './movesScreen'
import { NowScreen } from './now'
import { ensureOffer, pendingOffers } from './offerFlow'
import { PrivateScreen } from './private'
import type { ReadingId } from './readings'
import { useReminders } from './reminders'
import { extrasEnabled } from './settings'
import { SettingsScreen, SettingsSectionScreen, type SettingsSection } from './settingsScreen'
import { Icon } from './icons'
import { StudyNightStep } from './studyStep'
import { logUse, pruneUseLog } from './useLog'
import { WordingScreen } from './wording'

type Tab = keyof typeof copy.tabs
const order: Tab[] = ['now', 'mirror', 'moves', 'aims', 'settings']

type View =
  | { kind: 'tabs' }
  | { kind: 'checkin'; day: string; block: Block; only?: ReadingId }
  | { kind: 'extras'; day: string; block: Block; fresh: boolean }
  | { kind: 'study'; day: string; block: Block; fresh: boolean }
  | { kind: 'summary'; day: string; block: Block; fresh: boolean }
  | { kind: 'wording' }
  | { kind: 'legend' }
  | { kind: 'private'; from?: SettingsSection }
  | { kind: 'settings'; section: SettingsSection }
  | { kind: 'data' }
  | { kind: 'catalogue' }
  | { kind: 'history' }
  | { kind: 'addAim' }
  | { kind: 'pickStep'; aimId: number }
  | { kind: 'pathChange'; aimId: number }
  | { kind: 'partnerNotes' }
  | { kind: 'ladder' }
  | { kind: 'follow' }
  | { kind: 'becoming' }
  | { kind: 'her' }
  | { kind: 'herPick' }
  | { kind: 'cloud' }
  | { kind: 'brain' }
  | { kind: 'evidence' }
  | { kind: 'weekly' }
  | { kind: 'readings' }

/** The screen a view is, for the use log: a tab, a sub-screen or a Settings section; the check-in's own steps are counted apart. */
function screenOf(view: View, tab: Tab): string | null {
  switch (view.kind) {
    case 'tabs':
      return tab
    case 'checkin':
    case 'extras':
    case 'study':
      return null
    case 'summary':
      return view.fresh ? null : 'summary'
    case 'settings':
      return `settings:${view.section}`
    default:
      return view.kind
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>('now')
  const [view, setView] = useState<View>({ kind: 'tabs' })
  const pushed = useRef(0)
  // Part 34: how the app is used, on this phone alone. A screen each time it opens; a check-in when it opens, and when it is left before its end.
  const shown = screenOf(view, tab)
  useEffect(() => {
    if (shown) void logUse('screen', shown)
  }, [shown])
  const before = useRef<View>(view)
  useEffect(() => {
    const prev = before.current
    before.current = view
    if (view.kind === 'checkin' && !view.only && !(prev.kind === 'checkin' && prev.day === view.day && prev.block === view.block)) void logUse('checkinOpened', view.block)
    if (prev.kind === 'checkin' && !prev.only && view.kind === 'tabs') void logUse('checkinLeft', prev.block)
  }, [view])
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const pending = useLive(pendingOffers, [])
  useReminders(settings, all)
  // The cloud copy: pull on open and every fifteen minutes, push soon after any change; nothing without a token.
  useEffect(() => startCloud(), [])
  // Phase 10: beliefs update once a day, on open.
  useEffect(() => {
    const day = blockAt(new Date()).day
    void pruneUseLog(day)
    void loadAudits()
      .then(adoptOrphanSubjects)
      .then(alignLadders)
      .then(() => runLearning(day))
      .then(() => runForecasting(day))
      .then(() => writeFactsRow(day))
    // A push address made under an older signing key is replaced; Settings then says to copy it again.
    void refreshPushIfKeyChanged()
      .then((subscription) => (subscription ? updateSettings((s) => ({ ...s, push: { subscription, subscribedAt: new Date().toISOString(), changed: true } })) : undefined))
      .catch(() => undefined)
  }, [])
  // Phase 11: a forecast for a block is written before that block is logged; after each completed check-in the next slots may be due.
  // Part 28: the facts row is written again once a check-in completes, so the Worker sees the morning's before it writes the day's line.
  const completed = all?.filter((c) => c.completedAt).length
  useEffect(() => {
    const day = blockAt(new Date()).day
    void runForecasting(day).then(() => writeFactsRow(day))
  }, [all?.length, completed])

  useEffect(() => {
    // The phone's back gesture returns to the tabs; ask the browser to keep our storage.
    const onPop = () => {
      pushed.current = Math.max(0, pushed.current - 1)
      setView({ kind: 'tabs' })
    }
    window.addEventListener('popstate', onPop)
    navigator.storage?.persist?.().catch(() => undefined)

    // A tapped reminder arrives with ?checkin=1: open the current block straight away.
    if (new URLSearchParams(location.search).has('checkin')) {
      history.replaceState(null, '', import.meta.env.BASE_URL)
      const { day, block } = blockAt(new Date())
      open({ kind: 'checkin', day, block })
    }
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function open(next: View) {
    if (view.kind === 'tabs' && next.kind !== 'tabs') {
      history.pushState({ lifeMirror: 1 }, '')
      pushed.current += 1
    }
    setView(next)
  }

  function closeAll() {
    if (pushed.current > 0) history.back()
    else setView({ kind: 'tabs' })
  }

  /** After the evening's extras (or straight after the readings when they are off): the study step on a study night, else the card. */
  function afterEvening(day: string, block: Block, fresh: boolean) {
    void getDayContext(day).then((ctx) => setView(ctx?.studyNight ? { kind: 'study', day, block, fresh } : { kind: 'summary', day, block, fresh }))
  }

  function content() {
    switch (view.kind) {
      case 'checkin':
        return (
          <CheckInScreen
            key={`${view.day}-${view.block}-${view.only ?? ''}`}
            day={view.day}
            block={view.block}
            depth={settings?.depth ?? 'full'}
            retired={settings?.retiredReadings ?? []}
            only={view.only}
            pending={pending ?? []}
            onDone={() => {
              if (view.only) return setView({ kind: 'summary', day: view.day, block: view.block, fresh: false })
              // The check-in is complete: write the card and the offer, then show the card.
              void ensureOffer(view.day, view.block)
              if (view.block === 'evening' && settings && extrasEnabled(settings)) return setView({ kind: 'extras', day: view.day, block: view.block, fresh: true })
              if (view.block === 'evening') return afterEvening(view.day, view.block, true)
              setView({ kind: 'summary', day: view.day, block: view.block, fresh: true })
            }}
            onClose={() => (view.only ? setView({ kind: 'summary', day: view.day, block: view.block, fresh: false }) : closeAll())}
          />
        )
      case 'extras':
        return <ExtrasScreen day={view.day} block={view.block} onDone={() => (view.fresh ? afterEvening(view.day, view.block, true) : setView({ kind: 'summary', day: view.day, block: view.block, fresh: false }))} />
      case 'study':
        return <StudyNightStep key={view.day} day={view.day} block={view.block} onDone={() => setView({ kind: 'summary', day: view.day, block: view.block, fresh: view.fresh })} />
      case 'summary':
        return (
          <SummaryScreen
            day={view.day}
            block={view.block}
            fresh={view.fresh}
            onChange={(id) => setView({ kind: 'checkin', day: view.day, block: view.block, only: id })}
            onExtras={() => setView({ kind: 'extras', day: view.day, block: view.block, fresh: false })}
            onDone={closeAll}
            onDeleted={closeAll}
          />
        )
      case 'wording':
        return <WordingScreen onClose={closeAll} />
      case 'legend':
        return <LegendScreen onClose={closeAll} />
      case 'private':
        return <PrivateScreen onClose={() => (view.from ? setView({ kind: 'settings', section: view.from }) : closeAll())} />
      case 'settings':
        return <SettingsSectionScreen key={view.section} section={view.section} onClose={closeAll} onPrivate={() => setView({ kind: 'private', from: view.section })} />
      case 'data':
        return <DataScreen onClose={closeAll} />
      case 'catalogue':
        return <CatalogueScreen onClose={closeAll} />
      case 'history':
        return <HistoryScreen onClose={closeAll} />
      case 'addAim':
        return <AddAimScreen onClose={closeAll} />
      case 'pickStep':
        return <PickStepScreen aimId={view.aimId} onClose={closeAll} />
      case 'pathChange':
        return <PathChangeScreen aimId={view.aimId} onClose={closeAll} />
      case 'partnerNotes':
        return <PartnerNotesScreen onClose={closeAll} />
      case 'ladder':
        return <LadderScreen onClose={closeAll} />
      case 'follow':
        return <FollowScreen onClose={closeAll} />
      case 'becoming':
        return <BecomingScreen onClose={closeAll} />
      case 'her':
        return <HerScreen onPick={() => setView({ kind: 'herPick' })} onClose={closeAll} />
      case 'herPick':
        return <HerPickScreen onClose={() => setView({ kind: 'her' })} />
      case 'cloud':
        return <CloudScreen onClose={closeAll} />
      case 'brain':
        return <BrainScreen onClose={closeAll} />
      case 'evidence':
        return <EvidenceScreen onClose={closeAll} />
      case 'weekly':
        return <WeeklyScreen onClose={closeAll} />
      case 'readings':
        return <ReadingsScreen onClose={closeAll} />
      case 'tabs':
        return screen(tab)
    }
  }

  function screen(t: Tab) {
    switch (t) {
      case 'now':
        return (
          <NowScreen
            onCheckIn={(day, block) => open({ kind: 'checkin', day, block })}
            onOpen={(day, block) => open({ kind: 'summary', day, block, fresh: false })}
            onChangeRep={(aimId) => open({ kind: 'pathChange', aimId })}
          />
        )
      case 'mirror':
        return <MirrorScreen onWeekly={() => open({ kind: 'weekly' })} />
      case 'moves':
        return <MovesScreen onHistory={() => open({ kind: 'history' })} onCatalogue={() => open({ kind: 'catalogue' })} onEvidence={() => open({ kind: 'evidence' })} />
      case 'aims':
        return (
          <AimsScreen
            onAdd={() => open({ kind: 'addAim' })}
            onChangeStep={(aimId) => open({ kind: 'pickStep', aimId })}
            onChangeRep={(aimId) => open({ kind: 'pathChange', aimId })}
            onLadder={() => open({ kind: 'ladder' })}
            onFollow={() => open({ kind: 'follow' })}
            onBecoming={() => open({ kind: 'becoming' })}
            onHer={() => open({ kind: 'her' })}
            onPartnerNotes={() => open({ kind: 'partnerNotes' })}
          />
        )
      case 'settings':
        return (
          <SettingsScreen
            onSection={(section) => open({ kind: 'settings', section })}
            onWording={() => open({ kind: 'wording' })}
            onLegend={() => open({ kind: 'legend' })}
            onData={() => open({ kind: 'data' })}
            onCloud={() => open({ kind: 'cloud' })}
            onBrain={() => open({ kind: 'brain' })}
            onReadings={() => open({ kind: 'readings' })}
          />
        )
    }
  }

  return (
    <div class="app">
      <main id="main">{content()}</main>
      {view.kind === 'tabs' && (
        <nav class="tabs" aria-label="Sections">
          <div class="tabs-inner">
          {order.map((t) => (
            <button
              key={t}
              type="button"
              class={t === tab ? 'tab is-active' : 'tab'}
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              <Icon name={t} class="tab-ic" />
              <span class="tab-label">{copy.tabs[t]}</span>
            </button>
          ))}
          </div>
        </nav>
      )}
    </div>
  )
}
