# The week ahead's level-plus-weekday way: the verdict (2026-11-21)

**VERDICT: PASS.** Read once on fresh seeds 900001 to 902000, against criteria frozen before any of this code was
written. The criteria are kept in the private repository; their text's SHA-256 is
`f9dc57e83c05b239353fe2d84d27f6bdc5ed2a5d1bdf66a26c3ad192f1048107`. This file describes the public code and what it
counted.

**Nothing is built.** The way lives beside its simulation (`stress/levelWeekday.ts`); nothing in `src/` has it, and the
week ahead is forecast exactly as before. Whether it is built is the owner's decision, with these results before them.

## The way

Its forecast for a check-in of a day is the same-block way's, plus one shift for that day's weekday, the same at each
of the day's check-ins and at every distance ahead. The seven shifts are learnt from the same-block way's own misses a
day ahead, each day counting once. They are used only while one test of the seven weekdays together stands open, and
has stood open on each of the days of its hold before; otherwise the four's pick stands exactly as today. It joins no
back-test, and everything is read from the record before the day forecast.

The method's numbers, set on the tuning seeds and written into the code before the verdict: a window of 180 days; the
test's chance at most 1 in 1,000,000; at least 4 days of each weekday; a hold of 28 days; a shrinking of 2.

## What was run

- **The code under test** is the app's own at c1bf62b: the four ways of forecasting, their back-test and their daily
  pick (`src/forecast.ts`), and the challenger (`src/challenger.ts`). The way and its simulation are at 0b3d039.
- **A simulated person** is `stress/world.ts`'s, 180 days long. On every day from day 15 to day 180 the week ahead
  (each check-in of the next seven days) is written from the record before that day, once by today's system and once by
  the system with the new way, and each forecast is set beside what was then answered.
- **The worlds** are in `stress/weekSim.ts`. With no weekday effect: `plain`, `streaks`, `sparse`, `season`. With one:
  `rhythm`. Harder, built to break what the way assumes: `rhythm-half` (half the steps), `rhythm-one` (the steps at the
  evening check-in alone) and `rhythm-turn` (from day 91 each weekday takes the step of the weekday three days after it).
- **The told forecast** is the bar a forecast could reach if it were told the true weekday shifts: the same-block way on
  the record with those shifts taken out, plus the true shift of the day forecast.
- **The checks kept on:** the five earlier worlds are drawn exactly as before the world's spec gained a shift at one
  check-in (the same fingerprints over 40 people each); every fiftieth person's pick is made by the app's own
  `chooseModel` too, every day; every fiftieth person's state of the way is worked out again from the record alone, every
  tenth day (`weekStateOf`); a difference stops the run, and none did. The program the verdict ran (`weekPool.mjs`,
  SHA-256 `e2f5a980bea1f7258ab5d82154b463f86d9db6ea8d2de3083a3cd209d93ffa7a`, the same before and after) gives on
  tuning people exactly what the tuning's run gave (24 people in each of two worlds). Every judged number was counted a second time by another program (`stress/week_recount.py`),
  and the two agree.

The verdict: `bash stress/validate-week.sh 900001 2000 <folder>`, then the same with `'' challenger`, then
`node stress/.out/weekJudge.mjs <folder>` and `python -I -X utf8 stress/week_recount.py <folder>`.

## The tuning, on seeds 1 to 1000

Every setting was read on all eight worlds and all 1,000 people.

- **The first run** (window 84, chance 1 in 100, hold 28, shrinking 2): it closed 22 of 100 of the gap in `rhythm`
  (a quarter is asked), and a turned pattern cost 0.114 points (0.103 to 0.125; under 0.10 is asked).
- **A first grid of 112 settings** (windows 56 to 180; shrinking 1 to 4; chance 1 in 100 and 1 in 1,000; hold 28 and
  42): none met every criterion. Closing the gap asked for a longer window; a turned pattern asked for a shorter one.
- **A second grid of 120 settings with far stricter tests** (windows 84 to 180; shrinking 1 to 3; chance 1 in 10,000 to
  1 in 10,000,000; hold 28 and 56): 26 met every criterion read there. A long window learns the shifts well, and a very
  strict test closes almost at once when a pattern turns, since the mixed evidence no longer clears it.
