# The stress test, re-judged after three corrections (stage 2)

**Verdict: MATERIAL FAILURE** (read 2026-10-17, once, on fresh validation seeds 200001–202000)
- **S2, a safeguard, failed again:** 3 of 44 established calls across the whole system were false
  (6.8 %, interval 2.3–18.2 %). The safeguard needs the interval's upper end under 5 %, and with 44
  calls even no false call at all would not have shown that.
- **C1 failed again:** both engines' median days to a right call are the 180-day horizon.
- **What the frozen rule says now:** the learning repair does not proceed. No smallest correction inside
  the agreed design can fix S2 or C1 without weakening a safeguard (below), so the decision is the
  owner's. Nothing in the app changed; this folder is offline only.

The criteria are `CRITERIA.md`, unchanged: the frozen block still hashes to `42ef0804…`. The first
verdict, read on seeds 100001–102000, is `RESULTS.md`. Since then:
- the three defects it found were corrected inside the agreed design;
- the values were re-settled on tuning seeds 1–1000 only;
- the verdict was read once on seeds never used before.

Nothing else changed. `world.ts`, `scenarios.ts`, `run.ts`, `stats.ts`, `engineA.ts` and the judge
(`metrics.ts`) are byte for byte as at the first verdict, so the simulated people, the scenarios and the
reading of every criterion are the same.

## The answer in brief

