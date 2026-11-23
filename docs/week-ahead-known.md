# The week ahead from what is known about each day (Stage C)

Stage C-A, built 2026-11-22, and switched on 2026-11-23 at the owner's word: Stage C is in the app (`src/knownAhead.ts`) and **switched on**. This document describes
the public code. A unit test (`src/knownAhead.test.ts`) holds its numbers and its words to the code, so the two cannot
drift apart unnoticed.

## In short

The week ahead is forecast by one of four ways, picked each day by how close each came a day ahead over the last four
weeks (`src/forecast.ts`). Stage C writes the week ahead instead on a day it has strong evidence that the days will
differ for a reason known before they come: a weekday that runs its own way, in the score or in some of its readings;
or the weather forecast for the day, where the weather has been shown to move the days. It is **not** a fifth
contestant: it joins no back-test and no contest with the four. On a day it is not in use the four's pick writes the
week exactly as before, and the level-plus-weekday way (`docs/week-ahead-weekdays.md`) never writes by its own test:
it writes only from inside Stage C.

**The switch is on: `KNOWN_AHEAD_ON = true`.** Set back to false, nothing of Stage C runs in the app, and every forecast
is written exactly as it was before Stage C existed.

## The method

On a day it is in use, every forecast row written that day is the same-block way's forecast (this time of day over the
last four weeks, the latest days counting most), plus up to two shifts. Each shift is learnt from the same-block way's
own misses a day ahead, and each stands behind its own test and a hold of 28 days: the test must be open on the day and
on each of the 28 days before it, each worked out from the record before that day.

- **A weekday shift.** Where the level-plus-weekday way's own test of the score's seven weekdays is held, its shift for
  the day's weekday. Otherwise, for each of the six readings behind the score whose own test of its seven weekdays is
  held, that reading's shift for the weekday, times the reading's share of the score at that check-in (its weight among
  the readings the check-in asks, as the score weighs them), summed. A reading's shift is never used while the score's
  own test is held.
- **A changed schedule.** A day's scheduled kind is what the week's template gave it when its record was made: an
  office day or not, the church day and which, a study day or not, and whether a pickup was set. A past day counts for
  its weekday in every weekday test only where its kind is the kind the template, as it stands now, gives that weekday;
  a part an older record does not hold is left out of the comparison. A test runs over the weekdays that still have
  their least days and needs at least five of them; with all seven it is the level-plus-weekday way's own test, number
  for number, and a weekday left out takes no shift.
- **A weather shift.** For the day's sunshine, its rain and its high, each read against its own level (its average over
  the 28 days before, at least 14 of them known): the slope of the score's day miss on the measure, over 180 days, with
  its test; at a strength of 1 less the shrinking over the test's squared t. How far a forecast can be trusted at each
  distance, from today to seven days ahead, is learnt from the forecasts as they were issued: the slope, through
  nothing, of what came on what was said, each less the level on the day of issue, kept between nothing and one, and
  nothing until a distance has its least pairs. The shift is the slope at its strength, times that distance's trust,
  times the forecast issued on the day of writing less the level on that day. One measure at most: of those whose test
  is held, the one with the smallest chance. The weather's term is in use only on a day a forecast was issued and the
  level stands, so that its shift can be laid.

Everything is read from the record before the day of writing, but the forecast issued that day and the week's
template as it stands. The forecasts as issued are those kept on each day's record since Stage C0 (`weatherIssued`).
Nothing of a note's or the journal's words is read, and nothing is asked of the owner about the days to come.

## Its numbers

Set on simulated tuning people inside limits frozen before the method's code was written, and written into the code
before its verdict was read (`STAGE_C`). They never change.

| Number | Value |
| --- | --- |
| The readings’ test’s chance | at most 1 in 200,000 |
| The readings’ shrinking | 2 |
| Least weekdays a test runs on | 5 |
| The weather’s test’s chance | at most 1 in 10,000 |
| The weather’s shrinking | 2 |
| The weather’s window | 180 days |
| The weather’s level | the 28 days before, at least 14 of them |
| Least pairs before a distance is trusted | 28 |
| The hold | 28 days |

The level-plus-weekday way's own test keeps its own numbers (`WEEK`, `docs/week-ahead-weekdays.md`). A fourth term,
recurring structured events, was simulated and left out: it has no number here and no code in the app.

## Its range

As each of the four takes its own: around the point, the 20th to 80th band of Stage C's own misses at the row's
distance over the 28 days before the day of writing; today's rows and tomorrow's take its misses a day out. Each miss is
as Stage C would have made that forecast then: the reading, less the same-block way's forecast from the record as it
stood that many days before, less every shift open on the record of the day it would have been written (nothing where a
term was not open there). With fewer than five misses at a distance, the band of its misses a day out. The point, the
low and the high are stored as every row is: rounded, and kept from 0 to 100.

## What the writer does, with Stage C switched on

