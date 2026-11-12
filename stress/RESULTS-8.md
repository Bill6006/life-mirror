# The counted foundation: the simulation's verdict (2026-11-12)

**PASS.** Read once, on fresh seeds 500001 to 502000, by a judge written before the run: every judged cell passed.

This is the proof the comparison core (`src/counted/compare.ts`) needs before anything in the app uses it. The core
is the one place that will decide whether "this went with that" is a steady pattern, a lead, no clear pattern yet, or
too few to compare. Nothing reads it yet.

## What was judged

The pass/fail criteria were written into the private execution plan and frozen there on 2026-11-12, before any of
this simulation's code existed and before the core had met a simulated person. Their text is not in this repository.
Its SHA-256 is `4d18fb26e12d446993969d418faf5e9d5f087677735b17b3a56536d9c8d6336d`. What follows describes the public
code that carries them out: the worlds in `countedWorlds.ts`, the marks in `countedJudge.ts`, the bounds in
`countedBound.ts`.

- **The people** are the stress test's own (`world.ts`), a year long: a base person, a person whose state carries
  over strongly from block to block, and a person who answers fewer check-ins and misses more of them when mood runs
  low.
- **The things** are laid over each person's days from seeded streams of their own. Where a check-in was not
  answered, a thing is unknown there, and that occasion is in neither side of any count.
- **Three families of questions**, each asked from the record's first 60, 180 and 365 days:
  - `A-day`, nine comparisons for a thing known once a day: the seven weekdays, a short night before, and a low
    evening the day before;
  - `A-checkin`, twelve comparisons for a thing known at each check-in: the seven weekdays, the three check-ins of
    the day, and the same two that came before;
  - `B`, twelve comparisons: for each of twelve evening things, the next morning's reading out of 100 after evenings
    with it against evenings without it, like for like within the evening's band.
- **Nine worlds with nothing there:** a thing that happens independently at a rate of 0.1, 0.3 or 0.5; one that comes
  in streaks; a weekly rhythm in the readings; missing check-ins that depend on state; a thing that follows how the
  evening started (family B only); streaks in the person whose state carries over; and a slow season in which the
  readings and every thing drift together.
- **Two worlds with something there, judged at day 180:** a thing that happens at a rate of 0.3, and 0.6 on
  Saturdays; and an evening thing after which the next morning reads fifteen points higher.
- **Three worlds reported only:** a ten-point difference (the size worth saying is also ten points, so no test can
  call it more than about half the time); a weekday effect in a thing known at each check-in; and a thing that
  happens more in the evening.

**The marks.**

1. With nothing there, the share of people whose family shows at least one pattern is read on 2,000 people. A cell
   passes when the upper bound of the share's 95% interval is at most 7 in 100. At 7 in 100 or more it fails. In
   between it is read once more on 8,000 further people and must then show an upper bound of at most 6 in 100.
2. How often a family shows a lead and no pattern, with nothing there, is reported and not judged.
3. The real weekday effect is called by day 180 in at least four fifths of the share the best fixed test could reach,
   computed for each simulated person from that person's own counts (Fisher's exact test, two-sided, at 0.05 over the
   comparisons the core tested, with the minimums and the size worth saying required).
4. The real fifteen-point difference is called by day 180 in at least nine tenths of the share a two-sided z test
   with the spread known could reach at each person's own counts.

## The verdict run

- Code: commit `200f7ff`. Results: `stress/.out/counted-500000/` (not committed; the run is seeded and regenerates
  exactly with `bash stress/validate-counted.sh 500001 2000 stress/.out/counted-500000`).
- All 75 cells of mark 1 passed on the first read, so no second read was needed and seeds 502001 to 510000 are
  unread. The largest share was 4.5 in 100 (89 people of 2,000; upper bound 5.4).
- Mark 3: 53.2 in 100 against a mark of 40.1. Mark 4: 99.0 in 100 against a mark of 89.0.
- No real effect was ever called in the wrong direction.

The judge's output, verbatim:

```text
THE COUNTED FOUNDATION: THE SIMULATION, JUDGED
folder: stress/.out/counted-500000

1. False patterns with nothing there (judged), and 2. leads with nothing there (reported)
world              family     look  people  pattern  share  upper95  lead-only  any-look  verdict
independent-10     A-day        60    2000       16    0.8      1.3       12.2       3.6  pass
independent-10     A-day       180    2000       42    2.1      2.8       11.9       3.6  pass
independent-10     A-day       365    2000       31    1.6      2.2        0.2       3.6  pass
independent-10     A-checkin    60    2000       71    3.5      4.5       21.1       3.8  pass
independent-10     A-checkin   180    2000        5    0.3      0.6        0.2       3.8  pass
independent-10     A-checkin   365    2000        0    0.0      0.2        0.1       3.8  pass
independent-10     B            60    2000       23    1.1      1.7        0.2       3.0  pass
independent-10     B           180    2000       39    1.9      2.7        1.4       3.0  pass
independent-10     B           365    2000        1    0.1      0.3        0.0       3.0  pass
independent-30     A-day        60    2000       42    2.1      2.8       19.3       7.4  pass
independent-30     A-day       180    2000       57    2.9      3.7       24.5       7.4  pass
independent-30     A-day       365    2000       61    3.0      3.9       17.5       7.4  pass
independent-30     A-checkin    60    2000       84    4.2      5.2       36.6       7.6  pass
independent-30     A-checkin   180    2000       68    3.4      4.3       12.3       7.6  pass
independent-30     A-checkin   365    2000       14    0.7      1.2        0.2       7.6  pass
independent-30     B            60    2000       54    2.7      3.5        5.2       2.7  pass
independent-30     B           180    2000        0    0.0      0.2        0.0       2.7  pass
independent-30     B           365    2000        0    0.0      0.2        0.0       2.7  pass
independent-50     A-day        60    2000       39    1.9      2.7       18.6       8.1  pass
independent-50     A-day       180    2000       65    3.3      4.1       24.3       8.1  pass
independent-50     A-day       365    2000       72    3.6      4.5       25.1       8.1  pass
independent-50     A-checkin    60    2000       81    4.0      5.0       35.6       9.0  pass
independent-50     A-checkin   180    2000       89    4.5      5.4       20.1       9.0  pass
independent-50     A-checkin   365    2000       33    1.7      2.3        0.5       9.0  pass
independent-50     B            60    2000       38    1.9      2.6        1.6       1.9  pass
independent-50     B           180    2000        0    0.0      0.2        0.0       1.9  pass
independent-50     B           365    2000        0    0.0      0.2        0.0       1.9  pass
runs               A-day        60    2000       12    0.6      1.0        9.9       3.4  pass
runs               A-day       180    2000       27    1.4      2.0       15.3       3.4  pass
runs               A-day       365    2000       32    1.6      2.2        5.5       3.4  pass
runs               A-checkin    60    2000       56    2.8      3.6       30.3       7.3  pass
runs               A-checkin   180    2000       62    3.1      4.0       26.3       7.3  pass
runs               A-checkin   365    2000       47    2.4      3.1        2.6       7.3  pass
runs               B            60    2000       36    1.8      2.5        5.0       1.8  pass
runs               B           180    2000        0    0.0      0.2        0.0       1.8  pass
runs               B           365    2000        0    0.0      0.2        0.0       1.8  pass
weekly-rhythm      A-day        60    2000       41    2.1      2.8       18.4       7.3  pass
weekly-rhythm      A-day       180    2000       57    2.9      3.7       22.9       7.3  pass
weekly-rhythm      A-day       365    2000       69    3.5      4.3       17.8       7.3  pass
weekly-rhythm      A-checkin    60    2000       71    3.5      4.5       38.9       7.8  pass
weekly-rhythm      A-checkin   180    2000       83    4.2      5.1       10.7       7.8  pass
weekly-rhythm      A-checkin   365    2000       18    0.9      1.4        0.2       7.8  pass
weekly-rhythm      B            60    2000       83    4.2      5.1       11.2       4.2  pass
weekly-rhythm      B           180    2000        1    0.1      0.3        0.0       4.2  pass
weekly-rhythm      B           365    2000        0    0.0      0.2        0.0       4.2  pass
missing-on-state   A-day        60    2000       48    2.4      3.2        8.6       8.3  pass
missing-on-state   A-day       180    2000       52    2.6      3.4       23.4       8.3  pass
missing-on-state   A-day       365    2000       81    4.0      5.0       24.1       8.3  pass
missing-on-state   A-checkin    60    2000       69    3.5      4.3       32.0       9.4  pass
missing-on-state   A-checkin   180    2000       74    3.7      4.6       30.7       9.4  pass
missing-on-state   A-checkin   365    2000       66    3.3      4.2        7.7       9.4  pass
missing-on-state   B            60    2000       44    2.2      2.9        5.9       2.8  pass
missing-on-state   B           180    2000       13    0.7      1.1        1.1       2.8  pass
missing-on-state   B           365    2000        1    0.1      0.3        0.1       2.8  pass
follows-band       B            60    2000       67    3.4      4.2        5.1       3.4  pass
follows-band       B           180    2000        0    0.0      0.2        0.0       3.4  pass
follows-band       B           365    2000        0    0.0      0.2        0.0       3.4  pass
runs-persistent    A-day        60    2000       20    1.0      1.5       11.8       4.3  pass
runs-persistent    A-day       180    2000       34    1.7      2.4       16.2       4.3  pass
runs-persistent    A-day       365    2000       36    1.8      2.5        5.0       4.3  pass
runs-persistent    A-checkin    60    2000       65    3.3      4.1       30.1       7.8  pass
runs-persistent    A-checkin   180    2000       65    3.3      4.1       26.2       7.8  pass
runs-persistent    A-checkin   365    2000       48    2.4      3.2        2.8       7.8  pass
runs-persistent    B            60    2000       82    4.1      5.1       12.0       4.3  pass
runs-persistent    B           180    2000        4    0.2      0.5        0.0       4.3  pass
runs-persistent    B           365    2000        0    0.0      0.2        0.0       4.3  pass
season             A-day        60    2000       30    1.5      2.1       12.7       7.6  pass
season             A-day       180    2000       72    3.6      4.5       26.1       7.6  pass
season             A-day       365    2000       70    3.5      4.4       12.3       7.6  pass
season             A-checkin    60    2000       70    3.5      4.4       23.0       7.4  pass
season             A-checkin   180    2000       75    3.8      4.7       11.0       7.4  pass
season             A-checkin   365    2000       21    1.1      1.6        6.6       7.4  pass
season             B            60    2000       62    3.1      4.0        2.5       4.5  pass
season             B           180    2000       29    1.5      2.1        1.7       4.5  pass
season             B           365    2000        0    0.0      0.2        0.0       4.5  pass

3. A real weekday effect (judged at day 180)
weekday, day 60: 179 of 2000, share 8.9 (95% 7.8 to 10.3); bound 10.0; mark 8.0 (0.8 of the bound): reported
  called the wrong way: 0
weekday, day 180: 1064 of 2000, share 53.2 (95% 51.0 to 55.4); bound 50.1; mark 40.1 (0.8 of the bound): pass
  called the wrong way: 0
weekday, day 365: 1808 of 2000, share 90.4 (95% 89.0 to 91.6); bound 89.9; mark 71.9 (0.8 of the bound): reported
  called the wrong way: 0

4. A real like-for-like difference (judged at day 180 in fifteen-points)
fifteen-points, day 60: 1406 of 2000, share 70.3 (95% 68.3 to 72.3); bound 85.8; mark 77.2 (0.9 of the bound): reported
  the true difference 14.63 points over 27425 evenings; mean spread 10.58; called the wrong way: 0; one of the eleven other things at pattern: 78 of 2000 (3.9)
fifteen-points, day 180: 1980 of 2000, share 99.0 (95% 98.5 to 99.4); bound 98.9; mark 89.0 (0.9 of the bound): pass
  the true difference 14.60 points over 82358 evenings; mean spread 10.65; called the wrong way: 0; one of the eleven other things at pattern: 0 of 2000 (0.0)
fifteen-points, day 365: 2000 of 2000, share 100.0 (95% 99.8 to 100.0); bound 99.9; mark 89.9 (0.9 of the bound): reported
  the true difference 14.60 points over 167469 evenings; mean spread 10.66; called the wrong way: 0; one of the eleven other things at pattern: 0 of 2000 (0.0)
ten-points, day 60: 571 of 2000, share 28.5 (95% 26.6 to 30.6); bound 42.0; mark 37.8 (0.9 of the bound): reported
  the true difference 9.82 points over 27283 evenings; mean spread 10.66; called the wrong way: 0; one of the eleven other things at pattern: 56 of 2000 (2.8)
ten-points, day 180: 925 of 2000, share 46.3 (95% 44.1 to 48.4); bound 46.4; mark 41.8 (0.9 of the bound): reported
  the true difference 9.82 points over 82497 evenings; mean spread 10.71; called the wrong way: 0; one of the eleven other things at pattern: 0 of 2000 (0.0)
ten-points, day 365: 880 of 2000, share 44.0 (95% 41.8 to 46.2); bound 44.8; mark 40.3 (0.9 of the bound): reported
  the true difference 9.82 points over 167224 evenings; mean spread 10.72; called the wrong way: 0; one of the eleven other things at pattern: 0 of 2000 (0.0)

5. Reported only
weekday-checkin, day 60: the Saturday cell at pattern, read higher: 694 of 2000, share 34.7 (95% 32.6 to 36.8); called the wrong way: 0
weekday-checkin, day 180: the Saturday cell at pattern, read higher: 1857 of 2000, share 92.8 (95% 91.6 to 93.9); called the wrong way: 0
weekday-checkin, day 365: the Saturday cell at pattern, read higher: 1998 of 2000, share 99.9 (95% 99.6 to 100.0); called the wrong way: 0
evening, day 60: the evening cell at pattern, read higher: 570 of 2000, share 28.5 (95% 26.6 to 30.5); called the wrong way: 0
evening, day 180: the evening cell at pattern, read higher: 1686 of 2000, share 84.3 (95% 82.6 to 85.8); called the wrong way: 0
evening, day 365: the evening cell at pattern, read higher: 1865 of 2000, share 93.3 (95% 92.1 to 94.3); called the wrong way: 0

Time for one simulated person through every family at three looks, in milliseconds (median by world)
independent-10     seeds 500001 to 502000  people  2000  median 123 ms  slowest 812 ms
independent-30     seeds 500001 to 502000  people  2000  median 179 ms  slowest 1266 ms
independent-50     seeds 500001 to 502000  people  2000  median 173 ms  slowest 1308 ms
runs               seeds 500001 to 502000  people  2000  median 148 ms  slowest 1044 ms
weekly-rhythm      seeds 500001 to 502000  people  2000  median 164 ms  slowest 951 ms
missing-on-state   seeds 500001 to 502000  people  2000  median 107 ms  slowest 914 ms
follows-band       seeds 500001 to 502000  people  2000  median 67 ms  slowest 632 ms
runs-persistent    seeds 500001 to 502000  people  2000  median 149 ms  slowest 1045 ms
season             seeds 500001 to 502000  people  2000  median 157 ms  slowest 976 ms
weekday            seeds 500001 to 502000  people  2000  median 57 ms  slowest 704 ms
fifteen-points     seeds 500001 to 502000  people  2000  median 86 ms  slowest 751 ms
ten-points         seeds 500001 to 502000  people  2000  median 86 ms  slowest 634 ms
weekday-checkin    seeds 500001 to 502000  people  2000  median 86 ms  slowest 830 ms
evening            seeds 500001 to 502000  people  2000  median 115 ms  slowest 753 ms

VERDICT: PASS (every judged cell passed).
```

