import { LocationSection } from './locationScreen'
import { namedPlaces } from './locationFlow'
import { useEffect, useState } from 'preact/hooks'
import { blockAt } from './blocks'
import { build } from './build'
import { Seg, SwitchRow, TimeRow } from './controls'
import { copy } from './copy'
import { getSettings, updateSettings } from './db'
import { fill, formatHHMM, formatWhen } from './format'
import { useLive } from './live'
import { pushSupported, shortAddress, subscribePush, unsubscribePush } from './push'
import { activeBlocks, applyLowDemand, daylightFor, type Settings, type Weekday, sunPlace } from './settings'
import { parsePlace, placeText, sunLocal, type Place } from './sun'
import { setTheme, THEMES, useTheme, type ThemeId } from './theme'
import { Disclosure, LinkRow, SectionLabel, SubHead } from './ui'

// Settings as a short list of sections (the approved structure, 2026-09-23): each row says what
// is set in one line, and opens its own screen with the same controls as before. Nothing was
// removed; every control moved into the section it belongs to.

export type SettingsSection = 'week' | 'location' | 'checkins' | 'extras' | 'moves' | 'direction' | 'theme' | 'about'

type Permission = NotificationPermission | 'unsupported'

function currentPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** A weekday's full name, Sunday first as the phone counts them. */
function weekdayName(d: Weekday): string {
  return new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'long' })
}

/** A span of the day kept as HH:MM, shown as 7:00 AM–9:00 PM. */
function clockSpan(span: { from: string; to: string }): { from: string; to: string } {
  return { from: formatHHMM(span.from), to: formatHHMM(span.to) }
}

const EXTRA_KEYS = ['minimumWin', 'caffeine', 'dinner', 'privateLog', 'faith'] as const

/** Each section's one line: what is set, in the words the section uses. */
export function summaries(s: Settings, theme: ThemeId): Record<SettingsSection | 'brain' | 'cloud' | 'data' | 'readings' | 'wording' | 'legend', string> {
  const n = copy.settingsNav
  const w = s.week
  const freq = s.frequency === 'three' ? copy.settings.freqThree : s.frequency === 'two' ? copy.settings.freqTwo : copy.settings.freqOne
  const extrasOn = EXTRA_KEYS.filter((k) => s.extras[k]).length
  const tests = build.unitTests === null ? n.aboutNoTests : fill(n.aboutTests, { n: String(build.unitTests) })
  return {
    week: [w.churchDay === null ? n.churchNone : fill(n.churchOn, { day: weekdayName(w.churchDay) }), w.pickupTime === null ? n.pickupNone : fill(n.pickupAt, { time: formatHHMM(w.pickupTime) }), fill(s.place ? n.daylightSun : n.daylight, clockSpan(daylightFor(s, blockAt(new Date()).day)))].join(' · '),
    location: s.location.on ? fill(n.locationOn, { known: n.locationKnownNone }) : n.locationOff,
    checkins: [...(s.lowDemand ? [n.lowDemandOn] : []), freq, s.depth === 'full' ? n.depthFull : n.depthShort, fill(n.quiet, clockSpan({ from: s.quietStart, to: s.quietEnd })), s.reminders.enabled ? n.remindersOn : n.remindersOff].join(' · '),
    extras: fill(n.extrasOn, { n: String(extrasOn), of: String(EXTRA_KEYS.length) }),
    moves: [s.hideFaith ? n.faithOff : n.faithOn, s.privateInSelection ? n.privateIn : n.privateOut].join(' · '),
    direction: s.direction ?? n.directionNone,
    theme: copy.appearance.names[theme],
    about: fill(n.aboutLine, { commit: build.shortCommit, tests }),
    brain: n.brainNote,
    cloud: n.cloudNote,
    data: n.dataNote,
    readings: copy.settings.readingsRowNote,
    wording: copy.settings.wordingNote,
    legend: n.legendNote,
  }
}

