"""RESULTS-3's numbers, read straight from the raw learning-week runs (tuning seeds only; never a verdict).

python3 -I stress/results3.py stress/.out/lw

It reads every engine B result file under the folder, the way stress/metrics.ts reads the frozen
criteria: C1's days to a right established call (180 when never), C6's subset eligible at least three
times a week, C3's day-90 bias and coverage, S1, S2 and C7. Every number RESULTS-3.md quotes comes out
of this script; nothing in it is typed by hand.
"""
import json
import math
import os
import statistics
import sys

D = sys.argv[1]
DELTA = 0.25
FULL = 'walk-ten|stress|nextBlock'


def wilson(k, n, z=1.959964):
    if n == 0:
        return float('nan'), float('nan'), float('nan')
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0.0, c - h), min(1.0, c + h)


def pct(k, n):
    if n == 0:
        return 'none to count (0/0)'
    p, lo, hi = wilson(k, n)
    return f'{100 * p:.1f} % [{100 * lo:.1f}, {100 * hi:.1f}] ({k}/{n})'


def right(d, truth):
    return truth > 0 if d == 'helps' else truth < 0 if d == 'hurts' else abs(truth) < DELTA if d == 'little' else False


cache = {}


def load(rel):
    p = os.path.join(D, rel)
    if not os.path.exists(p):
        return None
    if p not in cache:
        data = json.load(open(p))
        assert data['results'], p
        cache[p] = data
    return cache[p]


def track(data, key=FULL):
    return [t for r in data['results'] for t in r['tracked'] if t['key'] == key]


def med(xs):
    return statistics.median(xs) if xs else float('nan')


def full(data):
    ts = track(data)
    n = len(ts)
    by180 = sum(1 for t in ts if 'established' in t['firstRight'])
    by144 = sum(1 for t in ts if t['firstRight'].get('established', 999) <= 144)
    days = [t['firstRight'].get('established', 180) for t in ts]
    wrong = sum(1 for t in ts if t['first'].get('established') and not right(t['first']['established']['dir'], t['truth']))
    return dict(n=n, by180=by180, by144=by144, median=med(days), wrong=wrong, offers=med([t['offersAll'] for t in ts]),
                n1=med([t['n1End'] for t in ts]), n0=med([t['n0End'] for t in ts]),
                half=med([t['csHalfEnd'] for t in ts if t['csHalfEnd'] is not None]))


def nul(data):
    ts = track(data)
    s1 = sum(1 for t in ts if t['first'].get('established') and t['first']['established']['dir'] != 'little')
    elig = [t for t in ts if t['eligibleAfter30'] >= 150 * 3 / 7]
    little = sum(1 for t in elig if t['littleEst'] is not None)
    return dict(n=len(ts), s1=s1, elig=len(elig), little=little, half=med([t['csHalfEnd'] for t in ts if t['csHalfEnd'] is not None]),
                n1=med([t['n1End'] for t in ts]), n0=med([t['n0End'] for t in ts]))


def c3(data):
    ts = [t for t in track(data) if t['d90']]
    bias = statistics.fmean(t['d90']['theta'] - t['truth'] for t in ts)
    cov = sum(1 for t in ts if abs(t['d90']['theta'] - t['truth']) <= 1.96 * t['d90']['se'])
    return bias, cov, len(ts)


def s2(data):
    rs = data['results']
    allest = [e for r in rs for e in r['est']]
    false = sum(1 for e in allest if not right(e['dir'], e['truth']))
    return dict(people=len(rs), calls=len(allest), false=false, per=len(allest) / len(rs))


def c7(data):
    rs = data['results']
    checkins = sum(r['checkins'] for r in rs)
    mo = sum(r['moveOffers'] for r in rs)
    offers = sum(r['offers'] for r in rs)
    low = sum(r['lowOffers'] for r in rs)
    return dict(per=mo / checkins, low=low, mo=mo, benefit=sum(r['benefit'] for r in rs) / offers)


def ladder(data):
    out = []
    for lv in ('early', 'likely', 'established'):
        ev = [x for r in data['results'] for x in r['ladder'] if x['level'] == lv]
        out.append((lv, sum(1 for x in ev if right(x['dir'], x['truth'])), len(ev)))
    return out


def week(data):
    lw = [r['lw'] for r in data['results'] if r.get('lw')]
    if not lw:
        return None
    m = lambda k: statistics.fmean(x[k] for x in lw)
    return dict(invited=m('invited'), accepted=m('accepted'), days=m('days'), checkins=m('checkins'), moveOffers=m('moveOffers'))


def seeds(data):
    return f'{data["seeds"][0]}–{data["seeds"][1]}'


