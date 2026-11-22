# Stage C, the week ahead from what is known about each day: its verdict (2026-11-22)

**VERDICT: PASS.** Read once on fresh seeds 920001 to 922000, against criteria frozen before the method's code was
written. The criteria are kept in the private repository; their text's SHA-256 is
`058115f722638bf16000e2e6e28321a88d87aa4608db3c299194967b42b4a899`. This file describes the public code and what it
counted.

**Nothing is built.** The method lives beside its simulation (`stress/stageC.ts`); nothing in `src/` has it.

## The method

Stage C keeps the level-plus-weekday way whole (`src/levelWeekday.ts`, dormant) and adds to it. On a day it is in use,
a forecast row is the same-block way's forecast plus up to two shifts, each learnt from the same-block way's own
misses a day ahead, each behind its own test and a hold of 28 days:

- **A weekday shift.** The level-plus-weekday way's own where its test of the score's seven weekdays is held.
  Otherwise, for each reading behind the score whose own test of its seven weekdays is held: that reading's shift
  times its share of the score, summed.
- **A changed schedule.** A past day counts for its weekday only where its scheduled kind is the kind the week's
  template gives that weekday now. A test runs over the weekdays that still have their least days; with all seven it
  is the level-plus-weekday way's own test, number for number.
- **A weather shift.** For each weather measure, read against its own recent level: the slope of the score's day miss
  on the measure, tested and held; times how far a forecast has proven itself at that distance (learnt from the
  forecasts as they were issued); times the forecast issued on the day of writing. One measure at most.
- **The ranges** as the level-plus-weekday way's: the band of the system's own misses at that distance over the 28
  days before, each less the shifts that were open on the record of its own day.

A fourth term was simulated and left out: **a structured event that recurs** (a yes or no the record holds for a day,
used only by how often it has happened on each weekday). See "Recurring events" below.

The numbers the tuning set, on seeds 1 to 1000, before the verdict's seeds were read (`STAGE_C`): the readings' test
at a chance of 0.000005, shrinking 2; the changed-schedule rule on, at least 5 weekdays; the weather's test at a
chance of 0.0001, shrinking 2, a window of 180 days, the level over 28 days, at least 28 pairs for a distance's trust.

## What was run

- **The worlds** (`stress/stageCWorlds.ts`), 24 of them, each on the simulated people of `stress/world.ts`, 180 days
  long, kept reading by reading: the level-plus-weekday way's eight, drawn exactly as its verdicts drew them; a weekday
  rhythm in two readings of six, at two strengths; sunshine that drives the day, at two strengths, and with forecasts
  worthless from two days ahead; a schedule whose office days move, and one that changes with nothing else changing;
  the weekday in two readings and the sunshine together; and eight worlds with structured events.
- **The rows.** On every day from day 15 to day 180 the rows the app would write (today's check-ins and each check-in
  of the next seven days: a point, a low and a high as the app stores them) are written by today's system (the app's
  own pick of four), by the Stage B system (the level-plus-weekday way where it is in use), by Stage C, and by a
  forecast told the truth. Today's rows are set beside the app's own `chooseModel` and `forecastsDue` on every
  fiftieth person.
- **The check against leaks,** in every run: on every fiftieth person, every thirtieth day, Stage C's state and rows
  are worked out a second time by a fresh copy of the method given the record cut off at the day before, and must be
  the same number for number. It never stopped a run.
- **The verdict:** `bash stress/validate-stagec.sh 920001 2000 <folder>`, from a clean copy of commit 3f6adb4;
  2,000 people in each world. Then `stress/stageCJudge.ts` and, sharing no code with it, `stress/stageC_recount.py`:
  the same on every count, every interval and every pass. Set side by side their outputs differ in line endings, and
  on four lines where 5 of 2,000 is 0.25 of 100 and the two programs round it to 0.3 and to 0.2.

## What it counted

Every one of the 111 cells read passed; none stood between its marks, so no further people were read. B, C and T are
the stored point's average miss for the Stage B system, Stage C and the told forecast.

| What was read | Where | Counted |
|---|---|---|
| The readings' weekdays close the gap | two readings, days 151 to 180 | B 10.014, C 9.945, T 9.839: 40 of 100 of the gap |
| The readings' weekdays, stronger | days 91 to 150 | B 10.032, C 9.869: B less C 0.163 (0.150 to 0.175) |
| The weather closes the gap | sunshine, days 91 to 180 | 69 of 100 of the gap; in days 151 to 180, B 11.259, C 10.582, T 10.439 |
| The changed schedule | office days move, days 91 to 180 | B less C 0.011 (0.008 to 0.015) |
| Both together | days 151 to 180 | B 11.350, C 10.724, T 10.418: 67 of 100 of the gap |
| No harm against the Stage B system | all 24 worlds, two stretches each | the nearest: C less B 0.021 (0.015 to 0.027), where a schedule changes and nothing else does |
| Nothing invented | all 24 worlds | ever in use where nothing is there: at most 15 of 2,000 people |
| The ranges | all 24 worlds, and the rows that differ | no harm anywhere; the rows that differ hold about 1 of 100 more answers than Stage B's |
| The challenger on Stage C | three worlds | adopted for 15, 15 and 9 of 2,000 |
| It stays in use | two worlds | out of use again for 44 of 1,914 and 23 of 1,977 |

