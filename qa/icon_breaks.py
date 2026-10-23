"""The owner's icon (Phase C, 2026-10-23), each rule undone once: the test that guards it must turn red.

The source is the owner's image exactly as given; every icon is drawn from it whole (the 192, the 512, the touch icon and
the favicon); the maskable one holds it at 0.9, its artwork inside the safe zone, the image's own ground carried out to
the edges with no seam; the manifest and the page name the new files, the maskable one marked so; a notification carries
the new icon; and the earlier icon's files are gone.

Same rules as the other runners: a green baseline first, one exact change, everything restored byte for byte, the table
read as data, and an empty test list refused. A change to the renderer or its source is followed by `npm run icons`, so
public/icons is kept aside first and put back byte for byte after; every break is built before its test and rebuilt
after its restore. Kinds of change: `old`/`new` replaces text once; `append` adds bytes to the end of a file; `create`
writes a file that must not exist, and removes it after.

python icon_breaks.py [id ...]
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
S = 'e2e/smoke.spec.ts'
MK = 'scripts/make-icons.mjs'
NAMES = 'the icon: every size'
OWNER = 'the icon is the owner'
ICONS = 'public/icons/'

TABLE = [
    dict(id='source-exact', file='scripts/icon-source.png', append=b'\x00', regen=True,
         tests=[S], pattern=OWNER),
    dict(id='maskable-safe-zone', file=MK,
         old="  ['life-mirror-maskable-512', 512, 0.9],\n",
         new="  ['life-mirror-maskable-512', 512, 1],\n",
         regen=True, tests=[S], pattern=OWNER),
    dict(id='maskable-ground-carried', file=MK,
         old="      if (at > 0) {\n",
         new="      if (false) {\n",
         regen=True, tests=[S], pattern=OWNER),
    dict(id='icon-512-whole', file=MK,
         old="  ['life-mirror-512', 512, 1],\n",
         new="  ['life-mirror-512', 512, 0.8],\n",
         regen=True, tests=[S], pattern=OWNER),
    dict(id='icon-192-whole', file=MK,
         old="  ['life-mirror-192', 192, 1],\n",
         new="  ['life-mirror-192', 192, 0.8],\n",
         regen=True, tests=[S], pattern=OWNER),
    dict(id='touch-whole', file=MK,
         old="  ['life-mirror-touch-180', 180, 1],\n",
         new="  ['life-mirror-touch-180', 180, 0.8],\n",
         regen=True, tests=[S], pattern=OWNER),
    dict(id='favicon-whole', file=MK,
         old="const fav = (await render(FAVICON, 1)).toString('base64')",
         new="const fav = (await render(FAVICON, 0.8)).toString('base64')",
         regen=True, tests=[S], pattern=OWNER),
    dict(id='manifest-new-names', file='vite.config.ts',
         old="          { src: 'icons/life-mirror-192.png', sizes: '192x192', type: 'image/png' },\n",
         new="          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },\n",
         tests=[S], pattern=NAMES),
    dict(id='manifest-maskable', file='vite.config.ts',
         old="type: 'image/png', purpose: 'maskable' },",
         new="type: 'image/png' },",
         tests=[S], pattern=NAMES),
    dict(id='page-favicon', file='index.html',
         old='<link rel="icon" href="%BASE_URL%icons/life-mirror-favicon.svg" type="image/svg+xml" />',
         new='<link rel="icon" href="%BASE_URL%favicon.svg" type="image/svg+xml" />',
         tests=[S], pattern=NAMES),
    dict(id='page-touch-icon', file='index.html',
         old='<link rel="apple-touch-icon" href="%BASE_URL%icons/life-mirror-touch-180.png" />',
         new='<link rel="apple-touch-icon" href="%BASE_URL%icons/apple-touch-icon.png" />',
         tests=[S], pattern=NAMES),
    dict(id='notification-icon', file='src/appIcon.ts',
         old="export const NOTIFICATION_ICON = 'icons/life-mirror-192.png'\n",
         new="export const NOTIFICATION_ICON = 'icons/icon-192.png'\n",
         tests=[S], pattern=OWNER),
    dict(id='earlier-icon-gone', file='public/favicon.svg',
         create='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f80"/></svg>\n',
         tests=[S], pattern=OWNER),
]


def sh(cmd, what):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit(f'{what} failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def build():
    sh([NPM, 'run', 'build'], 'build')


def regen():
    sh([NPM, 'run', 'icons'], 'icons')


def icons_kept():
    return {n: io.open(ROOT + ICONS + n, 'rb').read() for n in sorted(os.listdir(ROOT + ICONS))}


def icons_back(kept):
    for n in os.listdir(ROOT + ICONS):
        if n not in kept:
            os.remove(ROOT + ICONS + n)
    for n, b in kept.items():
        io.open(ROOT + ICONS + n, 'wb').write(b)
    assert icons_kept() == kept, 'public/icons not restored'


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    cmd = [NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests]
    if pattern:
        cmd += ['-g', pattern]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
    failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
    return r.returncode, failed, passed, out


def main(ids):
    rows = [t for t in TABLE if not ids or t['id'] in ids]
    assert rows, 'no entry matched'
    results = []
    build()
    for t in rows:
        path = ROOT + t['file']
        creating = 'create' in t
        if creating:
            if os.path.exists(path):
                results.append((t['id'], 'SETUP: the file to create already exists'))
                print(t['id'], '->', results[-1][1], flush=True)
                continue
            original = None
        else:
            original = io.open(path, 'rb').read()
            if 'old' in t and original.decode('utf-8').count(t['old']) != 1:
                results.append((t['id'], f"SETUP: the text to break appears {original.decode('utf-8').count(t['old'])} times"))
                print(t['id'], '->', results[-1][1], flush=True)
                continue
        code, failed, passed, out = run(t['tests'], t.get('pattern'))
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        kept = icons_kept()
        try:
            if creating:
                io.open(path, 'wb').write(t['create'].encode('utf-8'))
            elif 'append' in t:
                io.open(path, 'wb').write(original + t['append'])
            else:
                io.open(path, 'wb').write(original.decode('utf-8').replace(t['old'], t['new']).encode('utf-8'))
            if t.get('regen'):
                regen()
            build()
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            if creating:
                if os.path.exists(path):
                    os.remove(path)
            else:
                io.open(path, 'wb').write(original)
            icons_back(kept)
            build()
        if creating:
            assert not os.path.exists(path), 'not removed: ' + t['file']
        else:
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