- **The corrections did what they were for.**
  - C2 now passes: the belief intervals covered the truth in 95.2 % of sparse looks (84.9 % before).
  - C14 now passes: early signs were right 92 % of the time, likely calls 92 %, established calls 93 %
    (64 %, 65 % and 92 % before).
  - C3's coverage now holds everywhere (95.5–98.7 %, against 88.7–91.8 % before), and no scenario's
    day-90 coverage fell under 90 % (six did before).
  - The good move stops being offered after day 30 for 27 % of full-step people (40 % before).
  - The benefit per offer rose to 3.1 times today's (2.5 before), with fewer move offers per check-in
    (0.61 against today's 0.72) and none to a move at likely-hurts or worse.
  - Every safeguard that held still holds: no no-effect move established for any of 2,000 people; no
    hurts call under heavy missingness; the day-90 estimate of a full step biased −0.080 under the
    engine's own adaptive chances; the sequence covering the truth at every look in 419 of 419 people;
    no established call in the wrong direction (0 of 97).
- **What still fails has one cause: too few randomized decisions per test.**
  - A move is available about once a day and is offered at most once a day. Even with its test held in
    the queue from day one, a test gathers about 50 randomized decisions in 180 days (sensitivity,
    below).
  - So few calls reach "established" (0.022 per person in the mixed catalogue) that S2 cannot show its
    false share is under 1 in 20, even though the false calls are rare (0.003 per person-year).
  - A full step is established by day 180 for 0.8 % of people, and C1 needs half of them by day 144.
  - The same shortage fails C6, C8, C9, C10, C11 and C13, which need calls within 180 days.
  - C3 also fails, on bias rather than coverage. The day-90 estimate's bias was −0.161 (rhythm), −0.139
    (rebound) and −0.149 (changing context) against a limit of ±0.1. On tuning seeds the same settings
    gave anywhere from +0.005 to −0.286, depending on the scenario and the seeds. The bias sits in the
    people whose test had fewer than five counted offers of the move by day 90: a move whose first results
    happen to look poor is offered less, so its low estimate is never corrected. It is the same shortage
    again, and it is a defect of its own (below).

## The three corrections, inside the agreed design

Each was found by the first verdict, diagnosed on tuning seeds 1–1000 before any change, and corrected
with the smallest change the agreed design allows. Nothing in `CRITERIA.md`, `world.ts`, `scenarios.ts`,
`run.ts`, `metrics.ts` or `engineA.ts` changed.

1. **One pre-declared reading per test.**
   - Before: a test in the queue was a whole move, every reading it targets tested at once, the error
     rate split three ways among them. On tuning seeds, 23 of 52 wrong early signs and 5 of 16 wrong
     likely calls were secondary readings of a move with a real effect on another reading, as were 2 of
     the first verdict's 3 false established calls.
   - Now: a test is one reading of one move, declared as it enters the queue, before any of its own
     sequence. The move's every reading is still recorded at every moment it was available, and the
     test reads its one reading from that record. A reading declared up front is its move's test. One
     test per move at a time, each test once, and the system's error rate shared by the tests the queue
     can hold (0.05 over 10: 0.005 each).
2. **A fair minimum chance for moves outside the test queue.**
   - Before: the moves outside the queue shared one floor of 0.05, so each kept 0.05 divided by the
     number of candidates (often 10–25), and the floors were then mixed with the draw's shares and
     renormalized, which watered every floor down: a running test's move, floored at 0.45, was chosen at
     23 % of its moments, and a move outside the queue at 4.4 %.
   - Now: every floor is kept whole. Each move outside the queue has its own minimum, never divided by
     the other candidates; "nothing extra" and a running test's move keep theirs. When the floors
     together would pass 0.9 they are scaled down together, so every set of chances stays valid. The
     draw shares out the rest.
3. **Everyday intervals that cover.**
   - Before: half the full-step people had fewer than five counted offers of the move by day 90; their estimates
     and intervals came from a handful of decisions whose spread could sit close by chance (one had a
     standard error of 0.00005). On tuning seeds the day-90 bias was −0.16 and coverage 88.8 %. At sparse
     looks the strong research prior held the belief near its own value: 13,916 of 13,936 misses had the
     truth above the interval.
   - Now: a test's spread is never below what the reading's own prediction leaves unexplained over the
     whole record. The effect when done carries the uncertainty of the share done as well as the effect
     of offering. The research prior's vague part was re-tuned (below), so a prior that is wrong for this
     person can no longer hold the interval away from the truth.

## The values, re-settled on tuning seeds 1–1000

| Value | First verdict | Now |
| --- | --- | --- |
| A running test | a whole move, its readings sharing the test | one pre-declared reading of one move |
| System error rate | 0.05, shared by the readings of up to 10 moves (0.00167 each) | 0.05, shared by up to 10 tests (0.005 each) |
| Floor on "nothing extra" | 0.35 | 0.35, kept whole |
| A running test's move | 0.45 when eligible | 0.45 when eligible, kept whole |
| Every other move | 0.05 shared by all candidates | 0.05 each, its own |
| Floors together | mixed with the draw's shares, then renormalized | first, scaled together only past 0.9; the draw shares the rest |
| The prior's vague part | weight 0.1, spread 0.75 steps | weight 0.2, spread 1.0 steps |
| A test's spread | its own decisions, floored by the arms' sizes | also never below the reading's prediction residual over the whole record |
| The effect when done | its interval from the effect of offering alone | its interval also carries the uncertainty of the share done |
| Likely rung | sequence error rate 0.0005, belief 0.95 | sequence at the test's own share (0.005), belief 0.95 |
| Early rung | sequence error rate 0.01, belief 0.8 | unchanged |
| Established | at least 15 decisions per arm and 20 days, the sequence tightest near 120 days | unchanged |
| Evidence half-life | 120 days | unchanged |
| A test's time in the queue | 45 days, or 135 once it reaches likely-helps | unchanged |
| Worthwhile margin | 0.25 steps, provisional; the owner confirms it | unchanged |

How each new value was settled, on tuning seeds only (1,000 people for no effect and the mixed catalogue,
500 for the rest; engine A's reference on seeds 1–200: 0.725 move offers per check-in, 0.0012 benefit per
offer):

| Setting | C2 belief coverage | S5 day-90 bias | Likely calls, right | Benefit per offer | Move offers per check-in | Stops learning |
| --- | --- | --- | --- | --- | --- | --- |
| Corrections, first verdict's values | 84.5 % | −0.039 | 1 of 1 | 0.0034 | 0.616 | 29.6 % |
| Vague part 0.15 at 1.0 | 88.5 % | −0.050 | 1 of 1 | 0.0035 | 0.616 | 29.8 % |
| **Vague part 0.2 at 1.0** | 91.4 % | +0.005 | none | 0.0039 | 0.616 | 28.3 % |
| Vague part 0.3 at 1.0 | 92.8 % | −0.093 | not run | 0.0042 | 0.615 | 27.4 % |
| 0.2 at 1.0, likely at 0.002 | 91.4 % | +0.005 | 5 of 5 | 0.0039 | 0.616 | 28.3 % |
| **0.2 at 1.0, likely at 0.005** | 91.4 % | +0.005 | 11 of 11 | 0.0039 | 0.616 | 28.3 % |
| the same, each other move at 0.08 | not run | −0.076 | 11 of 14 | 0.0033 | 0.641 | 30.0 % |

- The vague part: 0.2 is the smallest weight tried that gives C2 its 90 %. 0.3 gives more room on C2,
  but its day-90 bias, −0.093, sits close to S5's limit, and a safeguard comes first.
- The likely rung: with each test's error share now 0.005, the first verdict's 0.0005 had made likely
  stricter than established, so tests went from early sign straight to established and almost no likely
  call was made. At the test's own share, likely is the same sequence bar as established, reached with
  fewer decisions; established adds its 15 per arm and 20 days.
- The fair minimum: 0.08 each was worse on every count (more burden, less benefit, a worse day-90 bias, a
  worse likely calibration, no fewer moves that stop being offered), so it stays at 0.05.
- With the settled values, on tuning seeds: S1 0 of 1,000; S4 0 of 500 hurts calls under heavy
  missingness, missingness adding −0.043 of bias; S5 +0.005, the sequence covering the truth at every look in 431 of 431; C2
  91.4 %; C3's day-90 bias +0.005 (base), −0.061 (rhythm), −0.092 (rebound) and 0.000 (changing context),
  coverage 96.6–98.5 %. The validation seeds then read C3's bias lower, −0.080 to −0.161: the brief above
  and the report's part 6 say why.

## The judge's output, verbatim

```
PASS S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.2] (0/2000)
FAIL S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue)
      6.8% [2.3, 18.2] (3/44); false established per person-year 0.003; established calls per person 0.022
PASS S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction: the only path to established in engine B is the confidence sequence on randomized decisions (engineB.call); no observational estimate exists in the prototype. Checked in the code, and every established call in every run comes from a test with randomized decisions on both arms (counted below).
PASS S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias with missingness -0.037, without -0.012, added -0.025
PASS S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.080 (474 people); coverage at every look 100.0% [99.1, 100.0] (419/419)
FAIL C1 better than today: full-step median days to a right established ≤ 0.8 × today's to a right Holds up; half-step share ≥ today's
      B median 180 days (80th 180), A median 180 days; half step: B 0.0% [0.0, 0.8] (0/500), A 0.0% [0.0, 0.8] (0/500); A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
PASS C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 95.2% [95.0, 95.3] (84662/88962); sequence coverage 100.0% [94.9, 100.0] (72/72)
FAIL C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.080, covers 98.7% [97.3, 99.4] (468/474); rhythm-large: bias -0.161, covers 97.5% [95.6, 98.5] (462/474); rebound-large: bias -0.139, covers 96.7% [94.6, 97.9] (462/478); context-large: bias -0.149, covers 95.5% [93.2, 97.0] (443/464)
PASS C4 is S3
      see S3
PASS C5 is S5
      see S5
FAIL C6 repeated looks and stopping: S1 under daily looks; little difference established for no effect by day 180 in at least half (move eligible ≥ 3 a week); called for a full step in fewer than 1 in 20
      S1 holds; little difference, no effect: 0.0% [0.0, 3.3] (0/111); little difference at a full step: 0.0% [0.0, 0.8] (0/500)
PASS C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.614, A 0.723; offers to low moves 0.0% [0.0, 0.0] (0/129663); benefit per offer B 0.0032, A 0.0010
FAIL C8 pooling without false sameness: the no-effect partner established in fewer than 1 in 20; the real one established by day 180 in ≥ 80%; pooling shortens the median time to likely
      no-effect partner 0.0% [0.0, 0.8] (0/500); real one 0.0% [0.0, 0.8] (0/500); median days to likely with pooling 180, without 180
FAIL C9 context without fragmenting: with-her call (likely+) in ≥ 70%; without-her helps (likely+) in fewer than 1 in 10; with no true difference, a context-specific call in fewer than 1 in 20 per context
      with her 0.0% [0.0, 0.8] (0/500); without her helps 0.0% [0.0, 0.8] (0/500); no difference: withHer 0.0% [0.0, 0.8] (0/500), office 0.0% [0.0, 0.8] (0/500), weekend 0.0% [0.0, 0.8] (0/500), shortSleep 0.0% [0.0, 0.8] (0/500)
FAIL C10 a misleading prior discounted: established helps in fewer than 1 in 20; by day 120 within 0.25 of 0 in ≥ 80%; against harm, believed not to help by day 120 in ≥ 80%
      prior +1 vs 0: established helps 0.1% [0.0, 0.3] (1/2000), within 0.25 at day 120 23.0% [21.2, 24.9] (460/2000); prior +1 vs −0.5: below 0 at day 120 55.2% [50.8, 59.5] (276/500)
FAIL C11 windows kept apart: next-check-in helps established in fewer than 1 in 20; next-morning established by day 180 in ≥ 70%; multi-day estimate within ±0.15; no window's data in another's (code)
      next check-in 0.0% [0.0, 0.8] (0/500); next morning 0.2% [0.0, 1.1] (1/500); multi-day bias -0.038 (65 people); windows are separate tests by key in engine B
PASS C12 is S4
      see S4
FAIL C13 change over time: stepped down within 60 days of the change in ≥ 80%; an unchanging effect kept to day 180 in ≥ 90% of those who reached it
      stepped down NaN% [NaN, NaN] (0/0) (of people established before day 120); kept 100.0% [51.0, 100.0] (4/4)
PASS C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 91.8% [83.2, 96.2] (67/73) (promise 67%); likely 91.7% [74.2, 97.7] (22/24) (promise 80%); established 93.2% [81.8, 97.7] (41/44) (promise 95%)
FAIL C15 is S1 with S2
      see S1 and S2

FAILURE HUNT
  confidently wrong (established in the wrong direction), every scenario: 0 of 97 established calls
  stops learning (a full-step move eligible but never offered after day 30): 27.3% [23.5, 31.4] (134/491)
  rebound taken for an effect (no-effect move established, strong regression to the mean): 0.0% [0.0, 0.2] (0/2000)
  rediscovered false positives (the same no-effect move established twice), all no-effect scenarios: 0 in 22000 people
  falsely narrow uncertainty (day-90 coverage under 90%): none
  prediction contaminating the causal estimate (a deliberately poor, constant prediction): day-90 bias -0.094, coverage 97.1% [95.1, 98.2] (464/478)

SPEED
  a full step, as the scenario stands: established by day 180 in 0.8% [0.3, 2.0] (4/500), median 156 days among them; likely by day 180 in 0.4% [0.1, 1.4] (2/500), median 136.5 days; offers of the move 19, decisions per arm at day 180 12 / 27
  a full step on the move the queue tests first (sensitivity): established by day 180 in 3.0% [1.8, 4.9] (15/500), median 157 days among them; likely by day 180 in 2.4% [1.4, 4.1] (12/500), median 135.5 days; offers of the move 26, decisions per arm at day 180 18 / 25
  half a step: established by day 180 in 0.0% [0.0, 0.8] (0/500); likely by day 180 in 0.0% [0.0, 0.8] (0/500); offers of the move 17, decisions per arm at day 180 12 / 27

VERDICT: MATERIAL FAILURE
```

## Recounted from the raw runs

Every headline number above was recounted from the raw run files by `recount.py`, written separately
from the judge, in another language, from the criteria's own words. Each matches the judge exactly:

```
S1 null: established either direction 0.0% [0.0, 0.2] (0/2000); pass if upper < 5%: True
S2 mixed: false 6.8% [2.3, 18.2] (3/44); per person-year 0.003; calls per person 0.022; pass: False
   false: glass-of-water|focus|nextBlock  hurts truth 0.00 day 177
   false: glass-of-water|mood|nextBlock  helps truth 0.00 day 71
   false: glass-of-water|mood|nextBlock  helps truth 0.00 day 109
C14 early: right 91.8% [83.2, 96.2] (67/73); promise 67%; pass: True
C14 likely: right 91.7% [74.2, 97.7] (22/24); promise 80%; pass: True
C14 established: right 93.2% [81.8, 97.7] (41/44); promise 95%; pass: True
S4: hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias missing -0.037, base -0.012, added -0.025
S5 large: day-90 bias -0.080 (474 people); CS covers at every look 100.0% [99.1, 100.0] (419/419)
C1: B median 180.0 (by 144: 1/500), A median 180.0; half step B 0.0% [0.0, 0.8] (0/500) A 0.0% [0.0, 0.8] (0/500); A null Holds-up 0.0% [0.0, 0.2] (0/2000)
C7: move offers/check-in B 0.614 A 0.723; to low moves 0.0% [0.0, 0.0] (0/129663); benefit/offer B 0.0032 A 0.0010
C2: belief intervals 95.2% [95.0, 95.3] (84662/88962) (needs 90%); sparse-large CS at every look 100.0% [94.9, 100.0] (72/72)
C3 large: bias -0.080, covers 98.7% [97.3, 99.4] (468/474)
C3 rhythm-large: bias -0.161, covers 97.5% [95.6, 98.5] (462/474)
C3 rebound-large: bias -0.139, covers 96.7% [94.6, 97.9] (462/478)
C3 context-large: bias -0.149, covers 95.5% [93.2, 97.0] (443/464)
C6: little difference, no effect (eligible 3+/week) 0.0% [0.0, 3.3] (0/111); at a full step 0.0% [0.0, 0.8] (0/500)
C8: no-effect partner 0.0% [0.0, 0.8] (0/500); real one 0.0% [0.0, 0.8] (0/500); median days to likely pooled 180.0, unpooled 180.0
C9: with her 0.0% [0.0, 0.8] (0/500); without her helps 0.0% [0.0, 0.8] (0/500); no difference: withHer 0.0% [0.0, 0.8] (0/500), office 0.0% [0.0, 0.8] (0/500), weekend 0.0% [0.0, 0.8] (0/500), shortSleep 0.0% [0.0, 0.8] (0/500)
C10: established helps 0.1% [0.0, 0.3] (1/2000); within 0.25 at day 120 23.0% [21.2, 24.9] (460/2000); below 0 vs harm 55.2% [50.8, 59.5] (276/500)
C11: next check-in helps 0.0% [0.0, 0.8] (0/500); next morning 0.2% [0.0, 1.1] (1/500); multi-day bias -0.038 (65)
C13: stepped down nan% [nan, nan] (0/0); kept 100.0% [51.0, 100.0] (4/4)
hunt, stops learning: 27.3% [23.5, 31.4] (134/491)
speed, full step: established by 180 0.8% [0.3, 2.0] (4/500), median among them 156.0; offers of the move 19.0; per arm 12.0/27.0
hunt, confidently wrong: 0 of 97 established calls
```

## Sensitivity, not judged: the test held in the queue from day one

These ran on tuning seeds 501–1000, 500 people each, with the full-step test pinned
(`'{"pinned":["walk-ten|stress|nextBlock"]}'`). They show the most this design can do at Life Mirror's
cadence, with the right test running from the first day.

| Truth | Established by day 180 | By day 144 | Likely | Early sign | Offers of the move (median) | Decisions per arm at day 180 (median) | Sequence half-width at day 180 (median) | Day-90 bias, coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a full step | 15.2 % (76/500), all right | 7.4 % | 5.8 % | 18.6 % | 41 | 28 / 23 | 0.93 steps | 0.027, 98.0 % |
| half a step | 2.2 % (11/500), all right | 1.2 % | 0.4 % | 3.4 % | 42 | 29 / 22 | 0.89 steps | 0.053, 97.4 % |
| no effect | none (0/500) | none | none | none | 43 | 29 / 22 | 0.89 steps | 0.057, 97.8 % |

- The first verdict's pinned run established 8.0 % at a full step. The corrections nearly doubled it,
  mostly because a running test's floor is now kept whole.
- At a full step the effect of offering is 0.63 steps, and at day 180 the sequence is still about one
  and a half times as wide (0.93; 10th–90th percentile 0.77–1.19). It narrows roughly with the square
  root of the decisions, so half the people established by day 144 would take about three times as many
  decisions per test.

## The report, in the plan's eight parts

1. **The scenarios:** the same 31 as the first verdict (`scenarios.ts`, unchanged), at the same sizes:
   2,000 people for every no-effect scenario and the mixed catalogue, 500 for the rest. Engine A ran
   where C1 and C7 read it: no effect (2,000), a full step and half a step (500 each).
2. **The criteria:** `CRITERIA.md`, unchanged since they were frozen.
3. **Today's engine:** it concluded nothing, again. In its three runs on these seeds (2,000 people with no
   effect, 500 at a full step, 500 at half a step) the card of the move with the known truth reached no
   tier for anyone, and no card of any move reached Holds up. It made 0.72 move offers per check-in, at
   0.0010 steps of benefit per offer.
