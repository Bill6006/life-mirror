#!/bin/bash
# The week ahead's level-plus-weekday way: every world on one range of seeds. The criteria were frozen on 2026-11-21,
# before the way's code was written; the private repository holds them. The judge is run on the folder afterwards
# (node stress/.out/weekJudge.mjs <folder> [tuning]).
#
# bash stress/validate-week.sh <first seed> <people> <results folder> [threads] [the way's numbers as JSON] [week|challenger] [world ...]
#
# Tuning, read as often as needed:  bash stress/validate-week.sh 1 1000 stress/.out/week-tune 12 '{"window":84}'
# The challenger on the way in use:  bash stress/validate-week.sh 1 1000 stress/.out/week-tune 12 '{"window":84}' challenger
#                                    (far slower; into <folder>/challenger; Phase 8's five useless worlds)
# The verdict, read once:           bash stress/validate-week.sh 900001 2000 stress/.out/week-900000
# A second read of one world:       bash stress/validate-week.sh 902001 8000 stress/.out/week-900000/second 12 '' week plain
# A result already in the folder is kept, so a stopped run resumes where it stopped, and no range is read twice. Each
# world's run is logged beside its result; a run that fails stops the script with its log's end. Before each world the
# script waits while another session's checks hold the breaks lock (LM_MAIN names the checkout that keeps it).
set -u -o pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
MAIN=${LM_MAIN:-$ROOT}
FROM=${1:?first seed}
PEOPLE=${2:?people}
OUT=${3:?results folder}
THREADS=${4:-12}
NUMBERS=${5:-}
KIND=${6:-week}
shift 3
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
WORLDS=("$@")
case "$KIND" in
  week) [ ${#WORLDS[@]} -eq 0 ] && WORLDS=(plain streaks sparse season rhythm rhythm-half rhythm-one rhythm-turn) ;;
  challenger) [ ${#WORLDS[@]} -eq 0 ] && WORLDS=(plain streaks sparse rhythm season); OUT="$OUT/challenger"; export WEEK_CHALLENGER=1 ;;
  *) echo "week or challenger"; exit 1 ;;
esac
ESBUILD="$MAIN/node_modules/.bin/esbuild"
NODE_PATH="$MAIN/node_modules" "$ESBUILD" stress/weekPool.ts --bundle --platform=node --format=esm --outfile=stress/.out/weekPool.mjs --log-level=warning || exit 1
NODE_PATH="$MAIN/node_modules" "$ESBUILD" stress/weekJudge.ts --bundle --platform=node --format=esm --outfile=stress/.out/weekJudge.mjs --log-level=warning || exit 1
mkdir -p "$OUT"
for w in "${WORLDS[@]}"; do
  [ -s "$OUT/$w.json" ] && { echo "$w: kept"; continue; }
  while [ -d "$MAIN/.qa/breaks.lock" ]; do echo "$(date '+%H:%M:%S') waiting: the breaks lock is held"; sleep 30; done
  LOG="$OUT/$w.log"
  if [ -n "$NUMBERS" ]; then node stress/.out/weekPool.mjs "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" "$NUMBERS" > "$LOG" 2>&1
  else node stress/.out/weekPool.mjs "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" > "$LOG" 2>&1; fi
  rc=$?
  if [ $rc -ne 0 ]; then echo "$w: FAILED (exit $rc); the log's end:"; tail -15 "$LOG"; exit 1; fi
  tail -1 "$LOG"
done
