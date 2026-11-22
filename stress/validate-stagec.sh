#!/bin/bash
# Stage C, the week ahead from what is known about each day: every world on one range of seeds, with the numbers the
# code itself holds (STAGE_C in stress/stageC.ts). The criteria were frozen on 2026-11-21, before the method's code was
# written; the private repository holds them. The judge and the second count are run on the folder afterwards:
#   node stress/.out/stageCJudge.mjs judge <folder> 0 [folder of further people]
#   python -I -X utf8 stress/stageC_recount.py <folder> 0 [folder of further people]
#
# bash stress/validate-stagec.sh <first seed> <people> <results folder> [threads] [world ...]
#
# The verdict, read once:            bash stress/validate-stagec.sh 920001 2000 stress/.out/c-920000
# A world between its marks, once:   bash stress/validate-stagec.sh 922001 8000 stress/.out/c-920000/further 13 <world>
# The three worlds the challenger is judged in (plain, two-strong, sun) are run with the app's challenger on the way in
# use, so that it is read on the same people. A result already in the folder is kept, so a stopped run resumes where it
# stopped and no range is read twice. Each world's run is logged beside its result; a run that fails stops the script
# with its log's end. Before each world the script waits while another session's checks hold the breaks lock (LM_MAIN
# names the checkout that keeps it, and whose node_modules a clean copy builds with).
set -u -o pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
MAIN=${LM_MAIN:-$ROOT}
FROM=${1:?first seed}
PEOPLE=${2:?people}
OUT=${3:?results folder}
THREADS=${4:-13}
shift 3
[ $# -gt 0 ] && shift
WORLDS=("$@")
[ ${#WORLDS[@]} -eq 0 ] && WORLDS=(plain streaks sparse season rhythm rhythm-half rhythm-one rhythm-turn two two-strong sun sun-weak sun-bad kind-move kind-idle all event event-weak event-rhythm event-idle event-flat event-told event-masked event-many)
ESBUILD="$MAIN/node_modules/.bin/esbuild"
NODE_PATH="$MAIN/node_modules" "$ESBUILD" stress/stageCSim.ts --bundle --platform=node --format=esm --outfile=stress/.out/stageCSim.mjs --log-level=warning || exit 1
NODE_PATH="$MAIN/node_modules" "$ESBUILD" stress/stageCJudge.ts --bundle --platform=node --format=esm --outfile=stress/.out/stageCJudge.mjs --log-level=warning || exit 1
mkdir -p "$OUT"
echo "$(date '+%H:%M:%S') seeds $FROM to $((FROM + PEOPLE - 1)), ${#WORLDS[@]} worlds, into $OUT, from $(git rev-parse --short HEAD) ($(git status --porcelain -- stress src | wc -l) files changed under stress and src)"
for w in "${WORLDS[@]}"; do
  [ -s "$OUT/$w.json" ] && { echo "$w: kept"; continue; }
  while [ -d "$MAIN/.qa/breaks.lock" ]; do echo "$(date '+%H:%M:%S') waiting: the breaks lock is held"; sleep 30; done
  LOG="$OUT/$w.log"
  case "$w" in
    plain|two-strong|sun) node stress/.out/stageCSim.mjs run "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" "" challenger > "$LOG" 2>&1 ;;
    *) node stress/.out/stageCSim.mjs run "$w" "$FROM" $((FROM + PEOPLE - 1)) "$OUT/$w.json" "$THREADS" > "$LOG" 2>&1 ;;
  esac
  rc=$?
  if [ $rc -ne 0 ]; then echo "$w: FAILED (exit $rc); the log's end:"; tail -15 "$LOG"; exit 1; fi
  tail -1 "$LOG"
done
echo "$(date '+%H:%M:%S') done"
