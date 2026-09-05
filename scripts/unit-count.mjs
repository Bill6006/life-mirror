// Reads Vitest's JSON report and prints the number of tests that passed.
// Exits non-zero if anything failed or nothing ran, so the pipeline stops here.
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'unit-results.json'
const report = JSON.parse(readFileSync(file, 'utf8'))
const { numTotalTests: total, numPassedTests: passed, numFailedTests: failed, success } = report

if (!success || failed > 0 || total === 0 || passed !== total) {
  console.error(`unit tests: ${passed}/${total} passed, ${failed} did not`)
  process.exit(1)
}

console.log(String(passed))