4. **The proposed engine:** the judge's output above.
5. **The settled values:** the table above.
   - The realistic time to establish a full step: the median and the 80th percentile are both past day
     180, even with the test held in the queue from day one. By extrapolation it is a year or more of
     focused testing per move, against the target of about three weeks.
   - The smallest effect established by day 180 in at least 80 % of people: none.
6. **Design defects, with their smallest corrections.**
   - Corrected since the first verdict, inside the agreed design: one pre-declared reading per test; a
     fair minimum chance outside the queue; everyday intervals that cover (above).
   - Found by this verdict, not yet corrected: the day-90 estimate is biased low when the adaptive chances
     leave a test with very few offers (C3). The people with fewer than five counted offers by day 90
     carry the bias; those with ten or more are close to the truth. Its smallest correction, to be settled
     on tuning seeds before any further verdict, is an estimator built for adaptively collected data, so
     that a test starved early is not read as a smaller effect. It adds no decisions, so it cannot change
     S2 or C1.
7. **Does it clearly outperform today's engine?**
   - On the person's benefit, yes: 3.1 times today's benefit per offer, fewer move offers, none to a
     move at likely-hurts or worse.
   - On safety per test, yes: no no-effect move established, no established call in the wrong direction,
     calibrated early signs, likely and established calls.
   - On system-wide safety (S2), it cannot show its false share is under 1 in 20: too few calls.
   - On speed, as C1 defines it, no: neither engine reaches established for most people within 180 days.
