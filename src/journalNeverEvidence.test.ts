import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Let it out's never-evidence rule (agreed 2026-10-15, adjustment 3), held in the code's own shape: the
// journal's words are read in exactly these places, and nowhere else. The learning engine, the fact sheet,
// the situations, the readings and the free models' prompts never read it, so nothing in it can become a
// reading, a fact, an outcome or a finding. A new reader fails this test until it is added here on purpose.

const READERS = [
  // The phone: its own module, the box in the evening extras, the Journal screen, and the export.
  'src/dataScreen.tsx',
  'src/extras.tsx',
  'src/journal.ts',
  'src/journalScreen.tsx',
  // The Worker: the retrieval layer's reader for Claude, and the check that reads the served nights again.
  'worker/src/claude.ts',
  'worker/src/retrieval.ts',
]

/** Reading the journal's words: its table on the phone, its module, or its rows in the Worker. */
const READS = /\bdb\.journal\b|from '\.\/journal'|readRecords\('journal'/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__snapshots__' ? [] : sources(`${dir}/${e.name}`)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []))
}

describe('the journal is never evidence', () => {
  it('is read only where it is shown, kept, exported or given to Claude under its switch', () => {
    const readers = [...sources('src'), ...sources('worker/src')].filter((f) => READS.test(readFileSync(f, 'utf8'))).sort()
    expect(readers).toEqual(READERS)
  })

  it('reaches no engine module, by import either', () => {
    for (const f of ['src/learning.ts', 'src/learningFlow.ts', 'src/tiers.ts', 'src/bandit.ts', 'src/offers.ts', 'src/offerFlow.ts', 'src/situations.ts', 'src/facts.ts', 'src/score.ts', 'src/claims.ts', 'src/provenance.ts', 'worker/src/brief.ts', 'worker/src/coach.ts', 'worker/src/skillCoach.ts', 'worker/src/qualify.ts']) {
      const text = readFileSync(f, 'utf8')
      expect(text, f).not.toMatch(READS)
      expect(text, f).not.toMatch(/from '\.\.?\/(?:\.\.\/src\/)?journal(?:Screen)?'/)
    }
  })
})
