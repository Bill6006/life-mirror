"""An independent recount of the counted foundation's verdict, from the raw results, in another language.

The judge is stress/countedJudge.ts. This reads the same folder and counts again, sharing no code with it: the people
whose family shows a pattern in every no-pattern cell, with the interval's upper bound; and the two judged shares,
each against a bound computed here from every person's own counts (Fisher's exact test by sums of logs, the z test by
the normal curve). Printed in the judge's order, so the two can be read side by side.

python -I -X utf8 stress/counted_recount.py <folder>
"""
import json
import math
import os
import sys
from statistics import NormalDist

LOOKS = ['60', '180', '365']
NO_PATTERN = [('independent-10', ['A-day', 'A-checkin', 'B']), ('independent-30', ['A-day', 'A-checkin', 'B']), ('independent-50', ['A-day', 'A-checkin', 'B']),
              ('runs', ['A-day', 'A-checkin', 'B']), ('weekly-rhythm', ['A-day', 'A-checkin', 'B']), ('missing-on-state', ['A-day', 'A-checkin', 'B']),
              ('follows-band', ['B']), ('runs-persistent', ['A-day', 'A-checkin', 'B']), ('season', ['A-day', 'A-checkin', 'B'])]
PATTERN = 3
Z95 = 1.959964
NORMAL = NormalDist()


def load(folder, world):
    path = os.path.join(folder, world + '.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)['results']


def upper(k, n):
    """The upper end of the 95% Wilson interval."""
    p = k / n
    den = 1 + Z95 * Z95 / n
    centre = (p + Z95 * Z95 / (2 * n)) / den
    half = Z95 * math.sqrt(p * (1 - p) / n + Z95 * Z95 / (4 * n * n)) / den
    return centre + half


def rows(person, look, family):
    fam = person['looks'][look]['families'].get(family)
    return fam['rows'] if fam else []


def shows(person, look, family):
    return any(r[4] == PATTERN for r in rows(person, look, family))


def log_choose(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def binom(n, p, k):
    return math.exp(log_choose(n, k) + k * math.log(p) + (n - k) * math.log(1 - p))


_fisher = {}
_weekday = {}


def fisher_two_sided(n1, n0, total):
    key = (n1, n0, total)
    if key not in _fisher:
        lo, hi = max(0, total - n0), min(n1, total)
        pmf = [math.exp(log_choose(n1, t) + log_choose(n0, total - t) - log_choose(n1 + n0, total)) for t in range(lo, hi + 1)]
        _fisher[key] = (lo, [min(1.0, sum(q for q in pmf if q <= own * (1 + 1e-7))) for own in pmf])
    return _fisher[key]


def weekday_bound(n1, n0, family, base=0.3, raised=0.6):
    """Criterion 3 for one person: Fisher's exact test, two-sided at 0.05 over the family, 8 a side, 5 occurrences, 0.15 seen."""
    if n1 < 8 or n0 < 8 or family < 1:
        return 0.0
    key = (n1, n0, family)
    if key not in _weekday:
        power = 0.0
        p0 = [binom(n0, base, x0) for x0 in range(n0 + 1)]
        for x1 in range(n1 + 1):
            p1 = binom(n1, raised, x1)
            for x0 in range(n0 + 1):
                total = x1 + x0
                if total < 5 or abs(x1 / n1 - x0 / n0) < 0.15:
                    continue
                lo, ps = fisher_two_sided(n1, n0, total)
                if ps[x1 - lo] <= 0.05 / family:
                    power += p1 * p0[x0]
        _weekday[key] = power
    return _weekday[key]


def means_bound(n1, n0, family, spread, effect):
    """Criterion 4 for one person: a two-sided z test with the spread known, at 0.05 over the family, ten points seen."""
    if n1 < 8 or n0 < 8 or family < 1 or not spread > 0:
        return 0.0
    se = spread * math.sqrt(1 / n1 + 1 / n0)
    bar = max(10.0, NORMAL.inv_cdf(1 - 0.05 / family / 2) * se)
    return 1 - NORMAL.cdf((bar - effect) / se) + NORMAL.cdf((-bar - effect) / se)


def main(folder):
    print('RECOUNT, from the raw results in', folder)
    print('world              family     look  people  pattern  share  upper95')
    for world, families in NO_PATTERN:
        people = load(folder, world)
        if people is None:
            print(world.ljust(18), 'MISSING')
            continue
        for family in families:
            for look in LOOKS:
                k = sum(1 for p in people if shows(p, look, family))
                n = len(people)
                print(f'{world.ljust(18)} {family.ljust(10)} {look.rjust(4)}  {str(n).rjust(6)}  {str(k).rjust(7)}  {100 * k / n:5.1f}  {100 * upper(k, n):7.1f}')
    people = load(folder, 'weekday')
    if people is not None:
        for look in LOOKS:
            n = len(people)
            hits = sum(1 for p in people if len(rows(p, look, 'A-day')) > 6 and rows(p, look, 'A-day')[6][4] == PATTERN and rows(p, look, 'A-day')[6][5] == 1)
            bound = sum(weekday_bound(p['looks'][look]['bound']['sat'], p['looks'][look]['bound']['other'], p['looks'][look]['families']['A-day']['tested']) for p in people) / n
            print(f'weekday, day {look}: {hits} of {n}, share {100 * hits / n:.1f}; bound {100 * bound:.1f}; four fifths of it {80 * bound:.1f}')
    for world in ['fifteen-points', 'ten-points']:
        people = load(folder, world)
        if people is None:
            continue
        for look in LOOKS:
            n = len(people)
            bounds = [p['looks'][look].get('bound', {}) for p in people]
            true_n = sum(b.get('trueN', 0) for b in bounds)
            true_diff = sum(b.get('trueSum', 0) for b in bounds) / true_n if true_n else 0.0
            bound = sum(means_bound(b.get('n1', 0), b.get('n0', 0), p['looks'][look]['families']['B']['tested'], b.get('spread', 0), true_diff) for p, b in zip(people, bounds)) / n
            hits = sum(1 for p in people if rows(p, look, 'B')[0][4] == PATTERN and rows(p, look, 'B')[0][5] == 1)
            print(f'{world}, day {look}: {hits} of {n}, share {100 * hits / n:.1f}; true difference {true_diff:.2f}; bound {100 * bound:.1f}; nine tenths of it {90 * bound:.1f}')


if __name__ == '__main__':
    assert len(sys.argv) == 2, 'usage: counted_recount.py <folder>'
    main(sys.argv[1])
