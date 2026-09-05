import { build } from './build'
import { copy } from './copy'
import { fill, formatWhen } from './format'

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section class="screen">
      <h1 class="eyebrow">{title}</h1>
      <p class="note">{note}</p>
    </section>
  )
}

export function SettingsScreen({ onWording }: { onWording: () => void }) {
  const tests =
    build.unitTests === null
      ? copy.settings.testsUnknown
      : fill(build.unitTests === 1 ? copy.settings.testsOne : copy.settings.testsMany, { n: String(build.unitTests) })

  return (
    <section class="screen">
      <h1 class="eyebrow">{copy.tabs.settings}</h1>

      <ul class="rows">
        <li>
          <button type="button" class="row" onClick={onWording}>
            <span class="row-main">
              {copy.settings.wording}
              <span class="sub">{copy.settings.wordingNote}</span>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>

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
