import { useState } from 'preact/hooks'
import { build } from './build'
import { NavRow, Seg, SwitchRow, TimeRow } from './controls'
import { copy } from './copy'
import { getSettings, updateSettings, useLive } from './db'
import { fill, formatWhen } from './format'
import { activeBlocks, applyLowDemand, type Settings } from './settings'

type Permission = NotificationPermission | 'unsupported'

function currentPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export function SettingsScreen({ onWording, onLegend, onPrivate }: { onWording: () => void; onLegend: () => void; onPrivate: () => void }) {
  const settings = useLive(getSettings, [])
  const [perm, setPerm] = useState<Permission>(currentPermission)
  if (!settings) return <section class="screen" />

  const set = (change: (s: Settings) => Settings) => void updateSettings(change)
  const setExtra = (key: keyof Settings['extras'], on: boolean) => set((s) => ({ ...s, extras: { ...s.extras, [key]: on } }))

  async function toggleReminders(on: boolean) {
    if (!on) return set((s) => ({ ...s, reminders: { ...s.reminders, enabled: false } }))
    if (perm === 'unsupported') return
    let p = Notification.permission
    if (p === 'default') p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') set((s) => ({ ...s, reminders: { ...s.reminders, enabled: true } }))
  }

  const tests =
    build.unitTests === null
      ? copy.settings.testsUnknown
      : fill(build.unitTests === 1 ? copy.settings.testsOne : copy.settings.testsMany, { n: String(build.unitTests) })

  return (
    <section class="screen">
      <h1 class="eyebrow">{copy.tabs.settings}</h1>

      <h2 class="section">{copy.settings.checkins}</h2>
      <Seg
        label={copy.settings.depth}
        note={copy.settings.depthNote}
        value={settings.depth}
        options={[
          { v: 'full', l: copy.settings.depthFull },
          { v: 'short', l: copy.settings.depthShort },
        ]}
        onChange={(depth) => set((s) => ({ ...s, depth }))}
      />
      <Seg
        label={copy.settings.frequency}
        value={settings.frequency}
        options={[
          { v: 'three', l: copy.settings.freqThree },
          { v: 'two', l: copy.settings.freqTwo },
          { v: 'one', l: copy.settings.freqOne },
        ]}
        onChange={(frequency) => set((s) => ({ ...s, frequency }))}
      />
      <SwitchRow label={copy.settings.lowDemand} note={copy.settings.lowDemandNote} on={settings.lowDemand} onChange={(on) => set((s) => applyLowDemand(s, on))} testid="low-demand" />

      <h2 class="section">{copy.settings.quiet}</h2>
      <TimeRow label={copy.settings.quietFrom} value={settings.quietStart} onChange={(quietStart) => set((s) => ({ ...s, quietStart }))} />
      <TimeRow label={copy.settings.quietTo} value={settings.quietEnd} onChange={(quietEnd) => set((s) => ({ ...s, quietEnd }))} />
      <p class="note faint">{copy.settings.quietNote}</p>

      <h2 class="section">{copy.settings.reminders}</h2>
      {perm === 'unsupported' ? (
        <p class="note">{copy.settings.remindersUnsupported}</p>
      ) : (
        <>
          <SwitchRow label={copy.settings.remindersOn} on={settings.reminders.enabled} onChange={(on) => void toggleReminders(on)} />
          {perm === 'denied' && <p class="note">{copy.settings.remindersDenied}</p>}
          {settings.reminders.enabled &&
            activeBlocks(settings.frequency).map((b) => (
              <TimeRow
                key={b}
                label={fill(copy.settings.reminderTime, { block: copy.blocks[b] })}
                value={settings.reminders.times[b]}
                onChange={(t) => set((s) => ({ ...s, reminders: { ...s.reminders, times: { ...s.reminders.times, [b]: t } } }))}
              />
            ))}
        </>
      )}
      <p class="note faint">{copy.settings.remindersNote}</p>

      <h2 class="section">{copy.settings.extras}</h2>
      <SwitchRow label={copy.settings.extraWin} on={settings.extras.minimumWin} onChange={(on) => setExtra('minimumWin', on)} />
      <SwitchRow label={copy.settings.extraCaffeine} on={settings.extras.caffeine} onChange={(on) => setExtra('caffeine', on)} />
      <SwitchRow label={copy.settings.extraDinner} on={settings.extras.dinner} onChange={(on) => setExtra('dinner', on)} />
      <SwitchRow label={copy.settings.extraPrivate} on={settings.extras.privateLog} onChange={(on) => setExtra('privateLog', on)} />
      <SwitchRow label={copy.settings.extraFaith} note={copy.settings.faithNote} on={settings.extras.faith} onChange={(on) => setExtra('faith', on)} />

      <ul class="rows top-gap">
        <NavRow label={copy.settings.private} note={copy.settings.privateNote} onClick={onPrivate} />
        <NavRow label={copy.settings.wording} note={copy.settings.wordingNote} onClick={onWording} />
        <NavRow label={copy.settings.legend} note={copy.settings.legendNote} onClick={onLegend} />
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
