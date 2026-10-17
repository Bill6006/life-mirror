#!/usr/bin/env python3
"""An independent recount of the stress test's headline numbers, straight from the raw run files.

Written separately from stress/metrics.ts (another language, from the criteria's own words), so a
slip in the judge cannot hide in the recount. Usage: python3 -I recount.py <results folder>
"""
import json
import math
import os
import sys

D = sys.argv[1]
DELTA = 0.25
TEST = 'walk-ten|stress|nextBlock'


def load(name, eng='B'):
    p = os.path.join(D, f'{name}-{eng}.json')
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)['results']


def wilson(k, n):
    if n == 0:
        return (float('nan'),) * 3
    z = 1.959964
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0.0, c - h), min(1.0, c + h)


def show(k, n):
    p, lo, hi = wilson(k, n)
    return f'{100 * p:.1f}% [{100 * lo:.1f}, {100 * hi:.1f}] ({k}/{n})'


def right(d, truth):
    if d == 'helps':
        return truth > 0
    if d == 'hurts':
        return truth < 0
    if d == 'little':
        return abs(truth) < DELTA
    return False


def tr(rs, key=TEST):
    out = []
    for r in rs:
        for t in r['tracked']:
            if t['key'] == key:
                out.append(t)
    return out


def median(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return float('nan')
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def mean(xs):
    return sum(xs) / len(xs) if xs else float('nan')


out = []
nul = load('null')
if nul:
    t = tr(nul)
    k = sum(1 for x in t if x['first'].get('established') and x['first']['established']['dir'] != 'little')
    out.append(f'S1 null: established either direction {show(k, len(t))}; pass if upper < 5%: {wilson(k, len(t))[2] < 0.05}')
mixed = load('mixed')
if mixed:
    est = [e for r in mixed for e in r['est']]
    bad = [e for e in est if not right(e['dir'], e['truth'])]
    out.append(f'S2 mixed: false {show(len(bad), len(est))}; per person-year {len(bad) / len(mixed) * 365 / 180:.3f}; calls per person {len(est) / len(mixed):.3f}; pass: {len(est) > 0 and wilson(len(bad), len(est))[2] < 0.05}')
    for e in bad:
        out.append(f'   false: {e["key"]} {e.get("ctx") or ""} {e["dir"]} truth {e["truth"]:.2f} day {e["day"]}')
    for lv, promise in (('early', 2 / 3), ('likely', 4 / 5), ('established', 19 / 20)):
        ev = [x for r in mixed for x in r['ladder'] if x['level'] == lv]
        ok = sum(1 for x in ev if right(x['dir'], x['truth']))
        out.append(f'C14 {lv}: right {show(ok, len(ev))}; promise {100 * promise:.0f}%; pass: {len(ev) > 0 and wilson(ok, len(ev))[2] >= promise}')
mn, ml, lg = load('missing-null'), load('missing-large'), load('large')
if mn and ml and lg:
    t = tr(mn)
    hurts = sum(1 for x in t if (x['first'].get('likely') or {}).get('dir') == 'hurts' or (x['first'].get('established') or {}).get('dir') == 'hurts')
    bm = mean([x['d180']['theta'] - x['truth'] for x in tr(ml) if x['d180']])
    bb = mean([x['d180']['theta'] - x['truth'] for x in tr(lg) if x['d180']])
    out.append(f'S4: hurts {show(hurts, len(t))}; day-180 bias missing {bm:.3f}, base {bb:.3f}, added {bm - bb:.3f}')
if lg:
    t = tr(lg)
    d90 = [x for x in t if x['d90']]
    cov = [x for x in t if x['coverAll'] is not None]
    k = sum(1 for x in cov if x['coverAll'])
    out.append(f'S5 large: day-90 bias {mean([x["d90"]["theta"] - x["truth"] for x in d90]):.3f} ({len(d90)} people); CS covers at every look {show(k, len(cov))}')
la, na, mo, moa = load('large', 'A'), load('null', 'A'), load('moderate'), load('moderate', 'A')
if lg and la and na and mo and moa:
    days_b = [x['firstRight'].get('established', 180) for x in tr(lg)]

    def holds(r):
        for t in r['tracked']:
            if t['key'] == 'walk-ten|stress':
                return t['first'].get('holdsUp')
        return None
    days_a = [holds(r)['day'] if holds(r) and holds(r)['right'] else 180 for r in la]
    a_null = sum(1 for r in na if holds(r))
    hb = sum(1 for x in tr(mo) if 'established' in x['firstRight'])
    ha = sum(1 for r in moa if holds(r) and holds(r)['right'])
    out.append(f'C1: B median {median(days_b)} (by 144: {sum(1 for d in days_b if d <= 144)}/{len(days_b)}), A median {median(days_a)}; half step B {show(hb, len(tr(mo)))} A {show(ha, len(moa))}; A null Holds-up {show(a_null, len(na))}')
    ch_b = sum(r['checkins'] for r in lg)
    ch_a = sum(r['checkins'] for r in la)
    out.append(f'C7: move offers/check-in B {sum(r["moveOffers"] for r in lg) / ch_b:.3f} A {sum(r["moveOffers"] for r in la) / ch_a:.3f}; to low moves {show(sum(r["lowOffers"] for r in lg), sum(r["moveOffers"] for r in lg))}; benefit/offer B {sum(r["benefit"] for r in lg) / sum(r["offers"] for r in lg):.4f} A {sum(r["benefit"] for r in la) / sum(r["offers"] for r in la):.4f}')
sn, sl = load('sparse-null'), load('sparse-large')
if sn and sl:
    a = tr(sn) + tr(sl)
    looks = sum(x['sparseLooks'] for x in a)
    cov = sum(x['sparseCovered'] for x in a)
    out.append(f'C2: belief intervals {show(cov, looks)} (needs 90%); sparse-large CS at every look {show(sum(1 for x in tr(sl) if x["coverAll"]), sum(1 for x in tr(sl) if x["coverAll"] is not None))}')
for name in ('large', 'rhythm-large', 'rebound-large', 'context-large'):
    rs = load(name)
    if not rs:
        continue
    d90 = [x for x in tr(rs) if x['d90']]
    k = sum(1 for x in d90 if abs(x['d90']['theta'] - x['truth']) <= 1.96 * x['d90']['se'])
    out.append(f'C3 {name}: bias {mean([x["d90"]["theta"] - x["truth"] for x in d90]):.3f}, covers {show(k, len(d90))}')
if nul and lg:
    t = tr(nul)
    el = [x for x in t if x['eligibleAfter30'] >= 150 * 3 / 7]
    out.append(f'C6: little difference, no effect (eligible 3+/week) {show(sum(1 for x in el if x["littleEst"] is not None), len(el))}; at a full step {show(sum(1 for x in tr(lg) if x["littleEst"] is not None), len(tr(lg)))}')
sp, sa, so = load('pool-split'), load('pool-same'), load('pool-same-off')
if sp and sa and so:
    n2 = tr(sp, 'talk-to-yourself-by-name|stress|nextBlock')
    re = tr(sp, 'cyclic-sigh|stress|nextBlock')
    on = median([x['firstRight'].get('likely', 180) for x in tr(sa, 'cyclic-sigh|stress|nextBlock') + tr(sa, 'talk-to-yourself-by-name|stress|nextBlock')])
    off = median([x['firstRight'].get('likely', 180) for x in tr(so, 'cyclic-sigh|stress|nextBlock') + tr(so, 'talk-to-yourself-by-name|stress|nextBlock')])
    out.append(f'C8: no-effect partner {show(sum(1 for x in n2 if x["first"].get("established") and x["first"]["established"]["dir"] != "little"), len(n2))}; real one {show(sum(1 for x in re if "established" in x["firstRight"]), len(re))}; median days to likely pooled {on}, unpooled {off}')
ho, cs = load('with-her-only'), load('context-same')
if ho and cs:
    t = tr(ho)
    w1 = sum(1 for x in t if (x['ctx'].get('withHer=1') or {}).get('dir') == 'helps')
    w0 = sum(1 for x in t if (x['ctx'].get('withHer=0') or {}).get('dir') == 'helps')
    per = ', '.join(f'{k} {show(sum(1 for x in tr(cs) if x["ctx"].get(k + "=0") or x["ctx"].get(k + "=1")), len(tr(cs)))}' for k in ('withHer', 'office', 'weekend', 'shortSleep'))
    out.append(f'C9: with her {show(w1, len(t))}; without her helps {show(w0, len(t))}; no difference: {per}')
pz, ph = load('prior-zero'), load('prior-harm')
if pz and ph:
    t0 = tr(pz)
    th = tr(ph)
    out.append(f'C10: established helps {show(sum(1 for x in t0 if (x["first"].get("established") or {}).get("dir") == "helps"), len(t0))}; within 0.25 at day 120 {show(sum(1 for x in t0 if x["post120"] is not None and abs(x["post120"]) <= 0.25), len(t0))}; below 0 vs harm {show(sum(1 for x in th if x["post120"] is not None and x["post120"] < 0), len(th))}')
nm, md = load('next-morning'), load('multi-day')
if nm and md:
    nx = tr(nm, 'green-walk|stress|nextBlock')
    mg = tr(nm, 'green-walk|stress|nextMorning')
    mt = [x for x in tr(md, 'next-week-costs|stress|sevenDays') if x['d180']]
    out.append(f'C11: next check-in helps {show(sum(1 for x in nx if (x["first"].get("established") or {}).get("dir") == "helps"), len(nx))}; next morning {show(sum(1 for x in mg if "established" in x["firstRight"] and (x["first"].get("established") or {}).get("dir") == "helps"), len(mg))}; multi-day bias {mean([x["d180"]["theta"] - x["truth"] for x in mt]):.3f} ({len(mt)})')
cg = load('change')
if cg and lg:
    t = [x for x in tr(cg) if (x['first'].get('established') or {}).get('dir') == 'helps' and x['first']['established']['day'] < 120]
    st = sum(1 for x in t if x['revisedDay'] is not None and 120 <= x['revisedDay'] <= 180)
    rc = [x for x in tr(lg) if (x['first'].get('established') or {}).get('dir') == 'helps']
    out.append(f'C13: stepped down {show(st, len(t))}; kept {show(sum(1 for x in rc if x["establishedAtEnd"]), len(rc))}')
if lg:
    t = [x for x in tr(lg) if x['eligibleAfter30'] > 0]
    out.append(f'hunt, stops learning: {show(sum(1 for x in t if x["offersAfter30"] == 0), len(t))}')
    days = [x['firstRight'].get('established') for x in tr(lg)]
    got = [d for d in days if d is not None]
    out.append(f'speed, full step: established by 180 {show(len(got), len(days))}, median among them {median(got)}; offers of the move {median([x["offersAll"] for x in tr(lg)])}; per arm {median([x["n1End"] for x in tr(lg)])}/{median([x["n0End"] for x in tr(lg)])}')
wrong = total = 0
for f in sorted(os.listdir(D)):
    if not f.endswith('-B.json') or f.startswith(('large-poor', 'large-first', 'pool-same-off')):
        continue
    for e in (e for r in load(f[:-7]) for e in r['est']):
        total += 1
        wrong += (e['dir'] == 'helps' and e['truth'] < 0) or (e['dir'] == 'hurts' and e['truth'] > 0)
out.append(f'hunt, confidently wrong: {wrong} of {total} established calls')
print('\n'.join(out))
