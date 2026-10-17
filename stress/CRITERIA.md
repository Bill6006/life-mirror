# The stress test's pass/fail criteria, frozen 2026-10-16

Written into the private execution plan, and frozen, before any simulation code existed. No result
moved them. The text inside the fence below is the frozen block byte for byte, as the plan holds it.
The lines between the two fence lines, joined with newlines (no trailing newline), hash to:

SHA-256 `42ef08047481f26f91f5edae35ce8aeb31c3dbfdc41ae9d8930881af2fd02424`

That hash was recorded in the private ledger the moment the criteria were frozen; on 2026-10-17 the
plan's copy still hashed to it.

```text
      - **THE PASS/FAIL CRITERIA, FROZEN 2026-10-16 BEFORE THE FIRST RUN.** Written before any simulation code exists. No result moves them. Their text's SHA-256 is recorded in PROGRESS.md the moment they are frozen, so any later change shows.
        - **The simulated people (the base model):**
          - Real-shaped weeks: three check-in blocks a day (morning, afternoon, evening); weekdays with daycare and a pickup, two office days, a church day on Sunday, weekends at home; with her on most days, away on some.
          - Each reading has a hidden state that moves day to day (an autoregressive drift, so a low tends to rebound), a rhythm by block, context effects and noise. It is answered as an anchor from 1 to 5. A step is one anchor step.
          - Check-ins answered with chance 0.9 in the morning, 0.6 in the afternoon and 0.85 in the evening, unless a scenario changes them.
          - A move offered is seen with chance 0.9. Of those seen: done 0.55, partly 0.15, no (no time or didn't want) 0.3. One answer in ten is left unanswered.
          - True effects, in steps on the target reading in its good direction: large +1.0, moderate +0.5, tiny +0.1, none 0, harmful −0.5.
          - 180 days per person, looked at daily, as the learning run does.
        - **The engines:**
          - A is today's: learning.ts, adaptive.ts, tiers.ts, bandit.ts and offers.ts exactly as committed when the run starts, replayed through a harness that mirrors offerFlow and learningFlow.
          - B is the agreed design, prototyped offline in its own folder and never imported by the app.
          - A's levels are compared as: promising with early sign, Holds up with established, Unhelpful with hurts or little difference.
        - **Seeds and sizes:**
          - Tuning seeds 1–1000 settle the values below.
          - The verdict is read once, on validation seeds 100001–102000, never used before. A design fix after a verdict is re-judged on a fresh range (200001–202000, then 300001–302000), never on seeds already read.
          - Every null scenario uses 2,000 people per engine; the rest use at least 500.
          - Every rate is reported with its 95 % Monte Carlo interval. A safeguard passes only if the interval's upper end is under its limit. A claim passes on its point estimate.
        - **"Right", for every level:** helps or hurts is right when the true effect has that sign and is not zero. Little difference is right when the true effect is within the worthwhile margin (provisionally 0.25 step for these runs; the settled value is reported).
        - **The ladder's promises, stated now** (the thresholds behind them are settled on the tuning seeds to keep these, never the reverse):
          - established: right at least 19 times in 20;
          - likely: right at least 4 times in 5;
          - early sign: right at least 2 times in 3.
        - **Safeguards (all must hold for B):**
          - S1. A move with no effect is called established, in either direction, in fewer than 1 in 20 people over 180 days of daily looks (requirement 14).
          - S2. Across the whole system, fewer than 1 in 20 established calls are false. This is judged in the mixed catalogue scenario: many moves, most with no effect, a few real, several readings, the contexts. False established calls per person-year are also counted and reported (claim 15).
          - S3. Nothing reaches established, and no causal word is allowed, except from randomized comparisons. Observational patterns stop at likely. Zero exceptions in every scenario (claim 4; requirement 8).
          - S4. Missing is never negative. Under heavy missingness (unseen, unanswered, away, missed check-ins), a no-effect move is called hurts (likely or established) in fewer than 1 in 20 people, and the bias that missingness adds to an estimate stays within ±0.1 step (claim 12).
          - S5. Under B's own adaptive chances, a full-step estimate is biased by at most ±0.1 step at day 90. The established interval covers the truth at every look, in at least 95 % of people within Monte Carlo error (claims 3, 5 and 6).
        - **Claims (each must pass for B):**
          - C1, better than today. At a full step, B's median days to a right established call are at most 0.8 times A's median days to a right Holds up; a person never reaching it counts as 180 days. At half a step, B's share of people with a right established call by day 180 is at least A's share for Holds up. If A itself breaks the 1-in-20 mark (its no-effect Holds-up rate is 5 % or more), A's speed is not trustworthy. C1 then passes if B, holding S1 and S2, reaches a right established call by day 180 in at least 80 % of full-step people.
          - C2, honest uncertainty when sparse (morning 0.6, afternoon 0.3, evening 0.6): the 95 % intervals behind early sign and likely cover the true effect in at least 90 % of looks with fewer than ten per arm, and established keeps S5's coverage.
          - C3, causal estimates: in the base, daily-rhythm, rebound and changing-context scenarios at a full step, the day-90 estimate is biased by at most ±0.1 step, and its 95 % interval covers the truth in at least 93 % of people.
          - C4 is S3; C5 is S5.
          - C6, repeated looks and stopping: S1 holds under daily looks. With no effect, and the move eligible at least three times a week, an established little difference is reached by day 180 in at least half the people; at a full step, little difference is called in fewer than 1 in 20.
          - C7, exploration without burden:
            - B makes no more move offers per check-in than A, at most one;
            - at least 90 % of B's offers go to moves not already at likely-hurts or worse;
            - B's realized benefit per offer (the true effect when the move is done) over 180 days is at least A's.
          - C8, pooling without false sameness. Two moves share a tag, one at a full step and one with no effect: the no-effect one is established in fewer than 1 in 20, and the real one is established by day 180 in at least 80 %. Two same-tag moves both at half a step: pooling shortens B's median time to likely compared with B with pooling turned off.
          - C9, context without fragmenting. A move helps a full step only with her, and does nothing otherwise: a with-her call of likely or better in at least 70 % by day 180; a without-her helps call of likely or better in fewer than 1 in 10. With no true context difference, a context-specific call of likely or better in fewer than 1 in 20, per context.
          - C10, a misleading prior discounted. The research prior says +1 step; the truth is 0: established helps in fewer than 1 in 20, and by day 120 the estimate is within 0.25 of 0 in at least 80 %. The truth is −0.5: by day 120 it is believed not to help (estimate below 0) in at least 80 %.
          - C11, windows kept apart. A move with only a next-morning effect at a full step: next-check-in established helps in fewer than 1 in 20, and next-morning established helps by day 180 in at least 70 %. A multi-day effect with carryover: blocks with gaps keep the estimate within ±0.15 step. No window's data enters another window's estimate, checked in the code.
          - C12 is S4.
          - C13, change over time. An established-helps move whose effect falls to zero on day 120 is stepped down (marked revised) within 60 days in at least 80 %. An effect that never changes keeps its established call to day 180 in at least 90 % of the people who reached it.
          - C14, a calibrated ladder: each level is right at least as often as its promise, within its Monte Carlo interval.
          - C15 is S1 with S2.
        - **The failure hunt:** each listed failure has its own scenario and its own count, reported whether or not it occurs:
          - confidently wrong: established in the wrong direction;
          - stops learning: a full-step move, eligible, not offered after day 30 in more than 1 in 10;
          - over-pooling: C8;
          - overreacting to context: C9's no-difference case;
          - rebound taken for an effect: S1 in the rebound scenario;
          - mishandled adaptive randomization: S5;
          - falsely narrow uncertainty: coverage under 90 % in any scenario;
          - rediscovered false positives: the same no-effect move established twice;
          - stale and over-fast beliefs: C13's two halves;
          - prediction contaminating causal estimates: S3, and C3 with a deliberately poor prediction;
          - burden: C7.
        - **Settled on the tuning seeds and reported with their values:**
          - the exploration floors;
          - the early-sign, likely and established thresholds;
          - the stopping boundaries;
          - the evidence decay;
          - the smallest effect established by day 180 in at least 80 % of people, and how fast, beside the worthwhile margin the owner confirms;
          - the realistic time to establish a full step (median and 80th percentile), against the target of about three weeks (requirement 14). That target is reported, not a gate.
        - **The verdict:**
          - The learning repair proceeds only if S1–S5 and C1–C15 all pass on validation seeds.
          - A failed safeguard, or a failed C1, is a material stress-test failure: the work stops and it is reported to the owner.
          - A failed C2–C14 is a design defect. Its smallest correction goes into the design first; the tuning runs are repeated, and the verdict is read again on fresh validation seeds.
          - These criteria never change.
```