- **The choice,** by a rule written into the grid's judge before the second grid was read: the setting with the most
  room at its tightest criterion. Run alone with the challenger on the tuning seeds, every criterion would pass.
- `stress/weekGrid.ts` runs a grid; its 12-week setting was proven against a run made with that setting alone: 0 of
  1,000 people differ in each of the eight worlds.

## The verdict, seeds 900001 to 902000

Misses are in points a check-in, averaged over people; intervals are 95 percent.

| Criterion | Where | Result | Asked |
|---|---|---|---|
| 1. Closes a quarter of the gap to the told forecast | `rhythm`, days 151 to 180 | 49 of 100 closed: the gain less a quarter of the gap 0.079 (0.062 to 0.096); gain 0.162, gap 0.329 | wholly above 0 |
| 2. Forecasts get better | `rhythm`, days 91 to 150 | 0.068 (0.058 to 0.078) | wholly above 0 |
| 3. No harm (with less without) | `rhythm`, days 29 to 90 | −0.000 (−0.001 to 0.001) | upper end under 0.05 |
| | `plain`, `streaks`, `sparse`, `season`, days 29 to 180 | 0.000 each | upper end under 0.05 |
| | `rhythm-half`, days 29 to 180 | −0.001 (−0.002 to 0.000) | upper end under 0.05 |
| | `rhythm-one`, days 29 to 180 | −0.000 (−0.001 to 0.000) | upper end under 0.05 |
| | `rhythm-turn`, days 151 to 180 | 0.004 (0.001 to 0.007) | upper end under 0.05 |
| 4. A turned pattern costs little | `rhythm-turn`, days 91 to 180 | 0.044 (0.038 to 0.049) | upper end under 0.10 |
| 5. No invented weeks: ever in use | `plain`, `streaks`, `sparse`, `season` | 0 of 2,000 in each | at most 80 of 2,000 |
| 6. The challenger adopted, the way among its bases | `plain` 13, `streaks` 19, `sparse` 2, `rhythm` 18, `season` 46 of 2,000 | | at most 80 of 2,000 |
| 7. It stays in use | `rhythm` | out of use again for 9 of 1,926 (0.5 in 100; 0.2 to 0.9) | wholly under 25 in 100 |

No world needed a second read.

## Reported, not judged

- **`rhythm`.** The way comes into use for 1,926 of 2,000 people, the middle one on day 124, and is in use on 1, 44 and
  90 of 100 days over days 29 to 90, 91 to 150 and 151 to 180. Over days 151 to 180: the flat way misses by 11.143,
  today's system by 10.216, the system with the way by 10.055, the told forecast by 9.887. By days ahead, today's
  system against the way: 10.22 against 10.01 a day ahead, 10.29 against 10.08 seven days ahead. The shifts in use on
  day 180, Sunday first, averaged over people: 3.8, −10.4, −5.6, −0.3, −0.6, 4.3, 8.8, beside true ones of 4.2, −10.5,
  −5.6, −0.7, −0.7, 4.2, 9.1; one person's shift is off by 1.31 points on average.
- **`rhythm-half`.** Ever in use for 126 of 2,000, on 4 of 100 days late in the record; late, today's system 10.084 and
  with the way 10.079 (a gain of 0.005, 0.001 to 0.009), the told forecast 9.903.
- **`rhythm-one`.** Ever in use for 13 of 2,000.
- **`rhythm-turn`.** In use for 374 of 2,000 before or after the turn, and out of use again for 372 of them; over days
  91 to 150 today's system misses by 11.129 and the system with the way by 11.193.
- **Today's pick in a world with no weekday effect.** In `plain` it is one of the two ways that tell weekdays apart on
  38, 50 and 48 of 100 days over the three stretches (`sparse` 42, 51, 50; `streaks` 23, 32, 30; `season` 10, 0, 12).
  The new way is never in use there.

## What this does not show

- Nothing here ran on a real record.
- The simulation stops at 180 days.
- The way passes by being used only on overwhelming evidence: a rhythm of half the size is almost never moved by it
  within 180 days.
- The ranges around the way's forecasts were not simulated; only its points were judged.
