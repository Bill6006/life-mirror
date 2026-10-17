#!/bin/bash
# The stress test's verdict run (stage 2; criteria frozen 2026-10-16): every scenario once, on a range
# of validation seeds never read before. No-effect scenarios and the mixed catalogue use 2,000 people
# per engine; the rest use 500. Engine A runs where a criterion reads it (C1, C7): no effect, a full
# step, half a step. Engine A is slow, so it runs in parts of 500 people, merged into one file.
#
# bash stress/validate.sh <seed base> [results folder] [threads]
#
# The seeds are base+1 to base+2000. The first verdict read 100001–102000 (base 100000): those seeds
# are spent and never read again. A design fix is re-judged on a fresh range: base 200000, then
# 300000. A result already in the folder is kept, so a stopped run resumes where it stopped.
# ENGINES=A or ENGINES=B runs one engine's part alone.
set -u
cd "$(dirname "$0")/.."
BASE=${1:?the seed base: 200000 reads seeds 200001-202000}
OUT=${2:-stress/.out/val-$BASE}
THREADS=${3:-12}
ENGINES=${ENGINES:-A B}
if [ "$BASE" -lt 1000 ] || { [ "$BASE" -ge 98001 ] && [ "$BASE" -le 101999 ]; }; then
  echo "seeds $((BASE + 1))-$((BASE + 2000)) reach the tuning seeds (1-1000) or the spent range (100001-102000)" >&2
  exit 1
fi
npx esbuild stress/pool.ts --bundle --platform=node --format=esm --outfile=stress/.out/pool.mjs --log-level=warning
mkdir -p "$OUT/parts"
run() { # scenario engine size [cfg] [name]
  local sc=$1 eng=$2 n=$3 cfg=${4:-'{}'} name=${5:-$1}
  case " $ENGINES " in *" $eng "*) ;; *) return ;; esac
  [ -s "$OUT/$name-$eng.json" ] && return
  if [ "$eng" = B ]; then
    node stress/.out/pool.mjs "$sc" B $((BASE + 1)) $((BASE + n)) "$OUT/$name-B.json" "$THREADS" "$cfg" 2>&1 | tail -1
    return
  fi
  local parts=() from to
  for ((from = BASE + 1; from <= BASE + n; from += 500)); do
    to=$((from + 499))
    [ "$to" -gt $((BASE + n)) ] && to=$((BASE + n))
    [ -s "$OUT/parts/$name-A-$from.json" ] || node stress/.out/pool.mjs "$sc" A "$from" "$to" "$OUT/parts/$name-A-$from.json" "$THREADS" "$cfg" 2>&1 | tail -1
    parts+=("$OUT/parts/$name-A-$from.json")
  done
  node stress/.out/pool.mjs merge "$OUT/$name-A.json" "${parts[@]}"
}
for sc in null noisy-null rebound-null rhythm-null context-null sparse-null missing-null adherence-null correlated-null every-checkin-null prior-zero mixed; do run "$sc" B 2000; done
for sc in large moderate tiny harmful noisy-large rebound-large rhythm-large context-large with-her-only context-same sparse-large missing-large adherence-large next-morning multi-day change prior-harm pool-split pool-same large-first; do run "$sc" B 500; done
run pool-same B 500 '{"pool":false}' pool-same-off
run large B 500 '{"poorPrediction":true}' large-poor
run null A 2000
run large A 500
run moderate A 500
echo "validation runs complete: $OUT"
