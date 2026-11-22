# Stage C: every judged number counted a second time, by a program that shares no code with stress/stageCJudge.ts.
# It reads the same run files and prints the same lines, so the two can be set side by side with diff.
#
#   python -I -X utf8 stress/stageC_recount.py <results folder> [setting] [folder of further people]
#   python -I -X utf8 stress/stageC_recount.py <results folder> beneath     the study of what is written beneath Stage C
import json
import math
import os
import sys

IDS = ['plain', 'streaks', 'sparse', 'season', 'rhythm', 'rhythm-half', 'rhythm-one', 'rhythm-turn', 'two', 'two-strong', 'sun', 'sun-weak', 'sun-bad', 'kind-move', 'kind-idle', 'all', 'event', 'event-weak', 'event-rhythm', 'event-idle', 'event-flat', 'event-told', 'event-masked', 'event-many']
NAMES = ['days 29 to 90', 'days 91 to 150', 'days 151 to 180']
PLACE = ['the score', 'readings', 'sunshine', 'rain', 'high', 'events']
WEATHER = [2, 3, 4]
NOTHING = {}
for w in ['plain', 'streaks', 'sparse', 'season']:
    NOTHING[w] = [1] + WEATHER
for w in ['rhythm', 'rhythm-half', 'rhythm-one', 'rhythm-turn', 'two', 'two-strong', 'kind-move', 'kind-idle', 'event', 'event-weak', 'event-rhythm']:
    NOTHING[w] = WEATHER
for w in ['sun', 'sun-weak', 'sun-bad']:
    NOTHING[w] = [1, 3, 4]
NOTHING['all'] = [3, 4]
for w in ['event-idle', 'event-many']:
    NOTHING[w] = WEATHER + [5]
for w in ['event-flat', 'event-told', 'event-masked']:
    NOTHING[w] = [1] + WEATHER + [5]


