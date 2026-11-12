#!/bin/bash
# The counted foundation's simulation: every world on one range of seeds, then the judge.
#
# bash stress/validate-counted.sh <first seed> <people> <results folder> [threads] [world ...]
#
# Tuning: seeds 1 to 1000, read as often as needed.  bash stress/validate-counted.sh 1 1000 stress/.out/counted-tune
# The verdict: seeds 500001 to 502000, read once.     bash stress/validate-counted.sh 500001 2000 stress/.out/counted-500000
# A second read of one world, into the verdict's folder: seeds 502001 to 510000.
#                                                     bash stress/validate-counted.sh 502001 8000 stress/.out/counted-500000/second 12 runs
# A result already in the folder is kept, so a stopped run resumes where it stopped, and no range is read twice.
set -u
cd "$(dirname "$0")/.."
FROM=${1:?first seed}
PEOPLE=${2:?people}
OUT=${3:?results folder}
THREADS=${4:-12}
shift 3
[ $# -gt 0 ] && shift
WORLDS=("$@")
[ ${#WORLDS[@]} -eq 0 ] && WORLDS=(independent-10 independent-30 independent-50 runs weekly-rhythm missing-on-state follows-band runs-persistent season weekday fifteen-points ten-points weekday-checkin evening)
npx esbuild stress/countedPool.ts --bundle --platform=node --format=esm --outfile=stress/.out/countedPool.mjs --log-level=warning || exit 1
npx esbuild stress/countedJudge.ts --bundle --platform=node --format=esm --outfile=stress/.out/countedJudge.mjs --log-level=warning || exit 1
mkdir -p "$OUT"
for w in "${WORLDS[@]}"; do
  [ -s "$OUT/$w.json" ] && { echo "$w: kept"; continue; }
  node stress/.out/countedPool.mjs "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" 2>&1 | tail -1 || exit 1
done
case "$OUT" in */second) ;; *) node stress/.out/countedJudge.mjs "$OUT" ;; esac
