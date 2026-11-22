# The week ahead's level-plus-weekday way

Stage A, built 2026-11-21: the way is in the app (`src/levelWeekday.ts`) and **switched off**. This document describes
the public code. A unit test (`src/levelWeekday.test.ts`) holds its numbers and its words to the code, so the two
cannot drift apart unnoticed.

## In short

The week ahead is forecast by one of four ways, picked each day by how close each came a day ahead over the last four
weeks (`src/forecast.ts`). Two of the four cannot tell one weekday from another, so on many records the days ahead come
out alike. The level-plus-weekday way is a fifth way that can, and it is **not** a fifth contestant: it joins no
back-test and no contest with the four. It writes the week ahead only on overwhelming evidence that the weekdays stand
apart, and otherwise the four's pick writes it exactly as before.

**While `LEVEL_WEEKDAY_ON = false` nothing of the way runs in the app**, and every forecast is written exactly as it
was before the way existed.

## The way

On a day it is in use, every forecast row written that day is:

- **the point:** the same-block way's forecast for the slot (this time of day over the last four weeks, the latest days
  counting most), plus **one shift for the forecast day's weekday**, the same at each of the day's check-ins and at
  every distance ahead;
- **the shifts:** learnt from the same-block way's own misses a day ahead over the window before the day of writing.
  A day's miss is the average, over its answered check-ins, of the reading less the same-block way's forecast of it
  from the record before that day; each day counts once. A weekday's shift is the average of its days' misses less the
  average over all the days;
- **the test:** one test of the seven weekdays together. F is the spread between the weekdays over the spread inside
  them: the sum over weekdays of (its days times its shift squared), over 6; over the sum over days of (the day's miss
  less its weekday's average) squared, over (the days less 7). The test is open when every weekday has its least days in
  the window and the chance of an F this large with nothing there (the F distribution on 6 and the days less 7
  degrees) is at most the test's chance;
- **the strength:** each shift is multiplied by 1 − (the shrinking ÷ F), never under nothing;
- **the hold:** the way is in use on a day only when its test is open on that day **and on each of the 28 days before
  it**, each worked out from the record before that day.

Everything is read from the record before the day forecast.

## Its numbers

Set on simulated tuning people inside limits frozen before the way's code was written, and written into the code
before its verdict was read. They never change.

| Number | Value |
| --- | --- |
| The window | 180 days |
| The test’s chance | at most 1 in 1,000,000 |
| Least days of each weekday | 4 |
| The hold | 28 days |
| The shrinking | 2 |

## Its range

As each of the four takes its own (`horizonBand`, `src/forecast.ts`): around the way's point, the 20th to 80th band of
the way's own misses at the row's distance over the 28 days before the day of writing; today's rows and tomorrow's take
its misses a day out. Each miss is as the way would have made that forecast then: the reading, less the same-block way's
forecast from the record as it stood that many days before, less the shift the way's test gave on that record for the
day's weekday (nothing where the test was closed on that record). With fewer than five misses at a distance, the band of
its misses a day out. The point, the low and the high are stored as every row is: rounded, and kept from 0 to 100.

## What the writer does, when the way is switched on

`forecastOnce` in `src/forecastFlow.ts`, once a run:

1. The four's pick is made exactly as before (`chooseModel`).
2. One reader of the way (`levelWeekdayReader`) is asked for the day's rows, under the comparisons' guard
   (`src/counted/fault.ts`), before the write. Not in use: nothing changes. A throw: the day is left to the four, and
   the failure is kept for the Worker's report by its error's name alone.
3. The rows due start from what `forecastsDue` gives the pick, so its skips hold as they are: the horizon rule, a slot
   that already has a row at that distance, a slot already logged (`rowsWithTheWay`). Each row the way has a row for
   takes the way's point, low and high and the name `levelWeekday`, and keeps its what-if. A slot only the way can
   forecast, under the same skips, is the way's row; a slot only the pick can forecast stays the pick's.
4. The challenger (`src/challenger.ts`) runs on top as built, with the way in use that day as its base: the way where
   it wrote the rows, else the four's pick. Its forecasts of the way come from the same reader.
5. A row is never rewritten.

## What is stored

- **`model: 'levelWeekday'`** on each row the way wrote, kept after any rollback.
- **`four`**, on each row the way wrote over one of the pick's: `{ model, point, lo, hi }`, the row the four's pick
  would have written for that slot, number for number, written in the same run. It is read by nothing yet, and no
  screen shows it; it cannot be rebuilt later, and it is what a later judgment on the real record would need. It
  syncs with the row and appears in the export beside `plain`.
- **`plain`**, where the challenger moved a row of the way, is the way's row as written (Batch 3,
  `docs/forecast-check.md`).

## Where it shows

The Weekly View's week ahead (Mirror → The weekly view). The way tells one weekday from another, so where it wrote the
latest rows the days ahead differ and the lowest is marked, as for any way that tells weekdays apart. Under **Details**
the way is named in its own sentence, in place of the four's:

- the way's name: `your usual level at this time of day and how this weekday usually differs`
- the sentence: `Expected from {model}. This way is used only after clear weekday differences have held for four weeks.`

The line after it, on how the range is sized, stands as it is. Ask, reading the stored forecasts, names the way in the
same words and says it can tell one weekday from another (`src/forecastConditions.ts` and `src/copy.ts`, which the
Worker shares).

## The switch, and turning it off

- **The switch:** `LEVEL_WEEKDAY_ON = false` in `src/levelWeekday.ts`. Switching it on is a commit of its own that
  changes nothing else in `src/`.
- **Turning it off again (rollback):** set it back to `false`, in a commit of its own. From that push the four's pick
  writes every row. Rows the way already wrote stay as written and keep its name; nothing is migrated, deleted or
  rewritten; the Worker needs no deploy. The way's words and its place among the ways that tell weekdays apart stay.
- **A fault while it is on** needs no rollback: the guard leaves that day to the four and reports it.

## How it was judged

Before any of the way's code was written, pass and fail criteria were frozen in the private repository; their text is
not copied here. Their SHA-256:

- the points: `f9dc57e83c05b239353fe2d84d27f6bdc5ed2a5d1bdf66a26c3ad192f1048107`, verdict PASS on unread seeds
  900001 to 902000 (`stress/RESULTS-13.md`);
- the ranges: `bda7abeb74527e1372fd52813fcd2b910752c601d2678a4d28ac4b18bd3be381`, verdict PASS on unread seeds
  910001 to 912000 (`stress/RESULTS-14.md`).

The simulation (`stress/weekSim.ts`, `stress/weekRanges.ts`) runs the app's own code. A fixture of the verdicts' people
(`stress/week-fixture.json`, checked by `stress/weekFixture.ts check`) proves that the way's code, moved into the app,
gives the same people, number for number.

**Said plainly:** the way passes by being used only on overwhelming evidence. On a real record it will most likely lie
unused for months, and that is the design working.