/** The Settings tab: the sections, grouped, each with its one line. */
export function SettingsScreen({ onSection, onData, onCloud, onBrain, onReadings, onWording, onLegend }: { onSection: (s: SettingsSection) => void; onData: () => void; onCloud: () => void; onBrain: () => void; onReadings: () => void; onWording: () => void; onLegend: () => void }) {
  const settings = useLive(getSettings, [])
  const places = useLive(namedPlaces, [])
  const theme = useTheme()
  if (!settings || !places) return <section class="screen" />
  const n = copy.settingsNav
  const g = n.groups
  const line = summaries(settings, theme)
  // Part 43: the places it knows are in their own table on this phone; counted here.
  const known = places.filter((p) => p.kind !== 'none').length
  if (settings.location.on) line.location = fill(n.locationOn, { known: known === 0 ? n.locationKnownNone : known === 1 ? n.locationKnownOne : fill(n.locationKnown, { n: String(known) }) })
  let i = 0
  const row = (label: string, note: string, icon: Parameters<typeof LinkRow>[0]['icon'], onClick: () => void, testid: string) => <LinkRow key={testid} label={label} note={note} icon={icon} onClick={onClick} testid={testid} index={i++} />
  return (
    <section class="screen settings-list">
      <header class="screen-head">
        <h1 class="eyebrow screen-title">{copy.tabs.settings}</h1>
      </header>

      <SectionLabel index={0}>{g.days}</SectionLabel>
      <div class="card">
        <ul class="rows">
          {row(n.week, line.week, 'week', () => onSection('week'), 'settings-week')}
          {row(n.location, line.location, 'pin', () => onSection('location'), 'settings-location')}
          {row(n.checkins, line.checkins, 'bell', () => onSection('checkins'), 'settings-checkins')}
          {row(n.extras, line.extras, 'extras', () => onSection('extras'), 'settings-extras')}
        </ul>
      </div>

      <SectionLabel index={1}>{g.meaning}</SectionLabel>
      <div class="card">
        <ul class="rows">
          {row(n.moves, line.moves, 'spark', () => onSection('moves'), 'settings-moves')}
          {row(n.direction, line.direction, 'compass', () => onSection('direction'), 'settings-direction')}
        </ul>
      </div>

      <SectionLabel index={2}>{g.appearance}</SectionLabel>
      <div class="card">
        <ul class="rows">{row(n.theme, line.theme, 'palette', () => onSection('theme'), 'settings-theme')}</ul>
      </div>

      <SectionLabel index={3}>{g.brainData}</SectionLabel>
      <div class="card">
        <ul class="rows">
          {row(n.brain, line.brain, 'brain', onBrain, 'settings-brain')}
          {row(n.cloud, line.cloud, 'cloud', onCloud, 'settings-cloud')}
          {row(n.data, line.data, 'shield', onData, 'settings-data')}
        </ul>
      </div>

      <SectionLabel index={4}>{g.reference}</SectionLabel>
      <div class="card">
        <ul class="rows">
          {row(copy.settings.readingsRow, line.readings, 'type', onReadings, 'settings-readings')}
          {row(copy.settings.wording, line.wording, 'type', onWording, 'settings-wording')}
          {row(n.legend, line.legend, 'legend', onLegend, 'settings-legend')}
          {row(n.about, line.about, 'info', () => onSection('about'), 'settings-about')}
        </ul>
      </div>
    </section>
  )
}

