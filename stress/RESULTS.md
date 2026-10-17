# The stress test: verdict and report (stage 2)

**Verdict: MATERIAL FAILURE** (read 2026-10-17, once, on validation seeds 100001–102000)
- **S2, a safeguard, failed:** across the whole system, 3 of 37 established calls were false.
- **C1 failed:** neither engine established a full-step effect within 180 days for most people.
- **What the frozen rule says now:** the learning repair does not proceed, and the decision is the
  owner's. Nothing in the app changed; this folder is offline only.

The criteria are in `CRITERIA.md`, byte for byte as frozen (SHA-256 `42ef0804…`). The code is in this
folder: engine A is today's engine replayed through the committed `src/` functions, and engine B is
the agreed sixteen-requirement design, prototyped. How to rerun everything is in `README.md`.

## The answer in brief

- **Today's engine concludes nothing.**
  - In 180 days the cards of the move with the known truth reached no tier at all, for any of 2,000
    no-effect, 500 full-step or 500 half-step people: no "promising", no "Holds up", no "unhelpful".
    No card of any move reached Holds up.
  - Its evidence scatters over 100+ cards, one per block, lowest reading and alternative. Each card
    needs 8 done offers per arm, and Holds up also needs its corrected lower bound above a whole step.
- **The agreed design is safe per test:**
  - a no-effect move was established for 0 of 2,000 people;
  - no established call came out in the wrong direction (0 of 129);
  - no false positive was rediscovered;
  - missing data was never read as harm (0 of 2,000 under heavy missingness);
  - its day-90 estimate of a full step was within the ±0.1 tolerance under its own adaptive chances
    (bias −0.083), and its sequence covered the truth at every look in 372 of 372 people.
- **But its everyday intervals are too narrow** (C2, C3): the belief intervals covered in 84.9 % of
  sparse looks against 90 %, and the day-90 intervals in 88.7–91.8 % against 93 %. Strong rebound
  biased the day-90 estimate by −0.24 steps.
- **It is better for the person:**
  - its offers deliver about 2.5 times today's benefit (0.0027 against 0.0011 steps per offer);
  - it makes fewer move offers per check-in (0.65 against 0.72);
  - none of its 138,258 move offers went to a move at likely-hurts or worse.
- **But it learns far too slowly at Life Mirror's cadence.**
  - Even with the full-step move held in the test queue from day one, only 8 % of people had it
    established by day 180 (the pinned run below).
  - By then its test held about 45 randomized decisions: 25 on the move, 20 on nothing extra, about
    one every four days.
  - The sequence's median half-width at day 180 was 1.03 steps, as wide as the effect itself. It
    narrows roughly with the square root of the decisions, so most people would need a year or more
    per move. The target was about three weeks.
- **Three design defects remain, found by the verdict:**
  - testing every reading a move targets: 2 of S2's 3 false calls were secondary readings of a move
    with a real effect on another reading;
  - a trace-only chance for moves outside the test queue: in 40 % of full-step people the good move
    stopped being offered after day 30;
  - everyday intervals too narrow (C2, C3, above).

## Options for the owner (the decision is theirs)

1. **Keep what tested well, and drop the promise of fast findings.**
   - Adopt the agreed design's draw and test queue: 2.5 times the benefit per offer, and no offer to
     a move at likely-hurts or worse.
   - Make its corrections:
     - one pre-declared target per test, which is requirement 1's own wording;
     - a fair minimum chance for moves outside the queue;
     - wider everyday intervals, so C2 and C3 cover as promised.
   - Say early signs and likely calls with their measured rates, and expect an established finding to
     take a year or more.
   - First, re-run the stress test on fresh validation seeds (200001–202000) over a longer horizon.
     The frozen criteria never change, so a new horizon is a new decision, and it is the owner's.
2. **More data per day.** The opt-in learning week is part of the agreed design (requirement 11):
   two or three randomized tests at every eligible check-in. It was not simulated here. Its mechanics
   need settling, and it needs a stress-test run of its own.
3. **Correct and re-judge as frozen.** Make the corrections and re-run on fresh seeds against the
   same criteria. C1 is expected to fail again: the speed limit comes from the data rate.
4. **Keep today's engine.** In these runs it made no false claim because it made no claim at all, and
   its offers helped least.

**The builder's recommendation: option 1.** It leaves every safeguard's threshold as frozen, and it
corrects the defect behind 2 of S2's 3 false calls. It gives the person more helpful moves now, and
it says plainly how long an established finding takes. It is re-tested before anything is built,
and nothing is built until the owner decides.