**The independent recount** (`counted_recount.py`, another language, no code shared with the judge) gives the same
people and the same pattern counts in all 75 cells, and the same judged shares and bounds:

```text
weekday, day 60: 179 of 2000, share 8.9; bound 10.0; four fifths of it 8.0
weekday, day 180: 1064 of 2000, share 53.2; bound 50.1; four fifths of it 40.1
weekday, day 365: 1808 of 2000, share 90.4; bound 89.9; four fifths of it 71.9
fifteen-points, day 60: 1406 of 2000, share 70.3; true difference 14.63; bound 85.8; nine tenths of it 77.2
fifteen-points, day 180: 1980 of 2000, share 99.0; true difference 14.60; bound 98.9; nine tenths of it 89.0
fifteen-points, day 365: 2000 of 2000, share 100.0; true difference 14.60; bound 99.9; nine tenths of it 89.9
ten-points, day 60: 571 of 2000, share 28.6; true difference 9.82; bound 42.0; nine tenths of it 37.8
ten-points, day 180: 925 of 2000, share 46.2; true difference 9.82; bound 46.4; nine tenths of it 41.8
ten-points, day 365: 880 of 2000, share 44.0; true difference 9.82; bound 44.8; nine tenths of it 40.3
```

## What to read into it, and what not to

- **A pattern with nothing there is rare:** at most 4.5 people in 100 at any look in any world, and next to none in
  family B once the record is long enough that ten points is far outside chance.
- **A lead with nothing there is common, by design.** A lead is a difference that clears 0.05 on its own and not
  after the family's correction. With nine to twelve comparisons in a family, up to 39 people in 100 are shown at
  least one lead when nothing is there. That is what the word must keep meaning: tentative, said with how many things
  were looked at, and never used to rank or firm up anything.
- **The weekday share came out a little above its bound** (53.2 against 50.1; on the tuning seeds 48.8 against the
  same 50.1). The bound is the power of Fisher's two-sided exact test, a yardstick fixed in advance. The core ranks
  arrangements by the size of the difference, which is a slightly different exact test and can do a little better for
  a rise in a small cell. The worlds with nothing there are what show it is not over-eager: at most 4 people in 100 for that family.
- **Ten points is called about 46 times in 100, however long the record,** as the bound said before any run. A true
  difference the same size as the smallest difference worth saying is seen at that size or more only half the time.
- **What the worlds do not cover:** a thing whose habit follows a longer rhythm than a streak (every other week, say);
  more than one occasion a day in a with-against-without comparison; and outcomes other than the reading out of 100.
  The first is a limit of any shuffle. The other two are not used by anything yet, and get their own worlds before
  they are.

## Tuning, before the verdict (seeds 1 to 1000 only)

The first tuning run, with the core as it stood when the criteria were frozen, passed every family-level cell and
both real-effect marks. Read more closely, the chance itself was too eager in three worlds. Over about 12,000
comparisons a world with nothing there, an honest check gives a chance at or under 0.01 in 1.00 of 100. With against
without gave 1.44 where the thing came in streaks, 1.32 where it followed how the evening started, and 1.44 for
streaks in the person whose state carries over.

Two causes. Dealing a stretch's labels out afresh treats every evening as a separate coincidence, and a streak of
evenings beside readings that carry over is fewer coincidences than its evenings. And where a thing follows the
starting band, the real arrangement rests on fewer matched evenings than a dealt one, so its difference is noisier
than the dealt differences it is ranked among.

What was settled, and built into the core before any verdict seed was read:

- **Each 14-day stretch's labels are turned round** in the order of their days, every label moving the same number
  of places, so a streak stays a streak.
- **Each arrangement is ranked by its difference against its own spread.** The difference that is said, and that the
  size worth saying is asked of, is still the plain like-for-like difference.
- Earlier the same morning, before the freeze: **a label the whole day shares (the weekday, what came before the
  day) moves by whole days,** each day keeping its check-ins together.

The cost: at day 60 a real fifteen-point difference is called in about 69 people of 100 instead of about 75. At day
180 and day 365 it costs nothing. The 0.05, the correction across the family, the minimums and the sizes worth
saying did not move.

`countedTune.ts` tried each way on the same simulated people. Its columns: comparisons tested with nothing there;
how many in 100 gave a chance at or under 0.05, 0.01 and 0.005, each with how many standard errors that is from the
honest 5, 1 and 0.5; the share of people whose family of twelve showed a pattern, and a lead; and, in the worlds with
a real difference, the share whose first thing was called. `free` deals afresh, `turn` turns round, `flip` turns and
mirrors, `streaks` moves whole streaks; the number is the stretch in days; `+band` shuffles inside stretch and band
together; `scaled` ranks against the spread.

