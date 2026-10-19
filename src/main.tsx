import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app'
import { reloadWhenSafe } from './swUpdate'
import { watchInstallOffer } from './installOffer'
import { applyTheme, currentTheme, followOtherWindows } from './theme'
import { restoreChoices } from './phoneChoices'
import './styles.css'

// The theme is on the page before the first paint (index.html); this keeps the two in step and follows another window's change.
applyTheme(currentTheme())
followOtherWindows()

// Register the service worker at once so the app opens offline after its first load. A new build
// reloads the page, but never under someone's typing (Pass 4).
registerSW({ immediate: true, onNeedReload: () => reloadWhenSafe() })

// The browser's offer to install the app, held for Settings from the first moment it comes.
watchInstallOffer()

// This phone's own choices (Location Context, the weather, the places named), put back first if the browser cleared the
// database since the app last ran, and kept in step from here on (2026-10-19). Put back in one write, so nothing reads
// Location Context on before its places and their key are back; the screens follow it as it lands.
void restoreChoices()

render(<App />, document.getElementById('app')!)