## The judge's output, verbatim

```
PASS S1 a no-effect move established in either direction in fewer than 1 in 20 people (daily looks)
      0.0% [0.0, 0.2] (0/2000)
FAIL S2 fewer than 1 in 20 established calls false, across the whole system (mixed catalogue)
      8.1% [2.8, 21.3] (3/37); false established per person-year 0.003; established calls per person 0.018
PASS S3 nothing established, and no causal word, except from randomized comparisons
      holds by construction: the only path to established in engine B is the confidence sequence on randomized decisions (engineB.call); no observational estimate exists in the prototype. Checked in the code, and every established call in every run comes from a test with randomized decisions on both arms (counted below).
PASS S4 missing is never negative: hurts called for a no-effect move under heavy missingness in fewer than 1 in 20; missingness adds at most ±0.1 step of bias
      hurts 0.0% [0.0, 0.2] (0/2000); day-180 bias with missingness -0.105, without -0.126, added 0.021
PASS S5 adaptive chances: full-step estimate biased by at most ±0.1 at day 90; the established interval covers the truth at every look in at least 95% within Monte Carlo error
      day-90 bias -0.083 (453 people); coverage at every look 100.0% [99.0, 100.0] (372/372)
FAIL C1 better than today: full-step median days to a right established ≤ 0.8 × today's to a right Holds up; half-step share ≥ today's
      B median 180 days (80th 180), A median 180 days; half step: B 0.2% [0.0, 1.1] (1/500), A 0.0% [0.0, 0.8] (0/500); A's own no-effect Holds-up rate 0.0% [0.0, 0.2] (0/2000)
FAIL C2 honest uncertainty when sparse: belief intervals cover in ≥ 90% of looks with under ten per arm; established keeps S5's coverage
      belief intervals 84.9% [84.6, 85.2] (49798/58632); sequence coverage 100.0% [93.5, 100.0] (55/55)
FAIL C3 causal estimates: day-90 bias within ±0.1 and 95% interval coverage ≥ 93% (base, rhythm, rebound, changing context)
      large: bias -0.083, covers 88.7% [85.5, 91.3] (402/453); rhythm-large: bias -0.062, covers 91.8% [88.8, 94.0] (401/437); rebound-large: bias -0.243, covers 89.8% [86.6, 92.3] (396/441); context-large: bias -0.056, covers 89.7% [86.4, 92.2] (382/426)
PASS C4 is S3
      see S3
PASS C5 is S5
      see S5
FAIL C6 repeated looks and stopping: S1 under daily looks; little difference established for no effect by day 180 in at least half (move eligible ≥ 3 a week); called for a full step in fewer than 1 in 20
      S1 holds; little difference, no effect: 0.0% [0.0, 4.0] (0/93); little difference at a full step: 0.0% [0.0, 0.8] (0/500)
PASS C7 exploration without burden: no more move offers per check-in than today (≤ 1); ≥ 90% of offers to moves not at likely-hurts or worse; benefit per offer ≥ today's
      move offers per check-in B 0.654, A 0.721; offers to low moves 0.0% [0.0, 0.0] (0/138258); benefit per offer B 0.0027, A 0.0011
FAIL C8 pooling without false sameness: the no-effect partner established in fewer than 1 in 20; the real one established by day 180 in ≥ 80%; pooling shortens the median time to likely
      no-effect partner 0.0% [0.0, 0.8] (0/500); real one 0.2% [0.0, 1.1] (1/500); median days to likely with pooling 180, without 180
FAIL C9 context without fragmenting: with-her call (likely+) in ≥ 70%; without-her helps (likely+) in fewer than 1 in 10; with no true difference, a context-specific call in fewer than 1 in 20 per context
      with her 0.0% [0.0, 0.8] (0/500); without her helps 0.0% [0.0, 0.8] (0/500); no difference: withHer 0.0% [0.0, 0.8] (0/500), office 0.0% [0.0, 0.8] (0/500), weekend 0.0% [0.0, 0.8] (0/500), shortSleep 0.0% [0.0, 0.8] (0/500)
FAIL C10 a misleading prior discounted: established helps in fewer than 1 in 20; by day 120 within 0.25 of 0 in ≥ 80%; against harm, believed not to help by day 120 in ≥ 80%
      prior +1 vs 0: established helps 0.0% [0.0, 0.2] (0/2000), within 0.25 at day 120 17.8% [16.2, 19.6] (357/2000); prior +1 vs −0.5: below 0 at day 120 45.6% [41.3, 50.0] (228/500)
FAIL C11 windows kept apart: next-check-in helps established in fewer than 1 in 20; next-morning established by day 180 in ≥ 70%; multi-day estimate within ±0.15; no window's data in another's (code)
      next check-in 0.0% [0.0, 0.8] (0/500); next morning 0.0% [0.0, 0.8] (0/500); multi-day bias -0.027 (89 people); windows are separate tests by key in engine B
PASS C12 is S4
      see S4
FAIL C13 change over time: stepped down within 60 days of the change in ≥ 80%; an unchanging effect kept to day 180 in ≥ 90% of those who reached it
      stepped down NaN% [NaN, NaN] (0/0) (of people established before day 120); kept 100.0% [56.6, 100.0] (5/5)
FAIL C14 a calibrated ladder: each level right at least as often as its promise, within its Monte Carlo interval
      early 64.4% [59.0, 69.4] (208/323) (promise 67%); likely 65.3% [56.3, 73.2] (77/118) (promise 80%); established 91.9% [78.7, 97.2] (34/37) (promise 95%)
FAIL C15 is S1 with S2
      see S1 and S2

FAILURE HUNT
  confidently wrong (established in the wrong direction), every scenario: 0 of 129 established calls
  stops learning (a full-step move eligible but never offered after day 30): 39.5% [35.2, 43.9] (193/489)
  rebound taken for an effect (no-effect move established, strong regression to the mean): 0.0% [0.0, 0.2] (0/2000)
  rediscovered false positives (the same no-effect move established twice), all no-effect scenarios: 0 in 22000 people
  falsely narrow uncertainty (day-90 coverage under 90%): large 88.7%, rebound-large 89.8%, context-large 89.7%, adherence-large 89.8%, missing-large 80.5%, sparse-large 82.6%
  prediction contaminating the causal estimate (a deliberately poor, constant prediction): day-90 bias -0.114, coverage 93.4% [90.6, 95.3] (408/437)

SPEED
  a full step, as the scenario stands: established by day 180 in 1.0% [0.4, 2.3] (5/500), median 162 days among them; likely by day 180 in 2.2% [1.2, 3.9] (11/500), median 137 days; offers of the move 14, decisions per arm at day 180 10 / 25
  a full step on the move the queue tests first (sensitivity): established by day 180 in 2.2% [1.2, 3.9] (11/500), median 148 days among them; likely by day 180 in 2.8% [1.7, 4.6] (14/500), median 112 days; offers of the move 18, decisions per arm at day 180 12 / 24
  half a step: established by day 180 in 0.2% [0.0, 1.1] (1/500), median 151 days among them; likely by day 180 in 0.6% [0.2, 1.7] (3/500), median 109 days; offers of the move 14, decisions per arm at day 180 9 / 25

VERDICT: MATERIAL FAILURE
```

