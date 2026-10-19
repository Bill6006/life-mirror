# Requirement 15's threshold rule, against the design the verdict passed (2026-10-19)

The learning repair keeps a track record of its own calls (requirement 15): every early sign, likely and established
call, kept the first time a test reaches it, and resolved later on that test's own evidence. A call holds when its test
reaches a higher rung in the same direction, or, for an established call, when it has stood sixty days. It does not
hold when its test reaches any rung in another direction, or an established call is withdrawn.

The app's engine also runs the rule the requirement asks for. Once ten of a rung's calls have resolved, that rung
tightens while the exact 95 % interval of its share held lies wholly below the rate the stress test kept for it: early
signs 2 in 3, likely 4 in 5, established 19 in 20. Tightening halves the rung's allowed error: early sign 0.8 to 0.9,
likely 0.95 to 0.975, established's error rate halved. The rung returns to the simulation's value once the share held is
back at that rate. It never goes looser than the simulation's value, which the verdict judged.

The judged design (`REPAIR`) keeps the rule off. The app runs the same design with it on (`IN_APP`). This file answers
one question: does the rule change anything the verdict read?

## The runs

- **The record kept, the rule off.** The judged engine with the track record kept reproduces the passing design's tuning
  run of the mixed catalogue person for person: 1,000 of 1,000 the same (`SCENARIOS=mixed bash stress/track15.sh
  stress/.out/track15-off 12 false`).
- **The rule on, every tuning scenario.** `bash stress/track15.sh` ran all 34 engine-B runs of the passing design's
  tuning set (`stress/.out/fix-tau`, seeds 1–1000, 1,000 people each), with every setting as that run had it and the
  rule on. Every run file carries `trackRule: true`. Compared person by person with the passing design's own tuning run
  (`stress/compare.ts`): **34 of 34 the same, 0 different**: 34,000 simulated people, every result unchanged.

## What it means

The rule changed no result the verdict reads, on any tuning scenario. A tightening that acts is visible: halving
established's error rate widens the confidence sequence every established call rests on (src/repair/track.test.ts),
and the runs record that sequence and every call. So the verdict by requirement 14 (RESULTS-6.md) stands as read for
the design the app runs.

The rule is a safeguard for the owner's own record. In simulation it changed nothing. In the app it acts only if the
owner's own early signs, likely calls or established calls are seen to hold less often than tested, and then only
toward caution.

## The two engines with the rule on

`DESIGN=app node stress/.out/equivalence.mjs 20` runs the judged engine and the app's copy, both with the rule on, on
the twelve equivalence scenarios, live, replayed and rebuilt from app-shaped records, comparing offers, chances, calls,
the week and the track record: **12 of 12 the same**, 20 people each. With the judged design (`REPAIR`, the rule off in
both), also 12 of 12.
