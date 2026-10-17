# The stress test (stage 2)

Offline only. Nothing in `src/` or `worker/src/` imports this folder, the app's typecheck and test
runner never reach it, and nothing here ships. It is the agreed stress test of the learning design:
requirement 14, and "the stress test, before any production learning math", in the private execution
plan, which is not in this repository. It ran against criteria frozen on 2026-10-16, before the first
simulation existed. `CRITERIA.md` holds them byte for byte, with their SHA-256.

**The first verdict (read once, 2026-10-17, seeds 100001–102000): MATERIAL FAILURE**, in `RESULTS.md`.
It found three defects in the design. They were corrected inside the agreed design, the values were
re-settled on the tuning seeds, and the verdict was read once more on fresh seeds 200001–202000 against
the same frozen criteria: **MATERIAL FAILURE** again, in `RESULTS-2.md`. The learning repair waits on
the owner's decision.

## What is here

| File | What it is |
| --- | --- |
| `CRITERIA.md` | The frozen pass/fail criteria and their hash. |
| `RESULTS.md` | The first verdict, the judge's output verbatim, the sensitivity runs and the eight-part report. |
| `RESULTS-2.md` | The verdict after the three corrections: the corrections, the re-settled values, the judge's output verbatim, its independent recount and the report. |
| `world.ts` | A simulated person. Real-shaped weeks, three check-ins a day, six readings drifting from block to block (a low tends to rebound), a rhythm by block, the day's context, noise, answers as anchors 1–5. Every draw that does not depend on what an engine offers is made up front, so both engines meet the same person. |
| `scenarios.ts` | The simulated people of the criteria's list, one scenario each. |
| `engineA.ts` | Today's engine, replayed. The draw mirrors `offerFlow.ensureOffer` and the daily run mirrors `learningFlow.runLearning`, calling the committed functions in `src/`. |
| `engineB.ts` | The agreed design (requirements 1–16), prototyped, with the three corrections. |
| `stats.ts` | The seeded generator and the small statistics both engines and the judge use. |
| `run.ts` | One person through one engine, and what the metrics need from it. |
| `pool.ts` | Many people over worker threads; it also merges parts of one run. |
| `metrics.ts` | The judge: the frozen criteria, read on the validation runs. |
| `recount.py` | An independent recount of the judge's headline numbers from the raw runs, in another language. |
| `validate.sh` | The verdict run: every scenario once, on a range of validation seeds never read before. |
| `summary.ts`, `tune.ts` | Reading a run while settling values on the tuning seeds. |
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
- `pool.mjs` takes: scenario, engine (A or B), first seed, last seed, output file, threads, and
  engine B's settings as JSON. `pool.mjs merge <out.json> <part.json>…` joins parts of one run over
  consecutive seeds into the file one run would have written. `validate.sh` builds it, and runs engine
  A in parts of 500.
- On 4 threads, engine B took about 140 minutes for all 34 runs (35,000 people). Engine A, which
  replays the app's own learning run every day, took about 147 minutes for 2,000 people.
