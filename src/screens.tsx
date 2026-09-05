import { copy } from './copy'
import { build } from './build'

function fill(template: string, n: number): string {
  return template.replace('{n}', String(n))
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function NowScreen() {
  return (
    <section class="screen" aria-labelledby="now-title">
      <h1 id="now-title" class="eyebrow">{copy.tabs.now}</h1>
      <p class="status">
        <span class="dot" aria-hidden="true" />
        {copy.now.status}
      </p>
      <p class="note">{copy.now.note}</p>
    </section>
  )
}

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section class="screen">
      <h1 class="eyebrow">{title}</h1>
      <p class="note">{note}</p>
    </section>
  )
}

export function SettingsScreen() {
  const tests =
    build.unitTests === null
      ? copy.settings.testsUnknown
      : fill(build.unitTests === 1 ? copy.settings.testsOne : copy.settings.testsMany, build.unitTests)

  return (
    <section class="screen">
      <h1 class="eyebrow">{copy.tabs.settings}</h1>

      <h2 class="section">{copy.settings.about}</h2>
      <dl class="facts">
        <div>
          <dt>{copy.settings.app}</dt>
          <dd>{copy.appName}</dd>
        </div>
        <div>
          <dt>{copy.settings.build}</dt>
          <dd>
            <code data-testid="build-commit">{build.shortCommit}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.settings.builtAt}</dt>
          <dd>{formatWhen(build.builtAt)}</dd>
        </div>
      </dl>
      <p class="note">{tests}</p>
      {build.runUrl ? (
        <a class="accent-link" href={build.runUrl} target="_blank" rel="noopener">
          {copy.settings.run}
        </a>
      ) : (
        <p class="note">{copy.settings.runMissing}</p>
      )}

      <h2 class="section">{copy.settings.data}</h2>
      <p class="note">{copy.settings.dataNote}</p>
      <p class="note faint">{copy.settings.phase}</p>
    </section>
  )
}
