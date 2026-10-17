# The learning week, tried on the tuning seeds (stage 2)

**Outcome (2026-10-17, tuning seeds 1–1000 only): no verdict was read.**
- The learning week was built into engine B with C3's correction and tuned on seeds 1–1000. It is the
  one part of the agreed design that adds randomized decisions per day.
- No realistic configuration can pass everything, so the last fresh range the criteria name,
  300001–302000, stays unread:
  - **C6 cannot pass in any configuration** that keeps the frozen criteria and offers a move at most
    once a day. Even with the week never ending and the test held from the first day, the sequence at
    day 180 was 3.3 to 3.6 times as wide as the worthwhile margin allows, which would take about 11 to
    13 times the data.
  - **C1 fails at the realistic rate.** A full step was established by day 180 for 1.0 % of people at
    one invitation in two, and 1.8 % with every invitation accepted; C1 needs half of them by day 144.
    Its speed is reached only at an upper bound no real week gives: the full-step test alone in the
    queue from the first day, and a learning week every day for 180 days (median 134 days). With the
    design's two tests at once, even that gave 156.
  - **S2 fails at the realistic rate.** The mixed catalogue made 0.016 established calls per person,
    at one invitation in two and with every invitation accepted alike: about 32 in the verdict's 2,000
    people, where at least 73 are needed even with none false. A week every day would make about 184,
    with 1 of 92 false, but no opt-in week runs every day.
- So today's engine stays: the criteria let the learning repair proceed only if every safeguard and
  claim passes on validation seeds. This is the builder's decision under the owner's instruction of
  2026-10-17, made on this evidence. The owner has made no learning-engine choice.
- C3's correction does what it is for. On the same tuning seeds, the day-90 bias of a full step
  reached −0.121 in the rebound scenario with the second verdict's estimator, outside C3's ±0.1. With
  the correction it stays between −0.070 and +0.034 in all four of C3's scenarios, and its interval
  covers the truth in 96.8–98.5 % of people.
- This work changes nothing in the app; this folder is offline only.

The criteria are `CRITERIA.md`, unchanged: the frozen block still hashes to `42ef0804…`. The two
verdicts read so far are `RESULTS.md` (seeds 100001–102000) and `RESULTS-2.md` (seeds 200001–202000).

## What was built

### The learning week (`lw`, off by default)

- A week is seven days, and the person opts in each time.
- It runs the tests already in the queue, up to two at once.
- At every check-in where a running test's move fits on that test's own declared reading, whatever
  reading is lowest now, the check-in's one suggestion becomes a randomized test decision.
  - "Fits" means every screen the app already applies: the block, the needs, the band, conflicts,
    people around, and a move at most once a day.
  - Each fitting test's move and "nothing extra" (every test's comparison) get equal chances. With one
    test that is an even coin between the move and nothing, the most a single decision can tell.
- Unchanged:
  - one suggestion per check-in (C7), and no new check-in;
  - a committed practice is never drawn: study, faith, church, time with her, the partner and the
    people paths;
  - a move believed to hurt, or already settled, is never run.
- A check-in where no running test fits draws as on any other day.
- The invitation is asked only when a running, still-open test fitted a check-in on at least three of
  the last seven days, so that the week would run it. It never comes sooner than 14 days after the
  last week or the last "Not now".
- Two tests, not three. With one suggestion per check-in and "nothing" as every test's comparison, a
  third test gives each test fewer decisions. With the week never ending, three tests made no more
  established calls than two (0.093 against 0.092 per person) and offered a move at more check-ins
  (0.525 against 0.500).

### C3's correction (`estimator: 'ht'`, off by default)

- `wcls` divides each test's estimating equation by the design the draws happened to give. `ht`
  divides it by the design the recorded chances promise: the Horvitz–Thompson form of the same weights
  and centring (Hadad, Wager and Athey 2021).
- Each decision's part is then unbiased given the past, whatever the chances were, so a test the draws
  starved early is not read as a smaller effect.
- The residual spread is still read over the design as it fell.

### Unchanged when both are off

With the week off and the estimator at `wcls`, engine B gives the second verdict's results person for
person. That was checked against the verdict's code (commit 60f4268) on 20 people in each of four
scenarios: no effect, a full step, the mixed catalogue and the rebound. Engine A's three people
replayed identically too.

## Settled before any run

These were recorded in the private plan before the runs that test them.

- **The person's opt-in, modelled as an acceptance rate: 0.5, one invitation in two.**
  - The week is opt-in each time, so some weeks will be declined: busy weeks, travel, illness, a week
    that is simply full.
  - A person who wants the app to learn will say yes more often than not when life allows.
  - A week asks for a randomized suggestion at most check-ins for seven days, which is a real ask.
  - So one in two is a neutral central rate, not one chosen to pass. 0.25 and 0 (no week) are reported
    beside it, and 1.0, every invitation accepted, above it.
