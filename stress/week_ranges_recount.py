# The level-plus-weekday way's ranges, counted a second time: by another program, in another language, from the same
# result files, sharing no code with stress/weekRangesJudge.ts. It prints each judged number; set them beside the judge's.
#
# python -I -X utf8 stress/week_ranges_recount.py <results folder>
import json
import math
import os
import sys

folder = sys.argv[1]
Z = 1.959963984540054


def people(world):
    path = os.path.join(folder, world + '.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)['results']


def interval(values):
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    half = Z * math.sqrt(var / n)
    return '%.3f (%.3f to %.3f; %d people)' % (mean, mean - half, mean + half, n)


def score_with_less_without(rows, stretches):
    out = []
    for p in rows:
        n = sum(p['week'][st][0] + p['today'][st][0] for st in stretches)
        if n == 0:
            continue
        without = sum(p['week'][st][5] + p['today'][st][5] for st in stretches)
        with_way = sum(p['week'][st][6] + p['today'][st][6] for st in stretches)
        out.append((with_way - without) / n)
    return out


r = people('rhythm')
if r:
    diffs = [100 * (p['used'][2][2] - p['used'][2][1]) / p['used'][2][0] for p in r if p['used'][2][0] > 0]
    print('criterion R1, rhythm, days 151-180, rows of days in use, inside with the way less today\'s, of 100 (lower end above -2):', interval(diffs))
    print('criterion R2, rhythm, days 151-180, every row, score without less with (wholly above 0):', interval([-v for v in score_with_less_without(r, [2])]))
print('criterion R3, score with less without (upper end under 0.18):')
for world, st, label in [('rhythm', [0], 'days 29-90'), ('plain', [0, 1, 2], 'days 29-180'), ('streaks', [0, 1, 2], 'days 29-180'), ('sparse', [0, 1, 2], 'days 29-180'), ('season', [0, 1, 2], 'days 29-180'), ('rhythm-half', [0, 1, 2], 'days 29-180'), ('rhythm-one', [0, 1, 2], 'days 29-180'), ('rhythm-turn', [2], 'days 151-180')]:
    rows = people(world)
    if rows:
        print('   %s, %s: %s' % (world, label, interval(score_with_less_without(rows, st))))
t = people('rhythm-turn')
if t:
    print('criterion R4, rhythm-turn, days 91-180, score with less without (upper end under 0.36):', interval(score_with_less_without(t, [1, 2])))
