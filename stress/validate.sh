#!/bin/bash
# The stress test's verdict run (stage 2; criteria frozen 2026-10-16): every scenario once, on the
# validation seeds 100001–102000, never used before. No-effect scenarios and the mixed catalogue use
# 2,000 people per engine; the rest use 500. Engine A runs where a criterion reads it (C1): no
# effect, a full step, half a step. Results land in stress/.out/val/.
#
# bash stress/validate.sh
set -u
cd "$(dirname "$0")/.."
npx esbuild stress/pool.ts --bundle --platform=node --format=esm --outfile=stress/.out/pool.mjs --log-level=warning
OUT=stress/.out/val
mkdir -p "$OUT"
run() { # scenario engine size [cfg] [name]
  local sc=$1 eng=$2 n=$3 cfg=${4:-'{}'} name=${5:-$1}
  local to=$((100000 + n))
  [ -s "$OUT/$name-$eng.json" ] && return
  node stress/.out/pool.mjs "$sc" "$eng" 100001 "$to" "$OUT/$name-$eng.json" 12 "$cfg" 2>&1 | tail -1
}
for sc in null noisy-null rebound-null rhythm-null context-null sparse-null missing-null adherence-null correlated-null every-checkin-null prior-zero mixed; do run "$sc" B 2000; done
for sc in large moderate tiny harmful noisy-large rebound-large rhythm-large context-large with-her-only context-same sparse-large missing-large adherence-large next-morning multi-day change prior-harm pool-split pool-same large-first; do run "$sc" B 500; done
run pool-same B 500 '{"pool":false}' pool-same-off
run large B 500 '{"poorPrediction":true}' large-poor
run null A 2000
run large A 500
run moderate A 500
echo "validation runs complete"
