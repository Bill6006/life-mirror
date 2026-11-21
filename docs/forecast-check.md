# How Life Mirror checks its own adjusted forecasts

Batch 3 of the forecast follow-ups, built 2026-11-21. This document describes the public code. A unit test
(`src/movedCheck.test.ts`) holds its numbers and its words to the code, so the two cannot drift apart unnoticed.

## In short

Since 19 November 2026 the forecast has one challenger (`src/challenger.ts`). On a day it is picked, the forecasts
written that day are moved by what the record held the day before: a short night, the evening's band, and up to three
things standing at a steady pattern for the next morning. This check asks one question: **did the moved forecasts
come closer to what happened than the plain forecasts would have?**

The app answers it by itself, from the rows it already stores, at three looks fixed in advance, and it acts on the
answer by itself: it keeps the challenger, or it switches the challenger off. No person and no AI session is needed
to read the result or to act on it.

## Where to see it

Mirror → The weekly view → Deeper diagnostics → **Scorecard** (closed until opened), under the forecast hit-rate line.

## What is stored

- **Each moved forecast** (a row in the phone's `forecasts` store with `adj`, the points the challenger added, and
  `adjBy`, the conditions that added them) also keeps **`plain`**: the plain forecast it was moved from, that is the
  base way's own `point`, `lo` and `hi` for the slot, number for number, written in the same run and never touched
  after (`adjustRows` in `src/challengerRecord.ts`).
- **Each scored slot** is a row in `forecastScores`: what was logged (`actual`) and the day it was scored (`scoredOn`).
- A forecast the challenger does not move has no `plain`, and is exactly what it was before Batch 3.
- Forecasts moved before Batch 3 shipped carry no `plain`. They are not counted: working the plain forecast out
  again later would read the record as it stands then, not as it stood when the forecast was written.

Both stores sync to the owner's own cloud copy and appear in the export, `plain` and `scoredOn` included.

## What is compared, for each moved forecast

Once its slot is scored, and only if it was scored on a day before today:

| Quantity | Calculation |
| --- | --- |
| miss | distance from what was logged to the moved point: \|actual − point\| |
| plain miss | distance from what was logged to the plain point: \|actual − plain.point\| |
| range held | lo ≤ actual ≤ hi |
| plain range held | plain.lo ≤ actual ≤ plain.hi |
| gain | plain miss − miss (above 0 where the moved forecast came closer) |

## The trigger: three looks, and never a fourth

- **Look 1** at 40 moved forecasts scored, **look 2** at 80, **look 3** at 120.
- A look counts only once its moved forecasts lie on at least 10 different days (the days forecast, not the days
  scored).
- A look takes whole scoring days: every moved forecast scored on or before the first scoring day by which the count
  is reached, and none scored later. It is read from the day after that scoring day.
- Only forecasts scored on a day before today are counted, so a reading never changes once it has been made.

Why fixed looks: a check read every day calls a useless thing sooner or later. Why three: one early chance to stop
something clearly harmful or clearly helpful, then a final decision.

## The calculation at a look

Over the look's moved forecasts:

- **n**: how many; **held** and **plain held**: how many ranges held, each way;
- **average miss**, moved and plain: the misses' sum over n;
- **gain**: the gains' sum over n;
- **clearance**, the challenger's own measure (`clear` in `runChallenger`): group the gains by the day forecast and add
  them up for each day, giving D day gains g₁ … g_D with sum G and average m = G / D; then

  clearance = G / √(D × s²), where s² = Σ (gᵢ − m)² / (D − 1).

  With fewer than two days, or no spread at all between the day gains, there is no clearance.

## The verdict, and what each verdict does

| Look | Keep it | Switch it off | Otherwise |
| --- | --- | --- | --- |
| 1 and 2 | clearance 2.4 or more | clearance −2.4 or less | keep watching: the next look is read when its count comes |
| 3 | gain above 0 | gain 0 or below | (none: look 3 always decides) |

- 2.4 is the challenger's own margin (`CHALLENGER.minClear`), the clearance its back-test must reach for it to be
  picked at all.
- **Keep it** and **switch it off** are final: no later look is read, and the Scorecard keeps showing the reading that
  decided.
- **Keep it** and **keep watching** leave the challenger as it is: still picked, or not, by its own daily rule.
- **Switch it off** stops the challenger from the day of reading on: the forecast writer (`forecastOnce` in
  `src/forecastFlow.ts`) reads the check before it would try the challenger, and does not try it. No forecast written
  from then on is moved. No row already written changes. The code's own switch, `CHALLENGER_ON`, is not touched.