```text
seeds 1 to 1000; chances with nothing there (an honest check gives 5.00, 1.00, 0.50), the family of twelve, and the first thing called
world              look  method           tested  p<=.05     z  p<=.01     z p<=.005     z  pattern%   lead%  first%
independent-30       60  free14            11723    4.63  -1.8    0.92  -0.9    0.49  -0.2      3.30    4.60    0.10
independent-30       60  free14+band       11723    4.88  -0.6    0.90  -1.0    0.48  -0.3      2.70    4.80    0.10
independent-30       60  free28+band       11723    4.85  -0.7    0.96  -0.4    0.45  -0.7      3.40    4.60    0.10
independent-30       60  turn14            11723    4.82  -0.9    0.94  -0.7    0.39  -1.7      2.10    5.70    0.10
independent-30       60  turn14+band       11723    4.83  -0.9    0.98  -0.2    0.45  -0.7      1.60    5.80    0.10
independent-30       60  turn28+band       11723    4.75  -1.2    0.90  -1.0    0.49  -0.1      2.60    5.10    0.10
independent-30       60  free14 scaled     11723    4.61  -2.0    0.93  -0.8    0.49  -0.1      3.10    4.70    0.10
independent-30       60  turn14 scaled     11723    4.70  -1.5    0.92  -0.9    0.49  -0.2      2.10    5.70    0.10
independent-30       60  turn28 scaled     11723    4.38  -3.1    0.90  -1.0    0.37  -2.0      2.00    5.50    0.00
independent-30      180  free14            12000    5.08  +0.4    1.02  +0.3    0.47  -0.4      0.00    0.00    0.00
independent-30      180  free14+band       12000    5.25  +1.3    0.91  -1.0    0.53  +0.4      0.00    0.00    0.00
independent-30      180  free28+band       12000    5.07  +0.3    1.02  +0.3    0.50  +0.0      0.00    0.00    0.00
independent-30      180  turn14            12000    5.15  +0.8    1.13  +1.5    0.53  +0.4      0.00    0.00    0.00
independent-30      180  turn14+band       12000    5.14  +0.7    0.94  -0.6    0.49  -0.1      0.00    0.00    0.00
independent-30      180  turn28+band       12000    5.08  +0.4    1.00  +0.0    0.46  -0.6      0.00    0.00    0.00
independent-30      180  free14 scaled     12000    5.16  +0.8    1.02  +0.2    0.52  +0.3      0.00    0.00    0.00
independent-30      180  turn14 scaled     12000    5.13  +0.6    1.07  +0.8    0.43  -1.0      0.00    0.00    0.00
independent-30      180  turn28 scaled     12000    5.06  +0.3    1.18  +1.9    0.58  +1.3      0.00    0.00    0.00
independent-30      365  free14            12000    5.25  +1.3    1.12  +1.3    0.51  +0.1      0.00    0.00    0.00
independent-30      365  free14+band       12000    5.07  +0.3    1.07  +0.8    0.54  +0.6      0.00    0.00    0.00
independent-30      365  free28+band       12000    5.29  +1.5    1.12  +1.3    0.63  +1.9      0.00    0.00    0.00
independent-30      365  turn14            12000    5.25  +1.3    1.01  +0.1    0.54  +0.6      0.00    0.00    0.00
independent-30      365  turn14+band       12000    5.08  +0.4    1.06  +0.6    0.53  +0.5      0.00    0.00    0.00
independent-30      365  turn28+band       12000    5.25  +1.3    1.07  +0.7    0.56  +0.9      0.00    0.00    0.00
independent-30      365  free14 scaled     12000    5.30  +1.5    1.03  +0.4    0.48  -0.3      0.00    0.00    0.00
independent-30      365  turn14 scaled     12000    5.29  +1.5    1.06  +0.6    0.50  +0.0      0.00    0.00    0.00
independent-30      365  turn28 scaled     12000    5.42  +2.1    1.09  +1.0    0.52  +0.3      0.00    0.00    0.00

runs                 60  free14            10475    5.50  +2.3    1.37  +3.9    0.69  +2.7      3.70    5.10    0.20
runs                 60  free14+band       10475    5.28  +1.3    1.22  +2.3    0.57  +1.1      2.50    5.40    0.20
runs                 60  free28+band       10475    5.49  +2.3    1.35  +3.6    0.70  +2.9      4.10    5.40    0.30
runs                 60  turn14            10475    5.24  +1.1    1.14  +1.4    0.56  +0.9      2.80    5.40    0.00
runs                 60  turn14+band       10475    5.21  +1.0    1.04  +0.4    0.48  -0.3      1.50    6.40    0.20
runs                 60  turn28+band       10475    5.13  +0.6    1.14  +1.4    0.49  -0.2      2.00    7.10    0.20
runs                 60  free14 scaled     10475    5.59  +2.8    1.34  +3.5    0.64  +2.0      3.20    5.50    0.10
runs                 60  turn14 scaled     10475    5.26  +1.2    1.16  +1.6    0.56  +0.9      2.70    5.40    0.10
runs                 60  turn28 scaled     10475    4.95  -0.3    1.03  +0.3    0.53  +0.4      2.70    5.80    0.30
runs                180  free14            12000    5.53  +2.7    1.27  +3.0    0.59  +1.4      0.00    0.00    0.00
runs                180  free14+band       12000    5.58  +2.9    0.97  -0.4    0.41  -1.4      0.00    0.00    0.00
runs                180  free28+band       12000    5.60  +3.0    1.12  +1.3    0.64  +2.2      0.00    0.00    0.00
runs                180  turn14            12000    5.05  +0.3    1.00  +0.0    0.47  -0.4      0.00    0.00    0.00
runs                180  turn14+band       12000    5.42  +2.1    1.01  +0.1    0.44  -0.9      0.00    0.00    0.00
runs                180  turn28+band       12000    5.47  +2.3    1.09  +1.0    0.58  +1.3      0.00    0.00    0.00
runs                180  free14 scaled     12000    5.38  +1.9    1.17  +1.8    0.53  +0.5      0.00    0.00    0.00
runs                180  turn14 scaled     12000    5.01  +0.0    1.05  +0.6    0.48  -0.3      0.00    0.00    0.00
runs                180  turn28 scaled     12000    4.91  -0.5    0.98  -0.2    0.55  +0.8      0.00    0.00    0.00
runs                365  free14            12000    5.56  +2.8    1.29  +3.2    0.63  +2.1      0.00    0.00    0.00
runs                365  free14+band       12000    5.57  +2.8    1.23  +2.5    0.67  +2.6      0.00    0.00    0.00
runs                365  free28+band       12000    5.62  +3.1    1.27  +3.0    0.68  +2.7      0.00    0.00    0.00
runs                365  turn14            12000    5.22  +1.1    1.09  +1.0    0.57  +1.0      0.00    0.00    0.00
runs                365  turn14+band       12000    5.53  +2.6    1.25  +2.8    0.64  +2.2      0.00    0.00    0.00
runs                365  turn28+band       12000    5.60  +3.0    1.23  +2.5    0.66  +2.5      0.00    0.00    0.00
runs                365  free14 scaled     12000    5.56  +2.8    1.22  +2.4    0.62  +1.8      0.00    0.00    0.00
runs                365  turn14 scaled     12000    5.09  +0.5    1.12  +1.3    0.58  +1.3      0.00    0.00    0.00
runs                365  turn28 scaled     12000    5.16  +0.8    1.04  +0.5    0.47  -0.4      0.00    0.00    0.00

weekly-rhythm        60  free14            11714    4.68  -1.6    0.95  -0.6    0.51  +0.2      4.60   13.20    0.00
weekly-rhythm        60  free14+band       11714    4.77  -1.1    0.97  -0.3    0.54  +0.6      4.40   11.80    0.00
weekly-rhythm        60  free28+band       11714    4.64  -1.8    0.98  -0.2    0.53  +0.4      3.90   13.60    0.00
weekly-rhythm        60  turn14            11714    4.75  -1.2    0.92  -0.8    0.46  -0.6      3.90   13.40    0.00
weekly-rhythm        60  turn14+band       11714    4.78  -1.1    0.95  -0.6    0.47  -0.5      2.90   13.10    0.00
weekly-rhythm        60  turn28+band       11714    4.61  -1.9    0.90  -1.0    0.45  -0.7      3.00   13.80    0.00
weekly-rhythm        60  free14 scaled     11714    4.64  -1.8    0.96  -0.4    0.48  -0.3      4.70   13.10    0.00
weekly-rhythm        60  turn14 scaled     11714    4.78  -1.1    0.95  -0.6    0.48  -0.3      4.20   13.00    0.00
weekly-rhythm        60  turn28 scaled     11714    4.66  -1.7    0.86  -1.5    0.42  -1.3      3.40   13.60    0.00
weekly-rhythm       180  free14            12000    4.88  -0.6    0.94  -0.6    0.48  -0.3      0.20    0.00    0.00
weekly-rhythm       180  free14+band       12000    4.98  -0.1    0.98  -0.2    0.42  -1.3      0.10    0.10    0.00
weekly-rhythm       180  free28+band       12000    4.80  -1.0    0.94  -0.6    0.47  -0.5      0.20    0.00    0.00
weekly-rhythm       180  turn14            12000    5.03  +0.2    0.93  -0.7    0.46  -0.6      0.20    0.00    0.00
weekly-rhythm       180  turn14+band       12000    4.97  -0.1    1.05  +0.6    0.47  -0.5      0.10    0.10    0.00
weekly-rhythm       180  turn28+band       12000    4.79  -1.0    0.93  -0.8    0.47  -0.4      0.20    0.00    0.00
weekly-rhythm       180  free14 scaled     12000    4.92  -0.4    0.98  -0.2    0.51  +0.1      0.20    0.00    0.00
weekly-rhythm       180  turn14 scaled     12000    4.93  -0.3    0.91  -1.0    0.43  -1.0      0.20    0.00    0.00
weekly-rhythm       180  turn28 scaled     12000    4.98  -0.1    0.96  -0.5    0.43  -1.0      0.20    0.00    0.00
weekly-rhythm       365  free14            12000    4.95  -0.3    0.97  -0.4    0.47  -0.5      0.00    0.00    0.00
weekly-rhythm       365  free14+band       12000    4.98  -0.1    0.97  -0.3    0.52  +0.3      0.00    0.00    0.00
weekly-rhythm       365  free28+band       12000    5.10  +0.5    0.93  -0.8    0.43  -1.0      0.00    0.00    0.00
weekly-rhythm       365  turn14            12000    4.99  -0.0    1.05  +0.6    0.48  -0.3      0.00    0.00    0.00
weekly-rhythm       365  turn14+band       12000    5.03  +0.1    0.98  -0.2    0.50  +0.0      0.00    0.00    0.00
weekly-rhythm       365  turn28+band       12000    5.04  +0.2    0.89  -1.2    0.45  -0.8      0.00    0.00    0.00
weekly-rhythm       365  free14 scaled     12000    4.91  -0.5    1.03  +0.4    0.48  -0.3      0.00    0.00    0.00
weekly-rhythm       365  turn14 scaled     12000    4.97  -0.2    1.02  +0.2    0.50  +0.0      0.00    0.00    0.00
weekly-rhythm       365  turn28 scaled     12000    5.06  +0.3    1.02  +0.3    0.47  -0.4      0.00    0.00    0.00

missing-on-state     60  free14             4001    4.40  -1.7    0.75  -1.6    0.37  -1.1      2.40    5.60    0.00
missing-on-state     60  free14+band        4001    3.57  -4.1    0.52  -3.0    0.17  -2.9      1.50    3.30    0.10
missing-on-state     60  free28+band        4001    4.27  -2.1    0.82  -1.1    0.35  -1.3      2.90    5.20    0.10
missing-on-state     60  turn14             4001    4.37  -1.8    0.55  -2.9    0.20  -2.7      1.50    5.50    0.00
missing-on-state     60  turn14+band        4001    3.40  -4.6    0.35  -4.1    0.07  -3.8      0.90    3.10    0.00
missing-on-state     60  turn28+band        4001    4.20  -2.3    0.55  -2.9    0.17  -2.9      1.70    4.70    0.00
missing-on-state     60  free14 scaled      4001    4.55  -1.3    0.77  -1.4    0.35  -1.3      2.20    6.00    0.10
missing-on-state     60  turn14 scaled      4001    4.62  -1.1    0.62  -2.4    0.17  -2.9      1.40    5.60    0.00
missing-on-state     60  turn28 scaled      4001    4.35  -1.9    0.47  -3.3    0.10  -3.6      2.20    5.60    0.10
missing-on-state    180  free14            11711    4.82  -0.9    0.86  -1.5    0.48  -0.3      0.80    1.30    0.00
missing-on-state    180  free14+band       11711    4.46  -2.7    0.85  -1.6    0.34  -2.4      0.40    1.10    0.00
missing-on-state    180  free28+band       11711    4.44  -2.8    0.86  -1.5    0.46  -0.6      0.70    1.20    0.00
missing-on-state    180  turn14            11711    4.85  -0.7    0.87  -1.4    0.44  -0.9      0.60    1.50    0.00
missing-on-state    180  turn14+band       11711    4.37  -3.1    0.80  -2.1    0.41  -1.4      0.20    1.30    0.00
missing-on-state    180  turn28+band       11711    4.38  -3.1    0.93  -0.8    0.53  +0.5      0.70    1.10    0.00
missing-on-state    180  free14 scaled     11711    4.88  -0.6    0.87  -1.4    0.46  -0.6      0.90    1.20    0.00
missing-on-state    180  turn14 scaled     11711    4.79  -1.0    0.89  -1.2    0.49  -0.2      0.70    1.40    0.00
missing-on-state    180  turn28 scaled     11711    4.90  -0.5    0.91  -1.0    0.50  +0.1      0.80    1.70    0.00
missing-on-state    365  free14            12000    5.35  +1.8    1.12  +1.3    0.59  +1.4      0.00    0.20    0.00
missing-on-state    365  free14+band       12000    5.10  +0.5    1.18  +1.9    0.60  +1.6      0.00    0.00    0.00
missing-on-state    365  free28+band       12000    5.33  +1.7    1.08  +0.9    0.60  +1.6      0.10    0.10    0.00
missing-on-state    365  turn14            12000    5.18  +0.9    1.19  +2.1    0.69  +3.0      0.00    0.20    0.00
missing-on-state    365  turn14+band       12000    5.06  +0.3    1.13  +1.5    0.59  +1.4      0.00    0.10    0.00
missing-on-state    365  turn28+band       12000    5.24  +1.2    1.13  +1.5    0.63  +1.9      0.10    0.00    0.00
missing-on-state    365  free14 scaled     12000    5.27  +1.3    1.17  +1.8    0.63  +1.9      0.00    0.20    0.00
missing-on-state    365  turn14 scaled     12000    5.27  +1.3    1.20  +2.2    0.64  +2.2      0.00    0.20    0.00
missing-on-state    365  turn28 scaled     12000    5.26  +1.3    1.14  +1.6    0.60  +1.6      0.10    0.10    0.00

follows-band         60  free14            11765    5.67  +3.3    1.29  +3.2    0.68  +2.8      4.50    5.60    0.10
follows-band         60  free14+band       11765    4.67  -1.6    0.97  -0.3    0.50  +0.0      2.90    5.70    0.00
follows-band         60  free28+band       11765    4.93  -0.3    0.95  -0.5    0.54  +0.7      3.50    6.10    0.00
follows-band         60  turn14            11765    5.73  +3.6    1.24  +2.6    0.72  +3.4      4.60    5.40    0.00
follows-band         60  turn14+band       11765    4.70  -1.5    0.88  -1.3    0.48  -0.4      2.60    5.60    0.00
follows-band         60  turn28+band       11765    4.83  -0.9    1.02  +0.2    0.45  -0.8      2.30    6.70    0.00
follows-band         60  free14 scaled     11765    4.96  -0.2    1.05  +0.5    0.54  +0.5      3.70    6.30    0.00
follows-band         60  turn14 scaled     11765    5.06  +0.3    1.05  +0.5    0.54  +0.5      3.00    6.80    0.00
follows-band         60  turn28 scaled     11765    4.99  -0.1    0.94  -0.6    0.48  -0.2      3.10    6.90    0.00
follows-band        180  free14            12000    5.91  +4.6    1.25  +2.8    0.63  +1.9      0.00    0.00    0.00
follows-band        180  free14+band       12000    4.97  -0.1    1.09  +1.0    0.53  +0.4      0.00    0.00    0.00
follows-band        180  free28+band       12000    4.89  -0.5    0.94  -0.6    0.50  +0.0      0.00    0.00    0.00
follows-band        180  turn14            12000    5.73  +3.7    1.27  +3.0    0.73  +3.6      0.00    0.00    0.00
follows-band        180  turn14+band       12000    4.90  -0.5    1.02  +0.3    0.53  +0.4      0.00    0.00    0.00
follows-band        180  turn28+band       12000    4.91  -0.5    0.91  -1.0    0.57  +1.0      0.00    0.00    0.00
follows-band        180  free14 scaled     12000    5.16  +0.8    0.94  -0.6    0.54  +0.6      0.00    0.00    0.00
follows-band        180  turn14 scaled     12000    4.97  -0.1    0.97  -0.3    0.48  -0.3      0.00    0.00    0.00
follows-band        180  turn28 scaled     12000    5.13  +0.6    0.94  -0.6    0.55  +0.8      0.00    0.00    0.00
follows-band        365  free14            12000    5.70  +3.5    1.16  +1.7    0.54  +0.6      0.00    0.00    0.00
follows-band        365  free14+band       12000    4.82  -0.9    1.06  +0.6    0.47  -0.4      0.00    0.00    0.00
follows-band        365  free28+band       12000    5.06  +0.3    1.01  +0.1    0.55  +0.8      0.00    0.00    0.00
follows-band        365  turn14            12000    5.69  +3.5    1.25  +2.8    0.63  +2.1      0.00    0.00    0.00
follows-band        365  turn14+band       12000    4.86  -0.7    1.07  +0.8    0.47  -0.4      0.00    0.00    0.00
follows-band        365  turn28+band       12000    4.88  -0.6    0.99  -0.1    0.50  +0.0      0.00    0.00    0.00
follows-band        365  free14 scaled     12000    4.95  -0.3    0.86  -1.6    0.47  -0.5      0.00    0.00    0.00
follows-band        365  turn14 scaled     12000    4.92  -0.4    0.88  -1.3    0.42  -1.3      0.00    0.00    0.00
follows-band        365  turn28 scaled     12000    4.92  -0.4    0.98  -0.2    0.50  +0.0      0.00    0.00    0.00

runs-persistent      60  free14            10468    6.08  +5.0    1.47  +4.8    0.67  +2.4      5.20   11.50    0.20
runs-persistent      60  free14+band       10468    5.86  +4.0    1.41  +4.3    0.66  +2.3      3.80   10.20    0.10
runs-persistent      60  free28+band       10468    5.91  +4.3    1.31  +3.2    0.61  +1.6      4.80   12.00    0.30
runs-persistent      60  turn14            10468    5.38  +1.8    1.08  +0.8    0.48  -0.3      3.30   12.30    0.00
runs-persistent      60  turn14+band       10468    5.63  +2.9    1.21  +2.2    0.56  +0.9      3.20   10.40    0.10
runs-persistent      60  turn28+band       10468    5.48  +2.3    1.14  +1.4    0.57  +1.1      3.70   12.20    0.20
runs-persistent      60  free14 scaled     10468    5.85  +4.0    1.37  +3.8    0.70  +2.9      5.70   10.60    0.30
runs-persistent      60  turn14 scaled     10468    5.25  +1.2    1.01  +0.1    0.57  +1.1      3.10   11.90    0.00
runs-persistent      60  turn28 scaled     10468    4.94  -0.3    0.79  -2.1    0.33  -2.4      2.50   13.30    0.20
runs-persistent     180  free14            12000    5.69  +3.5    1.27  +3.0    0.80  +4.7      0.10    0.00    0.00
runs-persistent     180  free14+band       12000    5.63  +3.2    1.17  +1.8    0.66  +2.5      0.10    0.00    0.00
runs-persistent     180  free28+band       12000    5.83  +4.1    1.32  +3.5    0.78  +4.3      0.10    0.00    0.00
runs-persistent     180  turn14            12000    5.21  +1.0    1.09  +1.0    0.56  +0.9      0.10    0.00    0.00
runs-persistent     180  turn14+band       12000    5.43  +2.2    1.13  +1.5    0.61  +1.7      0.10    0.00    0.00
runs-persistent     180  turn28+band       12000    5.36  +1.8    1.25  +2.8    0.64  +2.2      0.10    0.00    0.00
runs-persistent     180  free14 scaled     12000    5.53  +2.6    1.30  +3.3    0.73  +3.6      0.10    0.00    0.00
runs-persistent     180  turn14 scaled     12000    5.11  +0.5    1.12  +1.3    0.53  +0.5      0.10    0.00    0.00
runs-persistent     180  turn28 scaled     12000    5.13  +0.6    1.06  +0.6    0.54  +0.6      0.10    0.00    0.00
runs-persistent     365  free14            12000    5.79  +4.0    1.32  +3.6    0.78  +4.4      0.00    0.00    0.00
runs-persistent     365  free14+band       12000    5.77  +3.9    1.35  +3.9    0.82  +5.0      0.00    0.00    0.00
runs-persistent     365  free28+band       12000    6.23  +6.2    1.35  +3.9    0.83  +5.2      0.00    0.00    0.00
runs-persistent     365  turn14            12000    5.38  +1.9    1.25  +2.8    0.57  +1.0      0.00    0.00    0.00
runs-persistent     365  turn14+band       12000    5.60  +3.0    1.38  +4.2    0.70  +3.1      0.00    0.00    0.00
runs-persistent     365  turn28+band       12000    5.77  +3.9    1.31  +3.4    0.72  +3.5      0.00    0.00    0.00
runs-persistent     365  free14 scaled     12000    5.88  +4.4    1.32  +3.5    0.76  +4.0      0.00    0.00    0.00
runs-persistent     365  turn14 scaled     12000    5.27  +1.3    1.18  +1.9    0.62  +1.8      0.00    0.00    0.00
runs-persistent     365  turn28 scaled     12000    5.27  +1.3    1.21  +2.3    0.64  +2.2      0.00    0.00    0.00

season               60  free14             2250    5.02  +0.0    1.20  +1.0    0.49  -0.1      3.70    2.70    0.00
season               60  free14+band        2250    5.47  +1.0    0.93  -0.3    0.53  +0.2      2.60    3.20    0.00
season               60  free28+band        2250    6.67  +3.6    1.47  +2.2    0.89  +2.6      4.60    2.70    0.00
season               60  turn14             2250    5.02  +0.0    0.89  -0.5    0.53  +0.2      3.10    2.70    0.00
season               60  turn14+band        2250    5.20  +0.4    0.80  -1.0    0.31  -1.3      2.50    2.70    0.00
season               60  turn28+band        2250    6.53  +3.3    1.38  +1.8    0.53  +0.2      4.50    2.20    0.00
season               60  free14 scaled      2250    4.93  -0.1    0.98  -0.1    0.53  +0.2      3.50    2.70    0.00
season               60  turn14 scaled      2250    4.49  -1.1    1.11  +0.5    0.44  -0.4      3.20    2.30    0.00
season               60  turn28 scaled      2250    6.13  +2.5    0.89  -0.5    0.27  -1.6      2.90    3.70    0.00
season              180  free14            12000    5.91  +4.6    1.17  +1.8    0.49  -0.1      1.50    1.70    0.00
season              180  free14+band       12000    6.08  +5.4    1.23  +2.5    0.65  +2.3      1.10    1.60    0.00
season              180  free28+band       12000    8.24 +16.3    1.99 +10.9    1.07  +8.8      1.50    1.60    0.00
season              180  turn14            12000    5.72  +3.6    1.10  +1.1    0.52  +0.3      1.30    1.80    0.00
season              180  turn14+band       12000    6.17  +5.9    1.28  +3.1    0.68  +2.7      1.10    1.50    0.00
season              180  turn28+band       12000    8.25 +16.3    1.93 +10.2    1.13  +9.8      1.90    1.20    0.00
season              180  free14 scaled     12000    5.77  +3.9    1.11  +1.2    0.53  +0.4      1.60    1.60    0.00
season              180  turn14 scaled     12000    5.59  +3.0    1.17  +1.8    0.57  +1.0      1.40    1.70    0.00
season              180  turn28 scaled     12000    6.61  +8.1    1.35  +3.9    0.68  +2.7      1.60    1.50    0.00
season              365  free14            12000    5.59  +3.0    1.13  +1.5    0.66  +2.5      0.00    0.00    0.00
season              365  free14+band       12000    6.46  +7.3    1.45  +5.0    0.82  +4.9      0.00    0.00    0.00
season              365  free28+band       12000   10.81 +29.2    2.98 +21.8    1.66 +18.0      0.00    0.00    0.00
season              365  turn14            12000    5.67  +3.4    1.17  +1.8    0.59  +1.4      0.00    0.00    0.00
season              365  turn14+band       12000    6.48  +7.5    1.57  +6.3    0.79  +4.5      0.00    0.00    0.00
season              365  turn28+band       12000   10.95 +29.9    2.93 +21.3    1.69 +18.5      0.00    0.00    0.00
season              365  free14 scaled     12000    5.60  +3.0    1.07  +0.8    0.57  +1.0      0.00    0.00    0.00
season              365  turn14 scaled     12000    5.39  +2.0    1.10  +1.1    0.55  +0.8      0.00    0.00    0.00
season              365  turn28 scaled     12000    7.03 +10.2    1.58  +6.4    0.84  +5.3      0.00    0.00    0.00

fifteen-points       60  free14            10727    4.96  -0.2    0.96  -0.4    0.45  -0.8      3.60   13.00   74.80
fifteen-points       60  free14+band       10727    5.05  +0.3    0.88  -1.3    0.41  -1.3      2.70   12.50   67.00
fifteen-points       60  free28+band       10727    4.94  -0.3    0.89  -1.1    0.38  -1.7      3.40   13.30   76.20
fifteen-points       60  turn14            10727    5.18  +0.9    0.95  -0.5    0.37  -1.9      3.00   13.20   67.40
fifteen-points       60  turn14+band       10727    4.85  -0.7    0.90  -1.0    0.31  -2.8      1.90   12.80   61.10
fifteen-points       60  turn28+band       10727    4.91  -0.4    0.93  -0.7    0.39  -1.6      2.80   13.00   65.70
fifteen-points       60  free14 scaled     10727    4.96  -0.2    0.88  -1.3    0.40  -1.5      3.40   13.20   76.10
fifteen-points       60  turn14 scaled     10727    5.13  +0.6    0.99  -0.1    0.46  -0.6      3.10   12.80   69.60
fifteen-points       60  turn28 scaled     10727    4.77  -1.1    1.03  +0.3    0.42  -1.2      2.80   12.90   60.00
fifteen-points      180  free14            11000    5.32  +1.5    1.03  +0.3    0.57  +1.1      0.10    0.00   98.50
fifteen-points      180  free14+band       11000    5.29  +1.4    1.09  +1.0    0.50  +0.0      0.10    0.00   98.50
fifteen-points      180  free28+band       11000    5.28  +1.4    1.09  +1.0    0.56  +0.9      0.10    0.00   98.50
fifteen-points      180  turn14            11000    5.49  +2.4    1.00  +0.0    0.65  +2.2      0.10    0.00   98.50
fifteen-points      180  turn14+band       11000    5.34  +1.6    1.15  +1.6    0.45  -0.8      0.10    0.00   98.50
fifteen-points      180  turn28+band       11000    5.17  +0.8    1.16  +1.7    0.54  +0.5      0.10    0.00   98.50
fifteen-points      180  free14 scaled     11000    5.38  +1.8    1.04  +0.4    0.62  +1.8      0.10    0.00   98.50
fifteen-points      180  turn14 scaled     11000    5.38  +1.8    0.95  -0.5    0.65  +2.3      0.10    0.00   98.50
fifteen-points      180  turn28 scaled     11000    5.40  +1.9    0.95  -0.5    0.55  +0.8      0.10    0.00   98.50
fifteen-points      365  free14            11000    5.17  +0.8    0.97  -0.3    0.54  +0.5      0.00    0.00   99.90
fifteen-points      365  free14+band       11000    5.14  +0.7    1.04  +0.4    0.47  -0.4      0.00    0.00   99.90
fifteen-points      365  free28+band       11000    4.85  -0.7    1.02  +0.2    0.46  -0.5      0.00    0.00   99.90
fifteen-points      365  turn14            11000    5.19  +0.9    0.94  -0.7    0.48  -0.3      0.00    0.00   99.90
fifteen-points      365  turn14+band       11000    5.10  +0.5    0.99  -0.1    0.47  -0.4      0.00    0.00   99.90
fifteen-points      365  turn28+band       11000    4.97  -0.1    0.98  -0.2    0.51  +0.1      0.00    0.00   99.90
fifteen-points      365  free14 scaled     11000    5.06  +0.3    1.00  +0.0    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  turn14 scaled     11000    5.15  +0.7    1.02  +0.2    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  turn28 scaled     11000    4.99  -0.0    1.09  +1.0    0.45  -0.7      0.00    0.00   99.90

ten-points           60  free14            10723    4.97  -0.1    0.99  -0.1    0.46  -0.6      3.70    8.50   30.20
ten-points           60  free14+band       10723    4.88  -0.6    0.94  -0.6    0.48  -0.4      2.70    8.00   25.90
ten-points           60  free28+band       10723    5.04  +0.2    0.90  -1.0    0.52  +0.3      3.80    8.20   29.80
ten-points           60  turn14            10723    4.82  -0.8    1.08  +0.9    0.48  -0.2      3.80    7.90   25.70
ten-points           60  turn14+band       10723    4.85  -0.7    1.04  +0.4    0.54  +0.6      3.00    7.40   23.60
ten-points           60  turn28+band       10723    4.96  -0.2    0.93  -0.7    0.49  -0.1      3.30    8.20   24.70
ten-points           60  free14 scaled     10723    4.96  -0.2    0.91  -0.9    0.54  +0.6      3.80    8.40   30.40
ten-points           60  turn14 scaled     10723    4.78  -1.0    1.13  +1.3    0.53  +0.5      3.50    8.30   24.90
ten-points           60  turn28 scaled     10723    4.76  -1.2    0.92  -0.8    0.46  -0.6      3.10    8.70   22.50
ten-points          180  free14            11000    5.28  +1.4    1.00  +0.0    0.46  -0.5      0.00    0.00   46.20
ten-points          180  free14+band       11000    5.13  +0.6    1.05  +0.5    0.48  -0.3      0.00    0.00   46.10
ten-points          180  free28+band       11000    5.05  +0.3    0.97  -0.3    0.55  +0.8      0.00    0.00   46.20
ten-points          180  turn14            11000    5.32  +1.5    1.13  +1.3    0.50  +0.0      0.00    0.00   46.20
ten-points          180  turn14+band       11000    5.04  +0.2    1.04  +0.4    0.47  -0.4      0.00    0.00   46.00
ten-points          180  turn28+band       11000    5.25  +1.2    1.02  +0.2    0.52  +0.3      0.00    0.00   46.20
ten-points          180  free14 scaled     11000    5.31  +1.5    1.02  +0.2    0.45  -0.8      0.00    0.00   46.20
ten-points          180  turn14 scaled     11000    5.35  +1.7    1.07  +0.8    0.54  +0.5      0.00    0.00   46.20
ten-points          180  turn28 scaled     11000    5.15  +0.7    1.07  +0.8    0.59  +1.4      0.00    0.00   46.20
ten-points          365  free14            11000    4.63  -1.8    0.86  -1.4    0.43  -1.1      0.00    0.00   44.30
ten-points          365  free14+band       11000    4.79  -1.0    0.95  -0.6    0.47  -0.4      0.00    0.00   44.30
ten-points          365  free28+band       11000    4.70  -1.4    0.89  -1.1    0.47  -0.4      0.00    0.00   44.30
ten-points          365  turn14            11000    4.59  -2.0    0.85  -1.5    0.42  -1.2      0.00    0.00   44.30
ten-points          365  turn14+band       11000    4.65  -1.7    0.88  -1.2    0.41  -1.4      0.00    0.00   44.30
ten-points          365  turn28+band       11000    4.67  -1.6    0.90  -1.1    0.45  -0.7      0.00    0.00   44.30
ten-points          365  free14 scaled     11000    4.70  -1.4    0.94  -0.7    0.40  -1.5      0.00    0.00   44.30
ten-points          365  turn14 scaled     11000    4.62  -1.8    0.87  -1.3    0.41  -1.4      0.00    0.00   44.30
ten-points          365  turn28 scaled     11000    4.74  -1.3    0.91  -1.0    0.42  -1.2      0.00    0.00   44.30

----

seeds 1 to 1000; chances with nothing there (an honest check gives 5.00, 1.00, 0.50), the family of twelve, and the first thing called
world              look  method           tested  p<=.05     z  p<=.01     z p<=.005     z  pattern%   lead%  first%
independent-30       60  free14 scaled     11723    4.61  -2.0    0.93  -0.8    0.49  -0.1      3.10    4.70    0.10
independent-30       60  turn14 scaled     11723    4.70  -1.5    0.92  -0.9    0.49  -0.2      2.10    5.70    0.10
independent-30       60  flip14 scaled     11723    4.67  -1.6    0.90  -1.0    0.44  -0.9      2.10    5.70    0.10
independent-30      180  free14 scaled     12000    5.16  +0.8    1.02  +0.2    0.52  +0.3      0.00    0.00    0.00
independent-30      180  turn14 scaled     12000    5.13  +0.6    1.07  +0.8    0.43  -1.0      0.00    0.00    0.00
independent-30      180  flip14 scaled     12000    5.19  +1.0    1.01  +0.1    0.51  +0.1      0.00    0.00    0.00
independent-30      365  free14 scaled     12000    5.30  +1.5    1.03  +0.4    0.48  -0.3      0.00    0.00    0.00
independent-30      365  turn14 scaled     12000    5.29  +1.5    1.06  +0.6    0.50  +0.0      0.00    0.00    0.00
independent-30      365  flip14 scaled     12000    5.25  +1.3    1.07  +0.7    0.61  +1.7      0.00    0.00    0.00

runs                 60  free14 scaled     10475    5.59  +2.8    1.34  +3.5    0.64  +2.0      3.20    5.50    0.10
runs                 60  turn14 scaled     10475    5.26  +1.2    1.16  +1.6    0.56  +0.9      2.70    5.40    0.10
runs                 60  flip14 scaled     10475    5.19  +0.9    1.14  +1.4    0.51  +0.1      2.80    5.40    0.00
runs                180  free14 scaled     12000    5.38  +1.9    1.17  +1.8    0.53  +0.5      0.00    0.00    0.00
runs                180  turn14 scaled     12000    5.01  +0.0    1.05  +0.6    0.48  -0.3      0.00    0.00    0.00
runs                180  flip14 scaled     12000    5.07  +0.3    1.01  +0.1    0.48  -0.3      0.00    0.00    0.00
runs                365  free14 scaled     12000    5.56  +2.8    1.22  +2.4    0.62  +1.8      0.00    0.00    0.00
runs                365  turn14 scaled     12000    5.09  +0.5    1.12  +1.3    0.58  +1.3      0.00    0.00    0.00
runs                365  flip14 scaled     12000    5.13  +0.6    1.14  +1.6    0.54  +0.6      0.00    0.00    0.00

follows-band         60  free14 scaled     11765    4.96  -0.2    1.05  +0.5    0.54  +0.5      3.70    6.30    0.00
follows-band         60  turn14 scaled     11765    5.06  +0.3    1.05  +0.5    0.54  +0.5      3.00    6.80    0.00
follows-band         60  flip14 scaled     11765    5.00  -0.0    0.99  -0.1    0.58  +1.2      3.50    6.40    0.00
follows-band        180  free14 scaled     12000    5.16  +0.8    0.94  -0.6    0.54  +0.6      0.00    0.00    0.00
follows-band        180  turn14 scaled     12000    4.97  -0.1    0.97  -0.3    0.48  -0.3      0.00    0.00    0.00
follows-band        180  flip14 scaled     12000    5.04  +0.2    0.97  -0.4    0.49  -0.1      0.00    0.00    0.00
follows-band        365  free14 scaled     12000    4.95  -0.3    0.86  -1.6    0.47  -0.5      0.00    0.00    0.00
follows-band        365  turn14 scaled     12000    4.92  -0.4    0.88  -1.3    0.42  -1.3      0.00    0.00    0.00
follows-band        365  flip14 scaled     12000    4.98  -0.1    0.93  -0.8    0.45  -0.8      0.00    0.00    0.00

runs-persistent      60  free14 scaled     10468    5.85  +4.0    1.37  +3.8    0.70  +2.9      5.70   10.60    0.30
runs-persistent      60  turn14 scaled     10468    5.25  +1.2    1.01  +0.1    0.57  +1.1      3.10   11.90    0.00
runs-persistent      60  flip14 scaled     10468    5.34  +1.6    1.10  +1.0    0.53  +0.4      3.50   11.90    0.00
runs-persistent     180  free14 scaled     12000    5.53  +2.6    1.30  +3.3    0.73  +3.6      0.10    0.00    0.00
runs-persistent     180  turn14 scaled     12000    5.11  +0.5    1.12  +1.3    0.53  +0.5      0.10    0.00    0.00
runs-persistent     180  flip14 scaled     12000    4.99  -0.0    1.07  +0.8    0.53  +0.4      0.10    0.00    0.00
runs-persistent     365  free14 scaled     12000    5.88  +4.4    1.32  +3.5    0.76  +4.0      0.00    0.00    0.00
runs-persistent     365  turn14 scaled     12000    5.27  +1.3    1.18  +1.9    0.62  +1.8      0.00    0.00    0.00
runs-persistent     365  flip14 scaled     12000    5.33  +1.7    1.17  +1.8    0.57  +1.2      0.00    0.00    0.00

season               60  free14 scaled      2250    4.93  -0.1    0.98  -0.1    0.53  +0.2      3.50    2.70    0.00
season               60  turn14 scaled      2250    4.49  -1.1    1.11  +0.5    0.44  -0.4      3.20    2.30    0.00
season               60  flip14 scaled      2250    4.49  -1.1    0.89  -0.5    0.44  -0.4      3.00    2.30    0.00
season              180  free14 scaled     12000    5.77  +3.9    1.11  +1.2    0.53  +0.4      1.60    1.60    0.00
season              180  turn14 scaled     12000    5.59  +3.0    1.17  +1.8    0.57  +1.0      1.40    1.70    0.00
season              180  flip14 scaled     12000    5.60  +3.0    1.11  +1.2    0.53  +0.5      1.60    1.50    0.00
season              365  free14 scaled     12000    5.60  +3.0    1.07  +0.8    0.57  +1.0      0.00    0.00    0.00
season              365  turn14 scaled     12000    5.39  +2.0    1.10  +1.1    0.55  +0.8      0.00    0.00    0.00
season              365  flip14 scaled     12000    5.60  +3.0    1.10  +1.1    0.57  +1.2      0.00    0.00    0.00

fifteen-points       60  free14 scaled     10727    4.96  -0.2    0.88  -1.3    0.40  -1.5      3.40   13.20   76.10
fifteen-points       60  turn14 scaled     10727    5.13  +0.6    0.99  -0.1    0.46  -0.6      3.10   12.80   69.60
fifteen-points       60  flip14 scaled     10727    5.15  +0.7    0.97  -0.3    0.37  -1.9      2.80   13.40   70.40
fifteen-points      180  free14 scaled     11000    5.38  +1.8    1.04  +0.4    0.62  +1.8      0.10    0.00   98.50
fifteen-points      180  turn14 scaled     11000    5.38  +1.8    0.95  -0.5    0.65  +2.3      0.10    0.00   98.50
fifteen-points      180  flip14 scaled     11000    5.36  +1.7    0.95  -0.5    0.64  +2.0      0.10    0.00   98.50
fifteen-points      365  free14 scaled     11000    5.06  +0.3    1.00  +0.0    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  turn14 scaled     11000    5.15  +0.7    1.02  +0.2    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  flip14 scaled     11000    5.11  +0.5    1.03  +0.3    0.48  -0.3      0.00    0.00   99.90

----

seeds 1 to 1000; chances with nothing there (an honest check gives 5.00, 1.00, 0.50), the family of twelve, and the first thing called
world              look  method           tested  p<=.05     z  p<=.01     z p<=.005     z  pattern%   lead%  first%
independent-30       60  free14 scaled     11723    4.61  -2.0    0.93  -0.8    0.49  -0.1      3.10    4.70    0.10
independent-30       60  turn14 scaled     11723    4.70  -1.5    0.92  -0.9    0.49  -0.2      2.10    5.70    0.10
independent-30       60  streaks14 scaled    11723    4.69  -1.5    0.72  -3.1    0.29  -3.2      0.50    4.10    0.00
independent-30       60  streaks14         11723    4.55  -2.3    0.64  -3.9    0.25  -3.9      0.30    4.00    0.00
independent-30      180  free14 scaled     12000    5.16  +0.8    1.02  +0.2    0.52  +0.3      0.00    0.00    0.00
independent-30      180  turn14 scaled     12000    5.13  +0.6    1.07  +0.8    0.43  -1.0      0.00    0.00    0.00
independent-30      180  streaks14 scaled    12000    4.83  -0.9    1.02  +0.3    0.59  +1.4      0.00    0.00    0.00
independent-30      180  streaks14         12000    4.97  -0.2    0.99  -0.1    0.57  +1.0      0.00    0.00    0.00
independent-30      365  free14 scaled     12000    5.30  +1.5    1.03  +0.4    0.48  -0.3      0.00    0.00    0.00
independent-30      365  turn14 scaled     12000    5.29  +1.5    1.06  +0.6    0.50  +0.0      0.00    0.00    0.00
independent-30      365  streaks14 scaled    12000    5.14  +0.7    1.01  +0.1    0.53  +0.5      0.00    0.00    0.00
independent-30      365  streaks14         12000    5.23  +1.2    1.02  +0.2    0.52  +0.3      0.00    0.00    0.00

runs                 60  free14 scaled     10475    5.59  +2.8    1.34  +3.5    0.64  +2.0      3.20    5.50    0.10
runs                 60  turn14 scaled     10475    5.26  +1.2    1.16  +1.6    0.56  +0.9      2.70    5.40    0.10
runs                 60  streaks14 scaled    10475    1.60 -15.9    0.04  -9.9    0.03  -6.8      0.10    1.10    0.00
runs                 60  streaks14         10475    1.59 -16.0    0.07  -9.6    0.00  -7.3      0.00    1.30    0.00
runs                180  free14 scaled     12000    5.38  +1.9    1.17  +1.8    0.53  +0.5      0.00    0.00    0.00
runs                180  turn14 scaled     12000    5.01  +0.0    1.05  +0.6    0.48  -0.3      0.00    0.00    0.00
runs                180  streaks14 scaled    12000    4.69  -1.5    0.90  -1.1    0.46  -0.6      0.00    0.00    0.00
runs                180  streaks14         12000    4.67  -1.7    0.88  -1.4    0.42  -1.3      0.00    0.00    0.00
runs                365  free14 scaled     12000    5.56  +2.8    1.22  +2.4    0.62  +1.8      0.00    0.00    0.00
runs                365  turn14 scaled     12000    5.09  +0.5    1.12  +1.3    0.58  +1.3      0.00    0.00    0.00
runs                365  streaks14 scaled    12000    5.13  +0.6    0.95  -0.6    0.49  -0.1      0.00    0.00    0.00
runs                365  streaks14         12000    5.05  +0.3    0.92  -0.9    0.42  -1.3      0.00    0.00    0.00

weekly-rhythm        60  free14 scaled     11714    4.64  -1.8    0.96  -0.4    0.48  -0.3      4.70   13.10    0.00
weekly-rhythm        60  turn14 scaled     11714    4.78  -1.1    0.95  -0.6    0.48  -0.3      4.20   13.00    0.00
weekly-rhythm        60  streaks14 scaled    11714    4.57  -2.1    0.68  -3.4    0.30  -3.1      1.20    9.90    0.00
weekly-rhythm        60  streaks14         11714    4.64  -1.8    0.66  -3.7    0.31  -3.0      1.20    9.70    0.00
weekly-rhythm       180  free14 scaled     12000    4.92  -0.4    0.98  -0.2    0.51  +0.1      0.20    0.00    0.00
weekly-rhythm       180  turn14 scaled     12000    4.93  -0.3    0.91  -1.0    0.43  -1.0      0.20    0.00    0.00
weekly-rhythm       180  streaks14 scaled    12000    4.78  -1.1    1.02  +0.3    0.56  +0.9      0.20    0.00    0.00
weekly-rhythm       180  streaks14         12000    4.72  -1.4    1.05  +0.6    0.52  +0.3      0.20    0.00    0.00
weekly-rhythm       365  free14 scaled     12000    4.91  -0.5    1.03  +0.4    0.48  -0.3      0.00    0.00    0.00
weekly-rhythm       365  turn14 scaled     12000    4.97  -0.2    1.02  +0.2    0.50  +0.0      0.00    0.00    0.00
weekly-rhythm       365  streaks14 scaled    12000    4.90  -0.5    0.97  -0.3    0.47  -0.5      0.00    0.00    0.00
weekly-rhythm       365  streaks14         12000    4.95  -0.3    1.01  +0.1    0.52  +0.3      0.00    0.00    0.00

missing-on-state     60  free14 scaled      4001    4.55  -1.3    0.77  -1.4    0.35  -1.3      2.20    6.00    0.10
missing-on-state     60  turn14 scaled      4001    4.62  -1.1    0.62  -2.4    0.17  -2.9      1.40    5.60    0.00
missing-on-state     60  streaks14 scaled     4001    1.55 -10.0    0.12  -5.6    0.07  -3.8      0.00    0.90    0.00
missing-on-state     60  streaks14          4001    1.55 -10.0    0.12  -5.6    0.02  -4.3      0.10    0.70    0.00
missing-on-state    180  free14 scaled     11711    4.88  -0.6    0.87  -1.4    0.46  -0.6      0.90    1.20    0.00
missing-on-state    180  turn14 scaled     11711    4.79  -1.0    0.89  -1.2    0.49  -0.2      0.70    1.40    0.00
missing-on-state    180  streaks14 scaled    11711    2.91 -10.4    0.43  -6.2    0.19  -4.8      0.00    0.10    0.00
missing-on-state    180  streaks14         11711    3.01  -9.9    0.44  -6.0    0.20  -4.7      0.00    0.20    0.00
missing-on-state    365  free14 scaled     12000    5.27  +1.3    1.17  +1.8    0.63  +1.9      0.00    0.20    0.00
missing-on-state    365  turn14 scaled     12000    5.27  +1.3    1.20  +2.2    0.64  +2.2      0.00    0.20    0.00
missing-on-state    365  streaks14 scaled    12000    4.34  -3.3    0.82  -2.0    0.41  -1.4      0.00    0.00    0.00
missing-on-state    365  streaks14         12000    4.33  -3.4    0.87  -1.5    0.42  -1.3      0.00    0.00    0.00

follows-band         60  free14 scaled     11765    4.96  -0.2    1.05  +0.5    0.54  +0.5      3.70    6.30    0.00
follows-band         60  turn14 scaled     11765    5.06  +0.3    1.05  +0.5    0.54  +0.5      3.00    6.80    0.00
follows-band         60  streaks14 scaled    11765    4.82  -0.9    0.80  -2.2    0.30  -3.1      1.00    5.50    0.00
follows-band         60  streaks14         11765    5.38  +1.9    0.86  -1.5    0.42  -1.3      1.50    5.10    0.00
follows-band        180  free14 scaled     12000    5.16  +0.8    0.94  -0.6    0.54  +0.6      0.00    0.00    0.00
follows-band        180  turn14 scaled     12000    4.97  -0.1    0.97  -0.3    0.48  -0.3      0.00    0.00    0.00
follows-band        180  streaks14 scaled    12000    5.06  +0.3    1.13  +1.4    0.44  -0.9      0.00    0.00    0.00
follows-band        180  streaks14         12000    5.79  +4.0    1.35  +3.9    0.68  +2.8      0.00    0.00    0.00
follows-band        365  free14 scaled     12000    4.95  -0.3    0.86  -1.6    0.47  -0.5      0.00    0.00    0.00
follows-band        365  turn14 scaled     12000    4.92  -0.4    0.88  -1.3    0.42  -1.3      0.00    0.00    0.00
follows-band        365  streaks14 scaled    12000    4.87  -0.7    1.02  +0.2    0.46  -0.6      0.00    0.00    0.00
follows-band        365  streaks14         12000    5.63  +3.2    1.28  +3.1    0.63  +2.1      0.00    0.00    0.00

runs-persistent      60  free14 scaled     10468    5.85  +4.0    1.37  +3.8    0.70  +2.9      5.70   10.60    0.30
runs-persistent      60  turn14 scaled     10468    5.25  +1.2    1.01  +0.1    0.57  +1.1      3.10   11.90    0.00
runs-persistent      60  streaks14 scaled    10468    1.46 -16.6    0.08  -9.5    0.02  -7.0      0.00    2.30    0.00
runs-persistent      60  streaks14         10468    1.60 -15.9    0.11  -9.2    0.04  -6.7      0.00    2.70    0.00
runs-persistent     180  free14 scaled     12000    5.53  +2.6    1.30  +3.3    0.73  +3.6      0.10    0.00    0.00
runs-persistent     180  turn14 scaled     12000    5.11  +0.5    1.12  +1.3    0.53  +0.5      0.10    0.00    0.00
runs-persistent     180  streaks14 scaled    12000    4.93  -0.3    0.98  -0.2    0.43  -1.0      0.00    0.00    0.00
runs-persistent     180  streaks14         12000    5.00  +0.0    0.89  -1.2    0.43  -1.0      0.00    0.00    0.00
runs-persistent     365  free14 scaled     12000    5.88  +4.4    1.32  +3.5    0.76  +4.0      0.00    0.00    0.00
runs-persistent     365  turn14 scaled     12000    5.27  +1.3    1.18  +1.9    0.62  +1.8      0.00    0.00    0.00
runs-persistent     365  streaks14 scaled    12000    5.33  +1.7    1.08  +0.9    0.52  +0.3      0.00    0.00    0.00
runs-persistent     365  streaks14         12000    5.39  +2.0    1.02  +0.3    0.57  +1.0      0.00    0.00    0.00

season               60  free14 scaled      2250    4.93  -0.1    0.98  -0.1    0.53  +0.2      3.50    2.70    0.00
season               60  turn14 scaled      2250    4.49  -1.1    1.11  +0.5    0.44  -0.4      3.20    2.30    0.00
season               60  streaks14 scaled     2250    3.73  -2.8    0.18  -3.9    0.13  -2.5      0.90    1.70    0.00
season               60  streaks14          2250    3.87  -2.5    0.22  -3.7    0.18  -2.2      0.80    2.00    0.00
season              180  free14 scaled     12000    5.77  +3.9    1.11  +1.2    0.53  +0.4      1.60    1.60    0.00
season              180  turn14 scaled     12000    5.59  +3.0    1.17  +1.8    0.57  +1.0      1.40    1.70    0.00
season              180  streaks14 scaled    12000    5.26  +1.3    1.13  +1.5    0.56  +0.9      1.20    1.10    0.00
season              180  streaks14         12000    5.33  +1.6    1.17  +1.8    0.58  +1.3      1.00    1.30    0.00
season              365  free14 scaled     12000    5.60  +3.0    1.07  +0.8    0.57  +1.0      0.00    0.00    0.00
season              365  turn14 scaled     12000    5.39  +2.0    1.10  +1.1    0.55  +0.8      0.00    0.00    0.00
season              365  streaks14 scaled    12000    5.21  +1.0    0.99  -0.1    0.46  -0.6      0.00    0.00    0.00
season              365  streaks14         12000    5.22  +1.1    1.03  +0.4    0.47  -0.5      0.00    0.00    0.00

fifteen-points       60  free14 scaled     10727    4.96  -0.2    0.88  -1.3    0.40  -1.5      3.40   13.20   76.10
fifteen-points       60  turn14 scaled     10727    5.13  +0.6    0.99  -0.1    0.46  -0.6      3.10   12.80   69.60
fifteen-points       60  streaks14 scaled    10727    4.65  -1.7    0.71  -3.0    0.29  -3.1      1.00    7.80   28.00
fifteen-points       60  streaks14         10727    4.59  -2.0    0.66  -3.5    0.30  -3.0      1.00    8.00   26.60
fifteen-points      180  free14 scaled     11000    5.38  +1.8    1.04  +0.4    0.62  +1.8      0.10    0.00   98.50
fifteen-points      180  turn14 scaled     11000    5.38  +1.8    0.95  -0.5    0.65  +2.3      0.10    0.00   98.50
fifteen-points      180  streaks14 scaled    11000    5.16  +0.8    1.25  +2.6    0.58  +1.2      0.10    0.00   97.00
fifteen-points      180  streaks14         11000    5.21  +1.0    1.21  +2.2    0.61  +1.6      0.10    0.00   97.00
fifteen-points      365  free14 scaled     11000    5.06  +0.3    1.00  +0.0    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  turn14 scaled     11000    5.15  +0.7    1.02  +0.2    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  streaks14 scaled    11000    5.51  +2.4    1.12  +1.2    0.50  +0.0      0.00    0.00   99.90
fifteen-points      365  streaks14         11000    5.41  +2.0    1.21  +2.2    0.50  +0.0      0.00    0.00   99.90

ten-points           60  free14 scaled     10723    4.96  -0.2    0.91  -0.9    0.54  +0.6      3.80    8.40   30.40
ten-points           60  turn14 scaled     10723    4.78  -1.0    1.13  +1.3    0.53  +0.5      3.50    8.30   24.90
ten-points           60  streaks14 scaled    10723    4.80  -0.9    0.80  -2.1    0.27  -3.4      0.60    6.40    8.40
ten-points           60  streaks14         10723    4.74  -1.2    0.72  -2.9    0.30  -3.0      1.00    5.60    7.60
ten-points          180  free14 scaled     11000    5.31  +1.5    1.02  +0.2    0.45  -0.8      0.00    0.00   46.20
ten-points          180  turn14 scaled     11000    5.35  +1.7    1.07  +0.8    0.54  +0.5      0.00    0.00   46.20
ten-points          180  streaks14 scaled    11000    4.97  -0.1    1.10  +1.1    0.58  +1.2      0.00    0.00   42.50
ten-points          180  streaks14         11000    5.10  +0.5    1.13  +1.3    0.55  +0.7      0.00    0.00   42.70
ten-points          365  free14 scaled     11000    4.70  -1.4    0.94  -0.7    0.40  -1.5      0.00    0.00   44.30
ten-points          365  turn14 scaled     11000    4.62  -1.8    0.87  -1.3    0.41  -1.4      0.00    0.00   44.30
ten-points          365  streaks14 scaled    11000    4.58  -2.0    0.90  -1.1    0.51  +0.1      0.00    0.00   44.30
ten-points          365  streaks14         11000    4.55  -2.1    0.88  -1.2    0.53  +0.4      0.00    0.00   44.20

----

seeds 1 to 1000; chances with nothing there (an honest check gives 5.00, 1.00, 0.50), the family of twelve, and the first thing called
world              look  method           tested  p<=.05     z  p<=.01     z p<=.005     z  pattern%   lead%  first%
independent-30       60  turn14 scaled     11723    4.70  -1.5    0.92  -0.9    0.49  -0.2      2.10    5.70    0.10
independent-30       60  turn7 scaled      11723    4.60  -2.0    0.90  -1.0    0.48  -0.3      2.60    5.10    0.20
independent-30       60  turn21 scaled     11723    4.65  -1.7    0.87  -1.4    0.38  -1.9      2.20    5.70    0.10
independent-30      180  turn14 scaled     12000    5.13  +0.6    1.07  +0.8    0.43  -1.0      0.00    0.00    0.00
independent-30      180  turn7 scaled      12000    5.17  +0.9    1.04  +0.5    0.53  +0.5      0.00    0.00    0.00
independent-30      180  turn21 scaled     12000    5.06  +0.3    1.08  +0.9    0.49  -0.1      0.00    0.00    0.00
independent-30      365  turn14 scaled     12000    5.29  +1.5    1.06  +0.6    0.50  +0.0      0.00    0.00    0.00
independent-30      365  turn7 scaled      12000    5.21  +1.0    1.06  +0.6    0.53  +0.4      0.00    0.00    0.00
independent-30      365  turn21 scaled     12000    5.35  +1.8    1.01  +0.1    0.51  +0.1      0.00    0.00    0.00

runs                 60  turn14 scaled     10475    5.26  +1.2    1.16  +1.6    0.56  +0.9      2.70    5.40    0.10
runs                 60  turn7 scaled      10475    5.32  +1.5    1.20  +2.1    0.53  +0.5      2.20    5.00    0.10
runs                 60  turn21 scaled     10475    5.29  +1.4    1.12  +1.2    0.63  +1.9      2.90    5.20    0.10
runs                180  turn14 scaled     12000    5.01  +0.0    1.05  +0.6    0.48  -0.3      0.00    0.00    0.00
runs                180  turn7 scaled      12000    5.32  +1.6    1.07  +0.7    0.51  +0.1      0.00    0.00    0.00
runs                180  turn21 scaled     12000    4.91  -0.5    0.94  -0.6    0.56  +0.9      0.00    0.00    0.00
runs                365  turn14 scaled     12000    5.09  +0.5    1.12  +1.3    0.58  +1.3      0.00    0.00    0.00
runs                365  turn7 scaled      12000    5.40  +2.0    1.05  +0.6    0.53  +0.4      0.00    0.00    0.00
runs                365  turn21 scaled     12000    5.08  +0.4    1.06  +0.6    0.52  +0.3      0.00    0.00    0.00

follows-band         60  turn14 scaled     11765    5.06  +0.3    1.05  +0.5    0.54  +0.5      3.00    6.80    0.00
follows-band         60  turn7 scaled      11765    5.13  +0.7    1.01  +0.1    0.53  +0.4      2.90    6.60    0.00
follows-band         60  turn21 scaled     11765    5.08  +0.4    1.01  +0.1    0.48  -0.4      2.80    7.20    0.00
follows-band        180  turn14 scaled     12000    4.97  -0.1    0.97  -0.3    0.48  -0.3      0.00    0.00    0.00
follows-band        180  turn7 scaled      12000    5.03  +0.2    0.99  -0.1    0.53  +0.4      0.00    0.00    0.00
follows-band        180  turn21 scaled     12000    5.02  +0.1    1.07  +0.7    0.56  +0.9      0.00    0.00    0.00
follows-band        365  turn14 scaled     12000    4.92  -0.4    0.88  -1.3    0.42  -1.3      0.00    0.00    0.00
follows-band        365  turn7 scaled      12000    4.92  -0.4    0.88  -1.4    0.42  -1.2      0.00    0.00    0.00
follows-band        365  turn21 scaled     12000    4.88  -0.6    0.88  -1.3    0.47  -0.5      0.00    0.00    0.00

runs-persistent      60  turn14 scaled     10468    5.25  +1.2    1.01  +0.1    0.57  +1.1      3.10   11.90    0.00
runs-persistent      60  turn7 scaled      10468    5.39  +1.8    1.05  +0.5    0.54  +0.6      2.40    9.70    0.00
runs-persistent      60  turn21 scaled     10468    5.09  +0.4    0.95  -0.6    0.43  -1.0      3.40   11.90    0.10
runs-persistent     180  turn14 scaled     12000    5.11  +0.5    1.12  +1.3    0.53  +0.5      0.10    0.00    0.00
runs-persistent     180  turn7 scaled      12000    5.54  +2.7    1.07  +0.7    0.52  +0.3      0.10    0.00    0.00
runs-persistent     180  turn21 scaled     12000    5.09  +0.5    1.03  +0.4    0.55  +0.8      0.10    0.00    0.00
runs-persistent     365  turn14 scaled     12000    5.27  +1.3    1.18  +1.9    0.62  +1.8      0.00    0.00    0.00
runs-persistent     365  turn7 scaled      12000    5.35  +1.8    1.09  +1.0    0.60  +1.6      0.00    0.00    0.00
runs-persistent     365  turn21 scaled     12000    5.31  +1.5    1.28  +3.1    0.73  +3.6      0.00    0.00    0.00

season               60  turn14 scaled      2250    4.49  -1.1    1.11  +0.5    0.44  -0.4      3.20    2.30    0.00
season               60  turn7 scaled       2250    4.93  -0.1    1.20  +1.0    0.36  -1.0      3.70    1.90    0.00
season               60  turn21 scaled      2250    5.64  +1.4    0.98  -0.1    0.40  -0.7      3.70    2.80    0.00
season              180  turn14 scaled     12000    5.59  +3.0    1.17  +1.8    0.57  +1.0      1.40    1.70    0.00
season              180  turn7 scaled      12000    5.17  +0.9    1.02  +0.3    0.51  +0.1      1.20    1.70    0.00
season              180  turn21 scaled     12000    5.94  +4.7    1.25  +2.8    0.58  +1.3      1.40    1.70    0.00
season              365  turn14 scaled     12000    5.39  +2.0    1.10  +1.1    0.55  +0.8      0.00    0.00    0.00
season              365  turn7 scaled      12000    5.10  +0.5    1.00  +0.0    0.51  +0.1      0.00    0.00    0.00
season              365  turn21 scaled     12000    6.07  +5.4    1.26  +2.8    0.62  +1.8      0.00    0.00    0.00

fifteen-points       60  turn14 scaled     10727    5.13  +0.6    0.99  -0.1    0.46  -0.6      3.10   12.80   69.60
fifteen-points       60  turn7 scaled      10727    5.01  +0.0    0.92  -0.8    0.39  -1.6      2.20   12.20   63.20
fifteen-points       60  turn21 scaled     10727    4.88  -0.6    0.89  -1.2    0.38  -1.7      2.40   13.30   67.80
fifteen-points      180  turn14 scaled     11000    5.38  +1.8    0.95  -0.5    0.65  +2.3      0.10    0.00   98.50
fifteen-points      180  turn7 scaled      11000    5.23  +1.1    1.07  +0.8    0.60  +1.5      0.10    0.00   98.50
fifteen-points      180  turn21 scaled     11000    5.36  +1.7    1.00  +0.0    0.49  -0.1      0.10    0.00   98.50
fifteen-points      365  turn14 scaled     11000    5.15  +0.7    1.02  +0.2    0.53  +0.4      0.00    0.00   99.90
fifteen-points      365  turn7 scaled      11000    4.94  -0.3    1.09  +1.0    0.52  +0.3      0.00    0.00   99.90
fifteen-points      365  turn21 scaled     11000    5.15  +0.7    1.05  +0.6    0.50  +0.0      0.00    0.00   99.90
```