8. **Is it safe to proceed to implementation?** Not on the frozen rule. A failed safeguard and a failed C1
   are a material failure, and the decision is the owner's.

## What remains, and the decision it needs

Every remaining failure needs more randomized decisions per test than Life Mirror's cadence gives:
- **S2 needs more established calls.** With no false call at all, the judge's interval needs 73
  established calls in the mixed catalogue's 2,000 people to fall under 5 %; with the 3 false calls seen
  here, 173. The design made 44.
- **C1 needs about three times the randomized decisions per test, with the right test running from the
  first weeks.** With the test held in the queue from day one, about 50 decisions in 180 days left the
  sequence about one and a half times as wide as the effect of offering.
- **C6 needs the sequence narrower than the worthwhile margin** (about ±0.16 on the effect of offering):
  out of reach in 180 days at this cadence.
- **C8, C9, C10, C11 and C13 each need calls or beliefs to settle within 180 days, or by day 120.**

Each smallest correction inside the agreed design was checked against them:
- **The floors and the queue:** the pinned sensitivity above is the most any setting of them can give,
  and it does not reach C1.
- **The error rate:** loosening it would buy calls by weakening S1 and S2's protection, which the agreed
  design forbids.
- **The vague part:** a vaguer prior moves C10 a little and brings S5's bias toward its limit (−0.093 at
  0.3).
