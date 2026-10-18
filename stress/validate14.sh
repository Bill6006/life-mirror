#!/bin/bash
# The verdict by requirement 14's rule (the owner's decision of 2026-10-18), read once on fresh seeds from 300001, the
# range the criteria name for the last re-judgement. The no-effect scenarios use 2,000 people, as the criteria fix
# them; every other scenario 5,000 (the criteria ask at least 500), so that no gate turns on sampling noise; the mixed
# catalogue 10,000, as the owner approved for S2. Engine B runs the design settled on the tuning seeds (RESULTS-4.md);
# engine A runs where a criterion reads it, as validate.sh runs it. Judged twice: by metrics.ts (the frozen verdict)
# and by verdict14.ts (gates and reported values).
#
# bash stress/validate14.sh [results folder] [threads]
#
# A result already in the folder is kept, so a stopped run resumes where it stopped. ENGINES=A or ENGINES=B runs one
# engine's part alone.
set -u
cd "$(dirname "$0")/.."
BASE=300000
OUT=${1:-stress/.out/val-300000}
THREADS=${2:-12}
ENGINES=${ENGINES:-A B}
DESIGN='{"estimator":"hybrid","hybridMin":2,"vague":0.3,"declareAll":true,"alphaWeights":"research","queueScore":"benefit","keepEarly":true,"queueSize":2,"lw":{"accept":0.5,"length":7,"gap":0,"gapNo":7,"tests":2,"always":false}}'
npx esbuild stress/pool.ts --bundle --platform=node --format=esm --outfile=stress/.out/pool.mjs --log-level=warning
npx esbuild stress/metrics.ts --bundle --platform=node --format=esm --outfile=stress/.out/metrics.mjs --log-level=warning
npx esbuild stress/verdict14.ts --bundle --platform=node --format=esm --outfile=stress/.out/verdict14.mjs --log-level=warning
mkdir -p "$OUT/parts"
run() { # scenario engine size [extra settings] [name]
  local sc=$1 eng=$2 n=$3 extra=${4:-} name=${5:-$1}
  case " $ENGINES " in *" $eng "*) ;; *) return ;; esac
  [ -s "$OUT/$name-$eng.json" ] && return
  if [ "$eng" = B ]; then
    local cfg="$DESIGN"
    [ -n "$extra" ] && cfg="${DESIGN%\}},$extra}"
    node stress/.out/pool.mjs "$sc" B $((BASE + 1)) $((BASE + n)) "$OUT/$name-B.json" "$THREADS" "$cfg" 2>&1 | tail -1
    return
  fi
  local parts=() from to
  for ((from = BASE + 1; from <= BASE + n; from += 500)); do
    to=$((from + 499))
    [ "$to" -gt $((BASE + n)) ] && to=$((BASE + n))
    [ -s "$OUT/parts/$name-A-$from.json" ] || node stress/.out/pool.mjs "$sc" A "$from" "$to" "$OUT/parts/$name-A-$from.json" "$THREADS" '{}' 2>&1 | tail -1
    parts+=("$OUT/parts/$name-A-$from.json")
  done
  node stress/.out/pool.mjs merge "$OUT/$name-A.json" "${parts[@]}"
}
run mixed B 10000
for sc in null noisy-null rebound-null rhythm-null context-null sparse-null missing-null adherence-null correlated-null every-checkin-null prior-zero; do run "$sc" B 2000; done
for sc in large moderate tiny harmful noisy-large rebound-large rhythm-large context-large with-her-only context-same sparse-large missing-large adherence-large next-morning multi-day change prior-harm pool-split pool-same large-first; do run "$sc" B 5000; done
run pool-same B 5000 '"pool":false' pool-same-off
run large B 5000 '"poorPrediction":true' large-poor
run null A 2000
run large A 500
run moderate A 500
echo "validation runs complete: $OUT"
node stress/.out/metrics.mjs "$OUT" "$OUT/verdict.json" > "$OUT/verdict.txt"
node stress/.out/verdict14.mjs "$OUT" "$OUT/verdict14.json" > "$OUT/verdict14.txt"
echo "judged: $OUT/verdict.txt and $OUT/verdict14.txt"