The four blocks above are the four tuning runs in the order they were made: every way on every world; then the two
leading ways beside the mirrored turn; then moving whole streaks; then the turn over 7 and 21 days.

**The chance in family B, by the core itself, before and after** (`counted-calib.mjs` on each tuning run's results;
the same columns, and a last one for the share that was also large enough to be said):

Before, the core as it stood at the freeze:

```text
world              family     look  group    tested   p<=.05 (z)      p<=.01 (z)      p<=.005 (z)   big&p<=.05
independent-10     B            60  things      967    4.96 (-0.1)     0.83 (-0.5)     0.21 (-1.3)    1.76
independent-10     B           180  things    11634    4.75 (-1.2)     0.90 (-1.1)     0.46 (-0.5)    0.21
independent-10     B           365  things    12000    4.60 (-2.0)     0.88 (-1.4)     0.40 (-1.6)    0.01
independent-30     B            60  things    11723    4.65 (-1.7)     1.03 (+0.3)     0.52 (+0.3)    0.73
independent-30     B           180  things    12000    5.13 (+0.6)     1.03 (+0.3)     0.53 (+0.5)    0.00
independent-30     B           365  things    12000    5.36 (+1.8)     1.03 (+0.3)     0.54 (+0.6)    0.00
independent-50     B            60  things    12000    4.96 (-0.2)     1.07 (+0.8)     0.45 (-0.8)    0.29
independent-50     B           180  things    12000    5.25 (+1.3)     1.05 (+0.6)     0.61 (+1.7)    0.00
independent-50     B           365  things    12000    5.53 (+2.6)     0.98 (-0.2)     0.57 (+1.2)    0.00
runs               B            60  things    10475    5.52 (+2.4)     1.44 (+4.5)     0.61 (+1.6)    0.90
runs               B           180  things    12000    5.60 (+3.0)     1.17 (+1.8)     0.53 (+0.4)    0.00
runs               B           365  things    12000    5.47 (+2.3)     1.24 (+2.7)     0.71 (+3.2)    0.00
weekly-rhythm      B            60  things    11714    4.76 (-1.2)     0.96 (-0.4)     0.55 (+0.7)    1.68
weekly-rhythm      B           180  things    12000    4.91 (-0.5)     0.92 (-0.8)     0.49 (-0.1)    0.02
weekly-rhythm      B           365  things    12000    5.04 (+0.2)     0.95 (-0.6)     0.43 (-1.2)    0.00
missing-on-state   B            60  things     4001    4.32 (-2.0)     0.72 (-1.7)     0.47 (-0.2)    2.22
missing-on-state   B           180  things    11711    4.80 (-1.0)     0.90 (-1.1)     0.44 (-0.9)    0.20
missing-on-state   B           365  things    12000    5.27 (+1.4)     1.15 (+1.7)     0.65 (+2.3)    0.02
follows-band       B            60  things    11765    5.54 (+2.7)     1.32 (+3.5)     0.66 (+2.5)    0.91
follows-band       B           180  things    12000    5.85 (+4.3)     1.26 (+2.8)     0.73 (+3.5)    0.00
follows-band       B           365  things    12000    5.81 (+4.1)     1.24 (+2.7)     0.56 (+0.9)    0.00
runs-persistent    B            60  things    10468    6.05 (+4.9)     1.44 (+4.6)     0.75 (+3.7)    1.77
runs-persistent    B           180  things    12000    5.71 (+3.6)     1.30 (+3.3)     0.75 (+3.9)    0.01
runs-persistent    B           365  things    12000    5.78 (+3.9)     1.32 (+3.6)     0.75 (+3.9)    0.00
season             B            60  things     2250    4.80 (-0.4)     1.07 (+0.3)     0.44 (-0.4)    2.93
season             B           180  things    12000    5.83 (+4.2)     1.13 (+1.5)     0.57 (+1.0)    0.28
season             B           365  things    12000    5.66 (+3.3)     1.11 (+1.2)     0.65 (+2.3)    0.00
```

