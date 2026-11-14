#!/bin/bash
# The forecast challenger's simulation: every world on one range of seeds, then the judge.
#
# bash stress/validate-forecast.sh <first seed> <people> <results folder> [threads] [numbers as JSON] [world ...]
#
# Tuning: seeds 1 to 1000, read as often as needed.  bash stress/validate-forecast.sh 1 1000 stress/.out/forecast-tune
# The verdict: seeds 600001 to 602000, read once.     bash stress/validate-forecast.sh 600001 2000 stress/.out/forecast-600000
# A second read of one world, into the verdict's folder: seeds 602001 to 610000.
#                                                     bash stress/validate-forecast.sh 602001 8000 stress/.out/forecast-600000/second 12 '' plain
# A result already in the folder is kept, so a stopped run resumes where it stopped, and no range is read twice.
set -u
cd "$(dirname "$0")/.."
FROM=${1:?first seed}
PEOPLE=${2:?people}
OUT=${3:?results folder}
THREADS=${4:-12}
NUMBERS=${5:-}
shift 3
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
WORLDS=("$@")
[ ${#WORLDS[@]} -eq 0 ] && WORLDS=(plain streaks sparse rhythm season fifteen-points ten-points own own-persistent)
npx esbuild stress/forecastPool.ts --bundle --platform=node --format=esm --outfile=stress/.out/forecastPool.mjs --log-level=warning || exit 1
npx esbuild stress/forecastJudge.ts --bundle --platform=node --format=esm --outfile=stress/.out/forecastJudge.mjs --log-level=warning || exit 1
mkdir -p "$OUT"
for w in "${WORLDS[@]}"; do
  [ -s "$OUT/$w.json" ] && { echo "$w: kept"; continue; }
  if [ -n "$NUMBERS" ]; then node stress/.out/forecastPool.mjs "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" "$NUMBERS" 2>&1 | tail -1 || exit 1
  else node stress/.out/forecastPool.mjs "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" 2>&1 | tail -1 || exit 1; fi
done
case "$OUT" in */second) ;; *) node stress/.out/forecastJudge.mjs "$OUT" ;; esac
