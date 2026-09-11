import { useEffect, useRef, useState } from 'preact/hooks'
import { AddAimScreen, AimsScreen, BecomingScreen, FollowScreen, LadderScreen, PickStepScreen } from './aimsScreen'
import { blockAt, type Block } from './blocks'
import { CatalogueScreen } from './catalogueScreen'
import { CheckInScreen, SummaryScreen } from './checkin'
import { CloudScreen } from './cloudScreen'
import { startCloud } from './cloudSync'
import { copy } from './copy'
import { DataScreen } from './dataScreen'
import { allCheckIns, getDayContext, getSettings } from './db'
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
import { SettingsScreen } from './settingsScreen'
import { StudyNightStep } from './studyStep'
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
  | { kind: 'private' }
  | { kind: 'data' }
  | { kind: 'catalogue' }
  | { kind: 'history' }
  | { kind: 'addAim' }
  | { kind: 'pickStep'; aimId: number }
  | { kind: 'ladder' }
  | { kind: 'follow' }
  | { kind: 'becoming' }
  | { kind: 'cloud' }

export function App() {
  const [tab, setTab] = useState<Tab>('now')
  const [view, setView] = useState<View>({ kind: 'tabs' })
  const pushed = useRef(0)
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  const pending = useLive(pendingOffers, [])
  useReminders(settings, all)
  // The cloud copy: pull on open and every fifteen minutes, push soon after any change; nothing without a token.
  useEffect(() => startCloud(), [])

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
        return <PrivateScreen onClose={closeAll} />
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
      case 'ladder':
        return <LadderScreen onClose={closeAll} />
      case 'follow':
        return <FollowScreen onClose={closeAll} />
      case 'becoming':
        return <BecomingScreen onClose={closeAll} />
      case 'cloud':
        return <CloudScreen onClose={closeAll} />
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
          />
        )
      case 'mirror':
        return <MirrorScreen />
      case 'moves':
        return <MovesScreen onHistory={() => open({ kind: 'history' })} onCatalogue={() => open({ kind: 'catalogue' })} />
      case 'aims':
        return (
          <AimsScreen
            onAdd={() => open({ kind: 'addAim' })}
            onChangeStep={(aimId) => open({ kind: 'pickStep', aimId })}
            onLadder={() => open({ kind: 'ladder' })}
            onFollow={() => open({ kind: 'follow' })}
            onBecoming={() => open({ kind: 'becoming' })}
          />
        )
      case 'settings':
        return (
          <SettingsScreen
            onWording={() => open({ kind: 'wording' })}
            onLegend={() => open({ kind: 'legend' })}
            onPrivate={() => open({ kind: 'private' })}
            onData={() => open({ kind: 'data' })}
            onCloud={() => open({ kind: 'cloud' })}
          />
        )
    }
  }

  return (
    <div class="app">
      <main id="main">{content()}</main>
      {view.kind === 'tabs' && (
        <nav class="tabs" aria-label="Sections">
          {order.map((t) => (
            <button
              key={t}
              type="button"
              class={t === tab ? 'tab is-active' : 'tab'}
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              {copy.tabs[t]}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
