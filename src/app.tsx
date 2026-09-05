import { useState } from 'preact/hooks'
import { copy } from './copy'
import { NowScreen, Placeholder, SettingsScreen } from './screens'

type Tab = keyof typeof copy.tabs
const order: Tab[] = ['now', 'mirror', 'moves', 'aims', 'settings']

export function App() {
  const [tab, setTab] = useState<Tab>('now')
  return (
    <div class="app">
      <main id="main">{screen(tab)}</main>
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
    </div>
  )
}

function screen(tab: Tab) {
  switch (tab) {
    case 'now':
      return <NowScreen />
    case 'mirror':
      return <Placeholder title={copy.tabs.mirror} note={copy.mirror.note} />
    case 'moves':
      return <Placeholder title={copy.tabs.moves} note={copy.moves.note} />
    case 'aims':
      return <Placeholder title={copy.tabs.aims} note={copy.aims.note} />
    case 'settings':
      return <SettingsScreen />
  }
}
