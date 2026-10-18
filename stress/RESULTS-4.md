# The design search (stage 2, tuning seeds only)

**Outcome (2026-10-18, tuning seeds 1–1000 only): the strongest design inside the agreed principles holds every
safeguard that these runs can judge and every check on honesty, and fails every criterion that asks how soon a call
is reached. S2 cannot be judged on so few calls. No verdict was read; seeds 300001–302000 stay unread.**

- The owner asked for this search before any change to the pass marks: the strongest reasonable design under the
  existing safeguards, verified rather than assumed.
- 23 designs were run on C1's full step, and the strongest design that keeps every agreed principle was then run
  across all 34 scenarios the judge reads and judged by `metrics.ts`, unchanged.
- **Speed cannot be bought at Life Mirror's cadence.**
  - When the engine has to find the right test itself, the best design established a full step by day 180 for
    7.9 % of people, and only with every invitation accepted. C1 needs half of them by day 144.
  - Handing the engine the right test from day one, which no real queue can better, gave 30 to 40 % by day 144 at
    the realistic opt-in of one week in two, across five variants (33.5 % with the final design). C1 is reached
    only with that test known in advance and nearly every week accepted (54.7 %, a median of 133 days).
  - C6's "established little difference" stays out of reach for any design, as RESULTS-3 showed by arithmetic.
- **What the strongest design does hold, on 1,000 people in each scenario:**
  - no move with no effect established in either direction (0 of 1,000);
  - no established call in the wrong direction in any scenario (0 of 402);
  - every rung of the ladder right at least as often as it promises (early sign 72 of 72, likely 6 of 6,
    established 63 of 63);
  - honest uncertainty when sparse (92.2 % coverage) and unbiased estimates (day-90 bias within ±0.043);
  - fewer move offers per check-in than today's engine (0.573 against 0.721) and about twelve times its benefit
    per offer (0.0128 against 0.0011 steps).
- **S2 is not shown either way:** 0 of the mixed catalogue's 63 established calls were false. The criteria need the
  interval's upper end under 5 %, and 63 calls cannot get there even with none false (5.7 %).
- So the frozen rule stands: the learning repair proceeds only if every safeguard and claim passes on validation
  seeds. What happens next is the owner's decision, reported to them with this evidence. The owner has made no
  learning-engine choice.

The criteria are `CRITERIA.md`, unchanged: the frozen block still hashes to `42ef0804…`. The earlier write-ups are
`RESULTS.md` and `RESULTS-2.md` (the two verdicts) and `RESULTS-3.md` (the learning week on tuning seeds).

## What was tried

Each change is a setting of `engineB.ts`, off by default. With every one off, engine B gives the earlier results
person for person: 30 people each in the full step with the learning week, the mixed catalogue with it, and the
second verdict's no-effect run were replayed and compared byte for byte after each change.

1. **Every test declared on day one** (`declareAll`, requirement 1). Each test's confidence sequence counts every
   randomized decision from day one, whether or not the queue is running it. The error rates, the lower rungs'
   included, are shared by the catalogue's 119 tests instead of the queue's cap of 10.
2. **The error rate shared by research** (`alphaWeights: 'research'`): each test's part in proportion to the effect
   research expects of its move, fixed before any data (weighted Bonferroni), never under a 0.05-step share.
3. **The queue by expected benefit** (`queueScore: 'benefit'`), so research's most promising tests run first.
4. **Early signs keep their place** (`keepEarly`), and tests with none leave after 14 days instead of 45.
5. **Learning weeks back to back:** the next invitation when a week ends, and 7 days after a "Not now" (`gapNo`).
   Still opt-in each time.
6. **The floors:** 0.01 or 0.02 for moves outside the queue, and the running test's floor raised to 0.55, the most
   the chances allow beside "nothing extra".
7. **The probes that could say yes:** the right test held from day one, at the realistic opt-in (0.5), at every
   invitation accepted (1.0), and with a week that never ends.

Every design and its result:

| Design | The test | What changes | Week opt-in | Week days per person | Right established by day 144 | By day 180 | Median days | Decisions per arm at day 180 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | finds its own test | every test declared on day one; weeks as settled on 2026-10-17 (two tests, 14 days apart) | 0.5 | 34.3 | 0.8 % [0.4, 1.6] | 0.9 % [0.5, 1.7] | 180 | 15 / 27 |
| A2 | finds its own test | declared on day one; tests leave after 14 days unless an early sign; weeks back to back, one test | 0.5 | 80.6 | 0.1 % [0.0, 0.6] | 0.1 % [0.0, 0.6] | 180 | 13 / 25 |
| A3 | finds its own test | as A2, one test at a time outside the weeks too | 0.5 | 72.6 | 0.0 % [0.0, 0.4] | 0.0 % [0.0, 0.4] | 180 | 13 / 29 |
| A4 | finds its own test | as A2, no weeks | none | 0.0 | 0.3 % [0.1, 0.9] | 0.3 % [0.1, 0.9] | 180 | 11 / 29 |
| A5 | finds its own test | as A3, a week that never ends | every day | 180.0 | 1.1 % [0.6, 2.0] | 1.2 % [0.7, 2.1] | 180 | 16 / 26 |
| B1 | finds its own test | research first: the queue by expected benefit, the error rate shared by research; 14-day tests; weeks back to back, one test | 0.5 | 73.0 | 0.5 % [0.2, 1.2] | 0.5 % [0.2, 1.2] | 180 | 14 / 30 |
| B2 | finds its own test | as B1 | 1 | 151.6 | 1.0 % [0.5, 1.8] | 1.3 % [0.8, 2.2] | 180 | 17 / 28 |
| B3 | finds its own test | as B1, a week that never ends | every day | 180.0 | 0.8 % [0.4, 1.6] | 0.9 % [0.5, 1.7] | 180 | 17 / 28 |
| B4 | finds its own test | as B1, tests declared as they enter the queue | 0.5 | 60.9 | 0.4 % [0.2, 1.0] | 0.5 % [0.2, 1.2] | 180 | 13 / 31 |
| C1 | finds its own test | research first; 45-day tests; the floor outside the queue 0.01; weeks back to back, one test | 0.5 | 75.6 | 4.4 % [3.3, 5.9] | 5.0 % [3.8, 6.5] | 180 | 19 / 40 |
| C2 | finds its own test | as C1, the floor 0.02 | 0.5 | 75.6 | 3.2 % [2.3, 4.5] | 3.8 % [2.8, 5.2] | 180 | 18 / 38 |
| C3 | finds its own test | as C1 | 1 | 154.2 | 6.9 % [5.5, 8.6] | 7.9 % [6.4, 9.7] | 180 | 20.5 / 36 |
| C4 | finds its own test | as C1, tests declared as they enter the queue | 0.5 | 75.8 | 4.3 % [3.2, 5.7] | 5.2 % [4.0, 6.8] | 180 | 19 / 40 |
| C5 | finds its own test | as C1, no weeks | none | 0.0 | 1.0 % [0.5, 1.8] | 1.2 % [0.7, 2.1] | 180 | 15 / 43 |
| P1 | the right test from day one | weeks back to back, one test | 0.5 | 84.9 | 33.1 % [30.3, 36.1] | 46.6 % [43.5, 49.7] | 180 | 46 / 45 |
| P2 | the right test from day one | weeks back to back, one test | 1 | 168.1 | 53.6 % [50.5, 56.7] | 69.1 % [66.2, 71.9] | 137.5 | 62 / 62 |
| P3 | the right test from day one | as P1, the floor outside the queue 0.01 | 0.5 | 84.7 | 39.7 % [36.7, 42.8] | 55.1 % [52.0, 58.2] | 164.5 | 52 / 51 |
| P4 | the right test from day one | a week that never ends (RESULTS-3's upper bound, on these seeds) | every day | 180.0 | 55.2 % [52.1, 58.3] | 71.3 % [68.4, 74.0] | 133 | 63 / 64 |
| P5 | the right test from day one | as P1, the running test's floor 0.55 | 0.5 | 85.0 | 29.9 % [27.1, 32.8] | 44.0 % [41.0, 47.1] | 180 | 48 / 44 |
| P6 | the right test from day one | the running test's floor 0.55, no weeks | none | 0.0 | 9.7 % [8.0, 11.7] | 17.0 % [14.8, 19.5] | 180 | 35 / 23 |
| P7 | the right test from day one | as P5, the floor outside the queue 0.01 | 0.5 | 84.9 | 37.3 % [34.4, 40.3] | 52.9 % [49.8, 56.0] | 173.5 | 54 / 48 |
| P1f | the right test from day one | as P1, with the final design's estimator and prior | 0.5 | 85.1 | 33.5 % [30.6, 36.5] | 48.1 % [45.0, 51.2] | 180 | 47 / 45 |
| P2f | the right test from day one | as P2, with the final design's estimator and prior | 1 | 168.4 | 54.7 % [51.6, 57.8] | 68.6 % [65.7, 71.4] | 133 | 62 / 63 |

- The week carries the learning. Without it even the right test from day one reached 9.7 % by day 144 (P6).
- Finding the test is the other half. A trace of six people under B1 showed the research-first queue starting with
  the right move on the wrong reading (mood) in four of them. It reached the stress reading between day 60 and
  day 88 in five, and not by day 158 in the sixth. By day 180 that test had 7 to 15 decisions on its move.
- P4 repeats RESULTS-3's upper bound on these seeds: a median of 133 days against 134 there, so the engine as
  changed reads the same.

## The strongest design inside the agreed principles

Its settings, all settled on these tuning seeds:
- C3's correction, with the sparse case handled (below);
- every test declared on day one, the error rate shared by research;
- the queue by expected benefit, early signs keeping their place, 45 days otherwise;
- two tests at once and two per week, as requirement 11 says ("two or three tests"); one test per week, faster on
  its own test, is outside those words and was run only as a bound;
- learning weeks back to back at the realistic opt-in of one in two;
- the floors as settled before (0.05 outside the queue, 0.45 for a running test, 0.35 for "nothing extra");
- the research prior's vague part at 0.3.

**Three corrections it needed, each recorded before its run was read:**

- **The floor stays at 0.05.** At 0.01, judged after 19 of 34 scenarios, C2's sparse intervals covered 88.8 % and
  C3's day-90 bias in the daily rhythm was +0.170, where both hold at 0.05, and C11's multi-day bias grew to 2.126.
  A full-step move also went unoffered after day 30 for 12.7 % of people. The low floor starves the moves it is
  meant to keep learning about.
- **Sparse tests read as the draws fell** (`estimator: 'hybrid'`, `hybridMin: 2`).
  - At the settled floor, C11's multi-day estimate was biased by 0.899. That test gets one or two decisions per
    arm in 180 days. With so few, C3's correction (the design the recorded chances promise) is ruled by a single
    rare draw, and among the people with a decision on each arm at all, it reads large.
  - Switching to the realized design until both arms hold five decisions fixed C11 (+0.114), but brought back the
    rebound bias C3's correction exists for (−0.138), and C2 fell to 89.0 %.
  - At two decisions per arm C3 passes with room, and the multi-day bias is +0.102.
- **The research prior's vague part at 0.3, up from 0.2** (Schmidli 2014's principle, requirement 7). At 0.2, C2
  covered 90.0 % (83,144 of 92,387 looks), just under its mark. The move research rates at 0.4 step, strongly, has
  a full step in the sparse scenario, and with under ten decisions a strong prior cannot reach it. At 0.3, C2
  covers 92.2 %.