The "large-first" scenario gave the full-step move a stronger research prior so the queue might test
it first. The queue still ranked other moves above it, so that row is not the best case. The pinned
sensitivity below is.

## Sensitivity, not judged: the move held in the queue from day one

These ran on tuning seeds 501–1000, 500 people each, with walk-ten pinned
(`'{"pinned":["walk-ten"]}'`).

| Truth | Established by day 180 | Likely | Early sign | Offers of the move (median) | Decisions per arm at day 180 (median) | Day-90 bias, coverage |
| --- | --- | --- | --- | --- | --- | --- |
| a full step | 8.0 % (40/500), all right | 4.6 % | 21.8 % | 37.5 | 25.5 / 20 | 0.007, 91.4 % |
| half a step | 0.4 % (2/500), all right | 0.6 % | 3.8 % | 38 | 25 / 20 | −0.019, 90.2 % |
| no effect | 0.2 % (1/500), false | 0 | 0.6 % (3, all false) | 36 | 25 / 19 | 0.019, 90.4 % |

## The report, in the plan's eight parts

1. **The scenarios.** 31 runs, listed in `scenarios.ts`:
   - no effect, large, moderate, tiny and harmful effects;
   - noisy readings, strong rebound and a strong daily rhythm, each with no effect and with a full step;
   - a changing context (office days rising from one to four a week);
   - a move that works only with her, and no true context difference;
   - sparse check-ins, and heavy and informative missingness;
   - adherence that follows energy, and correlated readings;
   - every check-in answered;
   - a next-morning effect, and a multi-day effect with carryover;
   - an effect that stops on day 120;
   - a misleading prior against no effect and against harm;
   - two same-tag moves, one real and one not, and both at half a step, with pooling on and off;
   - the mixed catalogue of seven real effects among the rest;
   - a deliberately poor prediction.
   - Sizes: 2,000 people for every no-effect scenario and for the mixed catalogue, 500 for the rest.
     Engine A ran where C1 and C7 read it: no effect (2,000), a full step and half a step (500 each).