After, the core as judged:

```text
world              family     look  group    tested   p<=.05 (z)      p<=.01 (z)      p<=.005 (z)   big&p<=.05
independent-10     B            60  things      967    5.07 (+0.1)     0.83 (-0.5)     0.52 (+0.1)    1.45
independent-10     B           180  things    11634    4.68 (-1.6)     0.98 (-0.2)     0.41 (-1.3)    0.21
independent-10     B           365  things    12000    4.64 (-1.8)     0.87 (-1.5)     0.38 (-1.9)    0.01
independent-30     B            60  things    11723    4.76 (-1.2)     0.89 (-1.2)     0.43 (-1.1)    0.73
independent-30     B           180  things    12000    5.18 (+0.9)     1.07 (+0.8)     0.49 (-0.1)    0.00
independent-30     B           365  things    12000    5.27 (+1.4)     1.06 (+0.6)     0.57 (+1.2)    0.00
independent-50     B            60  things    12000    5.32 (+1.6)     1.02 (+0.2)     0.54 (+0.6)    0.28
independent-50     B           180  things    12000    5.23 (+1.2)     1.02 (+0.2)     0.58 (+1.3)    0.00
independent-50     B           365  things    12000    5.47 (+2.4)     0.98 (-0.2)     0.57 (+1.2)    0.00
runs               B            60  things    10475    5.15 (+0.7)     1.16 (+1.7)     0.53 (+0.5)    0.85
runs               B           180  things    12000    5.07 (+0.3)     0.97 (-0.3)     0.52 (+0.3)    0.00
runs               B           365  things    12000    5.07 (+0.3)     1.11 (+1.2)     0.58 (+1.3)    0.00
weekly-rhythm      B            60  things    11714    4.85 (-0.8)     0.95 (-0.6)     0.51 (+0.2)    1.58
weekly-rhythm      B           180  things    12000    4.89 (-0.5)     0.92 (-0.8)     0.47 (-0.5)    0.02
weekly-rhythm      B           365  things    12000    5.06 (+0.3)     0.97 (-0.4)     0.47 (-0.5)    0.00
missing-on-state   B            60  things     4001    4.47 (-1.5)     0.57 (-2.7)     0.25 (-2.2)    1.87
missing-on-state   B           180  things    11711    4.77 (-1.1)     0.83 (-1.9)     0.41 (-1.4)    0.20
missing-on-state   B           365  things    12000    5.20 (+1.0)     1.24 (+2.7)     0.64 (+2.2)    0.02
follows-band       B            60  things    11765    5.08 (+0.4)     1.01 (+0.1)     0.59 (+1.3)    0.88
follows-band       B           180  things    12000    4.93 (-0.3)     0.94 (-0.6)     0.53 (+0.5)    0.00
follows-band       B           365  things    12000    4.91 (-0.5)     0.88 (-1.4)     0.43 (-1.0)    0.00
runs-persistent    B            60  things    10468    5.38 (+1.8)     1.06 (+0.6)     0.50 (-0.0)    1.58
runs-persistent    B           180  things    12000    5.12 (+0.6)     1.13 (+1.4)     0.55 (+0.8)    0.01
runs-persistent    B           365  things    12000    5.22 (+1.1)     1.18 (+1.9)     0.63 (+2.1)    0.00
season             B            60  things     2250    4.80 (-0.4)     0.98 (-0.1)     0.44 (-0.4)    2.67
season             B           180  things    12000    5.58 (+2.9)     1.07 (+0.8)     0.57 (+1.2)    0.27
season             B           365  things    12000    5.51 (+2.6)     1.14 (+1.6)     0.55 (+0.8)    0.00
```

