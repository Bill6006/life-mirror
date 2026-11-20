"""An independent recount of Batch 2's verdicts (items 5 and 6), sharing no code with the judges: it reads the results
files as data and counts again, in another language.

  python -B -I -X utf8 stress/batch2_recount.py hold  <results folder> <N>
  python -B -I -X utf8 stress/batch2_recount.py fifth <results folder>
"""
import json
import math
import os
import sys

FIRST_SHOWN = 14
LAST_DAY = 179
Z = 1.959963984540054


def load(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)['results']


def rule(k, people, more_k, more_people):
    """At most 80 of 2,000 passes; 100 or more fails; 81 to 99 is read again and passes at 457 of 10,000."""
    if k <= 80:
        return 'PASS'
    if k >= 100:
        return 'FAIL'
    if more_k is None:
        return 'READ AGAIN'
    return 'PASS on the second read' if k + more_k <= 457 else 'FAIL on the second read'


def hold(folder, n):
    def shown(person, pairs=None):
        for i, runs in enumerate(person['runs']):
            if pairs is not None and i not in pairs:
                continue
            for start, days in runs:
                if days >= n and start + days - 1 >= FIRST_SHOWN:
                    return True
        return False

    def shown_one(person, i, at):
        return any(days >= at and start + days - 1 >= FIRST_SHOWN for start, days in person['runs'][i])

    readings = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
    stress_high = readings.index('stress') * 2
    ok = True
    for world in ['plain', 'streaks', 'sparse', 'rhythm', 'season']:
        people = load(f'{folder}/{world}.json')
        if people is None:
            print(f'{world}: no results')
            ok = False
            continue
        k = sum(1 for p in people if shown(p))
        more = load(f'{folder}/second/{world}.json')
        more_k = None if more is None else sum(1 for p in more if shown(p))
        verdict = rule(k, len(people), more_k, None if more is None else len(more))
        ok = ok and verdict.startswith('PASS')
        print(f'criterion 1, {world}: {k} of {len(people)} shown at N = {n}: {verdict}')
    useful = load(f'{folder}/fifteen-points.json')
    if useful is not None:
        at_n = sum(1 for p in useful if shown_one(p, stress_high, n))
        at_one = sum(1 for p in useful if shown_one(p, stress_high, 1))
        passed = 3 * at_n >= 2 * at_one
        ok = ok and passed
        print(f'criterion 2, fifteen-points: {at_n} at N = {n} against {at_one} at N = 1: {"PASS" if passed else "FAIL"}')
    print('RECOUNT:', 'PASS' if ok else 'NOT A PASS')


def fifth(folder):
    def picked(p):
        return any(d[1] == 1 for d in p['days'])

    def adopted(p):
        return any(d[2] == 1 for d in p['days'])

    def gain(people):
        diffs = [p['four']['sum'] / p['four']['n'] - p['five']['sum'] / p['five']['n'] for p in people if p['four']['n'] > 0 and p['five']['n'] > 0]
        n = len(diffs)
        mean = sum(diffs) / n
        sd = math.sqrt(sum((v - mean) ** 2 for v in diffs) / (n - 1))
        half = Z * sd / math.sqrt(n)
        return mean, mean - half, mean + half

    ok = True
    for world in ['plain', 'streaks', 'sparse', 'season']:
        people = load(f'{folder}/{world}.json')
        more = load(f'{folder}/second/{world}.json')
        k = sum(1 for p in people if picked(p))
        verdict = rule(k, len(people), None if more is None else sum(1 for p in more if picked(p)), None)
        ok = ok and verdict.startswith('PASS')
        print(f'criterion 1, {world}: {k} of {len(people)}: {verdict}')
    mean, lo, hi = gain(load(f'{folder}/rhythm.json'))
    ok = ok and lo > 0
    print(f'criterion 2, rhythm: {mean:.3f} ({lo:.3f} to {hi:.3f}): {"PASS" if lo > 0 else "FAIL"}')
    for world in ['plain', 'streaks', 'sparse', 'rhythm', 'season']:
        people = load(f'{folder}/{world}.json')
        more = load(f'{folder}/second/{world}.json')
        k = sum(1 for p in people if adopted(p))
        verdict = rule(k, len(people), None if more is None else sum(1 for p in more if adopted(p)), None)
        ok = ok and verdict.startswith('PASS')
        print(f'criterion 3, {world}: {k} of {len(people)}: {verdict}')
    for world in ['plain', 'streaks', 'sparse', 'season']:
        mean, lo, hi = gain(load(f'{folder}/{world}.json'))
        passed = -lo < 0.1
        ok = ok and passed
        print(f'criterion 4, {world}: five less four {-mean:.3f} (upper end {-lo:.3f}): {"PASS" if passed else "FAIL"}')
    print('RECOUNT:', 'PASS' if ok else 'NOT A PASS')


if __name__ == '__main__':
    if sys.argv[1] == 'hold':
        hold(sys.argv[2], int(sys.argv[3]))
    elif sys.argv[1] == 'fifth':
        fifth(sys.argv[2])
    else:
        raise SystemExit('hold or fifth')