/** Seven toggles, Sunday first as the phone counts them, four to a row so each is a full target. */
function DayChips({ label, value, onChange, testid }: { label: string; value: Record<Weekday, boolean>; onChange: (v: Record<Weekday, boolean>) => void; testid?: string }) {
  return (
    <div class="setting" data-testid={testid}>
      <p class="setting-label">{label}</p>
      <div class="days" role="group" aria-label={label}>
        {WEEKDAYS.map((d) => (
          <button key={d} type="button" class={value[d] ? 'day is-on' : 'day'} aria-pressed={value[d]} aria-label={weekdayName(d)} onClick={() => onChange({ ...value, [d]: !value[d] })}>
            {copy.week.days[d]}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Where you are, roughly (Part 35): typed once as latitude and longitude, kept to one decimal, and
 * today's sunrise and sunset shown back. Emptied, the hours you set take over again. Nothing is
 * looked up or sent anywhere: the sun is worked out on the phone.
 */
function PlaceRow({ place, onSave }: { place: Place | null; onSave: (p: Place | null) => void }) {
  const w = copy.week
  const [text, setText] = useState(place ? placeText(place) : '')
  const [bad, setBad] = useState(false)
  useEffect(() => setText(place ? placeText(place) : ''), [place?.lat, place?.lon])
  const sun = place ? sunLocal(blockAt(new Date()).day, place) : null
  function save() {
    if (!text.trim()) {
      setBad(false)
      if (place) onSave(null)
      return
    }
    const p = parsePlace(text)
    setBad(!p)
    if (p && (p.lat !== place?.lat || p.lon !== place?.lon)) onSave(p)
  }
  return (
    <div class="setting" data-testid="place-row">
      <p class="setting-label">{w.place}</p>
      <input
        class="input"
        type="text"
        inputMode="decimal"
        maxLength={40}
        placeholder={w.placeHint}
        value={text}
        aria-label={w.place}
        data-testid="place-field"
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        }}
      />
      <p class="note faint" data-testid="place-note">
        {bad ? w.placeBad : place ? (sun ? fill(w.placeSun, { rise: formatHHMM(sun.rise), set: formatHHMM(sun.set) }) : w.placePolar) : w.placeNone}
      </p>
    </div>
  )
}

/** Part 43: while Location Context gives the sun its area, the place typed above only stands in; says so, with today's sun. */
function AutoPlaceNote({ settings }: { settings: Settings }) {
  const where = sunPlace(settings)
  if (where?.from !== 'auto') return null
  const sun = sunLocal(blockAt(new Date()).day, where.place)
  return sun ? (
    <p class="note faint" data-testid="place-auto">
      {fill(copy.week.placeAuto, { rise: formatHHMM(sun.rise), set: formatHHMM(sun.set) })}
    </p>
  ) : null
}

/** Your direction, one line, kept on this phone; saved when you leave the field. */
function DirectionField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      class="input"
      type="text"
      maxLength={200}
      placeholder={copy.direction.placeholder}
      value={text}
      data-testid="direction-field"
      onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => onSave(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}

/** Appearance → Theme: the three, each drawn in its own theme; a tap switches at once and keeps your place. */
function ThemePicker() {
  const theme = useTheme()
  const a = copy.appearance
  return (
    <>
      <ul class="theme-opts" role="radiogroup" aria-label={a.theme}>
        {THEMES.map((t) => (
          <li key={t}>
            <button type="button" role="radio" class="theme-opt" aria-checked={t === theme} data-testid={`theme-${t}`} onClick={() => setTheme(t)}>
              <span class="swatch" data-theme={t} aria-hidden="true">
                <span class="swatch-num">50</span>
                <span class="swatch-bar">
                  <span class="swatch-pill" />
                  <span class="swatch-ev" />
                </span>
              </span>
              <span>
                <span class="theme-name">{a.names[t]}</span>
                <span class="theme-line">{a.lines[t]}</span>
                {t === theme && <span class="theme-current">{a.current}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p class="note faint">{a.note}</p>
    </>
  )
}

/** One section of Settings, on its own screen, with the controls it always had. */
export function SettingsSectionScreen({ section, onClose, onPrivate }: { section: SettingsSection; onClose: () => void; onPrivate: () => void }) {
  const settings = useLive(getSettings, [])
  const [perm, setPerm] = useState<Permission>(currentPermission)
  const [copied, setCopied] = useState(false)
  const [showAddress, setShowAddress] = useState(false)
  if (!settings) return <section class="screen" />

  const n = copy.settingsNav
  const set = (change: (s: Settings) => Settings) => void updateSettings(change)
  const setExtra = (key: keyof Settings['extras'], on: boolean) => set((s) => ({ ...s, extras: { ...s.extras, [key]: on } }))
  const setWeek = (change: (w: Settings['week']) => Settings['week']) => set((s) => ({ ...s, week: change(s.week) }))

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

  const titles: Record<SettingsSection, string> = { week: n.week, location: n.location, checkins: n.checkins, extras: n.extras, moves: n.moves, direction: n.direction, theme: copy.appearance.theme, about: n.about }
  const cur: Settings = settings
  const w = cur.week
  const sub = cur.push.subscription

  function body() {
    switch (section) {
      case 'week':
        return (
          <>
            <div class="card">
              <Seg
                label={copy.week.churchDay}
                class="seg-days"
                value={w.churchDay === null ? 'none' : String(w.churchDay)}
                options={[...WEEKDAYS.map((d) => ({ v: String(d), l: copy.week.days[d] })), { v: 'none', l: copy.week.none }]}
                onChange={(v) => setWeek((week) => ({ ...week, churchDay: v === 'none' ? null : (Number(v) as Weekday) }))}
              />
              <SwitchRow label={copy.week.livesWithMe} note={copy.week.livesWithMeNote} on={w.livesWithMe} onChange={(livesWithMe) => setWeek((week) => ({ ...week, livesWithMe }))} testid="lives-with-me" />
              <DayChips label={copy.week.studyNights} value={w.studyNights} onChange={(studyNights) => setWeek((week) => ({ ...week, studyNights }))} testid="study-days" />
              {/* Workstream 6, D5: a preference only. It orders what is already due to learn; it never makes anything due or picks a subject. */}
              {WEEKDAYS.some((d) => w.studyNights[d]) && (
                <Seg
                  label={copy.week.studyPartLabel}
                  class="seg-halves"
                  value={w.studyPart ?? 'any'}
                  options={(['any', 'morning', 'afternoon', 'evening'] as const).map((v) => ({ v, l: copy.week.studyParts[v] }))}
                  onChange={(v) => setWeek((week) => ({ ...week, studyPart: v as NonNullable<typeof week.studyPart> }))}
                />
              )}
              <p class="note faint in-card" data-testid="study-days-note">{copy.week.studyNote}</p>
              <DayChips label={copy.week.officeDays} value={w.officeDays} onChange={(officeDays) => setWeek((week) => ({ ...week, officeDays }))} testid="office-days" />
              <PlaceRow place={cur.place} onSave={(place) => set((s) => ({ ...s, place }))} />
              <AutoPlaceNote settings={cur} />
              {!cur.place && <TimeRow label={copy.week.daylightFrom} value={cur.daylight.from} onChange={(from) => set((s) => ({ ...s, daylight: { ...s.daylight, from } }))} />}
              {!cur.place && <TimeRow label={copy.week.daylightTo} value={cur.daylight.to} onChange={(to) => set((s) => ({ ...s, daylight: { ...s.daylight, to } }))} />}
              <SwitchRow label={copy.week.pickupOn} on={w.pickupTime !== null} onChange={(on) => setWeek((week) => ({ ...week, pickupTime: on ? '17:00' : null }))} testid="pickup-on" />
              {w.pickupTime !== null && <TimeRow label={copy.week.pickupTime} value={w.pickupTime} onChange={(pickupTime) => setWeek((week) => ({ ...week, pickupTime }))} />}
              {w.pickupTime !== null && <DayChips label={copy.week.daycareDays} value={w.daycareDays} onChange={(daycareDays) => setWeek((week) => ({ ...week, daycareDays }))} testid="daycare-days" />}
              {w.pickupTime !== null && <TimeRow label={copy.week.soloUntil} value={w.soloUntil} onChange={(soloUntil) => setWeek((week) => ({ ...week, soloUntil }))} />}
            </div>
            <p class="note faint">{copy.week.note}</p>
          </>
        )
      case 'checkins':
        return (
          <>
            <SectionLabel index={0}>{copy.settings.checkins}</SectionLabel>
            <div class="card">
              <Seg
                label={copy.settings.depth}
                note={copy.settings.depthNote}
                value={cur.depth}
                options={[
                  { v: 'full', l: copy.settings.depthFull },
                  { v: 'short', l: copy.settings.depthShort },
                ]}
                onChange={(depth) => set((s) => ({ ...s, depth }))}
              />
              <Seg
                label={copy.settings.frequency}
                value={cur.frequency}
                options={[
                  { v: 'three', l: copy.settings.freqThree },
                  { v: 'two', l: copy.settings.freqTwo },
                  { v: 'one', l: copy.settings.freqOne },
                ]}
                onChange={(frequency) => set((s) => ({ ...s, frequency }))}
              />
              <SwitchRow label={copy.settings.lowDemand} note={copy.settings.lowDemandNote} on={cur.lowDemand} onChange={(on) => set((s) => applyLowDemand(s, on))} testid="low-demand" />
            </div>

            <SectionLabel index={1}>{copy.settings.quiet}</SectionLabel>
            <div class="card">
              <TimeRow label={copy.settings.quietFrom} value={cur.quietStart} onChange={(quietStart) => set((s) => ({ ...s, quietStart }))} />
              <TimeRow label={copy.settings.quietTo} value={cur.quietEnd} onChange={(quietEnd) => set((s) => ({ ...s, quietEnd }))} />
            </div>
            <p class="note faint">{copy.settings.quietNote}</p>

            <SectionLabel index={2}>{copy.settings.reminders}</SectionLabel>
            <div class="card">
              {perm === 'unsupported' ? (
                <p class="note in-card">{copy.settings.remindersUnsupported}</p>
              ) : (
                <>
                  <SwitchRow label={copy.settings.remindersOn} on={cur.reminders.enabled} onChange={(on) => void toggleReminders(on)} testid="reminders-on" />
                  {perm === 'denied' && <p class="note in-card">{copy.settings.remindersDenied}</p>}
                  {cur.reminders.enabled &&
                    activeBlocks(cur.frequency).map((b) => (
                      <TimeRow
                        key={b}
                        label={fill(copy.settings.reminderTime, { block: copy.blocks[b] })}
                        value={cur.reminders.times[b]}
                        onChange={(t) => set((s) => ({ ...s, reminders: { ...s.reminders, times: { ...s.reminders.times, [b]: t } } }))}
                      />
                    ))}
                </>
              )}
            </div>
            <p class="note faint">{copy.settings.remindersNote}</p>
            {/* Until the ping is set up, the in-app reminder note says how to be rung with the app closed; after, it has done its job. */}
            {cur.reminders.enabled && !sub && <p class="note faint">{copy.settings.inAppNote}</p>}

            {cur.reminders.enabled && perm === 'granted' && (
              <div class="card pad ping" data-testid="ping">
                <h3 class="title-sm">{copy.settings.pushTitle}</h3>
                {!pushSupported() ? (
                  <p class="note">{copy.settings.pushUnsupported}</p>
                ) : !sub ? (
                  <>
                    <div class="actions">
                      <button type="button" class="pill-quiet" onClick={() => void setUpPush()}>
                        {copy.settings.pushSetup}
                      </button>
                    </div>
                    <p class="note faint no-gap">{copy.settings.pushNote}</p>
                  </>
                ) : (
                  <>
                    {cur.push.changed && <p class="note">{copy.settings.pushChanged}</p>}
                    <Disclosure label={copy.settingsNav.pingDetails} sub={cur.push.subscribedAt ? fill(n.pingSet, { when: formatWhen(cur.push.subscribedAt) }) : undefined} testid="ping-details" defaultOpen={cur.push.changed}>
                      <p class="note">
                        <code>{shortAddress(sub.endpoint ?? '')}</code>
                      </p>
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
                      <p class="note faint no-gap">{copy.settings.pushNote}</p>
                    </Disclosure>
                  </>
                )}
              </div>
            )}
          </>
        )
      case 'extras':
        return (
          <div class="card">
            <SwitchRow label={copy.settings.extraWin} on={cur.extras.minimumWin} onChange={(on) => setExtra('minimumWin', on)} />
            <SwitchRow label={copy.settings.extraCaffeine} on={cur.extras.caffeine} onChange={(on) => setExtra('caffeine', on)} />
            <SwitchRow label={copy.settings.extraDinner} on={cur.extras.dinner} onChange={(on) => setExtra('dinner', on)} />
            <SwitchRow label={copy.settings.extraPrivate} on={cur.extras.privateLog} onChange={(on) => setExtra('privateLog', on)} />
            <SwitchRow label={copy.settings.extraFaith} note={copy.settings.faithNote} on={cur.extras.faith} onChange={(on) => setExtra('faith', on)} />
          </div>
        )
      case 'moves':
        return (
          <>
            <div class="card">
              <SwitchRow label={copy.settings.offerFaith} note={copy.settings.offerFaithNote} on={!cur.hideFaith} onChange={(on) => set((s) => ({ ...s, hideFaith: !on }))} testid="offer-faith" />
              <SwitchRow label={copy.settings.privateInSelection} note={copy.settings.privateInSelectionNote} on={cur.privateInSelection} onChange={(on) => set((s) => ({ ...s, privateInSelection: on }))} testid="private-in-selection" />
            </div>
            <div class="card">
              <ul class="rows">
                <LinkRow label={copy.settings.private} note={copy.settings.privateNote} icon="lock" onClick={onPrivate} testid="settings-private" />
              </ul>
            </div>
          </>
        )
      case 'direction':
        return (
          <div class="card pad">
            <DirectionField value={cur.direction ?? ''} onSave={(v) => set((s) => ({ ...s, direction: v.trim() || null, directionAskedAt: s.directionAskedAt ?? new Date().toISOString() }))} />
            <p class="note faint no-gap">{copy.direction.settingsNote}</p>
          </div>
        )
      case 'theme':
        return <ThemePicker />
      case 'location':
        return <LocationSection />
      case 'about': {
        const tests =
          build.unitTests === null
            ? copy.settings.testsUnknown
            : fill(build.unitTests === 1 ? copy.settings.testsOne : copy.settings.testsMany, { n: String(build.unitTests) })
        return (
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
        )
      }
    }
  }

  return (
    <section class="screen" data-testid={`settings-section-${section}`}>
      <SubHead title={titles[section]} back={n.back} onBack={onClose} />
      {body()}
    </section>
  )
}