**The judge's output for its full run** (1,000 people per scenario, seeds 1–1000; today's engine's three files
are the first verdict's, as its references for C1 and C7, since it concludes nothing on any seeds):

```
PASS S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.4] (0/1000)
FAIL S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue)
      0.0% [0.0, 5.7] (0/63); false established per person-year 0.000; established calls per person 0.063
PASS S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction: the only path to established in engine B is the confidence sequence on randomized decisions (engineB.call); no observational estimate exists in the prototype. Checked in the code, and every established call in every run comes from a test with randomized decisions on both arms (counted below).
PASS S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.4] (0/1000); day-180 bias with missingness -0.015, without -0.060, added 0.045
PASS S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.016 (920 people); coverage at every look 100.0% [99.6, 100.0] (898/898)
FAIL C1 better than today: full-step median days to a right established ≤ 0.8 × today's to a right Holds up; half-step share ≥ today's
      B median 180 days (80th 180), A median 180 days; half step: B 0.1% [0.0, 0.6] (1/1000), A 0.0% [0.0, 0.8] (0/500); A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
PASS C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 92.2% [92.0, 92.4] (84033/91155); sequence coverage 100.0% [99.4, 100.0] (666/666)
PASS C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.016, covers 97.1% [95.8, 98.0] (893/920); rhythm-large: bias 0.018, covers 96.8% [95.5, 97.8] (859/887); rebound-large: bias -0.043, covers 97.1% [95.8, 98.0] (877/903); context-large: bias 0.030, covers 96.8% [95.5, 97.8] (890/919)
PASS C4 is S3
      see S3
PASS C5 is S5
      see S5
FAIL C6 repeated looks and stopping: S1 under daily looks; little difference established for no effect by day 180 in at least half (move eligible ≥ 3 a week); called for a full step in fewer than 1 in 20
      S1 holds; little difference, no effect: 0.0% [0.0, 19.4] (0/16); little difference at a full step: 0.0% [0.0, 0.4] (0/1000)
PASS C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.573, A 0.721; offers to low moves 0.0% [0.0, 0.0] (0/242473); benefit per offer B 0.0128, A 0.0011
FAIL C8 pooling without false sameness: the no-effect partner established in fewer than 1 in 20; the real one established by day 180 in ≥ 80%; pooling shortens the median time to likely
      no-effect partner 0.0% [0.0, 0.4] (0/1000); real one 1.5% [0.9, 2.5] (15/1000); median days to likely with pooling 180, without 180
FAIL C9 context without fragmenting: with-her call (likely+) in ≥ 70%; without-her helps (likely+) in fewer than 1 in 10; with no true difference, a context-specific call in fewer than 1 in 20 per context
      with her 0.0% [0.0, 0.4] (0/1000); without her helps 0.0% [0.0, 0.4] (0/1000); no difference: withHer 0.0% [0.0, 0.4] (0/1000), office 0.0% [0.0, 0.4] (0/1000), weekend 0.0% [0.0, 0.4] (0/1000), shortSleep 0.0% [0.0, 0.4] (0/1000)
FAIL C10 a misleading prior discounted: established helps in fewer than 1 in 20; by day 120 within 0.25 of 0 in ≥ 80%; against harm, believed not to help by day 120 in ≥ 80%
      prior +1 vs 0: established helps 0.0% [0.0, 0.4] (0/1000), within 0.25 at day 120 32.2% [29.4, 35.2] (322/1000); prior +1 vs −0.5: below 0 at day 120 66.9% [63.9, 69.7] (669/1000)
FAIL C11 windows kept apart: next-check-in helps established in fewer than 1 in 20; next-morning established by day 180 in ≥ 70%; multi-day estimate within ±0.15; no window's data in another's (code)
      next check-in 0.0% [0.0, 0.4] (0/1000); next morning 0.8% [0.4, 1.6] (8/1000); multi-day bias -0.016 (56 people); windows are separate tests by key in engine B
PASS C12 is S4
      see S4
FAIL C13 change over time: stepped down within 60 days of the change in ≥ 80%; an unchanging effect kept to day 180 in ≥ 90% of those who reached it
      stepped down 0.0% [0.0, 9.6] (0/36) (of people established before day 120); kept 100.0% [92.9, 100.0] (50/50)
PASS C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 100.0% [94.9, 100.0] (72/72) (promise 67%); likely 100.0% [61.0, 100.0] (6/6) (promise 80%); established 100.0% [94.3, 100.0] (63/63) (promise 95%)
FAIL C15 is S1 with S2
      see S1 and S2

FAILURE HUNT
  confidently wrong (established in the wrong direction), every scenario: 0 of 402 established calls
  stops learning (a full-step move eligible but never offered after day 30): 13.0% [11.1, 15.3] (129/991)
  rebound taken for an effect (no-effect move established, strong regression to the mean): 0.0% [0.0, 0.4] (0/1000)
  rediscovered false positives (the same no-effect move established twice), all no-effect scenarios: 0 in 11000 people
  falsely narrow uncertainty (day-90 coverage under 90%): none
  prediction contaminating the causal estimate (a deliberately poor, constant prediction): day-90 bias 0.023, coverage 96.7% [95.3, 97.6] (902/933)

SPEED
  a full step, as the scenario stands: established by day 180 in 5.0% [3.8, 6.5] (50/1000), median 105.5 days among them; likely by day 180 in 0.6% [0.3, 1.3] (6/1000), median 52 days; offers of the move 34, decisions per arm at day 180 23 / 29
  a full step on the move the queue tests first (sensitivity): established by day 180 in 7.9% [6.4, 9.7] (79/1000), median 111 days among them; likely by day 180 in 0.8% [0.4, 1.6] (8/1000), median 53 days; offers of the move 39, decisions per arm at day 180 27 / 31
  half a step: established by day 180 in 0.1% [0.0, 0.6] (1/1000), median 78 days among them; likely by day 180 in 0.0% [0.0, 0.4] (0/1000); offers of the move 32, decisions per arm at day 180 21 / 28

VERDICT: MATERIAL FAILURE
```

