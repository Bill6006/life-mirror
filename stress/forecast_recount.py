"""A second count of the forecast challenger's results, written apart from the judge.

  python -I -X utf8 stress/forecast_recount.py <results folder> [min slots] [min gain] [min clear]

Reads each world's JSON as the pool wrote it and counts, with the margin given (by default 20 slots, 0.5 points,
2.4 clear): the people picked on at least one day, the first such day, the days picked, and the people for whom a
thing stood at a steady pattern on any day. Nothing here imports the simulation's code.
"""
import json
import os
import sys

WORLDS = ['plain', 'streaks', 'sparse', 'rhythm', 'season', 'fifteen-points', 'ten-points', 'own', 'own-persistent']


def main():
    folder = sys.argv[1]
    slots, gain, clear = (float(x) for x in (sys.argv[2:5] + ['20', '0.5', '2.4'][len(sys.argv) - 2:]))
    for world in WORLDS:
        path = os.path.join(folder, world + '.json')
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        people = data['results']
        seeds = [p['seed'] for p in people]
        adopted = 0
        firsts = []
        days = 0
        on = 0
        pattern = 0
        for p in people:
            first = None
            if any(r[4] > 0 for r in p['rows']):
                pattern += 1
            for r in p['rows']:
                days += 1
                if r[1] >= slots and r[2] is not None and r[2] >= gain and r[3] is not None and r[3] >= clear:
                    on += 1
                    if first is None:
                        first = r[0] + 1
            if first is not None:
                adopted += 1
                firsts.append(first)
        firsts.sort()
        median = firsts[len(firsts) // 2] if firsts else '-'
        print(f'{world}: seeds {min(seeds)} to {max(seeds)}, {len(set(seeds))} people; picked {adopted}; median first day {median}; '
              f'days picked {on} of {days}; a thing at a pattern on any day {pattern}; numbers {json.dumps(data.get("numbers"))}')


if __name__ == '__main__':
    main()
