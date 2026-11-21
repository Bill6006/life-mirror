# The steady pattern hold's simulation: the tuning (2026-11-20)

**NO N CHOSEN: the build stops for the owner.** Read on the tuning seeds 1 to 1000, against criteria frozen before
any of this code was written. The criteria are kept in the private plan; their text's SHA-256 is
`762ffba25a054367bb457f405925fbf0b6705f996c5b90859e29e8f89b8141b5`. This file describes the public code and what
it counted.

Nothing of the hold is built: "What comes before your days" and "Evenings like this one" say their standings as
before. The verdict's seeds were not read.

## What was run

- **The code under test** is the app's own, at commit 709cb16: "What comes before your days" (`comesBefore`,
  `src/beforeDays.ts`), its sixteen pairs, their family and their interval rule, worked out for every day up to day
  180 from the record as it stood that day.
- **A simulated person** is `stress/world.ts`'s, 180 days long.
- **Held at N:** a pair whose standing was a pattern on that day and on each of the N − 1 days before it. A person
  counts as shown at N when any of the sixteen pairs is held on at least one day from day 15 to day 180.
- **A useless pair:** the person's evening check-ins are another simulated person's (the same seed plus
  5,000,000), day for day and every answer, so no evening says anything about the person's next morning.
- **The worlds** are in `stress/holdSim.ts`: five useless (`plain`, `streaks`, `sparse`, `rhythm`, `season`); two
  where a stress evening at its top two phrases lowers the next morning by about fifteen points or about ten
  (`fifteen-points`, `ten-points`); and two with the person's own evenings (`own`, `own-persistent`).
- **The shortcut:** each day's standings come from `pairStandings`, which is checked against `comesBefore` itself
  on every tenth day of every fiftieth person; a difference stops the run, and none did. Before any number was
  read, `stress/batch2Proof.ts` worked out every day of the first people by `comesBefore` alone and compared the
  runs at a pattern pair by pair: `plain` 3 people, `fifteen-points` 3, `own` 2, all alike.

Run with `bash stress/validate-batch2.sh hold 1 1000 stress/.out/hold-tune` (64 minutes on 12 threads) and read
with `node stress/.out/holdJudge.mjs stress/.out/hold-tune`. Counted a second time at N = 1, 7, 14, 21 and 30 by
`stress/batch2_recount.py`, which shares no code with the judge. The two agree on every count they share.

## How N is chosen

The smallest N from 1 to 30 at which every useless world has at most 30 of its 1,000 people shown. None does.

## People shown at each N, of 1,000 a world

| N | plain | streaks | sparse | rhythm | season | fifteen-points | ten-points | own | own-persistent |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 312 | 472 | 225 | 387 | 607 | 930 | 757 | 348 | 436 |
| 2 | 264 | 381 | 215 | 319 | 535 | 921 | 722 | 280 | 364 |
| 3 | 225 | 321 | 200 | 266 | 469 | 913 | 690 | 231 | 307 |
| 4 | 191 | 268 | 182 | 230 | 408 | 906 | 664 | 194 | 268 |
| 5 | 152 | 231 | 166 | 194 | 376 | 900 | 646 | 177 | 239 |
| 6 | 133 | 210 | 149 | 169 | 348 | 891 | 631 | 148 | 222 |
| 7 | 117 | 188 | 137 | 152 | 318 | 888 | 606 | 134 | 201 |
| 8 | 100 | 170 | 122 | 132 | 282 | 886 | 593 | 118 | 184 |
| 9 | 95 | 153 | 115 | 121 | 257 | 878 | 580 | 110 | 161 |
| 10 | 88 | 135 | 109 | 108 | 241 | 870 | 569 | 104 | 149 |
| 11 | 77 | 125 | 102 | 100 | 233 | 864 | 563 | 96 | 133 |
| 12 | 66 | 113 | 94 | 95 | 213 | 857 | 548 | 88 | 126 |
| 13 | 65 | 107 | 84 | 85 | 190 | 854 | 543 | 80 | 113 |
| 14 | 61 | 101 | 78 | 74 | 175 | 849 | 531 | 71 | 105 |
| 15 | 49 | 93 | 73 | 70 | 164 | 842 | 518 | 69 | 98 |
| 16 | 45 | 86 | 65 | 64 | 150 | 839 | 501 | 68 | 88 |
| 17 | 40 | 79 | 61 | 57 | 141 | 836 | 493 | 66 | 82 |
| 18 | 39 | 74 | 57 | 54 | 129 | 833 | 482 | 64 | 79 |
| 19 | 37 | 71 | 56 | 49 | 119 | 829 | 473 | 60 | 75 |
| 20 | 34 | 67 | 56 | 46 | 115 | 824 | 466 | 59 | 72 |
| 21 | 34 | 64 | 53 | 45 | 105 | 818 | 454 | 55 | 65 |
| 22 | 31 | 56 | 51 | 43 | 97 | 812 | 438 | 53 | 61 |
| 23 | 31 | 55 | 48 | 42 | 92 | 812 | 427 | 49 | 59 |
| 24 | 31 | 50 | 46 | 41 | 87 | 808 | 419 | 45 | 58 |
| 25 | 30 | 48 | 43 | 40 | 84 | 807 | 407 | 44 | 58 |
| 26 | 28 | 45 | 41 | 38 | 82 | 803 | 400 | 44 | 55 |
| 27 | 27 | 41 | 36 | 37 | 80 | 800 | 397 | 41 | 53 |
| 28 | 26 | 38 | 36 | 34 | 75 | 799 | 389 | 41 | 50 |
| 29 | 23 | 37 | 34 | 33 | 65 | 796 | 387 | 39 | 48 |
| 30 | 23 | 33 | 34 | 33 | 62 | 790 | 381 | 37 | 47 |

The first five columns are the useless worlds. At N = 30 four of them are at 34 or under and `season` is at 62.

`fifteen-points`' own stress pair, the real one, is shown for 895 people at N = 1, 865 at N = 7, 833 at N = 14,
807 at N = 21 and 784 at N = 30.

**Said plainly:** looked at every day for 180 days, a useless pair reads as a steady pattern on at least one day
for 225 to 607 people in 1,000 as the app stands (N = 1). A hold cuts that fast at first and then slowly: a useless run
at a pattern usually lasts a day or two, but about one in a hundred lasts six weeks or more. `season` holds longest.
Its mornings follow a six-month curve and its borrowed evenings drift on their own. Two slow drifts can stand side
by side for weeks, and the core's check, which turns its labels round within 14-day stretches, cannot tell that from
a pattern.

## What this does not show

- Nothing here ran on a real record.
- The simulation stops at 180 days. Over a longer record, more chance runs reach any N.
- What a hold longer than 30 days would give is not judged here; the criteria stop at 30.