The "when" families were not touched by the change: the second tuning run gave all 57,000 of the first run's "when"
families number for number.

## Running it

```
npx tsc --noEmit -p stress/tsconfig.json
bash stress/validate-counted.sh 1 1000 stress/.out/counted-tune
python -I -X utf8 stress/counted_recount.py stress/.out/counted-tune
node stress/counted-calib.mjs stress/.out/counted-tune
```

- `validate-counted.sh` takes the first seed, the number of people, the results folder, the threads and, if wanted,
  the worlds. It keeps any result already in the folder, and the pool refuses to overwrite one: a range is read once.
- The seeds: tuning, 1 to 1000, read as often as needed; the verdict, 500001 to 502000, read once and spent; the
  second read of an undecided cell, 502001 to 510000, unread; a change of method after this verdict is judged again
  whole on 520001 to 522000 (second read 522001 to 530000), then 540001 to 542000 (542001 to 550000).
- On 12 threads the verdict's 14 worlds took about seven minutes.

## Afterwards: the same comparison on a scale of steps (2026-11-12)

The verdict above judged with against without on the reading out of 100. Some of the app's comparisons are measured on
one reading in steps, where 0.4 of a step is the size worth saying. Before any of those may say "a steady pattern", the
same twelve evening things were asked of the next morning's own stress answer, an anchor from 1 to 5, in the nine
worlds with nothing there (`countedSteps.ts`).

