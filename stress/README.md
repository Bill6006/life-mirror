# The stress test (stage 2)

Offline only. Nothing in `src/` or `worker/src/` imports this folder, the app's typecheck and test
runner never reach it, and nothing here ships. It is the agreed stress test of the learning design:
requirement 14, and "the stress test, before any production learning math", in the private execution
plan, which is not in this repository. It ran against criteria frozen on 2026-10-16, before the first
simulation existed. `CRITERIA.md` holds them byte for byte, with their SHA-256.

**The verdict (read once, 2026-10-17): MATERIAL FAILURE.** The report, the options and the
recommendation are in `RESULTS.md`. The learning repair waits on the owner's decision.

## What is here

| File | What it is |
| --- | --- |
| `CRITERIA.md` | The frozen pass/fail criteria and their hash. |
| `RESULTS.md` | The verdict, the judge's output verbatim, the sensitivity runs and the eight-part report. |
| `world.ts` | A simulated person. Real-shaped weeks, three check-ins a day, six readings drifting from block to block (a low tends to rebound), a rhythm by block, the day's context, noise, answers as anchors 1–5. Every draw that does not depend on what an engine offers is made up front, so both engines meet the same person. |
| `scenarios.ts` | The simulated people of the criteria's list, one scenario each. |
| `engineA.ts` | Today's engine, replayed. The draw mirrors `offerFlow.ensureOffer` and the daily run mirrors `learningFlow.runLearning`, calling the committed functions in `src/`. |
| `engineB.ts` | The agreed design (requirements 1–16), prototyped. |
| `stats.ts` | The seeded generator and the small statistics both engines and the judge use. |
| `run.ts` | One person through one engine, and what the metrics need from it. |
| `pool.ts` | Many people over worker threads. |
| `metrics.ts` | The judge: the frozen criteria, read on the validation runs. |
| `validate.sh` | The verdict run: every scenario once, on the validation seeds. |
| `summary.ts`, `tune.ts` | Reading a run while settling values on the tuning seeds. |
| `probeA.ts`, `probeB.ts` | A first look at one simulated person through each engine. |

## Running it

```
npx tsc --noEmit -p stress/tsconfig.json
bash stress/validate.sh
npx esbuild stress/metrics.ts --bundle --platform=node --format=esm --outfile=stress/.out/metrics.mjs
node stress/.out/metrics.mjs
```

- Results land in `stress/.out/` (not committed). They are about 30 MB, and the runs are seeded, so
  they regenerate exactly. `validate.sh` skips any result already there.
- Tuning used seeds 1–1000; the verdict read seeds 100001–102000 once. Fresh seeds for any re-run
  start at 200001.
- The sensitivity runs in `RESULTS.md` (not judged) held walk-ten in the test queue from day one:

```
node stress/.out/pool.mjs large B 501 1000 stress/.out/val/sens-pinned-large-B.json 12 '{"pinned":["walk-ten"]}'
```

  The same command with `moderate` or `null` gives the other two rows.
- `pool.mjs` takes: scenario, engine (A or B), first seed, last seed, output file, threads, and
  the engine's settings as JSON. `validate.sh` builds it.
- On 12 threads, engine B takes about 4 minutes per 2,000 people. Engine A, which replays the app's
  own learning run every day, took 69 minutes for 2,000.
