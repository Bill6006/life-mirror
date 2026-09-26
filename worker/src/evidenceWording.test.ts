import { describe, expect, it } from 'vitest'
import { EVIDENCE_WORDING } from '../../src/brainShared'
import type { ClaimCard } from '../../src/libraryTypes'
import { cardLines } from './library'
import { claudeInstructions, EVIDENCE_RULE, lineSystem, reviewSystem, withEvidenceRule } from './prompt'

// Pass 4: every writer of a line or a review is told the evidence rule, and each medium or large
// card says its size, once the gate is open. While it is closed every monitored prompt reads exactly
// as before (the gated prompt snapshots hold that byte for byte).

const card = (id: string, size?: 'medium' | 'large'): ClaimCard => ({ id, claim: 'A claim.', domain: 'sleep', tags: ['sleep'], grade: 'A', replication: 'replicated', effect: 'an effect', population: 'adults', sources: [], caveats: 'None.', app: 'A use.', reviewed: '2026-09-25', status: 'admitted', ...(size ? { size } : {}) })
const LAST = '- Plain words, second person, no headings, no lists, no emoji.'

describe('the evidence rule in the prompts (Pass 4)', () => {
  it('is gated, and changes nothing while it is', () => {
    expect(EVIDENCE_WORDING).toBe('gated')
    for (const system of [lineSystem(), reviewSystem(), claudeInstructions('line'), claudeInstructions('review'), claudeInstructions('coach')]) {
      expect(system).not.toContain(EVIDENCE_RULE)
      expect(withEvidenceRule(system, 'gated')).toBe(system)
    }
    expect(cardLines([card('a', 'large'), card('b')], 'gated')).not.toContain('Size:')
  })

  it('once open, tells every writer of a line or a review the rule, once, just before the last rule', () => {
    for (const system of [lineSystem(), reviewSystem(), claudeInstructions('line'), claudeInstructions('review')]) {
      expect(system.split(LAST).length - 1).toBe(1)
      const open = withEvidenceRule(system, 'open')
      expect(open.split(EVIDENCE_RULE).length - 1).toBe(1)
      expect(open).toContain(`${EVIDENCE_RULE}\n${LAST}`)
    }
    // The coach cites no cards and is never given it.
    expect(claudeInstructions('coach')).not.toContain(LAST)
  })

  it('once open, says each medium or large card’s size, and nothing of the rest', () => {
    const lines = cardLines([card('a', 'large'), card('b', 'medium'), card('c')], 'open').split('\n')
    expect(lines[0]).toMatch(/In this app: A use\. Size: large\.$/)
    expect(lines[1]).toMatch(/Size: medium\.$/)
    expect(lines[2]).not.toContain('Size:')
  })
})
