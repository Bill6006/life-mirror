import { useState } from 'preact/hooks'
import { CLOUD_URL } from './cloudStore'
import { removeToken, saveToken, syncNow, useCloudStatus } from './cloudSync'
import { copy } from './copy'
import { getSettings } from './db'
import { fill, formatWhen } from './format'
import { useLive } from './live'
import { readLog } from './tokenVault'

/**
 * Settings → Cloud copy. The database, a constant; the token, pasted once and kept in this
 * app's storage on the phone; the status, last sync and what is pending; and Sync now. Sync
 * stays off until a token exists. Rule 21: the phone is the source of truth.
 */
export function CloudScreen({ onClose }: { onClose: () => void }) {
  const settings = useLive(getSettings, [])
  const status = useCloudStatus()
  const [token, setToken] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  if (!settings || !status) return <section class="screen" />
  const c = copy.cloud

  function keep() {
    const t = token.trim()
    if (!t) return
    setProblem(null)
    saveToken(t).then(
      () => {
        setToken('')
        void syncNow()
      },
      (e: unknown) => setProblem(e instanceof Error ? e.message : c.notKept),
    )
  }

  function remove() {
    void removeToken()
  }

  const notice = status.notice
  const noticeLine = notice ? `${formatWhen(notice.at)}${notice.lastSeenAt ? `, ${fill(c.lastSeen, { when: formatWhen(notice.lastSeenAt) })}` : ''}: ${notice.detail}` : null
  const log = readLog().slice(-3)

  const statusLine = !status.hasToken
    ? notice?.kind === 'missing'
      ? fill(c.tokenMissing, { when: formatWhen(notice.at) })
      : c.off
    : status.state === 'syncing'
      ? c.syncing
      : status.state === 'offline'
        ? c.offline
        : status.state === 'error' && status.lastError
          ? fill(c.error, { error: status.lastError })
          : status.lastSyncAt
            ? fill(c.lastSync, { when: formatWhen(status.lastSyncAt) })
            : c.never
  const pendingLine = status.pending > 0 ? fill(c.pending, { n: String(status.pending) }) : c.pendingNone

  return (
    <section class="screen" data-testid="cloud">
      <header class="screen-head">
        <p class="eyebrow">{c.title}</p>
      </header>
      <p class="note">{c.intro}</p>

      <h2 class="section">{c.url}</h2>
      <div class="card pad">
        <p class="address mono" data-testid="cloud-url">
          {CLOUD_URL}
        </p>
        <p class="note faint no-gap">{c.urlNote}</p>
      </div>

      <h2 class="section">{c.token}</h2>
      <div class="card pad">
        {settings.cloud.token ? (
          <>
            <p class="note" data-testid="token-set">
              {c.tokenSet}
            </p>
            <div class="actions">
              <button type="button" class="textbtn" data-testid="token-remove" onClick={remove}>
                {c.remove}
              </button>
            </div>
          </>
        ) : (
          <div class="add">
            <input
              class="input"
              type="password"
              autocomplete="off"
              placeholder={c.tokenPlaceholder}
              value={token}
              data-testid="token-input"
              onInput={(e) => setToken((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') keep()
              }}
            />
            <button type="button" class="pill-quiet" data-testid="token-keep" disabled={!token.trim()} onClick={keep}>
              {c.keep}
            </button>
          </div>
        )}
        <p class="note faint no-gap">{c.tokenNote}</p>
        {problem && (
          <p class="note" role="alert" data-testid="token-problem">
            {problem}
          </p>
        )}
        {noticeLine && (
          <p class="note" role="status" data-testid="token-notice">
            {noticeLine}
          </p>
        )}
      </div>

      <h2 class="section">{c.status}</h2>
      <div class="card pad">
        <p class="note" data-testid="cloud-status">
          {statusLine}
        </p>
        <p class="note faint" data-testid="cloud-pending">
          {pendingLine}
        </p>
        <p class="note faint">
          {c.device}: <span class="mono">{settings.cloud.deviceId || '—'}</span>
        </p>
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="sync-now" disabled={!status.hasToken || status.state === 'syncing'} onClick={() => void syncNow()}>
            {c.syncNow}
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <>
          <h2 class="section">{c.tokenLog}</h2>
          <div class="card pad" data-testid="token-log">
            {log.map((e) => (
              <p class="note faint" key={`${e.at}-${e.kind}`}>
                {formatWhen(e.at)} · {e.kind} · {e.detail}
              </p>
            ))}
          </div>
        </>
      )}

      <p class="note faint">{c.restoreNote}</p>
      <p class="note faint">{c.limit}</p>

      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}
