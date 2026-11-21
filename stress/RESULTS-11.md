# The week ahead's fifth way's simulation: the tuning (2026-11-20)

**NO NUMBERS MEET THE CRITERIA: the build stops for the owner.** Read on the tuning seeds 1 to 1000, against criteria
frozen before any of this code was written. The criteria are kept in the private plan; their text's SHA-256 is
`1dc703b64bbf8f325d0bb46cc4099dcec4777c5369774c828675c4bf671d15ad`. This file describes the public code and what
it counted.

The fifth way was switched off (`FIFTH_ON` in `src/weekdayPattern.ts` at 709cb16), and nothing in the app imported
it: the week ahead is forecast as before. The verdict's seeds were not read.

**Closed on 2026-11-20 at the owner's word, and never built.** Its code now lives beside its simulation, in
`stress/weekdayPattern.ts`, and nothing in the app has it.

## What was run

- **The code under test** is the app's own, at commit 709cb16: the four ways of forecasting, their back-test and
  their daily pick (`src/forecast.ts`); the fifth way, its steady patterns, its offsets and its margin
  (`src/weekdayPattern.ts`); and the challenger (`src/challenger.ts`) on the way picked of five.
- **A simulated person** is `stress/world.ts`'s, 180 days long. On every day from day 15 to day 180 the pick is
  made from the record before that day, as the app makes it.
- **The worlds** are in `stress/fifthSim.ts`: `plain`, `streaks`, `sparse` and `season`, with no weekday effect;
  `rhythm`, whose readings move with the weekday at every check-in; and `rhythm-half`, the same weekdays at half the
  steps.
- **The shortcut:** each past slot's forecast by the four is worked out once. Every fiftieth person is also picked
  for by the app's own `chooseModel` every day and by its own `chooseOfFive` every tenth day; a difference stops the
  run, and none did.
- **The margin, tried without running anyone again.** A run made with `FIFTH_RECORD=1` keeps, for every day the
  fifth way beat each of the four in the back-test (the only days a margin can pick it), what the margin is judged
  on and where either pick would have led. `stress/fifthMargin.ts` makes every person again under each margin from
  that record. It first makes them again at the run's own margin and stops unless each comes out as the run wrote
  them; none stopped.

Each run: `FIFTH_RECORD=1 bash stress/validate-batch2.sh fifth 1 1000 <folder> 12 '<numbers>'`, then
`node stress/.out/fifthMargin.mjs <folder> [grid]` and `node stress/.out/fifthJudge.mjs <folder> tuning`.

## What was tried

The numbers the tuning may set are the window (at most 180 days), the hold (from 1 day), the shrinking (0 to 4)
and the margin's three: the least slots, the least gain and the least clear.

| Run | Window | Hold | Shrinking | Margins |
|---|---|---|---|---|
| a | 180 | 1 | 4 | 288, then 252 wider |
| b | 180 | 1 | 0 | 288, then 252 wider |
| c | 180 | 3 | 4 | 288 |
| d | 90 | 1 | 4 | 288 |

The grid: the least slots 4, 8, 12, 16, 24 and 32; the least gain 0, 0.5, 1, 1.5, 2 and 3 points; the least clear
0, 1, 1.5, 2, 2.5, 3, 3.5 and 4. The wider one: 4, 8, 16, 32, 48 and 64 slots; 0, 1, 2, 3, 4, 6 and 8 points; a
clear of 0, 2, 4, 5, 6 and 8.

## What it found

Over the 288 margins of each run, of 1,000 people a world. Criterion 1 is the most picked in any world with no
weekday effect, and criterion 3 the most adopted in any useless world. Criterion 2 is in points, with its interval;
"picked for" counts `rhythm`'s people picked on some day.

| Run | Criterion 1 | Criterion 3 | Criterion 4: worst upper end | Criterion 2: margins wholly above nothing | Criterion 2 at its worst | Criterion 2 at its best |
|---|---|---|---|---|---|---|
| a | 14 | 21 | 0.001 | 0 | −0.057 (−0.068 to −0.046), picked for 606 | 0.000 (−0.000 to 0.001), picked for 2 |
| b | 13 | 21 | 0.001 | 0 | −0.079 (−0.093 to −0.065), picked for 647 | 0.000 (−0.001 to 0.002), picked for 4 |
| c | 10 | 21 | 0.001 | 0 | −0.049 (−0.060 to −0.039), picked for 560 | 0.000 (−0.000 to 0.001), picked for 1 |
| d | 9 | 21 | 0.002 | 0 | −0.022 (−0.028 to −0.015), picked for 308 | 0.000 (−0.000 to 0.001), picked for 4 |

The wider grid gives a and b the same: no margin wholly above nothing; criterion 2 from −0.057 and −0.078 at worst
to 0.000 at best; criterion 1 at most 14 and 13; criterion 3 at most 21; criterion 4's worst upper end 0.001.

Criteria 1, 3 and 4 hold at every margin, with room. Criterion 2 fails at every margin. Wherever a margin lets the
fifth way be picked in `rhythm`, the day-ahead forecasts of days 151 to 180 get worse. Where a margin is strict
enough that it is almost never picked, they are as before, with an interval that reaches below nothing.

At the code's own margin (8 slots, 1 point and a clear of 2), in `rhythm`, of 1,000 people:

| Run | Picked on some day | Picked on day 180 | On the days picked, its next day's miss against the pick's | Criterion 2 |
|---|---|---|---|---|
| a | 357 | 66 | 0.483 points a slot more, over 6,145 slots | −0.023 (−0.031 to −0.015) |
| b | 328 | 55 | 0.632 more, over 5,600 slots | −0.027 (−0.037 to −0.018) |
| c | 298 | 61 | 0.431 more, over 4,972 slots | −0.017 (−0.024 to −0.009) |
| d | 68 | 7 | 0.810 more, over 928 slots | −0.004 (−0.006 to −0.001) |

`rhythm`'s weekday cells at a steady pattern on day 180, of 1,000 people. With the window at 180 days: Monday
morning 851, Monday evening 829, Saturday morning 692, Saturday evening 679, Saturday afternoon 605, Monday
afternoon 535, Tuesday afternoon 216, and every other cell 104 or under. At 90 days: Monday morning 445, Monday
evening 408, Saturday morning 296, Saturday evening 287, Saturday afternoon 144, Monday afternoon 122, and every
other cell 34 or under.

**Said plainly:** the week ahead already learns the weekdays. Two of its four ways tell weekdays apart: the weekday
way, and the blend of it with the same-block way. In `rhythm` the daily pick is nearly always one of those two. The
fifth way adds its weekday offsets to the same-block way's forecast, which the pick has already passed over. And it
can read only the weekdays that stand 10 points or more from the rest, Monday and Saturday. So it seldom beats the
four over four weeks, and when it does, mostly by luck: the next day it misses by more.

## What this does not show

- Nothing here ran on a real record.
- The simulation stops at 180 days.
- A way of another form, such as one built on the day's pick, is not judged here.
