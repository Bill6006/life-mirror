# The week ahead's level-plus-weekday way: its ranges' verdict (2026-11-21)

**VERDICT: PASS.** Read once on fresh seeds 910001 to 912000, against criteria frozen before the way's range code was
written. The criteria are kept in the private repository; their text's SHA-256 is
`bda7abeb74527e1372fd52813fcd2b910752c601d2678a4d28ac4b18bd3be381`. This file describes the public code and what it
counted. The way's points passed their own verdict earlier the same day (`RESULTS-13.md`).

**Nothing is built.** The way lives beside its simulation (`stress/levelWeekday.ts`); nothing in `src/` has it.

## The range

As each of the four ways takes its own (`horizonBand`, `src/forecast.ts`): around the way's point, the 20th to 80th
band of the way's own misses at the row's distance over the 28 days before the day of writing; today's rows and
tomorrow's take its misses a day out. Each miss is as the way would have made that forecast then: the reading, less
the same-block way's forecast from the record as it stood that many days before, less the shift the way's test gave on
that record for the day's weekday (nothing where the test was closed on that record). With fewer than five misses at a
distance, the band of its misses a day out. The range has no number of its own, so nothing was tuned.

## What was run

- **The rows.** On every day from day 15 to day 180 the rows the app would write (today's check-ins and each check-in
  of the next seven days: a point, a low and a high, rounded and kept to 0 to 100 as the app stores them) are written
  by today's system and by the system with the way, whose rows are the way's on a day it is in use and today's
  otherwise. `stress/weekRanges.ts`.
- **The measures,** on the answered slots where both wrote a row: whether the answer fell inside the range; the
  range's width; and its score, the width plus five times how far outside it the answer fell (the usual score for a
  range meant to hold six answers in ten; lower is better).
- **The worlds and the method's numbers** are those of `RESULTS-13.md`: eight worlds; a window of 180 days, the
  test's chance at most 1 in 1,000,000, at least 4 days of each weekday, a hold of 28 days, a shrinking of 2.
- **Today's system alone was read first** on tuning seeds 1 to 1000, before the criteria were frozen: its ranges hold
  about 58 answers in 100, and a range's score is 3.6 to 3.7 times the miss in every world.
- **The checks kept on:** today's rows are worked out with each past forecast made once, and were proven against the
  app's own `chooseModel` and `forecastsDue` run for every day (0 of 12 people differing); every fiftieth person's
  rows are written by those functions again every tenth day, and every fiftieth person's rows of the way by the
  function that reads the record alone (`levelWeekdayRows`); a difference stops the run, and none did. The program
  the verdict ran (`weekRanges.mjs`, SHA-256 `c352e3fd3e1264ebe61c35af2b85ce46f7dbdd3cb7475524263633b11cd1ce8e`,
  the same before and after) gives on tuning people exactly what the tuning read gave (24 people in each of two
  worlds). Every judged number was counted a second time by another program (`stress/week_ranges_recount.py`), and
  the two agree.
- **The tuning read** (seeds 1 to 1000, all eight worlds): no fault in the code, nothing changed, every criterion
  would pass.

The verdict: `node stress/.out/weekRanges.mjs run <world> 910001 912000 <folder>/<world>.json` for each world, then
`node stress/.out/weekRanges.mjs judge <folder>` and `python -I -X utf8 stress/week_ranges_recount.py <folder>`.

## The verdict, seeds 910001 to 912000

2,000 people in each of the eight worlds; intervals are 95 percent.

| Criterion | Where | Result | Asked |
|---|---|---|---|
| R1. The range still holds what today's do: the share inside with the way less today's, of 100 | `rhythm`, days 151 to 180, the rows written on days the way is in use | 1.126 (0.920 to 1.332): 59.1 inside against 58.0 | lower end above −2 |
| R2. The ranges get better: the score without less with | `rhythm`, days 151 to 180, every row | 0.546 (0.470 to 0.622) | wholly above 0 |
| R3. No harm: the score with less without | `rhythm`, days 29 to 90 | 0.003 (−0.002 to 0.008) | upper end under 0.18 |
| | `plain`, `streaks`, `sparse`, `season`, days 29 to 180 | 0.000 each: the way is never in use | upper end under 0.18 |
| | `rhythm-half`, days 29 to 180 | 0.002 (−0.001 to 0.004) | upper end under 0.18 |
| | `rhythm-one`, days 29 to 180 | 0.000 (−0.000 to 0.001) | upper end under 0.18 |
| | `rhythm-turn`, days 151 to 180 | 0.009 (0.002 to 0.016) | upper end under 0.18 |
| R4. A turned pattern costs little: the score with less without | `rhythm-turn`, days 91 to 180 | 0.147 (0.128 to 0.167) | upper end under 0.36 |

## Reported, not judged

- **`rhythm`, days 151 to 180.** The week ahead's rows, today's system then the system with the way: 58.0 and 59.0 of
  100 inside; width 20.36 and 20.58; score 37.15 and 36.68; the stored point's miss 10.194 and 10.015. Today's own
  rows, which the points' verdict did not cover: 58.6 and 59.8 inside; width 20.24 and 20.26; score 36.45 and 35.38;
  the stored point's miss 10.117 and 9.807.
- **Days in use,** of about 332,000 a world: `rhythm` 107,120; `rhythm-half` 2,472; `rhythm-one` 163; `rhythm-turn`
  7,143; none in the four worlds with no weekday effect. The way left no slot without a row.
- **Where it hurt.** In `rhythm-turn`, on the rows written on the days the way was in use (most of them just after
  the turn): 53.1 and 51.5 of 100 inside, score 42.02 and 45.78, the stored point's miss 11.519 and 12.589. Over
  every row of days 91 to 150 the stored point's miss is 11.075 and 11.137 for the week ahead.
- **`rhythm-half`,** on the rows written on days in use: 56.5 and 57.3 inside; score 37.01 and 37.25.

## What this does not show

- Nothing here ran on a real record, and the simulation stops at 180 days.
- The challenger's own range on a row it moves is unchanged and was not simulated on top of the way.