## Why every remaining failure is speed

- **C1:** the median is the horizon. A full step was established by day 180 for 5.0 % of people. The probes above
  show that no queue reaches C1 at the realistic opt-in.
- **C6:** "established little difference by day 180 in at least half" needs about 250 offers of a move even with
  unlimited comparisons, and one offer a day allows at most 180 (RESULTS-3). Its other two clauses hold: S1, and
  no little difference called at a full step (0 of 1,000).
- **C8:** the real one established by day 180 in 1.5 %, where 80 % is asked; both medians to likely are the
  horizon, so pooling cannot show it shortens them. The no-effect partner: 0 of 1,000.
- **C9:** a with-her call of likely or better by day 180 in none, where 70 % is asked. No false context call
  anywhere.
- **C10:** by day 120 the misleading prior's estimate was within 0.25 of 0 in 32.2 %, and below 0 against harm
  in 66.9 %, where 80 % is asked. Its test held a median of 28 decisions on the move by day 180, fewer by day 120:
  too few to outweigh a strong prior. Established helps against no effect: 0 of 1,000.
- **C11:** next-morning established helps by day 180 in 0.8 %, where 70 % is asked. Next-check-in helps
  established: 0 of 1,000; the multi-day bias −0.016.
- **C13:** stepped down within 60 days of the change in none of the 36 people established before day 120. The whole
  180 days gave its test a median of 23 decisions on the move, so 60 days add only a few: too few to turn a belief
  resting on the months before. The unchanging effect was kept to day 180 by all 50 who reached it.