- **The miss decides.** The ranges held are shown beside the misses and never decide the verdict.
- The check is worked out afresh from the stored rows at every read, with nothing kept between reads.

## The result format: the words on screen

The Scorecard shows these lines (`copy.weekly.movedCheck` in `src/copy.ts`; `movedCheckLines` in `src/weeklyScreen.tsx`).

Before the first look:

- `Forecasts moved and scored: {n}`
- `They are set beside the plain forecast once {first} are scored, on at least {days} days.`

From a look on, the look's own numbers, in the approved contract's shape (misses to one decimal):

- `Forecasts moved and scored: {n}`
- `Range held: {a} of {n} moved, {b} of {n} plain`
- `Average miss: {x} moved, {y} plain`
- `Read as written down beforehand: {verdict}.`, where the verdict is `keep it`, `keep watching` or `switch it off`

and one line of what follows:

- keep watching: `Read on {day}; read again once {next} are scored ({now} so far).`
- keep it: `Read on {day}; it is not read again.`
- switch it off: `Read on {day}: forecasts written from then on are not moved.`

The lines name no condition, so no private item and no note event appears in them. An example of a finished reading:

    Forecasts moved and scored: 41
    Range held: 27 of 41 moved, 23 of 41 plain
    Average miss: 7.1 moved, 8.0 plain
    Read as written down beforehand: keep watching.
    Read on 9 December; read again once 80 are scored (41 so far).

## How it was expected to behave, worked out before the rule was frozen

By simulating the rule alone (20,000 readings a case; day gains drawn independent and normal; at three moved
forecasts a day the looks fall at about 14, 27 and 40 days):

- with no real difference: an early "keep it" about 2.5 times in 100, an early "switch it off" about 2.4 times in 100,
  and in all a coin's toss (kept about 50 in 100), which is harmless either way;
- where a day's gain averages a tenth of its own spread in the moved forecasts' favour: kept about 74 in 100; a fifth:
  about 90 in 100;
- a tenth against: switched off about 73 in 100; a fifth against: about 90 in 100.

The third look decides by the gain alone because a real help of the challenger's size seldom stands 2.4 clear within
120 forecasts; keeping only what stood that clear would switch most real helps off.

## Where the rule comes from

The rule was written, and frozen, in the owner's private plan on 2026-11-21, before any of this code existed and
before any real moved forecast was counted or read. Its text is kept there; its SHA-256 is
`520036607665158a0e1eb92f4e015baf6015dbd5d46cfb10f66f37a63158b1c0`. This document describes the code that carries it
out, and is not a copy of that text.

## Checking a reading by hand

From an export (Settings → Data), with no app code:

1. Take the `forecasts` rows that have both `adj` (not 0) and `plain`.
2. Join each to its `forecastScores` row by `day`, `block` and `horizon`; keep those whose `scoredOn` is before the
   day you are checking.
3. Sort them by `scoredOn`, then `day`, then the check-in (morning, afternoon, evening), then `horizon`.
4. For look 1, walk down the list to the end of the first scoring day by which there are at least 40 of them on at
   least 10 different `day`s. Those are the look's rows (likewise 80 and 120).
5. Work out the table above for each row, then the averages, the day gains and the clearance, and read the verdict
   from the verdict table.

## The code and its tests

- `src/movedCheck.ts`: `CHECK_LOOKS`, `CHECK_MIN_DAYS`, `CHECK_CLEAR`; `movedForecasts`, `lookAt`, `readingOf`,
  `movedCheck` and `checkStopsChallenger`.
- `src/challengerRecord.ts`: `adjustRows` keeps `plain`.
- `src/forecastFlow.ts`: the writer reads the check before trying the challenger; `weeklyData` carries it to the screen.
- `src/weeklyScreen.tsx` and `src/copy.ts`: the Scorecard's lines.
- `src/export.ts`: `plain` and `scoredOn` in the export.
- Tests: `src/movedCheck.test.ts` (the rule, the words, this document), `src/forecastCheck.test.ts` (the writer),
  `e2e/batch3.spec.ts` (the Scorecard in a browser); deliberate breaks in `qa/forecast_check_breaks.py`; the live
  site's check in `qa/live-forecast-check.mjs`.

## What it does not do

- It never changes the challenger's method, its numbers or its daily pick; the four ways of forecasting, their
  back-test or the ranges; or any row already written.
- It tells neither Ask nor the Brain anything new. Ask keeps its own record of moved forecasts
  (`forecasts.movedRecord` on the Worker), which counts every moved row, those from before Batch 3 too.
- It puts no notice on Now. It has no fourth look, and a final verdict is never read again.