print('== Provenance of every file read')
for root, _, files in sorted(os.walk(D)):
    for f in sorted(files):
        if f.endswith('.json') and 'regress' not in f:
            data = load(os.path.relpath(os.path.join(root, f), D))
            print(f'  {os.path.relpath(os.path.join(root, f), D)}: {data["scenario"]}, {len(data["results"])} people, seeds {seeds(data)}, cfg {json.dumps({k: (data.get("cfg") or {}).get(k) for k in ("estimator", "lw", "pinned", "queueSize")})}')

print('\n== The upper bound (seeds 501–1000)')
for name, label in (('U-', 'two tests, the second verdict\'s estimator'), ('U1/', 'one test, C3\'s correction')):
    lg = load(f'{name}large-B.json')
    if not lg:
        print(f'  {label}: not run')
        continue
    f = full(lg)
    print(f'  {label}: full step established by 180 {pct(f["by180"], f["n"])}, by 144 {pct(f["by144"], f["n"])}, median {f["median"]} days, wrong {f["wrong"]}; offers {f["offers"]}, per arm {f["n1"]} / {f["n0"]}, half-width {f["half"]:.3f}')
    md = load(f'{name}moderate-B.json')
    if md:
        h = full(md)
        print(f'    half step established by 180 {pct(h["by180"], h["n"])}, wrong {h["wrong"]}')
    nl = load(f'{name}null-B.json')
    if nl:
        x = nul(nl)
        print(f'    no effect: S1 {pct(x["s1"], x["n"])}; C6 little difference {pct(x["little"], x["elig"])}; half-width {x["half"]:.3f}, per arm {x["n1"]} / {x["n0"]}; {x["half"] / 0.155:.1f} times as wide as 0.155 allows; needs about {(x["half"] / 0.155) ** 2:.1f} times the data for 0.155, {(x["half"] / 0.31) ** 2:.1f} for 0.31')
    for sc in ('large', 'null'):
        dd = load(f'{name}{sc}-B.json')
        if dd:
            b, cv, n = c3(dd)
            w = week(dd)
            c = c7(dd)
            print(f'    {sc}: day-90 bias {b:+.3f}, covers {pct(cv, n)}; move offers per check-in {c["per"]:.3f}; to low moves {c["low"]}/{c["mo"]}; week days {w["days"] if w else "-"}')

print('\n== S2\'s most calls: the mixed catalogue with the week never ending (seeds 1–1000)')
for f in ('UM/mixed2-B.json', 'UM/mixed3-B.json'):
    dd = load(f)
    if not dd:
        print(f'  {f}: not run')
        continue
    s = s2(dd)
    c = c7(dd)
    print(f'  {f}: established calls {s["calls"]} in {s["people"]} people ({s["per"]:.3f} per person; about {s["per"] * 2000:.0f} in 2,000), false {pct(s["false"], s["calls"])}; move offers per check-in {c["per"]:.3f}; ladder {ladder(dd)}')

print('\n== The realistic week and lower rates (seeds 1–1000)')
for cfg, label in (('R100', 'week, every invitation accepted'), ('R50', 'week, one invitation in two'), ('R25', 'week, one in four'), ('R0', 'no week, C3\'s correction'), ('W0', 'no week, the second verdict\'s engine')):
    print(f'  -- {cfg}: {label}')
    lg = load(f'{cfg}/large-B.json')
    if lg:
        f = full(lg)
        w = week(lg)
        print(f'    full step: established by 180 {pct(f["by180"], f["n"])}, by 144 {pct(f["by144"], f["n"])}, median {f["median"]}, wrong {f["wrong"]}; offers {f["offers"]}, per arm {f["n1"]} / {f["n0"]}, half-width {f["half"]:.3f}')
        if w:
            print(f'    week per person: invited {w["invited"]:.2f}, accepted {w["accepted"]:.2f}, days {w["days"]:.1f}, its check-ins {w["checkins"]:.1f}, its move offers {w["moveOffers"]:.1f}')
    md = load(f'{cfg}/moderate-B.json')
    if md:
        h = full(md)
        print(f'    half step: established by 180 {pct(h["by180"], h["n"])}')
    nl = load(f'{cfg}/null-B.json')
    if nl:
        x = nul(nl)
        print(f'    no effect: S1 {pct(x["s1"], x["n"])}; C6 {pct(x["little"], x["elig"])}; half-width {x["half"]:.3f}')
    mx = load(f'{cfg}/mixed-B.json')
    if mx:
        s = s2(mx)
        c = c7(mx)
        print(f'    mixed: established calls {s["calls"]} ({s["per"]:.3f} per person; about {s["per"] * 2000:.0f} in 2,000), false {pct(s["false"], s["calls"])}')
        print(f'    mixed C7: move offers per check-in {c["per"]:.3f}, to low moves {c["low"]}/{c["mo"]}, benefit per offer {c["benefit"]:.4f}; ladder {ladder(mx)}')
    if lg:
        c = c7(lg)
        print(f'    large C7: move offers per check-in {c["per"]:.3f}, benefit per offer {c["benefit"]:.4f}')
    parts = []
    for sc in ('large', 'rhythm-large', 'rebound-large', 'context-large'):
        dd = load(f'{cfg}/{sc}-B.json')
        if dd:
            b, cv, n = c3(dd)
            parts.append(f'{sc} {b:+.3f} covers {pct(cv, n)}')
    print('    C3: ' + '; '.join(parts))


