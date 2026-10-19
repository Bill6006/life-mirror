#!/bin/bash
# Requirement 15's threshold rule (2026-10-19), against the design the verdict passed: every engine-B scenario on the
# tuning seeds 1–1000, as the correction's tuning run had them (stress/.out/fix-tau), with the rule on; then the two
# runs compared person by person. If no person differs, the rule never acted there, and the verdict stands as read.
# The judged design itself keeps the rule off.
#
# bash stress/track15.sh [results folder] [threads] [switch]
#
# A result already in the folder is kept, so a stopped run resumes where it stopped. The switch is true by default;
# false runs the same with the rule off, to show the record kept alone changes nothing.
set -u
cd "$(dirname "$0")/.."
OUT=${1:-stress/.out/track15-on}
THREADS=${2:-12}
RULE=${3:-true}
DESIGN="{\"estimator\":\"hybrid\",\"hybridMin\":2,\"vague\":0.3,\"priorTau\":0.4,\"declareAll\":true,\"alphaWeights\":\"research\",\"queueScore\":\"benefit\",\"keepEarly\":true,\"queueSize\":2,\"lw\":{\"accept\":0.5,\"length\":7,\"gap\":0,\"gapNo\":7,\"tests\":2,\"always\":false},\"trackRule\":$RULE}"
SCENARIOS=${SCENARIOS:-mixed null noisy-null rebound-null rhythm-null context-null sparse-null missing-null adherence-null correlated-null every-checkin-null prior-zero multi-day large moderate tiny harmful noisy-large rebound-large rhythm-large context-large with-her-only context-same sparse-large missing-large adherence-large next-morning change prior-harm pool-split pool-same large-first pool-same-off large-poor}
npx esbuild stress/pool.ts --bundle --platform=node --format=esm --outfile=stress/.out/pool.mjs --log-level=warning
npx esbuild stress/compare.ts --bundle --platform=node --format=esm --outfile=stress/.out/compare.mjs --log-level=warning
mkdir -p "$OUT"
for name in $SCENARIOS; do
  sc=$name
  cfg="$DESIGN"
  case $name in
    pool-same-off) sc=pool-same; cfg="${DESIGN%\}},\"pool\":false}" ;;
    large-poor) sc=large; cfg="${DESIGN%\}},\"poorPrediction\":true}" ;;
  esac
  [ -s "$OUT/$name-B.json" ] && continue
  node stress/.out/pool.mjs "$sc" B 1 1000 "$OUT/$name-B.json" "$THREADS" "$cfg" 2>&1 | tail -1
done
echo "runs complete: $OUT"
node stress/.out/compare.mjs stress/.out/fix-tau "$OUT" > "$OUT/compare.txt"
tail -1 "$OUT/compare.txt"
