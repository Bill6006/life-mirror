import { useState } from 'preact/hooks'
import { build } from './build'
import { NavRow, Seg, SwitchRow, TimeRow } from './controls'
import { copy } from './copy'
import { getSettings, updateSettings } from './db'
import { fill, formatWhen } from './format'
import { useLive } from './live'
import { pushSupported, shortAddress, subscribePush, unsubscribePush } from './push'
import { activeBlocks, applyLowDemand, type Settings } from './settings'

type Permission = NotificationPermission | 'unsupported'

function currentPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export function SettingsScreen({ onWording, onLegend, onPrivate }: { onWording: () => void; onLegend: () => void; onPrivate: () => void }) {
  const settings = useLive(getSettings, [])
  const [perm, setPerm] = useState<Permission>(currentPermission)
  const [copied, setCopied] = useState(false)
  const [showAddress, setShowAddress] = useState(false)
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

  async function setUpPush() {
    try {
      const subscription = await subscribePush()
      set((s) => ({ ...s, push: { subscription, subscribedAt: new Date().toISOString(), changed: false } }))
    } catch (e) {
      console.error(e)
    }
  }

  async function copyAddress() {
    const sub = settings?.push.subscription
    if (!sub) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(sub))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShowAddress(true)
    }
  }

  async function dropPush() {
    await unsubscribePush()
    set((s) => ({ ...s, push: { subscription: null, subscribedAt: null, changed: false } }))
  }

  const tests =
    build.unitTests === null
      ? copy.settings.testsUnknown
      : fill(build.unitTests === 1 ? copy.settings.testsOne : copy.settings.testsMany, { n: String(build.unitTests) })

  const sub = settings.push.subscription

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs.settings}</h1>
      </header>

      <h2 class="section">{copy.settings.checkins}</h2>
      <div class="card">
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
      </div>

      <h2 class="section">{copy.settings.quiet}</h2>
      <div class="card">
        <TimeRow label={copy.settings.quietFrom} value={settings.quietStart} onChange={(quietStart) => set((s) => ({ ...s, quietStart }))} />
        <TimeRow label={copy.settings.quietTo} value={settings.quietEnd} onChange={(quietEnd) => set((s) => ({ ...s, quietEnd }))} />
      </div>
      <p class="note faint">{copy.settings.quietNote}</p>

      <h2 class="section">{copy.settings.reminders}</h2>
      <div class="card">
        {perm === 'unsupported' ? (
          <p class="note in-card">{copy.settings.remindersUnsupported}</p>
        ) : (
          <>
            <SwitchRow label={copy.settings.remindersOn} on={settings.reminders.enabled} onChange={(on) => void toggleReminders(on)} />
            {perm === 'denied' && <p class="note in-card">{copy.settings.remindersDenied}</p>}
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
      </div>
      <p class="note faint">{copy.settings.remindersNote}</p>
      {settings.reminders.enabled && <p class="note faint">{copy.settings.inAppNote}</p>}

      {settings.reminders.enabled && perm === 'granted' && (
        <div class="card pad ping" data-testid="ping">
          <h3 class="title-sm">{copy.settings.pushTitle}</h3>
          {!pushSupported() ? (
            <p class="note">{copy.settings.pushUnsupported}</p>
          ) : !sub ? (
            <div class="actions">
              <button type="button" class="pill-quiet" onClick={() => void setUpPush()}>
                {copy.settings.pushSetup}
              </button>
            </div>
          ) : (
            <>
              <p class="note">
                <code>{shortAddress(sub.endpoint ?? '')}</code>
              </p>
              {settings.push.changed && <p class="note">{copy.settings.pushChanged}</p>}
              {settings.push.subscribedAt && <p class="note faint">{fill(copy.settings.pushSubscribedAt, { when: formatWhen(settings.push.subscribedAt) })}</p>}
              <div class="actions">
                <button type="button" class="pill-quiet" onClick={() => void copyAddress()}>
                  {copied ? copy.settings.pushCopied : copy.settings.pushCopy}
                </button>
                <button type="button" class="textbtn" onClick={() => setShowAddress((v) => !v)}>
                  {showAddress ? copy.settings.pushHide : copy.settings.pushShow}
                </button>
                <button type="button" class="textbtn" onClick={() => void dropPush()}>
                  {copy.settings.pushUnsubscribe}
                </button>
              </div>
              {showAddress && <textarea class="input address" readOnly rows={6} value={JSON.stringify(sub)} />}
            </>
          )}
          <p class="note faint no-gap">{copy.settings.pushNote}</p>
        </div>
      )}

      <h2 class="section">{copy.settings.extras}</h2>
      <div class="card">
        <SwitchRow label={copy.settings.extraWin} on={settings.extras.minimumWin} onChange={(on) => setExtra('minimumWin', on)} />
        <SwitchRow label={copy.settings.extraCaffeine} on={settings.extras.caffeine} onChange={(on) => setExtra('caffeine', on)} />
        <SwitchRow label={copy.settings.extraDinner} on={settings.extras.dinner} onChange={(on) => setExtra('dinner', on)} />
        <SwitchRow label={copy.settings.extraPrivate} on={settings.extras.privateLog} onChange={(on) => setExtra('privateLog', on)} />
        <SwitchRow label={copy.settings.extraFaith} note={copy.settings.faithNote} on={settings.extras.faith} onChange={(on) => setExtra('faith', on)} />
      </div>

      <h2 class="section">{copy.settings.more}</h2>
      <div class="card">
        <ul class="rows">
          <NavRow label={copy.settings.private} note={copy.settings.privateNote} onClick={onPrivate} />
          <NavRow label={copy.settings.wording} note={copy.settings.wordingNote} onClick={onWording} />
          <NavRow label={copy.settings.legend} note={copy.settings.legendNote} onClick={onLegend} />
        </ul>
      </div>

      <h2 class="section">{copy.settings.about}</h2>
      <div class="card">
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
        <p class="note in-card">{tests}</p>
        {build.runUrl ? (
          <a class="accent-link" href={build.runUrl} target="_blank" rel="noopener">
            {copy.settings.run}
          </a>
        ) : (
          <p class="note in-card">{copy.settings.runMissing}</p>
        )}
      </div>

      <h2 class="section">{copy.settings.data}</h2>
      <div class="card pad">
        <p class="note">{copy.settings.dataNote}</p>
        <p class="note faint no-gap">{copy.settings.phase}</p>
      </div>
    </section>
  )
}
