import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { findPath, type Path } from './catalogue'
import { copy } from './copy'
import type { PathVersion } from './db'
import { contentHash, offersDecision, requestedPath, standing } from './pathVersions'

// The Path request fix (2026-11-21): a request whose Path came back is read from its row only until you decide on that
// Path, and then says where it stands with you, from your decisions and your Aims; the read screen of a Path you started
// that is on your Aims offers no second start, and no Later or Not this. Removing a commitment writes no decision, so a
// Path started and then removed reads by your Aims alone, and Add's read screen still starts it again.

const speaking = findPath('speaking') as Path
// The same Path at a second version, a minor change since the first; and with that change major.
const minor: Path = {
  ...speaking,
  version: '2',
  changes: [
    { version: '1', day: '2026-11-06', reason: 'design', major: true, what: 'The first version.' },
    { version: '2', day: '2026-11-10', reason: 'editorial', major: false, what: 'Clearer words.' },
  ],
}
const major: Path = { ...minor, changes: [minor.changes![0], { ...minor.changes![1], major: true }] }

let n = 0
/** A decision on the Path, a second after the one before it. */
function row(path: Path, decision: PathVersion['decision'], hash = contentHash(path), version = path.version ?? '1'): PathVersion {
  n += 1
  return { id: n, path: path.id, version, hash, decision, at: new Date(Date.UTC(2026, 10, 12, 9, 0, n)).toISOString(), cards: [] }
}

describe('where a requested Path stands with you, for its row', () => {
  it('is still to decide with no decision, and set aside or declined after Later or Not this, on your Aims or not', () => {
    for (const onAims of [false, true]) {
      expect(requestedPath(speaking, [], onAims)).toBe('undecided')
      expect(requestedPath(speaking, [row(speaking, 'later')], onAims)).toBe('later')
      expect(requestedPath(speaking, [row(speaking, 'notThis')], onAims)).toBe('notThis')
    }
  })

  it('is on your Aims once started there, on its current version, a minor change since, or a major change waiting', () => {
    expect(standing(speaking, [row(speaking, 'started')])).toEqual({ kind: 'started', noted: [] })
    expect(requestedPath(speaking, [row(speaking, 'started')], true)).toBe('onAims')
    const onOne = [row(minor, 'started', 'an older hash', '1')]
    expect(standing(minor, onOne).kind).toBe('started')
    expect(requestedPath(minor, onOne, true)).toBe('onAims')
    expect(standing(major, onOne).kind).toBe('waiting')
    expect(requestedPath(major, onOne, true)).toBe('onAims')
  })

  it('is removed once started and taken off your Aims, whatever version it was started on', () => {
    expect(requestedPath(speaking, [row(speaking, 'started')], false)).toBe('removed')
    const onOne = [row(minor, 'started', 'an older hash', '1')]
    expect(requestedPath(minor, onOne, false)).toBe('removed')
    expect(requestedPath(major, onOne, false)).toBe('removed')
  })

  it('reads your latest decision: a start after Not this, and Later after a start', () => {
    expect(requestedPath(speaking, [row(speaking, 'notThis'), row(speaking, 'started')], true)).toBe('onAims')
    expect(requestedPath(speaking, [row(speaking, 'started'), row(speaking, 'later')], true)).toBe('later')
    expect(requestedPath(speaking, [row(speaking, 'later'), row(speaking, 'started'), row(speaking, 'notThis')], false)).toBe('notThis')
  })

  it('leaves a built-in Path, never a request’s, as it reads today', () => {
    const social = findPath('social') as Path
    expect(requestedPath(social, [], true)).toBe('undecided')
    expect(requestedPath(social, [], false)).toBe('undecided')
  })

  it('says each standing in its own words, and the read screen of a Path you started says so in its own', () => {
    expect(copy.path.make.decided).toEqual({
      onAims: 'Started: it is on your Aims.',
      later: 'Set aside for later: Add still has it.',
      notThis: 'You chose Not this: Add still has it.',
      removed: 'Started, then removed from your Aims: Add still has it.',
    })
    expect(copy.path.make.states.ready).toBe('Ready to read.')
    expect(copy.path.read.started).toBe('A Path you started')
  })
})

describe('what a Path’s read screen offers', () => {
  it('offers no Start, Later or Not this for a Path started on its current version that is on your Aims', () => {
    expect(offersDecision(standing(speaking, [row(speaking, 'started')]), true)).toBe(false)
    // A minor change since is only noted: the Path is still started on its current version, as the app counts it.
    expect(offersDecision(standing(minor, [row(minor, 'started', 'an older hash', '1')]), true)).toBe(false)
  })

  it('offers them as today for a major change waiting, read and continued there', () => {
    expect(offersDecision(standing(major, [row(major, 'started', 'an older hash', '1')]), true)).toBe(true)
  })

  it('offers them as today for a Path started and removed from your Aims, so Add starts it again', () => {
    expect(offersDecision(standing(speaking, [row(speaking, 'started')]), false)).toBe(true)
    expect(offersDecision(standing(minor, [row(minor, 'started', 'an older hash', '1')]), false)).toBe(true)
  })

  it('offers them as today for a Path still to decide, set aside or declined, on your Aims or not', () => {
    for (const onAims of [false, true]) {
      expect(offersDecision(standing(speaking, []), onAims)).toBe(true)
      expect(offersDecision(standing(speaking, [row(speaking, 'later')]), onAims)).toBe(true)
      expect(offersDecision(standing(speaking, [row(speaking, 'notThis')]), onAims)).toBe(true)
      expect(offersDecision({ kind: 'builtIn' }, onAims)).toBe(true)
    }
  })
})