2. **The criteria:** `CRITERIA.md`, unchanged since they were frozen.
3. **Today's engine:** it concluded nothing.
   - In all three of its runs, the cards of the move with the known truth reached no tier for any
     person.
   - No card of any move reached Holds up; its no-effect Holds-up rate is 0 of 2,000.
   - It made 0.72 move offers per check-in, at 0.0011 steps of benefit per offer.
4. **The proposed engine:** the judge's output above.
5. **The settled values:**

   | Value | Setting |
   | --- | --- |
   | Floor on "nothing extra" | 0.35 |
   | Test queue | 2 moves, each with a 0.45 floor when eligible |
   | A test's time in the queue | 45 days, or 135 once it reaches likely-helps |
   | Floor shared by the other moves | 0.05 |
   | Moves tested in all | at most 10 |
   | System error rate | 0.05, shared by the readings of those moves |
   | Likely rung | sequence error rate 0.0005, belief 0.95 |
   | Early rung | sequence error rate 0.01, belief 0.8 |
   | Established | at least 15 decisions per arm and 20 days, the sequence tightest near 120 days |
   | Evidence half-life | 120 days |
   | The prior's vague part | weight 0.1, spread 0.75 steps |
   | Worthwhile margin | 0.25 steps, provisional; the owner confirms it |

   - The realistic time to establish a full step: the median and the 80th percentile are both past
     day 180, even with the move held in the queue from day one. By extrapolation it is a year or more
     of focused testing per move.
   - The smallest effect established by day 180 in at least 80 % of people: none.
6. **Design defects, with their smallest corrections.**
   - Corrected during tuning, before the verdict:
     - each rung needs the record's own anytime-valid sequence;
     - one prediction per reading, from the whole earlier record;
     - requirement 11's test queue;
     - the error rate shared by the tests the queue can hold;
     - a move's every reading read at every moment it was available;
     - the vague part settled;
     - small-sample variance floored.
   - Found by the verdict, not yet corrected:
     - one pre-declared target per test: 2 of S2's 3 false calls were secondary readings of a move
       with a real effect on another reading;
     - a fair minimum chance for moves outside the queue: in 40 % of full-step people the good move
       stopped being offered after day 30;
     - everyday intervals too narrow for C2 and C3.
7. **Does it clearly outperform today's engine?**
   - On the person's benefit, yes: today's engine learns nothing and its offers help less.
   - On safety per test, yes.
   - On system-wide safety (S2) and on interval coverage (C2, C3), it fails its own bar.
   - On speed, as C1 defines it, no: neither engine reaches established for most people within 180
     days.
8. **Is it safe to proceed to implementation?** Not on the frozen rule. A failed safeguard and a
   failed C1 are a material failure. The owner decides; the options are above.

## Provenance

- Engine B's verdict runs used `engineB.ts` with SHA-256 `723a4bd6bf7d6d2db326bc183eaa21e5c4b39d5b52763c0ac13a8ba96bb0bad5`. The
  only later change is the sensitivity-only `pinned` setting, which defaults to empty, so
  `B_DEFAULT` behaves identically.
- The other files at the verdict:

  | File | SHA-256 |
  | --- | --- |
  | `engineA.ts` | `f8445e8168d595614c2b30ee1f83ad8fb449be9cfc9de1bca485c60bcb0a1c8a` |
  | `world.ts` | `7d8d04a08fae607ea7fbf55b3fa08beecc8fcad6e662988a0bf1812d1533d6c3` |
  | `run.ts` | `06dcfa345ba2c075410cc7d378185a37e35f903b203c57f1c8eb1d39aa2f60af` |
  | `scenarios.ts` | `a4d0725c5411afd1ef96ba94d671e54ab8a9b7b9965d6bfd849db11f60591c91` |
  | `stats.ts` | `fe07b30b4da5f0deba45679dd9cd4fa2a4929041ec26fb0bbe1bd592583bf331` |

- Engine A replays `src/` exactly as committed at `4d650b1`.
- Run times on 12 worker threads:
  - B: about 4 minutes per 2,000 people;
  - A: 4,122 seconds for 2,000 people, 1,258 seconds for 500.
- The raw results (about 30 MB) are not committed. The runs are fully seeded: `bash stress/validate.sh`
  regenerates them exactly from this code.
