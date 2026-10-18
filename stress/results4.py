"""RESULTS-4's numbers, read straight from the raw design-search runs (tuning seeds only; never a verdict).

python3 -I stress/results4.py stress/.out

It reads engine B's runs of C1's full step under every design the search tried, folders search1–search5 under the
given root, and prints each design's settings beside the frozen criteria's reading of C1: the share of people with a
right established call by day 144 and by day 180, and the median days, a person never reaching it counting as 180.
Every number RESULTS-4.md quotes from the search comes out of this script; the full run of the strongest design is
read by the judge itself (stress/metrics.ts). Nothing in it is typed by hand.
"""
import json
import math
import os
import statistics
import sys

ROOT = sys.argv[1]
FULL = 'walk-ten|stress|nextBlock'

# Each design's settings in words, beside the folder its run is in. The settings themselves are in each file's cfg.
DESIGNS = [
    ('search1/A1', 'finds its own test', 'every test declared on day one; weeks as settled on 2026-10-17 (two tests, 14 days apart)', 0.5),
    ('search1/A2', 'finds its own test', 'declared on day one; tests leave after 14 days unless an early sign; weeks back to back, one test', 0.5),
    ('search1/A3', 'finds its own test', 'as A2, one test at a time outside the weeks too', 0.5),
    ('search1/A4', 'finds its own test', 'as A2, no weeks', None),
    ('search1/A5', 'finds its own test', 'as A3, a week that never ends', 'always'),
    ('search2/B1', 'finds its own test', 'research first: the queue by expected benefit, the error rate shared by research; 14-day tests; weeks back to back, one test', 0.5),
    ('search2/B2', 'finds its own test', 'as B1', 1.0),
    ('search2/B3', 'finds its own test', 'as B1, a week that never ends', 'always'),
    ('search2/B4', 'finds its own test', 'as B1, tests declared as they enter the queue', 0.5),
    ('search3/C1', 'finds its own test', 'research first; 45-day tests; the floor outside the queue 0.01; weeks back to back, one test', 0.5),
    ('search3/C2', 'finds its own test', 'as C1, the floor 0.02', 0.5),
    ('search3/C3', 'finds its own test', 'as C1', 1.0),
    ('search3/C4', 'finds its own test', 'as C1, tests declared as they enter the queue', 0.5),
    ('search3/C5', 'finds its own test', 'as C1, no weeks', None),
    ('search4/P1', 'the right test from day one', 'weeks back to back, one test', 0.5),
    ('search4/P2', 'the right test from day one', 'weeks back to back, one test', 1.0),
    ('search4/P3', 'the right test from day one', 'as P1, the floor outside the queue 0.01', 0.5),
    ('search4/P4', 'the right test from day one', 'a week that never ends (RESULTS-3\'s upper bound, on these seeds)', 'always'),
    ('search5/P5', 'the right test from day one', 'as P1, the running test\'s floor 0.55', 0.5),
    ('search5/P6', 'the right test from day one', 'the running test\'s floor 0.55, no weeks', None),
    ('search5/P7', 'the right test from day one', 'as P5, the floor outside the queue 0.01', 0.5),
    ('search6/P1f', 'the right test from day one', 'as P1, with the final design\'s estimator and prior', 0.5),
    ('search6/P2f', 'the right test from day one', 'as P2, with the final design\'s estimator and prior', 1.0),
]


def wilson(k, n, z=1.959964):
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return max(0.0, c - h), min(1.0, c + h)


def pct(k, n):
    lo, hi = wilson(k, n)
    return f'{100 * k / n:.1f} % [{100 * lo:.1f}, {100 * hi:.1f}]'


def read(rel):
    p = os.path.join(ROOT, rel, 'large-B.json')
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    assert d['results'] and d['scenario'] == 'large' and d['seeds'] == [1, 1000], p
    ts = [t for r in d['results'] for t in r['tracked'] if t['key'] == FULL]
    days = [t['firstRight'].get('established', 180) for t in ts]
    lw = [r['lw'] for r in d['results'] if r.get('lw')]
    return dict(
        cfg=d['cfg'],
        n=len(ts),
        by144=sum(1 for x in days if x <= 144),
        by180=sum(1 for t in ts if 'established' in t['firstRight']),
        median=statistics.median(days),
        n1=statistics.median(t['n1End'] for t in ts),
        n0=statistics.median(t['n0End'] for t in ts),
        week=statistics.fmean(x['days'] for x in lw) if lw else 0.0,
    )


print('== Provenance of every file read')
for rel, *_ in DESIGNS:
    r = read(rel)
    if r:
        c = r['cfg']
        keys = ('estimator', 'declareAll', 'alphaWeights', 'queueScore', 'keepEarly', 'queueMaxDays', 'queueSize', 'explore', 'activeFloor', 'pinned', 'lw')
        print(f'  {rel}/large-B.json: {r["n"]} people, seeds 1–1000, cfg {json.dumps({k: c.get(k) for k in keys})}')
    else:
        print(f'  {rel}: not run')

print('\n== MARKDOWN: C1\'s full step under every design (C1 needs at least 50 % by day 144, a median of at most 144 days)')
print('| Design | The test | What changes | Week opt-in | Week days per person | Right established by day 144 | By day 180 | Median days | Decisions per arm at day 180 |')
print('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for rel, who, what, accept in DESIGNS:
    r = read(rel)
    if not r:
        print(f'| {rel.split("/")[1]} | {who} | {what} | | not run | | | | |')
        continue
    a = 'none' if accept is None else 'every day' if accept == 'always' else f'{accept:g}'
    print(f'| {rel.split("/")[1]} | {who} | {what} | {a} | {r["week"]:.1f} | {pct(r["by144"], r["n"])} | {pct(r["by180"], r["n"])} | {r["median"]:g} | {r["n1"]:g} / {r["n0"]:g} |')