By days ahead, where sunshine drives the day (days 151 to 180, C less B, 0 to 7 days ahead): −1.064, −1.004, −0.932,
−0.792, −0.634, −0.424, −0.317, −0.248. With forecasts worthless from two days ahead: −0.973, −0.420, then about
−0.11 at every distance, where no weather shift is laid: that part is the same-block way standing in for the pick of
four, which is chosen on misses a day ahead and used a week ahead.

## The harm and the limits found

- Where every reading already carries the weekday, Stage C is a little worse than the Stage B system: 10.012 against
  10.001 in days 151 to 180. The readings' shifts sometimes write before the score's own test is held.
- After office days move to other weekdays, the Stage B system is worse than today's system (10.294 against 10.169 in
  days 151 to 180), and Stage C, writing the Stage B system's rows on a day it is not in use, carries most of that
  (10.259). The study below is about this.
- The worlds are 180 days long and their effects are laid by hand. They say what the method does when an effect is
  there or is not; they do not say how large any effect is in a real record.

## Recurring events: simulated, and left out

The term used three tests and the hold: the event keeps to weekdays; it matters for the check-in after it, weekday for
weekday; and its rhythm shows in what follows. On the tuning seeds it invented nothing: with its loosest allowed
chance it was ever in use for 0 to 8 of 1,000 people in the five worlds built to fool it (an event that recurs and
moves nothing, one that matters and keeps to no weekday, a marker that is no cause, one whose effect is masked, and
sixteen useless kinds at once). It helped in one of its two worlds only, and only at that loosest chance: a strong
weekly event, with no weekday pattern held, closed 19 of 100 of its gap after six months. Where a weekday pattern was
also held it gave nothing at any chance. So it was left out before the verdict.

## What is written beneath Stage C: a study apart

Stage C's verdict was read with the Stage B system's rows written on a day Stage C is not in use. The design itself
has the pick of four write such a day. The two are the same rows wherever no day's scheduled kind changes: checked on
600 tuning people in three worlds, number for number. They differ only after a schedule changes, so that arrangement
was judged apart, by criteria of its own, frozen before it met any simulated person (kept in the private repository;
their text's SHA-256 is `31bbae40ebeeb57a58b3a784c23998e449e107e4378cd7475f77c49ae790b090`).

**VERDICT: PASS, all 9 cells.** Read once on fresh seeds 940001 to 942000, 2,000 people in each of three worlds, from
a clean copy of commit 960d316: `node stress/.out/stageCSim.mjs run <world> 940001 942000 <file> 13 "" - today`, then
`stageCJudge.mjs beneath <folder>` and `stageC_recount.py <folder> beneath`, which agree line for line. Nothing was
tuned: the arrangement has no number of its own.

The stored point's average miss, in days 91 to 150 and in days 151 to 180:

| World | Today's system | The Stage B system | The pick of four beneath Stage C |
|---|---|---|---|
| Office days move to other weekdays | 10.711, 10.116 | 10.801, 10.240 | 10.712, 10.132 |
| A schedule changes and nothing else does | 10.214, 10.158 | 10.155, 9.983 | 10.219, 10.153 |
| The same, changing back and forth every 30 days | 10.214, 10.158 | 10.155, 9.983 | 10.214, 10.152 |

- After office days move, over days 91 to 180: 0.006 above today's system (0.002 to 0.010), where the Stage B system is
  0.101 above it; and 0.095 better than the Stage B system (0.086 to 0.104).
- Where a schedule changes and nothing else does, it is level with today's system (−0.005 in days 151 to 180, −0.017
  to 0.007), and gives up what the Stage B system keeps there: 0.170 in days 151 to 180.
- The ranges against today's system: 0.002, 0.013 and 0.003 of score, each far inside its bar.

So the arrangement is never worse than today's system after a schedule changes, and the price is the weekday shifts
set aside for about two months each time one does.

## A fixture for a build

`stress/stageC-fixture.json`, made by `stress/stageCFixture.ts` from the verdict's own people: for 24 of them, on five
days each, which of Stage C's terms write the day and every row written (1,176 rows). `node
stress/.out/stageCFixture.mjs check` makes the people again and must print "the same people, number for number".