`forecastOnce` in `src/forecastFlow.ts`, once a run:

1. The four's pick is made exactly as before (`chooseModel`).
2. Where today's record keeps no forecast issued yet, the writer first waits for the day's one weather read, the same
   request as ever, made at most once a day and only while its switch is on and a place is known; ten seconds at most.
3. One reader of Stage C (`knownAheadReader`) is made from the record the four are given (a trip's days left out) and
   asked for the day, under the comparisons' guard (`src/counted/fault.ts`), before the write. Not in use: nothing
   changes. A throw: the day is left to the four, and the failure is kept for the Worker's report by its error's name.
4. The rows due start from what `forecastsDue` gives the pick, so its skips hold as they are (`rowsWithKnownAhead`).
   Each row Stage C has a row for takes its point, low and high and the day's way, and keeps its what-if. A slot only
   Stage C can forecast, under the same skips, is its row; a slot only the pick can forecast stays the pick's. A day
   inside a planned trip has no row at all.
5. The challenger (`src/challenger.ts`) runs on top as built, with Stage C's way as its base on a day it writes the
   rows; its forecasts of that way come from the same reader.
6. A row is never rewritten.

## What is stored

- **`model`**, the way that wrote the row, by the terms in use that day: `levelWeekday` (the score's own weekday test,
  no weather), `levelReadings`, `levelWeather` or `levelWeekdayWeather`. Kept after any rollback.
- **`four`**, the row the four's pick would have written for the slot, as the level-plus-weekday way keeps it.
- **`stageB`**, on a day the level-plus-weekday way's own test is in use, the row it would have written for the slot.
- **`weather`**, on a day the weather's term is in use, the measure used: `sunshine`, `rain` or `high`.

They are read by nothing yet, and no screen shows them; they cannot be rebuilt later. They sync with the row and appear
in the export beside `plain`.

## Where it shows

The Weekly View's week ahead (Mirror → The weekly view). Where Stage C wrote the latest rows the days ahead can differ,
and the lowest is marked, as for any way whose days differ. Under **Details** the way is named in its own sentence:

- `levelReadings`, the way's name `your usual level at this time of day and how this weekday usually differs in some of your readings`, and the sentence `Expected from {model}. This way is used only after clear weekday differences have held for four weeks.`
- `levelWeather`, the way's name `your usual level at this time of day and the weather forecast for the day`, and the sentence `Expected from {model}. This way is used only after a clear tie between the weather and your days has held for four weeks.`
- `levelWeekdayWeather`, the way's name `your usual level at this time of day, how this weekday usually differs and the weather forecast for the day`, and the sentence `Expected from {model}. Each part is used only after it has held clearly for four weeks.`

The weather way cannot tell one weekday from another, but its days differ by the forecast for each, so the week ahead is
never said to come out alike for it. Ask, reading the stored forecasts, names each way in the same words
(`src/forecastConditions.ts` and `src/copy.ts`, which the Worker shares).

## The switch, and turning it off

- **The switch:** `KNOWN_AHEAD_ON` in `src/knownAhead.ts`, switched on 2026-11-23 at the owner's own word, in a commit of
  its own that changes nothing else of the app's code. The level-plus-weekday way's own switch stays off: it writes only
  from inside Stage C.
- **Turning it off again (rollback):** set it back to `false`, in a commit of its own. From that push the four's pick
  writes every row. Rows Stage C already wrote stay as written and keep their way's name; nothing is migrated, deleted
  or rewritten, and the forecasts as issued go on being kept. The ways' words stay.
- **A fault while it is on** needs no rollback: the guard leaves that day to the four and reports it.

## How it was judged

Before any of Stage C's method was written, pass and fail criteria were frozen in the private repository; their text is
not copied here. Their SHA-256:

- Stage C: `058115f722638bf16000e2e6e28321a88d87aa4608db3c299194967b42b4a899`, verdict PASS on unread seeds 920001 to
  922000;
- what is written on a day Stage C is not in use (the four's pick, as here): `31bbae40ebeeb57a58b3a784c23998e449e107e4378cd7475f77c49ae790b090`,
  verdict PASS on unread seeds 940001 to 942000.

Both are reported in `stress/RESULTS-15.md`. The simulation (`stress/stageCSim.ts`) runs the app's own code for the four
ways. A fixture of the verdict's people (`stress/stageC-fixture.json`, checked by `stress/stageCFixture.ts check`) and a
check that sets the app's reader beside the simulation's own day-by-day method on those people, every day of each
(`stress/stageCReaderCheck.ts`), prove that the method moved into the app gives the same people, number for number.

**Said plainly:** Stage C passes by being used only on strong evidence. On a real record nothing of it will show for
months: the weather's term moves a row only at a distance whose forecasts have been kept long enough to be trusted, four
weeks of them at the least, and only once its test has held for four weeks; the weekday terms wait on their own tests.
That is the design working.
