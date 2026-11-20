#!/bin/bash
# Batch 2's simulations (the forecast follow-ups, items 5 and 6): every world of one item on one range of seeds. The
# criteria were frozen on 2026-11-20 before any of this was written; the private plan holds them. The judges are run
# on the folder afterwards (node stress/.out/fifthJudge.mjs <folder> [tuning]; node stress/.out/holdJudge.mjs <folder> [N]).
#
# bash stress/validate-batch2.sh fifth|hold <first seed> <people> <results folder> [threads] [fifth way's numbers as JSON] [world ...]
#
# Tuning, read as often as needed:  bash stress/validate-batch2.sh hold 1 1000 stress/.out/hold-tune
#                                   bash stress/validate-batch2.sh fifth 1 1000 stress/.out/fifth-tune 12 '{"minClear":2.4}'
# The verdicts, read once:          bash stress/validate-batch2.sh hold 700001 2000 stress/.out/hold-700000
#                                   bash stress/validate-batch2.sh fifth 800001 2000 stress/.out/fifth-800000
# A result already in the folder is kept, so a stopped run resumes where it stopped, and no range is read twice. Each
# world's run is logged beside its result; a run that fails stops the script with its log's end.
set -u -o pipefail
cd "$(dirname "$0")/.."
ITEM=${1:?fifth or hold}
FROM=${2:?first seed}
PEOPLE=${3:?people}
OUT=${4:?results folder}
THREADS=${5:-12}
NUMBERS=${6:-}
shift 4
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
WORLDS=("$@")
case "$ITEM" in
  fifth) [ ${#WORLDS[@]} -eq 0 ] && WORLDS=(plain streaks sparse season rhythm rhythm-half) ;;
  hold) [ ${#WORLDS[@]} -eq 0 ] && WORLDS=(plain streaks sparse rhythm season fifteen-points ten-points own own-persistent) ;;
  *) echo "fifth or hold"; exit 1 ;;
esac
npx esbuild "stress/${ITEM}Pool.ts" --bundle --platform=node --format=esm --outfile="stress/.out/${ITEM}Pool.mjs" --log-level=warning || exit 1
npx esbuild "stress/${ITEM}Judge.ts" --bundle --platform=node --format=esm --outfile="stress/.out/${ITEM}Judge.mjs" --log-level=warning || exit 1
mkdir -p "$OUT"
for w in "${WORLDS[@]}"; do
  [ -s "$OUT/$w.json" ] && { echo "$w: kept"; continue; }
  LOG="$OUT/$w.log"
  if [ -n "$NUMBERS" ]; then node "stress/.out/${ITEM}Pool.mjs" "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" "$NUMBERS" > "$LOG" 2>&1
  else node "stress/.out/${ITEM}Pool.mjs" "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" > "$LOG" 2>&1; fi
  rc=$?
  if [ $rc -ne 0 ]; then echo "$w: FAILED (exit $rc); the log's end:"; tail -15 "$LOG"; exit 1; fi
  tail -1 "$LOG"
done
