import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The evidence library's second reader, end to end (P3, 2026-11-06): the check and the reader run on a copy of the
// library. A card drafted through the second version is admitted only on the very words a reader other than its
// drafter judged; a verdict is kept only for the words laid out for that reader; and a claim, effect or population
// changed after its reading is no longer read.

type Card = Record<string, unknown> & { id: string; claim: string; effect?: string; population?: string; status: string; drafted?: { run: string }; support?: Record<string, unknown> }
const library = JSON.parse(readFileSync('src/library.json', 'utf8')) as Card[]
const dir = mkdtempSync(join(tmpdir(), 'lm-library-'))
let n = 0

/** The fingerprint of the words a reader judges, as the scripts take it. */
const judged = (c: Pick<Card, 'claim' | 'effect' | 'population'>) => createHash('sha256').update(JSON.stringify([c.claim, c.effect ?? null, c.population ?? null]), 'utf8').digest('hex').slice(0, 16)

function write(name: string, data: unknown): string {
  const file = join(dir, `${++n}-${name}.json`)
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return file
}

function run(script: string, args: string[], file: string) {
  const r = spawnSync(process.execPath, [`scripts/${script}`, ...args], { env: { ...process.env, LIBRARY_FILE: file }, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const copy = () => JSON.parse(JSON.stringify(library)) as Card[]
const drafted = (cards: Card[]) => cards.find((c) => c.drafted && c.status === 'admitted') as Card

describe('the library check, on a copy', () => {
  it('passes the library as it stands', () => {
    const r = run('library-check.mjs', ['--check'], write('as-is', library))
    expect(r.out).toContain('well formed')
    expect(r.code).toBe(0)
  })

  it('refuses a drafted card admitted on words its reader did not judge', () => {
    const cards = copy()
    const c = drafted(cards)
    c.claim = `${c.claim} And more than its passages say.`
    const r = run('library-check.mjs', ['--check'], write('changed', cards))
    expect(r.code).toBe(1)
    expect(r.out).toContain(`${c.id}: admitted, but its claim, effect or population is not the wording its reader judged`)
  })

  it('refuses a drafted card admitted on its drafter’s own reading', () => {
    const cards = copy()
    const c = drafted(cards)
    c.support = { ...c.support, run: c.drafted?.run }
    const r = run('library-check.mjs', ['--check'], write('self-read', cards))
    expect(r.code).toBe(1)
    expect(r.out).toContain(`${c.id}: admitted without spans and a reader other than its drafter saying it supports`)
  })
})

describe('the second reader, on a copy', () => {
  it('keeps a verdict only for the words laid out, with their fingerprint', () => {
    const cards = copy()
    const c = drafted(cards)
    const laid = { claims: [{ id: c.id, read: judged(c), claim: c.claim, effect: c.effect, population: c.population }] }
    const verdicts = { run: 'test-reader', verdicts: [{ id: c.id, verdict: 'supports', why: 'The passages say it.' }] }
    const same = write('same', cards)
    expect(run('library-reader.mjs', ['--apply', write('verdicts', verdicts), write('batch', laid)], same).code).toBe(0)
    const kept = (JSON.parse(readFileSync(same, 'utf8')) as Card[]).find((x) => x.id === c.id)
    expect(kept?.support).toMatchObject({ run: 'test-reader', verdict: 'supports', read: judged(c) })
    // The claim changed after it was laid out: no verdict is kept, and the reason is said.
    c.claim = `${c.claim} Changed since.`
    const r = run('library-reader.mjs', ['--apply', write('verdicts', verdicts), write('batch', laid)], write('changed', cards))
    expect(r.code).not.toBe(0)
    expect(r.out).toContain(`${c.id}: its claim, effect or population changed after it was laid out`)
  })

  it('admits a card only on the words its reader judged', () => {
    const cards = copy()
    const c = drafted(cards)
    c.status = 'draft'
    c.population = `${c.population}, and others`
    const r = run('library-reader.mjs', ['--admit', c.id], write('admit-changed', cards))
    expect(r.code).not.toBe(0)
    expect(r.out).toContain(`${c.id}: its claim, effect or population changed after its reading`)
    // The words it was read on: admitted.
    const fine = copy()
    const d = drafted(fine)
    d.status = 'draft'
    const file = write('admit-same', fine)
    expect(run('library-reader.mjs', ['--admit', d.id], file).code).toBe(0)
    expect((JSON.parse(readFileSync(file, 'utf8')) as Card[]).find((x) => x.id === d.id)?.status).toBe('admitted')
  })
})
