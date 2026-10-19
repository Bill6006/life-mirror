# The verdict by requirement 14's rule (stage 2, read once on fresh seeds)

**Verdict (read 2026-10-18, once, on fresh seeds from 300001): FAIL on one gate of 23.** C2's belief intervals
covered the truth in 89.1 % of sparse looks, where 90 % is required. Every other gate passed, S2 among them. Today's
engine stays, as recorded before the run.

- **The rule.** On 2026-10-18 the owner decided that the engine is judged by requirement 14's rule: the safeguards
  come first, and a speed the simulation shows unrealistic at Life Mirror's cadence is reported, never gated, with
  no safeguard weakened.
  - `verdict14.ts` reads every clause of the frozen criteria exactly as `metrics.ts` does. It marks each as a gate
    (it limits wrong calls, bias or honesty) or as reported (it asks how soon a call is reached).
  - The verdict passes only if every gate passes.
  - `metrics.ts` also ran, unchanged, as the frozen verdict: MATERIAL FAILURE, since C1 is a speed clause.
  - `CRITERIA.md` is unchanged; the frozen block still hashes to `42ef0804…`.
- **The design** is the one `RESULTS-4.md` settled on the tuning seeds.
- **The sizes, fixed before the run.** The no-effect scenarios used 2,000 people, as the criteria fix them. Every
  other scenario used 5,000, where the criteria ask for at least 500. The mixed catalogue used 10,000, so that S2 could be
  decided. All seeds were fresh.

## What passed

- **Every safeguard:**
  - S1: a move with no effect was never established (0 of 2,000).
  - S2: 3 of 531 established calls were false, 0.6 % [0.2, 1.6].
  - S3.
  - S4: no hurts call under heavy missingness (0 of 2,000), and missingness added −0.035 of bias.
  - S5: day-90 bias −0.004; the established interval covered the truth at every look in 4,468 of 4,469 people.
- **The other gates:**
  - C3: day-90 biases −0.039 to +0.008, coverage at least 96.2 %.
  - C6's two safety clauses, C8a, C9b, C9c, C10a and C11a: none of their wrong calls occurred.
  - C7: 0.573 move offers per check-in against today's 0.724, and 0.0134 benefit per offer against 0.0011.
  - C11c: the multi-day bias was −0.056 on 344 people.
  - C13b: 231 of 231 kept their established call to day 180.
  - C14: early signs were right 651 of 654 times, likely 72 of 73, established 528 of 531.
- **The reported speeds:**
  - C1: the full step's median days to a right established call is the horizon, 180.
  - C6b: little difference established for none of 30.
  - C8b: 1.4 % by day 180.
  - C9a: 0.1 %.
  - C10b and C10c: 33.1 % and 67.0 % at day 120.
  - C11b: 0.5 %.
  - C13a: none of 139 stepped down within 60 days.

## Why C2 failed

C2 pools the looks of two scenarios. The same files, read by scenario after the verdict, never to change it:

- sparse check-ins with no effect: 98.6 % of 91,376 looks (2,000 people);
- sparse check-ins with a full step: 85.2 % of 225,201 looks (5,000 people).

The verdict's sizes put more than twice as many full-step looks into the pool. With the 500 people `validate.sh`
gives that scenario, the same data reads 96.4 %; with equal sizes, 92.3 %. The tuning run, 1,000 people each, read
92.2 %.

The size choice exposed a weakness; it did not create one. The full step sits on a move research rates at 0.4 step,
strongly (a spread of 0.3). Under ten decisions per arm, the belief cannot reach a person whose real effect is a
full step, so its 95 % intervals cover the truth only about 85 % of the time. The first verdict read 65.6 % there.

## What follows

- Today's engine stays, as recorded before the run: no further fresh range is named, so whether to correct the
  design and judge it again is the owner's decision.