- **Its own read:** seeds 560001 to 562000, 2,000 people a world, once, under the first mark above. 26 of the 27 cells
  passed on the first read. The one not decided, streaks in the person whose state carries over, at day 60 (118 people
  of 2,000), passed its second read on seeds 562001 to 570000: 485 of all 10,000, 4.85 in 100, upper bound 5.29.
- **The second read showed more than it was asked.** It ran that whole world on 8,000 further people. Over all 10,000,
  the day-180 cell stands at 594 people: 5.94 in 100, with a 95% interval of 5.5 to 6.4. That cell had passed on 2,000
  people, as the mark allows, and it is over the 5 in 100 the standard aims for.
- **Why.** In that world a chance at or under 0.05 turns up 5.3 to 5.9 times in 100, and one at or under 0.01 turns up
  1.0 to 1.3 times, where an honest check gives 5 and 1. Turning a fortnight's labels round removes most of what
  streaks beside a strongly persistent state do, and not all of it. On the reading out of 100 the ten-point size rule
  covers what is left: the verdict's own cells for that world are 4.1 in 100 at day 60 and 0.2 at day 180. On a scale
  of steps the size worth saying is well inside chance for months, and nothing covers it.
- **What follows.** A comparison on a scale of steps is capped: its strongest standing is a lead. Lifting the cap needs
  a better answer to streaks for that scale, settled on tuning seeds and read on a fresh range (580001 on).