- **The arithmetic for C6.** C6 asks for an established little difference by day 180 in at least half
  the no-effect people whose move is eligible at least three times a week.
  - The worthwhile margin, 0.25 step on the effect when done, is about 0.155 on the effect of offering
    (a share done of about 0.62).
  - The sequence, at the test's error rate (0.005), falls under that only with about 500 to 1,000
    decisions per arm by day 180, at a residual spread of 0.65 to 0.85 step.
  - A move is offered at most once a day, so a test reaches at most about 180 offers in 180 days, and
    fewer after unseen offers and unanswered check-ins.
  - So no design that keeps the frozen margin, the error rate and one offer of a move a day can pass
    C6, with a learning week or without. The upper-bound probe below shows it in the simulation as well.

## The upper bound: the probe that could have said yes

Seeds 501–1000, 500 people each. The full-step test is held in the queue from the first day, and the
week never ends, so its move is a randomized decision at every check-in where it fits. No real
configuration can give a test more decisions than this.

| Week never ending, test held from day one | Full step: established by day 180 | By day 144 | Median days (C1 needs ≤ 144) | Decisions per arm at day 180 | No effect: established either way (S1) | No effect: little difference (C6 needs ≥ 50 %) | Sequence half-width at day 180, no effect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Two tests, `wcls` | 57.8 % (289/500) | 44.8 % (224/500) | 156 | 59 / 59 | 0.4 % (2/500) | 0.0 % (0/485) | 0.55 |
| One test alone, `ht` | 70.6 % (353/500) | 54.6 % (273/500) | 134 | 63 / 65 | 0.4 % (2/500) | 0.0 % (0/498) | 0.51 |

- Two tests at once, with the second verdict's estimator: the full step's median is 156 days, 12 past
  C1's 144. Its test gathered 59 decisions per arm by day 180, its move offered on about one day in two.
- One test alone, with C3's correction: median 134 days, 54.6 % by day 144. That is C1's speed, but only
  with the right test running alone from the first day, and the person in a learning week every day for
  180 days. The two rows differ in both the number of tests and the estimator, so neither difference
  alone accounts for the gap.
- No effect: the sequence at day 180 was 0.55 and 0.51 wide (medians), where the worthwhile margin
  allows 0.155. Little difference was established for none of 485 and none of 498 people: C6 needs half.
