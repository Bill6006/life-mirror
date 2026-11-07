"""P1 of the AI-generated Paths design (2026-11-06), Paths as data: each new rule undone once, and the test that
guards it must turn red.

What a Path's name decided is a trait now (the hard day's light reps, the People row's share and whether it binds
alone, the sheet, the coach), a Path may hold strands that move by their own reps and draw at even chances, the one
People row takes a Path's share of days, your decisions on a Path's versions decide where it is offered, and the
compiler refuses a Path that breaks any of its checks. The golden comparison (src/pathsGolden.test.ts) guards Social
and Partner byte for byte: a change either path could see turns it red.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused.

python paths_p1_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
GOLD = 'src/pathsGolden.test.ts'
DATA = 'src/pathsData.test.ts'
CHK = 'src/pathCheck.test.ts'
PARTNER = 'src/partnerPath.test.ts'
REFUSE = 'refuse each broken rule'

TABLE = [
    # Traits: the hard day's light reps are Partner's alone, and Partner keeps them.
    dict(id='light-reps-all-paths', file='src/pathStage.ts',
         old='  const lightOnly = path.traits.lightOnHardDays === true && i.lightOnly === true\n',
         new='  const lightOnly = i.lightOnly === true\n',
         tests=[GOLD], pattern=None),
    dict(id='light-reps-none', file='src/pathStage.ts',
         old='  const lightOnly = path.traits.lightOnHardDays === true && i.lightOnly === true\n',
         new='  const lightOnly = false && i.lightOnly === true\n',
         tests=[PARTNER], pattern='offers light reps alone on a day the record reads high stress'),
    # The People row: a share of days in seven, binding beside another Path, or alone where the Path says so.
    dict(id='row-share-ignored', file='src/pathStage.ts',
         old="    if (only.length && days.size < (v.path.traits.rowShare ?? 0)) return row(v, turn(v, only, 'own'))\n",
         new="    if (only.length && days.size < 7) return row(v, turn(v, only, 'own'))\n",
         tests=[DATA], pattern='gives the Path’s own reps up to its share'),
    dict(id='row-share-one-more', file='src/pathStage.ts',
         old="    if (only.length && days.size < (v.path.traits.rowShare ?? 0)) return row(v, turn(v, only, 'own'))\n",
         new="    if (only.length && days.size < (v.path.traits.rowShare ?? 0) + 1) return row(v, turn(v, only, 'own'))\n",
         tests=[GOLD], pattern=None),
    dict(id='share-unbound-alone', file='src/pathStage.ts',
         old='    const binds = v.path.traits.shareBindsAlone === true || on.length > 1\n',
         new='    const binds = on.length > 1\n',
         tests=[GOLD], pattern=None),
    dict(id='share-unbound-beside', file='src/pathStage.ts',
         old='    const binds = v.path.traits.shareBindsAlone === true || on.length > 1\n',
         new='    const binds = v.path.traits.shareBindsAlone === true\n',
         tests=[DATA], pattern='gives the Path’s own reps up to its share'),
    dict(id='own-reps-include-shared', file='src/pathStage.ts',
         old='  return Boolean(placeOn(path.id, moveId)) && !paths.some((p) => p.id !== path.id && p.traits.rowShare === undefined && placeOn(p.id, moveId))\n',
         new='  return Boolean(placeOn(path.id, moveId))\n',
         tests=[GOLD], pattern=None),
    # Strands: each moves by its own reps, offers its own stage's reps, draws at even chances; the step records its own strand's stage.
    dict(id='strand-moved-by-others', file='src/pathStage.ts',
         old='      if (strand !== undefined && (place?.strand ?? ONE_STRAND) !== strand) return false\n',
         new='',
         tests=[DATA], pattern='moves each strand by its own reps alone'),
    dict(id='strand-offers-every-strand', file='src/pathStage.ts',
         old='.flatMap((n) => pathReps(i.path.id, n, i.strand))',
         new='.flatMap((n) => pathReps(i.path.id, n))',
         tests=[DATA], pattern='offers the reps that fit from every strand'),
    dict(id='strands-lean', file='src/pathStage.ts',
         old='seeded(`${i.aim.id ?? 0}|${i.day}|${i.block}`), tracks ? NO_LEAN : elig.stage, !around)',
         new='seeded(`${i.aim.id ?? 0}|${i.day}|${i.block}`), elig.stage, !around)',
         tests=[DATA], pattern='offers the reps that fit from every strand'),
    dict(id='step-stage-of-first-strand', file='src/pathStage.ts',
         old='  return pt.strands.find((s) => s.strand.id === strand)?.elig.stage ?? pt.elig.stage\n',
         new='  return pt.elig.stage\n',
         tests=[DATA], pattern='offers the reps that fit from every strand'),
    # Off the phone: a Path of its own reaches neither the coach nor the sheet.
    dict(id='coach-block-takes-all', file='src/pathStage.ts',
         old='  const views = all.filter((v) => v.path.traits.coach)\n',
         new='  const views = all\n',
         tests=[DATA], pattern='is left out of the coach'),
    dict(id='coach-row-names-own', file='src/pathFlow.ts',
         old='  if (!row || !row.view.path.traits.coach) return null\n',
         new='  if (!row) return null\n',
         tests=[DATA], pattern='is left out of the coach'),
    dict(id='coach-pick-on-own-row', file='src/pathFlow.ts',
         old='  const pick = row && row.view.path.traits.coach ? coachPickFor(row, coach, today) : null\n',
         new='  const pick = row ? coachPickFor(row, coach, today) : null\n',
         tests=[DATA], pattern='never takes a coach'),
    dict(id='facts-for-own-path', file='src/facts.ts',
         old="    if (aim.kind === 'path' && (aim.pausedAt || !findPath(aim.path as string)?.traits.sheet)) continue\n",
         new="    if (aim.kind === 'path' && (aim.pausedAt || aim.path === 'partner')) continue\n",
         tests=[DATA], pattern='writes no fact at all'),
    dict(id='sheet-counts-own-steps', file='src/facts.ts',
         old='  return !o.paths?.some((id) => !sheet(id)) || o.paths.some(sheet)\n',
         new="  return !o.paths?.includes('partner') || o.paths.includes('social')\n",
         tests=[DATA], pattern='leaves its own steps out of the sheet'),
    dict(id='weekly-names-own-reps', file='src/weeklyFacts.ts',
         old="  if (held.some((id) => !findPath(id)?.traits.sheet) && !held.some((id) => findPath(id)?.traits.sheet)) return 'partner'\n",
         new="  if (m.path?.partner && !m.path.social) return 'partner'\n",
         tests=[DATA], pattern='keeps its own reps out of the weekly view'),
    # Your decisions on its versions.
    dict(id='major-change-runs', file='src/pathVersions.ts',
         old="  return since.some((c) => c.major) ? { kind: 'waiting', changes: since } : { kind: 'started', noted: since }\n",
         new="  return { kind: 'started', noted: since }\n",
         tests=[DATA], pattern='show what changed since the version you started'),
    dict(id='built-in-needs-a-start', file='src/pathVersions.ts',
         old="  if (path.builtIn) return { kind: 'builtIn' }\n",
         new='',
         tests=[DATA], pattern='offer a Path the catalogue adds nowhere until you start it'),
    dict(id='not-this-forgotten', file='src/pathVersions.ts',
         old="  if (last.decision === 'notThis') return { kind: 'declined', reason: last.reason ?? null }\n",
         new='',
         tests=[DATA], pattern='offer a Path the catalogue adds nowhere until you start it'),
    dict(id='hash-counts-change-records', file='src/pathVersions.ts',
         old='  const { changes: _changes, ...rest } = path\n',
         new='  const rest = path\n',
         tests=[DATA], pattern='hash a Path by what you would see'),
    # A Path names itself, says its own turn, and wears its own icon.
    dict(id='turn-said-as-partner', file='src/pathStage.ts',
         old="  if (!path || path.id === 'partner' || path.traits.rowShare === undefined) return c.turn[turn]\n",
         new='  return c.turn[turn]\n',
         tests=[DATA], pattern='is named by itself'),
    dict(id='name-from-copy-alone', file='src/pathStage.ts',
         old='  return (copy.path.names as Readonly<Record<string, string>>)[path.id] ?? path.names?.called ?? path.name ?? path.id\n',
         new='  return (copy.path.names as Readonly<Record<string, string>>)[path.id] ?? path.name ?? path.id\n',
         tests=[DATA], pattern='is named by itself'),
    dict(id='icon-by-name', file='src/aimCard.tsx',
         old="  if (aim.kind === 'path') return (findPath(aim.path as PathId)?.traits.icon ?? 'social') as IconName\n",
         new="  if (aim.kind === 'path') return (aim.path as PathId) === 'partner' ? 'partner' : 'social'\n",
         tests=[DATA], pattern='wears its own icon'),
    # The compiler: each check refuses the Path that breaks it.
    dict(id='check-strand', file='src/pathCheck.ts',
         old="      say('structure', `${path.id}:${m.id}`, `placed on a strand the Path does not have: ${place.strand ?? '(none)'}`)\n",
         new='',
         tests=[CHK], pattern=REFUSE),
    dict(id='check-reachable', file='src/pathCheck.ts',
         old="      if (moving.length < rule.distinctReps) say(",
         new="      if (false) say(",
         tests=[CHK], pattern=REFUSE),
    dict(id='check-rep-wording', file='src/pathCheck.ts',
         old="    for (const t of repTexts(m, path.id)) if (outcomeWords(t)) say(",
         new="    for (const t of repTexts(m, path.id)) if (false) say(",
         tests=[CHK], pattern=REFUSE),
    dict(id='check-guardrail', file='src/pathCheck.ts',
         old="  if (!builtIn) for (const m of reps) if ((m.with === 'adult' || m.record) && !guardrailOf(m, path.id)) say(",
         new="  if (false) for (const m of reps) if ((m.with === 'adult' || m.record) && !guardrailOf(m, path.id)) say(",
         tests=[CHK], pattern=REFUSE),
    dict(id='check-cards', file='src/pathCheck.ts',
         old="    if (!c) say('cards', path.id, `cites a card the library does not hold: ${id}`)\n",
         new="    if (false) say('cards', path.id, `cites a card the library does not hold: ${id}`)\n",
         tests=[CHK], pattern=REFUSE),
    dict(id='check-own-off-phone', file='src/pathCheck.ts',
         old="  if (path.traits.privacy === 'own' && (path.traits.sheet || path.traits.coach)) say(",
         new="  if (false) say(",
         tests=[CHK], pattern=REFUSE),
    dict(id='check-version', file='src/pathCheck.ts',
         old="    else if (!(path.changes ?? []).some((c) => c.version === path.version)) say(",
         new="    else if (false) say(",
         tests=[CHK], pattern=REFUSE),
    dict(id='check-status', file='src/pathCheck.ts',
         old="    if (!elsewhere && m.status !== 'path') say(",
         new="    if (false) say(",
         tests=[CHK], pattern=REFUSE),
]


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
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
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            io.open(path, 'wb').write(original)
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
