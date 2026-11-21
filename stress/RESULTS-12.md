# The steady pattern hold's simulation: the verdict (2026-11-21)

**PASS at N = 43.** Read once on the verdict's seeds, 700001 to 702000, which no earlier run had read. The criteria
were frozen anew on 2026-11-20 at the owner's word, before those seeds were read, and N = 43 was written into the
private plan before the run. The criteria are kept in the private plan; their text's SHA-256 is
`9eef7e117c036a111758dd52119e4a7babdb7019e673842427f9e3585f0e0c2c`. They are the first criteria
(`762ffba25a054367bb457f405925fbf0b6705f996c5b90859e29e8f89b8141b5`, read in `RESULTS-10.md`) but for the range of
the hold, now 1 to 60 days where the first stopped at 30. This file describes the public code and what it counted.

## What was run

- **The code under test** is the app's own `comesBefore` (`src/beforeDays.ts`) at commit 89f5eea, unchanged since
  709cb16: its sixteen pairs, their family and their interval rule, worked out for every day up to day 180 from the
  record as it stood that day.
- **Everything else is as `RESULTS-10.md` describes:** the simulated people, the worlds, a useless pair, held at N,
  and the shortcut, checked against `comesBefore` itself on every tenth day of every fiftieth person. No difference
  stopped the run.

Run with `bash stress/validate-batch2.sh hold 700001 2000 stress/.out/hold-700000` (124 minutes on 12 threads),
read with `node stress/.out/holdJudge.mjs stress/.out/hold-700000 43`, and counted again by
`python -B -I -X utf8 stress/batch2_recount.py hold stress/.out/hold-700000 43`, which shares no code with the
judge. The two agree.

## How N was chosen

On the tuning seeds, 1 to 1000 (the run `RESULTS-10.md` reads), N is the smallest hold from 1 to 60 days at which
every useless world has at most 30 of its 1,000 people shown. That is 43: plain 10, streaks 20, sparse 18, rhythm
15 and season 27. The judge as committed at 89f5eea, which reads holds up to 60 days, chose it, and the recount
gives the same counts at 43.

## The verdict, of 2,000 people a world

| World | Shown at N = 43 | In 100, with its interval | Shown at N = 1 | Criterion 1 |
|---|---|---|---|---|
| plain | 18 | 0.90 (0.57 to 1.42) | 623 | passes |
| streaks | 45 | 2.25 (1.69 to 3.00) | 880 | passes |
| sparse | 28 | 1.40 (0.97 to 2.02) | 424 | passes |
| rhythm | 25 | 1.25 (0.85 to 1.84) | 724 | passes |
| season | 65 | 3.25 (2.56 to 4.12) | 1,176 | passes |

The first criterion asks that, in each useless world, fewer than 1 person in 20 be shown. On 2,000 people a world
passes at once at 80 or fewer, so no world was read a second time.

The second criterion asks that the real stress pair of `fifteen-points` still be shown by day 180 for at least two
thirds as many people as at N = 1. It is shown for 1,432 people at N = 43 and 1,747 at N = 1: 82.0 percent.

## People shown at each N, of 2,000 a world

| N | plain | streaks | sparse | rhythm | season | fifteen-points | ten-points | own | own-persistent |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 623 | 880 | 424 | 724 | 1,176 | 1,821 | 1,451 | 680 | 824 |
| 7 | 219 | 346 | 246 | 282 | 604 | 1,716 | 1,113 | 275 | 368 |
| 14 | 118 | 192 | 145 | 158 | 363 | 1,657 | 938 | 142 | 218 |
| 21 | 68 | 114 | 92 | 101 | 243 | 1,611 | 831 | 89 | 142 |
| 30 | 43 | 73 | 56 | 63 | 140 | 1,540 | 728 | 54 | 86 |
| 43 | 18 | 45 | 28 | 25 | 65 | 1,441 | 599 | 28 | 53 |
| 50 | 12 | 33 | 24 | 11 | 45 | 1,392 | 542 | 24 | 40 |
| 60 | 7 | 23 | 14 | 8 | 23 | 1,297 | 459 | 18 | 29 |

The first five columns are the useless worlds. `fifteen-points`' own stress pair, the real one, is shown for
1,747 at N = 1, 1,684 at N = 7, 1,639 at N = 14, 1,597 at N = 21, 1,529 at N = 30, 1,432 at N = 43, 1,384 at
N = 50 and 1,291 at N = 60.

## Reported, not judged

- **`fifteen-points`:** a median of 48 days from the stress pair's first day at a pattern to its first day held,
  over the 1,432 people it is held for; 56 of its 1,455 held runs fell back before day 180.
- **`ten-points`:** its stress pair is shown for 584 people at N = 43, against 1,207 at N = 1.
- **`own`:** people with their own evenings. 28 people shown, 29 pairs held, and 19 held runs fell
  back before day 180.
- **`own-persistent`:** the same with persistent people. 53 people shown, 53 pairs held, and
  42 held runs fell back.

**Said plainly:** looked at every day for 180 days, a useless pair now reads as a steady pattern on some day for
about 1 to 3 people in 100, where the app as it stands shows one for 21 to 59 in 100. A real pair that moves the
next morning by about fifteen points is still called one for 72 people in 100, about seven weeks after it
first reads as a pattern. A pair of about ten points is called one about half as often as before.

## What this does not show

- Nothing here ran on a real record.
- The simulation stops at 180 days. Over a longer record, more chance runs reach any N.
- Only the sixteen pairs of "What comes before your days" were simulated, the one "Evenings like this one" shows
  among them. No other standing is judged here.
