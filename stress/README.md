# The stress test (stage 2)

Offline only. Nothing in `src/` or `worker/src/` imports this folder, the app's typecheck and test
runner never reach it, and nothing here ships. It is the agreed stress test of the learning design:
requirement 14, and "the stress test, before any production learning math", in the private execution
plan, which is not in this repository. It ran against criteria frozen on 2026-10-16, before the first
simulation existed. `CRITERIA.md` holds them byte for byte, with their SHA-256.

**The first verdict (read once, 2026-10-17, seeds 100001–102000): MATERIAL FAILURE**, in `RESULTS.md`.
It found three defects in the design. They were corrected inside the agreed design, the values were
re-settled on the tuning seeds, and the verdict was read once more on fresh seeds 200001–202000 against
the same frozen criteria: **MATERIAL FAILURE** again, in `RESULTS-2.md`.

**Then the learning week, tried (2026-10-17, tuning seeds only)**, in `RESULTS-3.md`. The agreed
design's one part that adds randomized decisions per day was built here, with C3's correction, and
tuned on seeds 1–1000. No realistic configuration can pass everything, so the last fresh range,
300001–302000, stays unread, and today's engine stays.

**Then the design search (2026-10-18, tuning seeds only)**, in `RESULTS-4.md`, asked for in the owner's words
before any change to the pass marks: the strongest designs not yet tried, 23 of them on C1's full step, then the
strongest inside the agreed principles across all 34 scenarios. It holds every safeguard these runs can judge and
every check on honesty, and fails every criterion that asks how soon a call is reached; S2 cannot be judged on so
few calls. The last fresh range stays unread, and what happens next is the owner's decision.

**Then the verdict by requirement 14's rule (read once, 2026-10-18, fresh seeds from 300001): FAIL on one gate of
23**, in `RESULTS-5.md`. The owner decided that the engine is judged with the safeguards first and its speed reported.
Every gate passed, S2 on 10,000 people among them, except C2: the belief intervals covered the truth in 89.1 % of
sparse looks, against 90 %. Today's engine stays; the smallest correction is in that write-up, and judging it again
is the owner's decision.

**Then, at the owner's word, the correction judged once more (2026-10-19, fresh seeds from 400001): PASS, all 23
gates**, in `RESULTS-6.md`. The stress test has passed by the rule the owner chose, and the learning repair is built
next.

## What is here

| File | What it is |
| --- | --- |
| `CRITERIA.md` | The frozen pass/fail criteria and their hash. |
| `RESULTS.md` | The first verdict, the judge's output verbatim, the sensitivity runs and the eight-part report. |
| `RESULTS-2.md` | The verdict after the three corrections: the corrections, the re-settled values, the judge's output verbatim, its independent recount and the report. |
| `RESULTS-3.md` | The learning week and C3's correction, tuned on seeds 1–1000: the probe that could have said yes, the realistic week and lower rates, and why the last fresh range stays unread. |
| `RESULTS-6.md` | The verdict by requirement 14's rule after C2's correction, read once more on fresh seeds: PASS, both judges' output verbatim. |
| `RESULTS-5.md` | The verdict by requirement 14's rule, read once on fresh seeds: both judges' output verbatim, why C2 failed, and the smallest correction. |
| `RESULTS-4.md` | The design search on seeds 1–1000: every design tried on C1's full step, the probes with the right test from day one, the strongest design's full run with the judge's output verbatim, and why every remaining failure is speed. |
| `world.ts` | A simulated person. Real-shaped weeks, three check-ins a day, six readings drifting from block to block (a low tends to rebound), a rhythm by block, the day's context, noise, answers as anchors 1–5. Every draw that does not depend on what an engine offers is made up front, so both engines meet the same person. |
| `scenarios.ts` | The simulated people of the criteria's list, one scenario each. |
| `engineA.ts` | Today's engine, replayed. The draw mirrors `offerFlow.ensureOffer` and the daily run mirrors `learningFlow.runLearning`, calling the committed functions in `src/`. |
| `engineB.ts` | The agreed design (requirements 1–16), prototyped, with the three corrections; the learning week (`lw`), C3's correction (`estimator: 'ht'`, or `'hybrid'` for sparse tests) and the design search's settings (`declareAll`, `alphaWeights`, `queueScore`, `keepEarly`, `lw.gapNo`, `hybridMin`), all off by default. |
| `stats.ts` | The seeded generator and the small statistics both engines and the judge use. |
| `run.ts` | One person through one engine, and what the metrics need from it. |
| `pool.ts` | Many people over worker threads; it also merges parts of one run. |
| `metrics.ts` | The judge: the frozen criteria, read on the validation runs. |
| `verdict14.ts` | The verdict by requirement 14's rule: every clause read as `metrics.ts` reads it, each a gate or a reported value. |
| `recount.py` | An independent recount of the judge's headline numbers from the raw runs, in another language. |
| `results3.py` | The learning-week runs read the way the judge reads the criteria: every number in `RESULTS-3.md`. |
| `results4.py` | The design search's runs of C1's full step: the table in `RESULTS-4.md`, each file's settings printed beside it. |
| `validate.sh` | The verdict run: every scenario once, on a range of validation seeds never read before. |
| `validate14.sh` | The verdict run by requirement 14's rule: the design `RESULTS-4.md` settled, at the sizes that let every gate decide. |
| `validate14b.sh` | The same, once more after C2's correction, on fresh seeds from 400001. |
| `summary.ts`, `tune.ts` | Reading a run while settling values on the tuning seeds. |
| `equivalence.ts` | The learning repair's guarantee: the stress test's people run through the judged engine and the app's copy (`src/repair/engine.ts`), live, replayed from the record, and rebuilt from app-shaped records by `src/repair/record.ts`; the same offers, chances, calls and week on every day. `perturb` is its own break. |
| `probeA.ts`, `probeB.ts` | A first look at one simulated person through each engine. |