def load(folder, world, suffix=''):
    path = os.path.join(folder, world + suffix + '.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def span(sts):
    return 'days 29 to 180' if len(sts) == 3 else 'days 91 to 180' if len(sts) == 2 else NAMES[sts[0]]


def interval(values):
    n = len(values)
    if n == 0:
        return n, float('nan'), float('nan'), float('nan')
    mean = math.fsum(values) / n
    sd = math.sqrt(math.fsum((v - mean) ** 2 for v in values) / (n - 1)) if n > 1 else 0.0
    half = 1.96 * sd / math.sqrt(n)
    return n, mean, mean - half, mean + half


def wilson(k, n):
    z = 1.96
    p = k / n
    mid = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return mid - half, mid + half


def misses(people, k, sts):
    """For each person with a row in the stretches: the Stage B system's, Stage C's and the told forecast's average miss."""
    out = []
    for p in people:
        n = sum(p['base'][st][0] for st in sts)
        if n == 0:
            continue
        b = sum(p['base'][st][2] for st in sts) / n
        t = sum(p['base'][st][3] for st in sts) / n
        c = sum(p['c'][k]['s'][st][0] for st in sts) / n
        out.append((b, c, t))
    return out


def f3(v):
    return '%.3f' % v


def line(passed, criterion, world, what, shown):
    word = 'MORE' if passed is None else 'pass' if passed else 'FAIL'
    return '%s | criterion %s | %s | %s | %s' % (word, criterion.ljust(2), world.ljust(13), what, shown)


def quarter(criterion, run, k, sts):
    m = misses(run['results'], k, sts)
    n, mean, lo, hi = interval([b - c - (b - t) / 4 for b, c, t in m])
    g = interval([b - c for b, c, t in m])[1]
    gap = interval([b - t for b, c, t in m])[1]
    shown = 'g less a quarter of b %s (%s to %s); g %s, the gap %s, closed %.0f of 100; %d people' % (f3(mean), f3(lo), f3(hi), f3(g), f3(gap), 100 * g / gap, n)
    return line(lo > 0, criterion, run['world'], span(sts) + ': closes at least a quarter of the gap', shown)


def better(criterion, run, k, sts):
    m = misses(run['results'], k, sts)
    n, mean, lo, hi = interval([b - c for b, c, t in m])
    gap = interval([b - t for b, c, t in m])[1]
    shown = 'B less C %s (%s to %s); the gap %s, closed %.0f of 100; %d people' % (f3(mean), f3(lo), f3(hi), f3(gap), 100 * mean / gap, n)
    return line(lo > 0, criterion, run['world'], span(sts) + ': the forecasts get better', shown)


def no_harm(run, k, sts):
    n, mean, lo, hi = interval([c - b for b, c, t in misses(run['results'], k, sts)])
    return line(hi < 0.05, '8', run['world'], span(sts) + ': no harm', 'C less B %s (%s to %s); %d people' % (f3(mean), f3(lo), f3(hi), n))


def twenty(criterion, world, what, hits, people, more):
    share = 100 * hits / people
    if hits <= 0.04 * people:
        return line(True, criterion, world, what, '%d of %d (%.1f of 100)' % (hits, people, share))
    if hits >= 0.05 * people:
        return line(False, criterion, world, what, '%d of %d (%.1f of 100)' % (hits, people, share))
    if more is None:
        return line(None, criterion, world, what, '%d of %d (%.1f of 100): between the marks, the further people decide' % (hits, people, share))
    both = hits + more[0]
    everyone = people + more[1]
    return line(both <= 0.0457 * everyone, criterion, world, what, '%d of %d, and with the further people %d of %d (%.2f of 100)' % (hits, people, both, everyone, 100 * both / everyone))


def ever(p, k, places):
    return any(p['c'][k]['ever'][at] == 1 for at in places)


def invented(run, k, further):
    places = NOTHING[run['world']]
    hits = sum(1 for p in run['results'] if ever(p, k, places))
    more = (sum(1 for p in further['results'] if ever(p, 0, places)), len(further['results'])) if further else None
    return twenty('9', run['world'], 'no invented differences (%s)' % ', '.join(PLACE[at] for at in places), hits, len(run['results']), more)


def range_harm(run, k):
    v = []
    for p in run['results']:
        n = sum(p['base'][st][0] for st in (0, 1, 2))
        if n:
            v.append(sum(p['c'][k]['s'][st][3] for st in (0, 1, 2)) / n - sum(p['base'][st][6] for st in (0, 1, 2)) / n)
    n, mean, lo, hi = interval(v)
    return line(hi < 0.18, '10', run['world'], 'days 29 to 180: the ranges, no harm', 'score C less B %s (%s to %s); %d people' % (f3(mean), f3(lo), f3(hi), n))


def range_holds(run, k):
    v = []
    for p in run['results']:
        n = sum(p['c'][k]['diff'][st][0] for st in (1, 2))
        if n:
            v.append(100 * (sum(p['c'][k]['diff'][st][2] for st in (1, 2)) - sum(p['c'][k]['diff'][st][1] for st in (1, 2))) / n)
    n, mean, lo, hi = interval(v)
    what = 'days 91 to 180, the rows that differ: the ranges still hold'
    if n == 0:
        return line(False, '10', run['world'], what, 'no person with such rows')
    return line(lo > -2, '10', run['world'], what, 'inside, C less B %.2f of 100 (%.2f to %.2f); %d people with such rows' % (mean, lo, hi, n))


def stays(run, k):
    used = [p for p in run['results'] if p['c'][k]['first'] >= 0]
    again = sum(1 for p in used if p['c'][k]['offs'] > 0)
    if not used:
        return line(False, '12', run['world'], 'it stays', '0 of 0 out of use again (NaN to NaN of 100)')
    lo, hi = wilson(again, len(used))
    return line(hi < 0.25, '12', run['world'], 'it stays', '%d of %d out of use again (%.1f to %.1f of 100)' % (again, len(used), 100 * lo, 100 * hi))


def challenger(folder, world, more_folder):
    own = load(folder, world, '.ch') or load(folder, world)
    if not own or not all('ch' in p for p in own['results']):
        return None
    further = (load(more_folder, world, '.ch') or load(more_folder, world)) if more_folder else None
    more = (sum(1 for p in further['results'] if p['ch']['adopted'] == 1), len(further['results'])) if further and all('ch' in p for p in further['results']) else None
    return twenty('11', world, 'the challenger stays safe', sum(1 for p in own['results'] if p['ch']['adopted'] == 1), len(own['results']), more)


def beneath(folder):
    out = []
    for world in ['kind-move', 'kind-idle', 'kind-flip']:
        run = load(folder, world)
        if not run:
            continue
        if run.get('beneath') != 'today':
            sys.exit(world + ": this run was not made with today's system beneath")
        people = run['results']

        def per(sts, pick):
            v = []
            for p in people:
                n = sum(p['base'][st][0] for st in sts)
                if n:
                    today = sum(p['base'][st][1] for st in sts) / n
                    b = sum(p['base'][st][2] for st in sts) / n
                    c = sum(p['c'][0]['s'][st][0] for st in sts) / n
                    v.append(pick(today, b, c))
            return interval(v)

        if world == 'kind-move':
            n, mean, lo, hi = per([1, 2], lambda today, b, c: c - today)
            other = per([1, 2], lambda today, b, c: b - today)[1]
            out.append(line(hi < 0.05, 'A1', world, "days 91 to 180: no harm against today's system", 'V less today %s (%s to %s); the Stage B system less today %s; %d people' % (f3(mean), f3(lo), f3(hi), f3(other), n)))
            n, mean, lo, hi = per([1, 2], lambda today, b, c: b - c)
            out.append(line(lo > 0, 'A2', world, 'days 91 to 180: better than the Stage B system', 'B less V %s (%s to %s); %d people' % (f3(mean), f3(lo), f3(hi), n)))
        else:
            for sts in ([0, 1, 2], [2]):
                n, mean, lo, hi = per(sts, lambda today, b, c: c - today)
                other = per(sts, lambda today, b, c: c - b)[1]
                out.append(line(hi < 0.05, 'A3', world, span(sts) + ": no harm against today's system", 'V less today %s (%s to %s); V less the Stage B system %s; %d people' % (f3(mean), f3(lo), f3(hi), f3(other), n)))
        v = []
        for p in people:
            n = sum(p['base'][st][0] for st in (0, 1, 2))
            if n:
                v.append(sum(p['c'][0]['s'][st][3] for st in (0, 1, 2)) / n - sum(p['base'][st][7] for st in (0, 1, 2)) / n)
        n, mean, lo, hi = interval(v)
        out.append(line(hi < 0.18, 'A4', world, "days 29 to 180: the ranges, no harm against today's system", 'score V less today %s (%s to %s); %d people' % (f3(mean), f3(lo), f3(hi), n)))
    for text in out:
        print(text)
    print('%d cells: %d pass, %d fail' % (len(out), sum(1 for t in out if t.startswith('pass')), sum(1 for t in out if t.startswith('FAIL'))))


def main():
    if len(sys.argv) > 2 and sys.argv[2] == 'beneath':
        beneath(sys.argv[1])
        return
    folder = sys.argv[1]
    k = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    more_folder = sys.argv[3] if len(sys.argv) > 3 else None
    runs = {}
    for world in IDS:
        run = load(folder, world)
        if run:
            runs[world] = run
    numbers = next(iter(runs.values()))['settings'][k]
    readings = numbers['readingChance'] > 0
    schedule = bool(numbers['reset'])
    weather = numbers['weatherChance'] > 0
    events = numbers['eventChance'] > 0
    out = []

    def own(on, world, make):
        if on and world in runs:
            out.append(make(runs[world]))

    own(readings, 'two', lambda r: quarter('1', r, k, [2]))
    own(readings, 'two-strong', lambda r: better('2', r, k, [1]))
    own(weather, 'sun', lambda r: quarter('3', r, k, [1, 2]))
    own(schedule, 'kind-move', lambda r: better('4', r, k, [1, 2]))
    own(readings and weather, 'all', lambda r: quarter('5', r, k, [2]))
    own(events, 'event', lambda r: better('6', r, k, [2]))
    own(events, 'event-rhythm', lambda r: better('7', r, k, [2]))
    for world in IDS:
        if world not in runs:
            continue
        r = runs[world]
        out.append(no_harm(r, k, [0, 1, 2]))
        out.append(no_harm(r, k, [2]))
        out.append(invented(r, k, load(more_folder, world) if more_folder else None))
        out.append(range_harm(r, k))
    for world in ['two', 'two-strong', 'sun', 'all']:
        own(True, world, lambda r: range_holds(r, k))
    own(schedule, 'kind-move', lambda r: range_holds(r, k))
    own(events, 'event', lambda r: range_holds(r, k))
    for world in ['plain', 'two-strong', 'sun']:
        cell = challenger(folder, world, more_folder)
        if cell:
            out.append(cell)
    own(True, 'two', lambda r: stays(r, k))
    own(True, 'sun', lambda r: stays(r, k))
    own(events, 'event', lambda r: stays(r, k))
    for text in out:
        print(text)
    failed = sum(1 for text in out if text.startswith('FAIL'))
    waiting = sum(1 for text in out if text.startswith('MORE'))
    print('%d cells: %d pass, %d fail, %d wait on the further people' % (len(out), len(out) - failed - waiting, failed, waiting))


main()