def p1(k, n):
    """A share as RESULTS-3's tables print it: the percent, with its count."""
    return '—' if n == 0 else f'{100 * k / n:.1f} % ({k}/{n})'


def tables():
    """The write-up's tables, printed as markdown from the same reads as above."""
    print('\n== MARKDOWN: the upper bound')
    print('| Week never ending, test held from day one | Full step: established by day 180 | By day 144 | Median days (C1 needs ≤ 144) | Decisions per arm at day 180 | No effect: established either way (S1) | No effect: little difference (C6 needs ≥ 50 %) | Sequence half-width at day 180, no effect |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for name, label in (('U-', 'Two tests, `wcls`'), ('U1/', 'One test alone, `ht`')):
        lg, nl = load(f'{name}large-B.json'), load(f'{name}null-B.json')
        if not lg or not nl:
            print(f'| {label} | not run | | | | | | |')
            continue
        f, x = full(lg), nul(nl)
        print(f'| {label} | {p1(f["by180"], f["n"])} | {p1(f["by144"], f["n"])} | {f["median"]:g} | {f["n1"]:g} / {f["n0"]:g} | {p1(x["s1"], x["n"])} | {p1(x["little"], x["elig"])} | {x["half"]:.2f} |')
    print('\n== MARKDOWN: the realistic week and lower rates')
    print('| Configuration | Week days per person | Full step: established by day 180 | By day 144 | Median days | Mixed catalogue: established calls per person (about, in 2,000) | Of them false | No effect: S1 | C7: move offers per check-in | C7: benefit per offer |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for cfg, label in (('R100', 'Week, every invitation accepted'), ('R50', 'Week, one invitation in two'), ('R25', 'Week, one in four'), ('R0', 'No week')):
        lg, mx, nl = load(f'{cfg}/large-B.json'), load(f'{cfg}/mixed-B.json'), load(f'{cfg}/null-B.json')
        if not lg or not mx or not nl:
            print(f'| {label} | not run | | | | | | | | |')
            continue
        f, s, x, c, w = full(lg), s2(mx), nul(nl), c7(lg), week(lg)
        print(f'| {label} | {w["days"]:.1f} | {p1(f["by180"], f["n"]) if w else ""} | {p1(f["by144"], f["n"])} | {f["median"]:g} | {s["per"]:.3f} ({s["per"] * 2000:.0f}) | {p1(s["false"], s["calls"])} | {p1(x["s1"], x["n"])} | {c["per"]:.3f} | {c["benefit"]:.4f} |' if w else f'| {label} | 0 | {p1(f["by180"], f["n"])} | {p1(f["by144"], f["n"])} | {f["median"]:g} | {s["per"]:.3f} ({s["per"] * 2000:.0f}) | {p1(s["false"], s["calls"])} | {p1(x["s1"], x["n"])} | {c["per"]:.3f} | {c["benefit"]:.4f} |')
    print('\n== MARKDOWN: C3, day-90 bias of a full step (coverage of its 95 % interval)')
    print('| Configuration | Base | Daily rhythm | Rebound | Changing context |')
    print('| --- | --- | --- | --- | --- |')
    for cfg, label in (('W0', 'No week, `wcls` (the second verdict\'s engine)'), ('R0', 'No week, `ht` (C3\'s correction)'), ('R25', 'Week one in four, `ht`'), ('R50', 'Week one in two, `ht`')):
        cells = []
        for sc in ('large', 'rhythm-large', 'rebound-large', 'context-large'):
            dd = load(f'{cfg}/{sc}-B.json')
            if not dd:
                cells.append('not run')
                continue
            b, cv, n = c3(dd)
            cells.append(f'{b:+.3f} ({100 * cv / n:.1f} %)')
        print(f'| {label} | ' + ' | '.join(cells) + ' |')
    print('\n== MARKDOWN: S2\'s most calls, the week never ending')
    print('| Mixed catalogue, week never ending | Established calls per person (about, in 2,000) | Of them false | Move offers per check-in |')
    print('| --- | --- | --- | --- |')
    for f_, label in (('UM/mixed2-B.json', 'Two tests'), ('UM/mixed3-B.json', 'Three tests')):
        dd = load(f_)
        if not dd:
            print(f'| {label} | not run | | |')
            continue
        s, c = s2(dd), c7(dd)
        print(f'| {label} | {s["per"]:.3f} ({s["per"] * 2000:.0f}) | {p1(s["false"], s["calls"])} | {c["per"]:.3f} |')


tables()
