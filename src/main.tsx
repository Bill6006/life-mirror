import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app'
import './styles.css'

// Register the service worker at once so the app opens offline after its first load.
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
