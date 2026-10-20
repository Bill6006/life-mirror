"""The ping's address (2026-10-20), each rule undone once: the test that guards it must turn red.

The owner reported that the ping's section in Settings showed only after Remind me was switched off and on, and decided
that the address travels through the cloud copy. The Worker sends to the address the phone's settings record carries,
at the cron's ping time and by hand, and to the secret copied by hand only for a record without the field; a record that
says the ping was turned off sends nothing; only an https address with both keys is sent to; its report says where it
read the address and when it was set up, never the address. The phone sends its own address with the settings, none once
turned off by hand, else the one it pulled, passed on unchanged, and never the rest of its push state; a pull keeps the
cloud's address aside and never takes it as this phone's own. At start the address kept is checked against the
browser's: a live one the cloud has not had is sent, keeping when it was set up; one under an older key is replaced; one
the browser lost is made again when notifications are allowed, by the page's permission or the push manager's, and when
only a tap can allow them Now offers the tap; no tap while they are blocked; a refusal by the push service asks for the
tap; nothing starts a ping never set up, and one turned off by hand stays off; the check's result is kept. Settings shows
the section whenever reminders are on and notifications are not blocked, reads the permission again when the app comes
back, and its set-up asks for the permission while it is undecided and keeps the address; its note says the address
travels with the cloud copy. Now's line shows while the tap is needed, and its tap keeps the address.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore. The texts that span several
lines were copied from the source as it stood, never retyped.

python ping_breaks.py [id ...]
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
CONFIG = os.environ.get('PW_CONFIG', 'playwright.config.ts')
WA = 'worker/src/address.test.ts'
WP = 'worker/src/pingAddress.test.ts'
CT = 'src/cloud.test.ts'
PT = 'src/push.test.ts'
PS = 'e2e/ping.spec.ts'
OWN = "  if (own?.subscription) return { subscription: own.subscription, subscribedAt: own.subscribedAt ?? null }\n"
HAD_PING = "  if (!(kept.subscription || kept.subscribedAt || s.cloudPush?.subscription)) return null\n"
CARD = "{cur.reminders.enabled && perm !== 'denied' && perm !== 'unsupported' && ("

TABLE = [
    # The Worker.
    dict(id='worker-reads-settings', file='worker/src/address.ts', tests=[WA, WP],
         old="  if (settings && typeof settings === 'object' && Object.prototype.hasOwnProperty.call(settings, 'push')) {\n",
         new="  if (false && settings && typeof settings === 'object' && Object.prototype.hasOwnProperty.call(settings, 'push')) {\n"),
    dict(id='worker-off-means-off', file='worker/src/address.ts', tests=[WA, WP],
         old="    const sub = subscriptionOf(p?.subscription)\n",
         new="    const sub = subscriptionOf(p?.subscription) ?? (secret ? subscriptionOf(JSON.parse(secret)) : null)\n"),
    dict(id='worker-https-only', file='worker/src/address.ts', tests=[WA],
         old="!s.endpoint.startsWith('https://')", new="!s.endpoint.startsWith('http')"),
    dict(id='worker-both-keys', file='worker/src/address.ts', tests=[WA],
         old="  if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) return null\n",
         new="  if (typeof p256dh !== 'string' || !p256dh) return null\n"),
    dict(id='cron-reads-settings', file='worker/src/index.ts', tests=[WP],
         old="const send = sender(env, await store.readRecord('settings', '1'))", new="const send = sender(env, null)"),
    dict(id='push-by-hand-reads-settings', file='worker/src/index.ts', tests=[WP],
         old="const send = sender(env, env.TURSO_TOKEN ? await tursoStore(env.TURSO_URL, env.TURSO_TOKEN).readRecord('settings', '1') : null)",
         new="const send = sender(env, null)"),
    dict(id='report-says-where', file='worker/src/index.ts', tests=[WP],
         old="address: a.sub !== null, addressFrom: a.from, addressSetUpAt: a.setUpAt,",
         new="address: Boolean(env.PUSH_SUBSCRIPTION),"),
    dict(id='report-never-the-address', file='worker/src/index.ts', tests=[WP],
         old="address: a.sub !== null, addressFrom: a.from, addressSetUpAt: a.setUpAt,",
         new="address: a.sub !== null, addressFrom: a.from, addressSetUpAt: a.setUpAt, endpoint: a.sub?.endpoint,"),
    # The address with the settings.
    dict(id='body-carries-address', file='src/cloudOutbox.ts', tests=[CT],
         old="  return synced === undefined ? rest : { ...rest, push: synced }\n", new="  return rest\n"),
    dict(id='body-own-first', file='src/cloudOutbox.ts', tests=[CT], old=OWN,
         new="  if (own?.subscription && pulled === undefined) return { subscription: own.subscription, subscribedAt: own.subscribedAt ?? null }\n"),
    dict(id='body-only-the-address', file='src/cloudOutbox.ts', tests=[CT], old=OWN,
         new="  if (own?.subscription) return own as unknown as SyncedPush\n"),
    dict(id='body-dropped-sends-none', file='src/cloudOutbox.ts', tests=[CT],
         old="  if (own?.droppedAt) return { subscription: null, subscribedAt: null }\n", new=""),
    dict(id='body-passes-pulled', file='src/cloudOutbox.ts', tests=[CT],
         old="  if (pulled === undefined) return undefined\n  return pulled ?? { subscription: null, subscribedAt: null }\n",
         new="  return undefined\n"),
    dict(id='pull-keeps-address-aside', file='src/cloudSync.ts', tests=[CT],
         old="...(cloudPush !== undefined ? { cloudPush } : {}), ", new=""),
    dict(id='pull-keeps-own-push', file='src/cloudSync.ts', tests=[CT],
         old="push: mine?.push ?? withDefaults(undefined).push, ...(cloudPush",
         new="push: withDefaults(body as Partial<Settings>).push, ...(cloudPush"),
    # The check at start.
    dict(id='permission-push-manager', file='src/push.ts', tests=[PT],
         old="  if (Notification.permission !== 'default') return Notification.permission\n",
         new="  return Notification.permission\n"),
    dict(id='reconcile-remakes', file='src/push.ts', tests=[PT],
         old="  if (permission === 'granted') {\n", new="  if (false) {\n"),
    dict(id='reconcile-only-set-up', file='src/push.ts', tests=[PT, PS], old=HAD_PING, new=""),
    dict(id='reconcile-cloud-remembers', file='src/push.ts', tests=[PT],
         old="kept.subscription || kept.subscribedAt || s.cloudPush?.subscription", new="kept.subscription || kept.subscribedAt"),
    dict(id='reconcile-dropped-stays-off', file='src/push.ts', tests=[PT, PS],
         old="  if (!s.reminders.enabled || kept.droppedAt) return", new="  if (!s.reminders.enabled) return"),
    dict(id='reconcile-denied-no-tap', file='src/push.ts', tests=[PT],
         old="  let needsTap = permission === 'default'\n", new="  let needsTap = permission !== 'granted'\n"),
    dict(id='reconcile-refused-asks-tap', file='src/push.ts', tests=[PT],
         old="      // A push service that gives no address now: the tap on Now tries again.\n      needsTap = true\n",
         new="      // A push service that gives no address now: the tap on Now tries again.\n"),
    dict(id='reconcile-sends-unsynced', file='src/push.ts', tests=[PT],
         old="    if (kept.subscription?.endpoint === sub.endpoint && kept.syncedEndpoint === sub.endpoint && !kept.needsTap) return null\n",
         new="    if (kept.subscription?.endpoint === sub.endpoint && !kept.needsTap) return null\n"),
    dict(id='reconcile-keeps-setup-time', file='src/push.ts', tests=[PT],
         old="subscribedAt: same && kept.subscribedAt ? kept.subscribedAt : new Date().toISOString()",
         new="subscribedAt: new Date().toISOString()"),
    dict(id='reconcile-old-key', file='src/push.ts', tests=[PT],
         old="  if (live && !sameKey(live)) {\n", new="  if (live && false) {\n"),
    dict(id='setup-asks-permission', file='src/push.ts', tests=[PT, PS],
         old="  if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()\n",
         new=""),
    dict(id='start-check-runs', file='src/app.tsx', tests=[PS],
         old="    check()\n    document.addEventListener('visibilitychange', check)\n",
         new="    document.addEventListener('visibilitychange', check)\n"),
    dict(id='start-check-kept', file='src/app.tsx', tests=[PS],
         old="(JSON.stringify(s.push) === JSON.stringify(read.push) ? { ...s, push } : s)",
         new="(JSON.stringify(s.push) === JSON.stringify(read.push) ? s : s)"),
    # Settings and Now.
    dict(id='settings-section-not-granted-only', file='src/settingsScreen.tsx', tests=[PS], old=CARD,
         new="{cur.reminders.enabled && perm === 'granted' && ("),
    dict(id='settings-section-hides-blocked', file='src/settingsScreen.tsx', tests=[PS],
         old="perm !== 'denied' && perm !== 'unsupported' && (", new="perm !== 'unsupported' && ("),
    dict(id='settings-reads-on-return', file='src/settingsScreen.tsx', tests=[PS],
         old="    read()\n    document.addEventListener('visibilitychange', read)\n    return () => document.removeEventListener('visibilitychange', read)\n",
         new="    read()\n"),
    dict(id='settings-setup-kept', file='src/settingsScreen.tsx', tests=[PS],
         old="      if (next) set((s) => ({ ...s, push: next }))\n", new=""),
    dict(id='drop-marks-off', file='src/settingsScreen.tsx', tests=[PS],
         old="droppedAt: new Date().toISOString(), needsTap: false, syncedEndpoint: null } }))",
         new="droppedAt: null, needsTap: false, syncedEndpoint: null } }))"),
    dict(id='note-says-it-travels', file='src/copy.ts', tests=[PS],
         old="The address travels with your cloud copy, so the brain always has the current one, and this phone makes a new one by itself if the browser drops it. ",
         new="Paste it once into the brain’s secret named PUSH_SUBSCRIPTION. "),
    dict(id='now-line-shows', file='src/now.tsx', tests=[PS],
         old="      {settings.reminders.enabled && settings.push.needsTap && <PingLost push={settings.push} />}\n", new=""),
    dict(id='now-tap-kept', file='src/now.tsx', tests=[PS],
         old=".then((next) => (next ? updateSettings((s) => ({ ...s, push: next })) : undefined))",
         new=".then(() => undefined)"),
]


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def browser(tests):
    return any(t.startswith('e2e/') for t in tests)


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    if browser(tests):
        units = [t for t in tests if not t.startswith('e2e/')]
        specs = [t for t in tests if t.startswith('e2e/')]
        outs = []
        code = 0
        failed = passed = 0
        if units:
            c, f, p, o = run(units, pattern)
            code, failed, passed = code or c, failed + f, passed + p
            outs.append(o)
        cmd = [NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *specs]
        if pattern:
            cmd += ['-g', pattern]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
        p = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
        f = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
        return code or r.returncode, failed + f, passed + p, '\n'.join(outs + [out])
    cmd = [NPX, 'vitest', 'run', *tests]
    if pattern:
        cmd += ['-t', pattern]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
    failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
    return r.returncode, failed, passed, out


def main(ids):
    rows = [t for t in TABLE if not ids or t['id'] in ids]
    assert rows, 'no entry matched'
    results = []
    if any(browser(t['tests']) for t in rows):
        build()
    for t in rows:
        path = ROOT + t['file']
        original = io.open(path, 'rb').read()
        text = original.decode('utf-8')
        n = text.count(t['old'])
        if n != 1:
            results.append((t['id'], f'SETUP: the text to break appears {n} times'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        code, failed, passed, out = run(t['tests'], t.get('pattern'))
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            if browser(t['tests']):
                build()
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            io.open(path, 'wb').write(original)
            if browser(t['tests']):
                build()
        assert io.open(path, 'rb').read() == original, 'restore failed: ' + t['file']
        verdict = 'CAUGHT' if code2 != 0 and failed2 > 0 else f'MISSED (exit {code2}, {failed2} failed, {passed2} passed)'
        results.append((t['id'], f'{verdict}; baseline {passed} green'))
        print(t['id'], '->', results[-1][1], flush=True)
    print('\nSUMMARY')
    for i, v in results:
        print(f'  {i}: {v}')
    print('caught', sum(1 for _, v in results if v.startswith('CAUGHT')), 'of', len(results))


if __name__ == '__main__':
    main(sys.argv[1:])
