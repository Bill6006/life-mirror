# The forecast challenger's simulation: the verdict (2026-11-14)

**PASS.** Read once, on seeds 600001 to 602000, against criteria frozen before any of this code was written.
The criteria are kept in the private plan; their text's SHA-256 is
`199a4fe3d9eba2373f0e3260be524fb16daf5908fa61cca396b32e25454cbf9e`. This file describes the public code and
what it counted.

The challenger is still switched off (`CHALLENGER_ON` in `src/challenger.ts`). Nothing in the app runs it.

## What was run

- **The code under test** is the app's own, at commit a27f64a: the four ways of forecasting, their back-test and
  their daily pick (`src/forecast.ts`), and the challenger (`src/challenger.ts`) with the numbers below.
- **A simulated person** is `stress/world.ts`'s, 180 days long. On every day from day 15 to day 180 the pick is
  made from the record before that day. A person counts as picked when the challenger is the pick on at least one
  of those days.
- **A useless input** says nothing about the person's days ahead. Every useless world gives two kinds at once:
  the sleep answers and evening bands of another simulated person in place of the person's own, and twelve
  evening things laid from seeded streams of their own, which pass through the standing gate
  (`kindsAtPattern`) as the app's candidates will.
- **The worlds** are in `stress/forecastSim.ts`: five useless, one with a real lift of about fifteen points on
  the morning after a thing, one with about ten, and two where the person's own conditions are used.
- **The pick among the four** is the app's rule with each past slot's forecast worked out once. Every fiftieth
  person is also picked for by the app's own `chooseModel`, day by day, and a difference stops the run. None did.

Run with `bash stress/validate-forecast.sh 600001 2000 stress/.out/forecast-600000`. Counted a second time by
`stress/forecast_recount.py`, which shares no code with the judge. The two agree on every count below.

## The numbers the verdict was read with

Set on tuning seeds 1 to 1000 and written into the code before the verdict's seeds were read.

| Number | Value |
|---|---|
| Days looked back over | 180 |
| Least days in a state, and outside it | 8 |
| Shrinking | 4 |
| The first two conditions adjust | each check-in |
| Most kinds on the list | 3 |
| Margin: least slots where it differed | 20 |
| Margin: least average gain in miss | 0.5 points |
| Margin: least clearance of its own spread | 2.4 |

## Useless inputs: how often the challenger was picked

2,000 people a world. The interval is Wilson's, at 95%.

| World | Picked | In 100 | Interval | A thing at a pattern on any day | Miss on picked days, points a slot |
|---|---|---|---|---|---|
| `plain` | 12 | 0.60 | 0.34 to 1.05 | 399 | +0.06 |
| `streaks` | 27 | 1.35 | 0.93 to 1.96 | 543 | +0.37 |
| `sparse` | 2 | 0.10 | 0.03 to 0.36 | 109 | -0.41 (2 slots) |
| `rhythm` | 15 | 0.75 | 0.46 to 1.23 | 441 | +0.18 |
| `season` | 40 | 2.00 | 1.47 to 2.71 | 475 | +0.31 |

Every world's interval ends under 5 in 100. No second read was needed.

The last column is what a wrong pick cost: on the days it was picked, the average miss of the slots it adjusted,
less the base way's on the same slots. Plus is worse.

**Said plainly:** looked at every day for 180 days, a useless thing stood at a steady pattern on at least one
day for 5 to 27 people in 100. The comparison core's own check is at one look. Here the margin is what keeps
such a thing out of the forecast.

## A useful input: how often it was picked

| World | Picked | In 100 | Interval | Median first day | Miss on picked days, points a slot |
|---|---|---|---|---|---|
| `fifteen-points` | 1,282 | 64.10 | 61.97 to 66.17 | 129 | -1.74 |
| `ten-points` | 429 | 21.45 | 19.71 to 23.30 | 135 | -0.79 |
| `own` | 618 | 30.90 | 28.91 to 32.96 | 140 | -0.77 |
| `own-persistent` | 1,707 | 85.35 | 83.73 to 86.83 | 117 | -1.80 |

- `fifteen-points` is judged against a floor: a third of what the best rule of this form could reach, computed
  at each person's own counts. That bound came to 94.28 in 100, so the floor is 31.43. It passes.
- The other three are reported, not judged. The bound for `ten-points` came to 69.67 in 100.
- `own` and `own-persistent` use the person's own sleep answers and evening bands, with useless things.

## What this does not show

- Nothing here ran on a real record.
- A lift of ten points is picked in about one person in five by day 180. The rule is slow for small effects.
- The simulation stops at 180 days. The challenger looks back no further than that for the same reason.