- **The estimator for adaptive data:** it is C3's own correction, but it adds no decisions, so S2 and C1
  stay where they are.
- **The opt-in learning week:** it runs two or three tests at every eligible check-in, and it is the only
  part of the agreed design that raises the data rate. Its mechanics are not yet settled (how often it
  runs, which tests it takes, what it asks of the owner), so it cannot be simulated without the owner's
  decision.

So the decision is the owner's. The fresh seeds the criteria name for the next re-judgement,
300001–302000, are kept unread for a run that could change the outcome.

## Provenance

- Engine B's verdict runs used `engineB.ts` with SHA-256
  `644dda9a28560a999274df507140cedb44359923c7661466c38ecbfd5139771e`.
- The other files at the verdict:

  | File | SHA-256 |
  | --- | --- |
  | `engineA.ts` | `f8445e8168d595614c2b30ee1f83ad8fb449be9cfc9de1bca485c60bcb0a1c8a` |
  | `world.ts` | `7d8d04a08fae607ea7fbf55b3fa08beecc8fcad6e662988a0bf1812d1533d6c3` |
  | `run.ts` | `06dcfa345ba2c075410cc7d378185a37e35f903b203c57f1c8eb1d39aa2f60af` |
  | `scenarios.ts` | `a4d0725c5411afd1ef96ba94d671e54ab8a9b7b9965d6bfd849db11f60591c91` |
  | `stats.ts` | `fe07b30b4da5f0deba45679dd9cd4fa2a4929041ec26fb0bbe1bd592583bf331` |
  | `metrics.ts` | `5730089c9782897024ef67d745100172d48f41e716c3bcf8a9d34776c377db9f` |

  The first five are byte for byte as at the first verdict (`RESULTS.md`), and `metrics.ts` is unchanged
  since its commit.
- Engine A replays `src/` exactly as committed at the first verdict; nothing in `src/` has changed since.
- Run times, on 4 worker threads, part of the time sharing the machine with each other:
  - B: 140 minutes for all 34 runs (35,000 people);
  - A: 147 minutes for 2,000 people with no effect, 34 for 500 at a full step, 33 for 500 at half a step.
- The raw results (about 30 MB) are not committed. The runs are fully seeded:
  `bash stress/validate.sh 200000 stress/.out/val-200000` regenerates them exactly from this code.