- **S2:** 0 false of 63 established calls. Its interval needs at least 73 calls with none false. The verdict's
  2,000 people would give about 126 at this rate; whether it passes then turns on one or two calls.

## Provenance

- `engineB.ts`, with every setting above, hashes to
  `e7b6507a6691123e7a4ed52abcdc3d7fefe9a836c08fb1aea5d60ceadfad069a`. The earlier rounds ran before the later
  settings existed. Each later setting is off by default, and the first 30 people of A1 and of C1, replayed on this
  engine with their files' own settings, match their results byte for byte.
- `run.ts` is RESULTS-3's (`451bd113…`). `engineA.ts`, `world.ts`, `scenarios.ts`, `stats.ts` and `metrics.ts`
  are byte for byte as at the second verdict (their hashes are in `RESULTS-2.md`).
- Of the app's code the engines call, only `src/offers.ts` has changed in what it does since the first verdict:
  a screen that holds an outdoor move while rain is forecast. The simulated people have no weather, so it changes
  nothing here, and P4's median repeats RESULTS-3's. `src/db.ts` changed too, but the engines import only its
  types.
- Every number in the search table comes from `python3 -I stress/results4.py stress/.out`, which prints each
  file's settings. The full run's numbers are the judge's output above, pasted whole. Nothing was typed by hand.
- Each design ran as `node stress/.out/pool.mjs large B 1 1000 <out> 12 '<settings>'`, the settings as each
  file's `cfg` holds them. The full run used the same command for every scenario `validate.sh` lists, 1,000
  people each, with:

```
{"estimator":"hybrid","hybridMin":2,"vague":0.3,"declareAll":true,"alphaWeights":"research","queueScore":"benefit","keepEarly":true,"queueSize":2,"lw":{"accept":0.5,"length":7,"gap":0,"gapNo":7,"tests":2,"always":false}}
```

  plus `"pool":false` for `pool-same-off` and `"poorPrediction":true` for `large-poor`, as `validate.sh` names
  them. It took 74 minutes on 12 threads. The raw results are not committed.
