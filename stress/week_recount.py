# The level-plus-weekday way's results, counted a second time: by another program, in another language, from the same
# result files, sharing no code with stress/weekJudge.ts. It prints each judged number; set them beside the judge's.
#
# python -I -X utf8 stress/week_recount.py <results folder>
import json
import math
import os
import sys

folder = sys.argv[1]
Z = 1.959963984540054


def people(path):
    full = os.path.join(folder, path)
    if not os.path.exists(full):
        return None
    with open(full, encoding='utf-8') as f:
        return json.load(f)['results']


def per_person(rows, stretches, value):
    out = []
    for p in rows:
        n = sum(p['s'][i][4] for i in stretches)
        if n == 0:
            continue
        without = sum(p['s'][i][0] for i in stretches) / n
        with_new = sum(p['s'][i][1] for i in stretches) / n
        told = sum(p['s'][i][2] for i in stretches) / n
        out.append(value(without, with_new, told))
    return out


def interval(values):
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    half = Z * math.sqrt(var / n)
    return '%.3f (%.3f to %.3f; %d people)' % (mean, mean - half, mean + half, n)


def wilson(k, n):
    p = k / n
    den = 1 + Z * Z / n
    mid = (p + Z * Z / (2 * n)) / den
    half = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / den
    return 100 * (mid - half), 100 * (mid + half)


EARLY, MIDDLE, LATE, AFTER, ALL = [0], [1], [2], [1, 2], [0, 1, 2]

r = people('rhythm.json')
if r:
    print('criterion 1, rhythm, days 151-180, g less a quarter of b:', interval(per_person(r, LATE, lambda a, b, c: (a - b) - 0.25 * (a - c))))
    print('   g:', interval(per_person(r, LATE, lambda a, b, c: a - b)), '| b:', interval(per_person(r, LATE, lambda a, b, c: a - c)))
    print('criterion 2, rhythm, days 91-150, without less with:', interval(per_person(r, MIDDLE, lambda a, b, c: a - b)))
print('criterion 3, with less without (upper end under 0.05):')
for world, st, label in [('rhythm', EARLY, 'days 29-90'), ('plain', ALL, 'days 29-180'), ('streaks', ALL, 'days 29-180'), ('sparse', ALL, 'days 29-180'), ('season', ALL, 'days 29-180'), ('rhythm-half', ALL, 'days 29-180'), ('rhythm-one', ALL, 'days 29-180'), ('rhythm-turn', LATE, 'days 151-180')]:
    rows = people(world + '.json')
    if rows:
        print('   %s, %s: %s' % (world, label, interval(per_person(rows, st, lambda a, b, c: b - a))))
t = people('rhythm-turn.json')
if t:
    print('criterion 4, rhythm-turn, days 91-180, with less without (upper end under 0.10):', interval(per_person(t, AFTER, lambda a, b, c: b - a)))
print('criterion 5, ever in use (at most 80 of 2,000; 100 or more fails; between, a second read, at most 457 of 10,000):')
for world in ['plain', 'streaks', 'sparse', 'season']:
    rows = people(world + '.json')
    if not rows:
        continue
    k = sum(1 for p in rows if p['use']['first'] is not None)
    more = people(os.path.join('second', world + '.json'))
    extra = '' if more is None else '; with the second read %d of %d' % (k + sum(1 for p in more if p['use']['first'] is not None), len(rows) + len(more))
    print('   %s: %d of %d (interval %.2f to %.2f in 100)%s' % (world, k, len(rows), *wilson(k, len(rows)), extra))
print('criterion 6, the challenger adopted (the same rule):')
for world in ['plain', 'streaks', 'sparse', 'rhythm', 'season']:
    rows = people(os.path.join('challenger', world + '.json'))
    if not rows:
        continue
    k = sum(1 for p in rows if p['ch']['adopted'] == 1)
    more = people(os.path.join('challenger', 'second', world + '.json'))
    extra = '' if more is None else '; with the second read %d of %d' % (k + sum(1 for p in more if p['ch']['adopted'] == 1), len(rows) + len(more))
    print('   %s: %d of %d (interval %.2f to %.2f in 100)%s' % (world, k, len(rows), *wilson(k, len(rows)), extra))
if r:
    came = [p for p in r if p['use']['first'] is not None]
    left = sum(1 for p in came if p['use']['offs'] > 0)
    lo, hi = wilson(left, len(came)) if came else (0, 100)
    print('criterion 7, rhythm, out of use again: %d of %d (interval %.1f to %.1f in 100; under 25 passes)' % (left, len(came), lo, hi))