- S1 held at the upper bound: 2 of 500 no-effect people were established either way in each probe
  (0.4 %; the interval's upper end 1.4 %, under the 5 % limit).
- The mixed catalogue, with the week never ending:

| Mixed catalogue, week never ending | Established calls per person (about, in 2,000) | Of them false | Move offers per check-in |
| --- | --- | --- | --- |
| Two tests | 0.092 (184) | 1.1 % (1/92) | 0.500 |
| Three tests | 0.093 (186) | 1.1 % (1/93) | 0.525 |

  This is S2's most calls: about 184 in the verdict's 2,000 people, enough in number for S2. No opt-in
  week runs every day, so it is not a configuration a person could give.

## The realistic week, and lower rates

Seeds 1–1000, 1,000 people each, with C3's correction unless marked. Today's engine is not re-run on
the tuning seeds; its figures from both verdicts are the references (C1: median 180 days, the horizon;
C7: 0.723 move offers per check-in and 0.0010 steps of benefit per offer).

| Configuration | Week days per person | Full step: established by day 180 | By day 144 | Median days | Mixed catalogue: established calls per person (about, in 2,000) | Of them false | No effect: S1 | C7: move offers per check-in | C7: benefit per offer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Week, every invitation accepted | 55.3 | 1.8 % (18/1000) | 0.8 % (8/1000) | 180 | 0.016 (32) | 0.0 % (0/16) | 0.0 % (0/1000) | 0.587 | 0.0086 |
| Week, one invitation in two | 34.3 | 1.0 % (10/1000) | 0.7 % (7/1000) | 180 | 0.016 (32) | 0.0 % (0/16) | 0.0 % (0/1000) | 0.597 | 0.0068 |
| Week, one in four | 19.2 | 0.7 % (7/1000) | 0.1 % (1/1000) | 180 | 0.011 (22) | 0.0 % (0/11) | 0.0 % (0/1000) | 0.605 | 0.0054 |
| No week | 0 | 0.6 % (6/1000) | 0.1 % (1/1000) | 180 | 0.008 (16) | 0.0 % (0/8) | 0.0 % (0/1000) | 0.617 | 0.0034 |

- One invitation in two gave each person 5.0 weeks on average, 34.3 of the 180 days: 10.0 invitations,
  half of them accepted. One in four gave 2.8 weeks, and every invitation accepted 8.0 (55.3 days).
- Even with every invitation accepted, a full step was established by day 180 for 1.8 % of people, and
  the mixed catalogue made no more established calls than at one in two.
- The week adds randomized decisions only while a test is running and the person has said yes, and
  within a week each test's move is still offered at most once a day. By day 180 the full step's test
  had 15 decisions on its move at one in two and 13 with no week; at the upper bound, 59.
- On the same seeds the second verdict's engine established a full step for 1.0 % too (10 of 1,000).
  C3's correction alone makes established calls slightly rarer (0.6 % with no week): its sequence at
  day 180 is wider (1.76 against 1.56). The week at one in two wins that back, and no more.
- S1 held in every realistic run. Read the judge's way, on the no-effect move's declared test, it was
  0 of 1,000 each time. Counting every reading of that move, it was at most 1 of 1,000 (its mood
  reading, with every invitation accepted), still far under 1 in 20.
- Across the 24 realistic runs, 7 established calls were false, every one on a reading the move does
  not affect, and none against a real effect's direction. The mixed catalogue, where S2 is judged, had
  none.
- No move already at likely-hurts or worse was offered, in any run.
- C7 held: fewer move offers per check-in than today's engine, and more benefit per offer.

## C3's correction, on its own

The same 1,000 people per scenario, with no learning week, read both ways:

| Configuration | Base | Daily rhythm | Rebound | Changing context |
| --- | --- | --- | --- | --- |
| No week, `wcls` (the second verdict's engine) | -0.022 (96.2 %) | -0.081 (97.9 %) | -0.121 (96.9 %) | -0.042 (97.5 %) |
| No week, `ht` (C3's correction) | +0.009 (97.7 %) | +0.034 (96.8 %) | -0.070 (98.5 %) | +0.028 (98.5 %) |
| Week one in four, `ht` | -0.001 (97.4 %) | +0.013 (96.8 %) | -0.055 (98.1 %) | +0.061 (98.4 %) |
| Week one in two, `ht` | +0.048 (98.1 %) | -0.057 (97.8 %) | -0.030 (97.8 %) | -0.007 (98.4 %) |

- With the second verdict's estimator the rebound scenario's bias is −0.121, outside C3's ±0.1, as the
  second verdict found on fresh seeds (−0.139). With C3's correction every scenario is within ±0.1:
  −0.070 at most.
- The correction holds with the week on: its largest bias is +0.061 at one in four, and −0.057 at one in
  two.
- Coverage held everywhere, 96.2 % at the lowest, against C3's 93 %.

## Why no setting inside the agreed design passes

- **C6** needs the sequence narrower than the worthwhile margin, about 11 to 13 times the data a week
  that never ends can give (above). The margin is the owner's to confirm, and the result does not hang on
  it: even a margin twice as wide would need about 3 times that data.
- **C1** is reached only by the right test running alone from the first day with a week that never
  ends. The queue cannot know in advance which move has a real effect, and a week is opt-in each time:
  at one invitation in two, the full step's test had 15 decisions on its move by day 180, a quarter of
  the upper bound's.
- **S2** needs at least 73 established calls in the mixed catalogue's 2,000 people, about 0.037 a
  person. One invitation in two gave 0.016, every invitation accepted 0.016 as well, and only a week
  every day, which no opt-in week is, 0.092.
- **What would buy calls, and why each is outside the agreed design or the frozen criteria:**
  - a looser error rate weakens S1's and S2's protection, which the agreed design forbids;
  - a move offered more than once a day, or more check-ins, changes what the person is asked, which
    the agreed design and the app's rules do not allow;
  - a narrower margin, a longer horizon or different thresholds change the frozen criteria, which
    never change.

## What happens now

- Seeds 300001–302000 stay unread, kept for a change that could pass.
- Today's engine stays in the app, unchanged. The learning repair is not built, and the learning week
  with it.
- This is the builder's decision under the owner's instruction of 2026-10-17, recorded in the private
  plan with this evidence. It is not the owner's choice.

## Provenance

- `engineB.ts`, with the week and C3's correction, hashes to
  `cad38d55eb1bbfef0594b790bcd04f3be3d0491f38080d977b84c7c5245997b5`, and `run.ts`, which passes the
  week's own draws to the engine, to `451bd1132a1e05af3d9fb6ba47cae194b617a5b5824dce5f4a480981a565be18`.
- `engineA.ts`, `world.ts`, `scenarios.ts`, `stats.ts` and `metrics.ts` are byte for byte as at the
  second verdict (their hashes are in `RESULTS-2.md`), and so is `pool.ts`.
- The person's answers to invitations come from a seeded stream of their own, so turning the week on
  adds no draw to any other stream.
- Every number above was read from the raw run files by `results3.py`, which prints each file's
  settings, its numbers and these tables; nothing was typed by hand.
- The runs, on 4 worker threads, regenerate exactly:

```
node stress/.out/pool.mjs large B 1 1000 stress/.out/lw/R50/large-B.json 4 '{"estimator":"ht","lw":{"accept":0.5,"length":7,"gap":14,"tests":2,"always":false}}'
```

  The other runs differ only in the settings the tables name: `"accept"` 0.25 or 1, no `"lw"` for no
  week, `{}` for the second verdict's engine, and for the upper bound `"always":true` with the test
  `"pinned"` (and `"queueSize":1` with one test), on seeds 501–1000.
- The 35 runs took 119 minutes on 4 threads, part of the time sharing the machine with the app's own
  tests. The raw results are not committed.