The first read, verbatim (the columns are `countedTune.ts`'s, with the upper bound of the share's 95% interval):

```text
seeds 560001 to 562000; the next morning's stress answer in steps, a size worth saying of 0.4
world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark
independent-10       60    1900     4.84     1.21    2000       58     2.90     3.73        1.55  pass
independent-10      180   23257     5.07     0.98    2000       99     4.95     5.99       37.30  pass
independent-10      365   24000     4.98     1.03    2000       88     4.40     5.39        8.95  pass
independent-30       60   23436     4.94     0.91    2000       83     4.15     5.12       39.35  pass
independent-30      180   24000     5.06     0.96    2000       76     3.80     4.73        3.60  pass
independent-30      365   24000     4.87     1.03    2000        2     0.10     0.36        0.00  pass
independent-50       60   24000     5.05     1.02    2000       99     4.95     5.99       38.45  pass
independent-50      180   24000     5.08     0.94    2000       42     2.10     2.83        1.15  pass
independent-50      365   24000     5.02     1.07    2000        1     0.05     0.28        0.00  pass
runs                 60   20985     4.97     0.86    2000       81     4.05     5.01       34.75  pass
runs                180   24000     5.18     1.07    2000       69     3.45     4.34        6.95  pass
runs                365   24000     5.16     1.07    2000        6     0.30     0.65        0.05  pass
weekly-rhythm        60   23401     4.63     0.88    2000       75     3.75     4.68       37.50  pass
weekly-rhythm       180   24000     4.88     0.94    2000       76     3.80     4.73        6.35  pass
weekly-rhythm       365   24000     4.79     0.98    2000        2     0.10     0.36        0.00  pass
missing-on-state     60    7672     4.87     0.78    2000       52     2.60     3.39       13.20  pass
missing-on-state    180   23435     4.90     0.97    2000       84     4.20     5.17       29.75  pass
missing-on-state    365   23987     4.99     1.08    2000       72     3.60     4.51        7.85  pass
follows-band         60   23482     4.77     0.89    2000       85     4.25     5.23       37.40  pass
follows-band        180   24000     5.06     1.00    2000       72     3.60     4.51        5.20  pass
follows-band        365   24000     5.17     1.05    2000        7     0.35     0.72        0.00  pass
runs-persistent      60   20939     5.65     1.19    2000      118     5.90     7.02       39.05  NOT DECIDED: a second read is needed
runs-persistent     180   24000     5.83     1.27    2000      114     5.70     6.80       26.10  pass
runs-persistent     365   24000     5.85     1.25    2000       46     2.30     3.05        2.20  pass
season               60    4523     4.97     1.06    2000       84     4.20     5.17        6.30  pass
season              180   24000     5.06     1.07    2000       91     4.55     5.55       26.15  pass
season              365   24000     5.26     1.11    2000       71     3.55     4.45        4.85  pass
```

The second read of that one world, in four parts of 2,000 people (no mark is printed: the mark is read on all 10,000 together, as above):

```text
seeds 562001 to 564000; the next morning's stress answer in steps, a size worth saying of 0.4
world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark
runs-persistent      60   20837     5.26     1.06    2000       89     4.45     5.44       37.90  pass
runs-persistent     180   24000     5.50     1.27    2000      121     6.05     7.18       23.75  NOT DECIDED: a second read is needed
runs-persistent     365   24000     5.56     1.23    2000       41     2.05     2.77        2.10  pass
world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark
runs-persistent      60   20847     5.54     0.97    2000       93     4.65     5.66       39.60  pass
runs-persistent     180   24000     5.56     1.21    2000      112     5.60     6.70       24.30  pass
runs-persistent     365   24000     5.64     1.13    2000       40     2.00     2.71        1.45  pass
world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark
runs-persistent      60   20964     5.44     0.98    2000       84     4.20     5.17       38.85  pass
runs-persistent     180   23999     5.56     1.19    2000      123     6.15     7.29       25.25  NOT DECIDED: a second read is needed
runs-persistent     365   24000     5.69     1.28    2000       53     2.65     3.45        2.00  pass
world              look  tested  p<=.05%  p<=.01%  people  pattern  share%  upper95%  lead-only%  mark
runs-persistent      60   20820     5.54     1.20    2000      101     5.05     6.10       39.45  pass
runs-persistent     180   24000     5.85     1.26    2000      124     6.20     7.34       23.65  NOT DECIDED: a second read is needed
runs-persistent     365   24000     5.73     1.33    2000       50     2.50     3.28        1.55  pass
```
