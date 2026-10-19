# The verdict by requirement 14's rule, read once more after C2's correction

**Verdict (read 2026-10-19, once, on fresh seeds from 400001): PASS, every one of the 23 gates.** The stress test
has passed by the rule the owner chose. The learning repair is built next.

- **What changed since `RESULTS-5.md`, at the owner's decision.** One correction, and one size:
  - The correction: the research prior's spread is widened by how far one person's effect may sit from research's
    average (`priorTau: 0.4`).
  - The size: the multi-day scenario ran on 10,000 people, so that its estimate could decide.
  - Everything else was as before, fixed before the run in `validate14b.sh`, and judged by `verdict14.ts` unchanged.
- **The sizes:** the no-effect scenarios used 2,000 people, as the criteria fix them; every other scenario used
  5,000; the mixed catalogue and the multi-day scenario used 10,000. Every seed was fresh.

## What it shows

- **Every safeguard holds:**
  - S1: a move with no effect was never established (0 of 2,000).
  - S2: 3 of 486 established calls were false, 0.6 % [0.2, 1.8].
  - S3.
  - S4: no hurts call under heavy missingness (0 of 2,000), and missingness added +0.014 of bias.
  - S5: day-90 bias −0.055; the established interval covered the truth at every look in all 4,477 people.
- **Every check on honesty and burden holds:**
  - C2: the belief intervals covered the truth in 95.5 % of sparse looks.
  - C3: day-90 biases −0.055, −0.023, −0.098 and −0.011, coverage at least 96.1 %. The rebound scenario's −0.098 is
    0.002 inside its limit, the nearest any gate came.
  - C7: 0.573 move offers per check-in against today's 0.724, and 0.0134 benefit per offer against 0.0012.
  - C11c: the multi-day bias was −0.057 on 716 people.
  - C13b: 230 of 230 kept their established call to day 180.
  - C14: early signs were right 632 of 640 times, likely 83 of 86, established 483 of 486.
  - C6, C8, C9, C10 and C11's limits on wrong calls: none of those calls occurred.
- **The speeds, reported:**
  - C1: the full step's median days to a right established call is the horizon, 180.
  - C6b: little difference established for none of 31.
  - C8b: 1.4 % by day 180.
  - C9a: 2 of 5,000.
  - C10b and C10c: 39.6 % and 66.4 % at day 120.
  - C11b: 0.4 %.
  - C13a: none of 135 stepped down within 60 days.
  - "Established" stays rare and slow at Life Mirror's cadence, as `RESULTS-4.md` found. The learning shows first as
    early and likely signs, which were right far more often than they promise.
- **The frozen verdict, for the record:** `metrics.ts` reads MATERIAL FAILURE, on the speed clauses the owner's rule
  reports rather than judges. Every safeguard passed there too.

## The judges' output

`verdict14.ts`, the verdict by requirement 14:

```
PASS gate     S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.2] (0/2000)
PASS gate     S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue, 10000 people)
      0.6% [0.2, 1.8] (3/486); false established per person-year 0.001; established calls per person 0.049
PASS gate     S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction, as metrics.ts records: the only path to established in engine B is the confidence sequence on randomized decisions.
PASS gate     S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias with missingness -0.063, without -0.078, added 0.014
PASS gate     S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.055 (4567 people); coverage at every look 100.0% [99.9, 100.0] (4477/4477)
not  reported C1a full-step median days to a right established ≤ 0.8 × today's to a right Holds up
      B median 180 days, A median 180 days; A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
met  reported C1b half-step share with a right established call by day 180 ≥ today's share for Holds up
      B 0.3% [0.2, 0.5] (16/5000), A 0.0% [0.0, 0.8] (0/500)
PASS gate     C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 95.5% [95.4, 95.5] (315690/330720); sequence coverage 100.0% [99.9, 100.0] (3148/3148)
PASS gate     C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.055, covers 96.8% [96.3, 97.3] (4422/4567); rhythm-large: bias -0.023, covers 96.4% [95.9, 96.9] (4306/4465); rebound-large: bias -0.098, covers 96.1% [95.5, 96.6] (4283/4457); context-large: bias -0.011, covers 96.8% [96.2, 97.3] (4390/4535)
PASS gate     C4 is S3
      see S3
PASS gate     C5 is S5
      see S5
PASS gate     C6a S1 holds under daily looks
      see S1
not  reported C6b with no effect and the move eligible at least three times a week, an established little difference by day 180 in at least half
      0.0% [0.0, 11.0] (0/31)
PASS gate     C6c at a full step, little difference called in fewer than 1 in 20
      0.0% [0.0, 0.1] (0/5000)
PASS gate     C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.573, A 0.724; offers to low moves 0.0% [0.0, 0.0] (0/1210921); benefit per offer B 0.0134, A 0.0012
PASS gate     C8a two moves sharing a tag: the no-effect one established in fewer than 1 in 20
      0.0% [0.0, 0.1] (0/5000)
not  reported C8b the real one established by day 180 in at least 80%
      1.4% [1.1, 1.7] (69/5000)
not  reported C8c two same-tag moves at half a step: pooling shortens the median time to likely
      median days to likely with pooling 180, without 180
not  reported C9a a move that helps only with her: a with-her call of likely or better by day 180 in at least 70%
      0.0% [0.0, 0.1] (2/5000)
PASS gate     C9b a without-her helps call of likely or better in fewer than 1 in 10
      0.0% [0.0, 0.1] (0/5000)
PASS gate     C9c with no true context difference, a context-specific call of likely or better in fewer than 1 in 20, per context
      withHer 0.0% [0.0, 0.1] (0/5000), office 0.0% [0.0, 0.1] (0/5000), weekend 0.0% [0.0, 0.1] (0/5000), shortSleep 0.0% [0.0, 0.1] (0/5000)
PASS gate     C10a a misleading prior (+1) against no effect: established helps in fewer than 1 in 20
      0.0% [0.0, 0.2] (0/2000)
not  reported C10b by day 120 the estimate within 0.25 of 0 in at least 80%
      39.6% [37.5, 41.8] (792/2000)
not  reported C10c against harm (−0.5): by day 120 believed not to help (estimate below 0) in at least 80%
      66.4% [65.1, 67.7] (3320/5000)
PASS gate     C11a a next-morning-only effect: next-check-in established helps in fewer than 1 in 20
      0.0% [0.0, 0.1] (0/5000)
not  reported C11b next-morning established helps by day 180 in at least 70%
      0.4% [0.3, 0.6] (20/5000)
PASS gate     C11c a multi-day effect with carryover: the estimate within ±0.15 step
      multi-day bias -0.057 (716 people)
PASS gate     C11d no window's data enters another window's estimate, checked in the code
      windows are separate tests by key in engine B, as metrics.ts records
PASS gate     C12 is S4
      see S4
not  reported C13a an established-helps move whose effect falls to zero on day 120 stepped down within 60 days in at least 80%
      0.0% [0.0, 2.8] (0/135) (of people established before day 120)
PASS gate     C13b an effect that never changes keeps its established call to day 180 in at least 90% of the people who reached it
      100.0% [98.4, 100.0] (230/230)
PASS gate     C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 98.8% [97.6, 99.4] (632/640) (promise 67%); likely 96.5% [90.2, 98.8] (83/86) (promise 80%); established 99.4% [98.2, 99.8] (483/486) (promise 95%)
PASS gate     C15 is S1 with S2
      see S1 and S2

23 gates, 23 pass
VERDICT BY REQUIREMENT 14: PASS
```

`metrics.ts`, the frozen verdict, for the record:

```
PASS S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.2] (0/2000)
PASS S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue)
      0.6% [0.2, 1.8] (3/486); false established per person-year 0.001; established calls per person 0.049
PASS S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction: the only path to established in engine B is the confidence sequence on randomized decisions (engineB.call); no observational estimate exists in the prototype. Checked in the code, and every established call in every run comes from a test with randomized decisions on both arms (counted below).
PASS S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias with missingness -0.063, without -0.078, added 0.014
PASS S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.055 (4567 people); coverage at every look 100.0% [99.9, 100.0] (4477/4477)
FAIL C1 better than today: full-step median days to a right established ≤ 0.8 × today's to a right Holds up; half-step share ≥ today's
      B median 180 days (80th 180), A median 180 days; half step: B 0.3% [0.2, 0.5] (16/5000), A 0.0% [0.0, 0.8] (0/500); A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
PASS C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 95.5% [95.4, 95.5] (315690/330720); sequence coverage 100.0% [99.9, 100.0] (3148/3148)
PASS C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.055, covers 96.8% [96.3, 97.3] (4422/4567); rhythm-large: bias -0.023, covers 96.4% [95.9, 96.9] (4306/4465); rebound-large: bias -0.098, covers 96.1% [95.5, 96.6] (4283/4457); context-large: bias -0.011, covers 96.8% [96.2, 97.3] (4390/4535)
PASS C4 is S3
      see S3
PASS C5 is S5
      see S5
FAIL C6 repeated looks and stopping: S1 under daily looks; little difference established for no effect by day 180 in at least half (move eligible ≥ 3 a week); called for a full step in fewer than 1 in 20
      S1 holds; little difference, no effect: 0.0% [0.0, 11.0] (0/31); little difference at a full step: 0.0% [0.0, 0.1] (0/5000)
PASS C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.573, A 0.724; offers to low moves 0.0% [0.0, 0.0] (0/1210921); benefit per offer B 0.0134, A 0.0012
FAIL C8 pooling without false sameness: the no-effect partner established in fewer than 1 in 20; the real one established by day 180 in ≥ 80%; pooling shortens the median time to likely
      no-effect partner 0.0% [0.0, 0.1] (0/5000); real one 1.4% [1.1, 1.7] (69/5000); median days to likely with pooling 180, without 180
FAIL C9 context without fragmenting: with-her call (likely+) in ≥ 70%; without-her helps (likely+) in fewer than 1 in 10; with no true difference, a context-specific call in fewer than 1 in 20 per context
      with her 0.0% [0.0, 0.1] (2/5000); without her helps 0.0% [0.0, 0.1] (0/5000); no difference: withHer 0.0% [0.0, 0.1] (0/5000), office 0.0% [0.0, 0.1] (0/5000), weekend 0.0% [0.0, 0.1] (0/5000), shortSleep 0.0% [0.0, 0.1] (0/5000)
FAIL C10 a misleading prior discounted: established helps in fewer than 1 in 20; by day 120 within 0.25 of 0 in ≥ 80%; against harm, believed not to help by day 120 in ≥ 80%
      prior +1 vs 0: established helps 0.0% [0.0, 0.2] (0/2000), within 0.25 at day 120 39.6% [37.5, 41.8] (792/2000); prior +1 vs −0.5: below 0 at day 120 66.4% [65.1, 67.7] (3320/5000)
FAIL C11 windows kept apart: next-check-in helps established in fewer than 1 in 20; next-morning established by day 180 in ≥ 70%; multi-day estimate within ±0.15; no window's data in another's (code)
      next check-in 0.0% [0.0, 0.1] (0/5000); next morning 0.4% [0.3, 0.6] (20/5000); multi-day bias -0.057 (716 people); windows are separate tests by key in engine B
PASS C12 is S4
      see S4
FAIL C13 change over time: stepped down within 60 days of the change in ≥ 80%; an unchanging effect kept to day 180 in ≥ 90% of those who reached it
      stepped down 0.0% [0.0, 2.8] (0/135) (of people established before day 120); kept 100.0% [98.4, 100.0] (230/230)
PASS C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 98.8% [97.6, 99.4] (632/640) (promise 67%); likely 96.5% [90.2, 98.8] (83/86) (promise 80%); established 99.4% [98.2, 99.8] (483/486) (promise 95%)
PASS C15 is S1 with S2
      see S1 and S2

FAILURE HUNT
  confidently wrong (established in the wrong direction), every scenario: 0 of 2105 established calls
  stops learning (a full-step move eligible but never offered after day 30): 13.0% [12.1, 13.9] (642/4952)
  rebound taken for an effect (no-effect move established, strong regression to the mean): 0.0% [0.0, 0.2] (0/2000)
  rediscovered false positives (the same no-effect move established twice), all no-effect scenarios: 0 in 22000 people
  falsely narrow uncertainty (day-90 coverage under 90%): none
  prediction contaminating the causal estimate (a deliberately poor, constant prediction): day-90 bias -0.021, coverage 96.4% [95.8, 96.9] (4419/4586)

SPEED
  a full step, as the scenario stands: established by day 180 in 4.6% [4.1, 5.2] (230/5000), median 111 days among them; likely by day 180 in 0.6% [0.4, 0.8] (29/5000), median 67 days; offers of the move 33, decisions per arm at day 180 22 / 29
  a full step on the move the queue tests first (sensitivity): established by day 180 in 6.5% [5.9, 7.3] (327/5000), median 114 days among them; likely by day 180 in 0.9% [0.7, 1.2] (46/5000), median 72.5 days; offers of the move 37, decisions per arm at day 180 25 / 31
  half a step: established by day 180 in 0.3% [0.2, 0.5] (16/5000), median 118 days among them; likely by day 180 in 0.0% [0.0, 0.1] (0/5000); offers of the move 31, decisions per arm at day 180 21 / 28

VERDICT: MATERIAL FAILURE
```

## Provenance

- The run was committed before it started: `validate14b.sh` at 1cb0f83 (SHA-256 `1572fc85…`). `verdict14.ts` is
  unchanged since 6b950c2 (`077a60b5…`), and `engineB.ts` since e7aab73 (`537388d2…`).
- The run: `bash stress/validate14b.sh stress/.out/val-400000 12`, from 01:55 to 08:22 local on 12 threads.
- `run.ts`, `metrics.ts`, `engineA.ts`, `world.ts`, `scenarios.ts` and `stats.ts` are as listed in `RESULTS-4.md`.
- The raw results are not committed. The runs are seeded, and the same command regenerates them exactly.