## Running it

```
npx tsc --noEmit -p stress/tsconfig.json
bash stress/validate.sh 200000 stress/.out/val-200000 12
npx esbuild stress/metrics.ts --bundle --platform=node --format=esm --outfile=stress/.out/metrics.mjs
node stress/.out/metrics.mjs stress/.out/val-200000
python3 -I stress/recount.py stress/.out/val-200000
```

- `validate.sh` takes the seed base, the results folder and the number of threads; the seeds are
  base+1 to base+2000. `ENGINES=A` or `ENGINES=B` runs one engine's part alone.
- Results land in `stress/.out/` (not committed). The runs are seeded, so they regenerate exactly, and
  `validate.sh` keeps any result already there, so a stopped run resumes where it stopped.
- The seeds:
  - tuning: 1–1000, the only seeds any value was settled on;
  - the first verdict: 100001–102000, read once and spent. `validate.sh` refuses them, and the tuning
    seeds;
  - the verdict after the three corrections: 200001–202000, read once;
  - fresh seeds for any later re-judgement start at 300001.
- The first verdict's code is the commit before the corrections, 761e99d (hashes in `RESULTS.md`).
- The sensitivity runs (not judged) hold one test in the queue from day one, named by its key:

```
node stress/.out/pool.mjs large B 501 1000 stress/.out/sens/pinned-large-B.json 12 '{"pinned":["walk-ten|stress|nextBlock"]}'
```

  The same command with `moderate` or `null` gives the other rows.
- The learning-week runs of `RESULTS-3.md` (tuning seeds only, never a verdict) pass engine B's
  settings the same way, for example the realistic week:

```
node stress/.out/pool.mjs large B 1 1000 stress/.out/lw/R50/large-B.json 4 '{"estimator":"ht","lw":{"accept":0.5,"length":7,"gap":14,"tests":2,"always":false}}'
```

  `python3 -I stress/results3.py stress/.out/lw` then prints every number `RESULTS-3.md` quotes.
- `pool.mjs` takes: scenario, engine (A or B), first seed, last seed, output file, threads, and
  engine B's settings as JSON. `pool.mjs merge <out.json> <part.json>…` joins parts of one run over
  consecutive seeds into the file one run would have written. `validate.sh` builds it, and runs engine
  A in parts of 500.
- On 4 threads, engine B took about 140 minutes for all 34 runs (35,000 people). Engine A, which
  replays the app's own learning run every day, took about 147 minutes for 2,000 people.
