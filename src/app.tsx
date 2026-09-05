import { useEffect, useRef, useState } from 'preact/hooks'
import type { Block } from './blocks'
import { CheckInScreen, SummaryScreen } from './checkin'
import { copy } from './copy'
import { allCheckIns, getSettings, useLive } from './db'
import { ExtrasScreen } from './extras'
import { LegendScreen } from './legend'
import { NowScreen } from './now'
import { PrivateScreen } from './private'
import type { ReadingId } from './readings'
import { useReminders } from './reminders'
import { Placeholder } from './screens'
import { extrasEnabled } from './settings'
import { SettingsScreen } from './settingsScreen'
import { WordingScreen } from './wording'

type Tab = keyof typeof copy.tabs
const order: Tab[] = ['now', 'mirror', 'moves', 'aims', 'settings']

type View =
  | { kind: 'tabs' }
  | { kind: 'checkin'; day: string; block: Block; only?: ReadingId }
  | { kind: 'extras'; day: string; block: Block; fresh: boolean }
  | { kind: 'summary'; day: string; block: Block; fresh: boolean }
  | { kind: 'wording' }
  | { kind: 'legend' }
  | { kind: 'private' }

export function App() {
  const [tab, setTab] = useState<Tab>('now')
  const [view, setView] = useState<View>({ kind: 'tabs' })
  const pushed = useRef(0)
  const settings = useLive(getSettings, [])
  const all = useLive(allCheckIns, [])
  useReminders(settings, all)

  useEffect(() => {
    // The phone's back gesture returns to the tabs; ask the browser to keep our storage.
    const onPop = () => {
      pushed.current = Math.max(0, pushed.current - 1)
      setView({ kind: 'tabs' })
    }
    window.addEventListener('popstate', onPop)
    navigator.storage?.persist?.().catch(() => undefined)
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
            onDone={() => {
              if (view.only) return setView({ kind: 'summary', day: view.day, block: view.block, fresh: false })
              if (view.block === 'evening' && settings && extrasEnabled(settings)) return setView({ kind: 'extras', day: view.day, block: view.block, fresh: true })
              setView({ kind: 'summary', day: view.day, block: view.block, fresh: true })
            }}
            onClose={() => (view.only ? setView({ kind: 'summary', day: view.day, block: view.block, fresh: false }) : closeAll())}
          />
        )
      case 'extras':
        return <ExtrasScreen day={view.day} block={view.block} onDone={() => setView({ kind: 'summary', day: view.day, block: view.block, fresh: view.fresh })} />
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
        return <Placeholder title={copy.tabs.mirror} note={copy.mirror.note} />
      case 'moves':
        return <Placeholder title={copy.tabs.moves} note={copy.moves.note} />
      case 'aims':
        return <Placeholder title={copy.tabs.aims} note={copy.aims.note} />
      case 'settings':
        return <SettingsScreen onWording={() => open({ kind: 'wording' })} onLegend={() => open({ kind: 'legend' })} onPrivate={() => open({ kind: 'private' })} />
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
