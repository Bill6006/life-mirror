import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app'
import { applyTheme, currentTheme, followOtherWindows } from './theme'
import './styles.css'

// The theme is on the page before the first paint (index.html); this keeps the two in step and follows another window's change.
applyTheme(currentTheme())
followOtherWindows()

// Register the service worker at once so the app opens offline after its first load.
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