- **The smallest correction, tried on the tuning seeds after the verdict.** Research reports average effects, and one
  person's effect varies around them. The prior's spread widened by 0.4 step for that variation (`priorTau`, added in
  quadrature; requirement 7's starting effect "checked for scale") lifts the sparse full-step coverage to 93.7 % and
  the sparse no-effect coverage to 98.8 %. Each is above 90 % on its own, so no mix of sizes can tip C2. A wider vague
  part needed a weight of 0.5 to reach 90.0 % in the full-step scenario.
- **The whole tuning set with the correction** (34 scenarios, 1,000 people each, judged by `verdict14.ts`):
  - C2 covered 96.3 %.
  - S1, S4 (added bias −0.006), S5 (−0.048) and C3 passed, and so did every other gate the tuning size can decide;
    C14 was right 66 of 66, 8 of 8 and 55 of 55 times.
  - Two gates the tuning size cannot decide:
    - S2: 0 of 55 calls false, too few for its interval. The verdict's 10,000 people decided it: 3 of 531.
    - C11c: the multi-day bias read 0.194 on 58 people. The correction does not touch that test's estimator. The
      verdict, on 344 people with the same estimator, read −0.056.

## The judges' output

`verdict14.ts`, the verdict by requirement 14:

```
PASS gate     S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.2] (0/2000)
PASS gate     S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue, 10000 people)
      0.6% [0.2, 1.6] (3/531); false established per person-year 0.001; established calls per person 0.053
PASS gate     S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction, as metrics.ts records: the only path to established in engine B is the confidence sequence on randomized decisions.
PASS gate     S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias with missingness -0.078, without -0.043, added -0.035
PASS gate     S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.004 (4553 people); coverage at every look 100.0% [99.9, 100.0] (4468/4469)
not  reported C1a full-step median days to a right established ≤ 0.8 × today's to a right Holds up
      B median 180 days, A median 180 days; A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
met  reported C1b half-step share with a right established call by day 180 ≥ today's share for Holds up
      B 0.3% [0.2, 0.5] (14/5000), A 0.0% [0.0, 0.8] (0/500)
FAIL gate     C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 89.1% [89.0, 89.2] (282041/316577); sequence coverage 99.9% [99.8, 100.0] (3236/3238)
PASS gate     C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.004, covers 96.3% [95.7, 96.8] (4386/4553); rhythm-large: bias 0.008, covers 96.3% [95.7, 96.8] (4291/4455); rebound-large: bias -0.039, covers 96.2% [95.6, 96.7] (4305/4474); context-large: bias 0.004, covers 96.9% [96.4, 97.4] (4386/4526)
PASS gate     C4 is S3
      see S3
PASS gate     C5 is S5
      see S5
PASS gate     C6a S1 holds under daily looks
      see S1
not  reported C6b with no effect and the move eligible at least three times a week, an established little difference by day 180 in at least half
      0.0% [0.0, 11.4] (0/30)
PASS gate     C6c at a full step, little difference called in fewer than 1 in 20
      0.0% [0.0, 0.1] (0/5000)
PASS gate     C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.573, A 0.724; offers to low moves 0.0% [0.0, 0.0] (0/1211391); benefit per offer B 0.0134, A 0.0011
PASS gate     C8a two moves sharing a tag: the no-effect one established in fewer than 1 in 20
      0.0% [0.0, 0.1] (0/5000)
not  reported C8b the real one established by day 180 in at least 80%
      1.4% [1.1, 1.8] (70/5000)
not  reported C8c two same-tag moves at half a step: pooling shortens the median time to likely
      median days to likely with pooling 180, without 180
not  reported C9a a move that helps only with her: a with-her call of likely or better by day 180 in at least 70%
      0.1% [0.0, 0.2] (4/5000)
PASS gate     C9b a without-her helps call of likely or better in fewer than 1 in 10
      0.0% [0.0, 0.1] (0/5000)
PASS gate     C9c with no true context difference, a context-specific call of likely or better in fewer than 1 in 20, per context
      withHer 0.0% [0.0, 0.1] (0/5000), office 0.0% [0.0, 0.1] (0/5000), weekend 0.0% [0.0, 0.1] (0/5000), shortSleep 0.0% [0.0, 0.1] (0/5000)
PASS gate     C10a a misleading prior (+1) against no effect: established helps in fewer than 1 in 20
      0.0% [0.0, 0.2] (0/2000)
not  reported C10b by day 120 the estimate within 0.25 of 0 in at least 80%
      33.1% [31.1, 35.2] (662/2000)
not  reported C10c against harm (−0.5): by day 120 believed not to help (estimate below 0) in at least 80%
      67.0% [65.7, 68.3] (3350/5000)
PASS gate     C11a a next-morning-only effect: next-check-in established helps in fewer than 1 in 20
      0.0% [0.0, 0.1] (0/5000)
not  reported C11b next-morning established helps by day 180 in at least 70%
      0.5% [0.4, 0.8] (26/5000)
PASS gate     C11c a multi-day effect with carryover: the estimate within ±0.15 step
      multi-day bias -0.056 (344 people)
PASS gate     C11d no window's data enters another window's estimate, checked in the code
      windows are separate tests by key in engine B, as metrics.ts records
PASS gate     C12 is S4
      see S4
not  reported C13a an established-helps move whose effect falls to zero on day 120 stepped down within 60 days in at least 80%
      0.0% [0.0, 2.7] (0/139) (of people established before day 120)
PASS gate     C13b an effect that never changes keeps its established call to day 180 in at least 90% of the people who reached it
      100.0% [98.4, 100.0] (231/231)
PASS gate     C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 99.5% [98.7, 99.8] (651/654) (promise 67%); likely 98.6% [92.6, 99.8] (72/73) (promise 80%); established 99.4% [98.4, 99.8] (528/531) (promise 95%)
PASS gate     C15 is S1 with S2
      see S1 and S2

23 gates, 22 pass; failed: C2
VERDICT BY REQUIREMENT 14: FAIL
```

`metrics.ts`, the frozen verdict, for the record:

```
PASS S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.2] (0/2000)
PASS S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue)
      0.6% [0.2, 1.6] (3/531); false established per person-year 0.001; established calls per person 0.053
PASS S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction: the only path to established in engine B is the confidence sequence on randomized decisions (engineB.call); no observational estimate exists in the prototype. Checked in the code, and every established call in every run comes from a test with randomized decisions on both arms (counted below).
PASS S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias with missingness -0.078, without -0.043, added -0.035
PASS S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.004 (4553 people); coverage at every look 100.0% [99.9, 100.0] (4468/4469)
FAIL C1 better than today: full-step median days to a right established ≤ 0.8 × today's to a right Holds up; half-step share ≥ today's
      B median 180 days (80th 180), A median 180 days; half step: B 0.3% [0.2, 0.5] (14/5000), A 0.0% [0.0, 0.8] (0/500); A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
FAIL C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 89.1% [89.0, 89.2] (282041/316577); sequence coverage 99.9% [99.8, 100.0] (3236/3238)
PASS C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.004, covers 96.3% [95.7, 96.8] (4386/4553); rhythm-large: bias 0.008, covers 96.3% [95.7, 96.8] (4291/4455); rebound-large: bias -0.039, covers 96.2% [95.6, 96.7] (4305/4474); context-large: bias 0.004, covers 96.9% [96.4, 97.4] (4386/4526)
PASS C4 is S3
      see S3
PASS C5 is S5
      see S5
FAIL C6 repeated looks and stopping: S1 under daily looks; little difference established for no effect by day 180 in at least half (move eligible ≥ 3 a week); called for a full step in fewer than 1 in 20
      S1 holds; little difference, no effect: 0.0% [0.0, 11.4] (0/30); little difference at a full step: 0.0% [0.0, 0.1] (0/5000)
PASS C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.573, A 0.724; offers to low moves 0.0% [0.0, 0.0] (0/1211391); benefit per offer B 0.0134, A 0.0011
FAIL C8 pooling without false sameness: the no-effect partner established in fewer than 1 in 20; the real one established by day 180 in ≥ 80%; pooling shortens the median time to likely
      no-effect partner 0.0% [0.0, 0.1] (0/5000); real one 1.4% [1.1, 1.8] (70/5000); median days to likely with pooling 180, without 180
FAIL C9 context without fragmenting: with-her call (likely+) in ≥ 70%; without-her helps (likely+) in fewer than 1 in 10; with no true difference, a context-specific call in fewer than 1 in 20 per context
      with her 0.1% [0.0, 0.2] (4/5000); without her helps 0.0% [0.0, 0.1] (0/5000); no difference: withHer 0.0% [0.0, 0.1] (0/5000), office 0.0% [0.0, 0.1] (0/5000), weekend 0.0% [0.0, 0.1] (0/5000), shortSleep 0.0% [0.0, 0.1] (0/5000)
FAIL C10 a misleading prior discounted: established helps in fewer than 1 in 20; by day 120 within 0.25 of 0 in ≥ 80%; against harm, believed not to help by day 120 in ≥ 80%
      prior +1 vs 0: established helps 0.0% [0.0, 0.2] (0/2000), within 0.25 at day 120 33.1% [31.1, 35.2] (662/2000); prior +1 vs −0.5: below 0 at day 120 67.0% [65.7, 68.3] (3350/5000)
FAIL C11 windows kept apart: next-check-in helps established in fewer than 1 in 20; next-morning established by day 180 in ≥ 70%; multi-day estimate within ±0.15; no window's data in another's (code)
      next check-in 0.0% [0.0, 0.1] (0/5000); next morning 0.5% [0.4, 0.8] (26/5000); multi-day bias -0.056 (344 people); windows are separate tests by key in engine B
PASS C12 is S4
      see S4
FAIL C13 change over time: stepped down within 60 days of the change in ≥ 80%; an unchanging effect kept to day 180 in ≥ 90% of those who reached it
      stepped down 0.0% [0.0, 2.7] (0/139) (of people established before day 120); kept 100.0% [98.4, 100.0] (231/231)
PASS C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 99.5% [98.7, 99.8] (651/654) (promise 67%); likely 98.6% [92.6, 99.8] (72/73) (promise 80%); established 99.4% [98.4, 99.8] (528/531) (promise 95%)
PASS C15 is S1 with S2
      see S1 and S2

FAILURE HUNT
  confidently wrong (established in the wrong direction), every scenario: 0 of 2209 established calls
  stops learning (a full-step move eligible but never offered after day 30): 12.7% [11.8, 13.6] (629/4964)
  rebound taken for an effect (no-effect move established, strong regression to the mean): 0.0% [0.0, 0.2] (0/2000)
  rediscovered false positives (the same no-effect move established twice), all no-effect scenarios: 0 in 22000 people
  falsely narrow uncertainty (day-90 coverage under 90%): none
  prediction contaminating the causal estimate (a deliberately poor, constant prediction): day-90 bias 0.007, coverage 96.6% [96.1, 97.1] (4427/4581)

SPEED
  a full step, as the scenario stands: established by day 180 in 4.6% [4.1, 5.2] (231/5000), median 112 days among them; likely by day 180 in 0.7% [0.5, 1.0] (35/5000), median 75 days; offers of the move 34, decisions per arm at day 180 23 / 29
  a full step on the move the queue tests first (sensitivity): established by day 180 in 7.7% [7.0, 8.5] (387/5000), median 115 days among them; likely by day 180 in 0.9% [0.7, 1.2] (45/5000), median 69 days; offers of the move 39, decisions per arm at day 180 27 / 31
  half a step: established by day 180 in 0.3% [0.2, 0.5] (14/5000), median 128 days among them; likely by day 180 in 0.0% [0.0, 0.1] (1/5000), median 56 days; offers of the move 33, decisions per arm at day 180 22 / 29

VERDICT: MATERIAL FAILURE
```

## Provenance

- The judge and the run were committed before the run started: `verdict14.ts` and `validate14.sh` at 6b950c2
  (SHA-256 `077a60b5…` and `3fd9419c…`), and `engineB.ts` at 52968dd (`027746d2…`). Their terms, and each choice
  that led to them, were recorded in the private plan before anything they govern was read.
- The run: `bash stress/validate14.sh stress/.out/val-300000 12`, from 17:43 to 23:37 local on 12 threads.
- `run.ts`, `metrics.ts`, `engineA.ts`, `world.ts`, `scenarios.ts` and `stats.ts` are as listed in `RESULTS-4.md`.
- The raw results are not committed. The runs are seeded, and the same command regenerates them exactly from 52968dd.
