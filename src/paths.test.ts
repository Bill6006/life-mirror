import { describe, expect, it } from 'vitest'
import { isPathOnly, isProposed, liveMoves, moves, pathReps, paths, SETTING_KINDS, type Move, type Path } from './catalogue'
import { cardById } from './library'
import { candidatesFor, NOTHING, type Situation, type TodayState } from './offers'

// The Social and Partner paths as content (Parts 23 and 26): read and vetoed before anything
// behaves differently. Every stage the rule moves can be met in person; online and remote reps
// move nothing; no path text rates a person or counts an outcome; nothing proposed is offered.

const social = paths.find((p) => p.id === 'social') as Path
const partner = paths.find((p) => p.id === 'partner') as Path
const IN_PERSON = new Set(['recurring', 'errand', 'group', 'oneToOne'])

/** Every text a path shows: its own words and each of its reps', never its lists of what is left out or never counted. */
function pathTexts(p: Path): string[] {
  const out = [p.what, p.counted, ...(p.parents ? [p.parents] : [])]
  for (const st of p.stages) out.push(st.what, st.notProgress)
  for (const ch of p.channels ?? []) out.push(ch.what)
  for (const a of p.acts ?? []) out.push(a.name, a.what, ...(a.questions ?? []).map((q) => q.text))
  for (const m of pathReps(p.id)) out.push(m.name, m.what, m.cue ?? '', m.crutch ?? '', m.doneWhen ?? '', m.guardrail ?? '')
  return out
}

describe('the two paths, as the plan names them', () => {
  it('has Social in six stages and Partner in seven, in the plan’s order', () => {
    expect(social.stages.map((s) => s.name)).toEqual(['Presence', 'One step past hello', 'Sustain and reciprocate', 'Voice in a group', 'Initiate', 'Host, lead, deepen'])
    expect(partner.stages.map((s) => s.name)).toEqual(['Meeting', 'Initiating', 'Expressing interest and inviting', 'Dating', 'Deciding', 'Building', 'Keeping'])
    expect(partner.stages.map((s) => s.advance)).toEqual(['counts', 'counts', 'counts or a date', 'declared', 'declared', 'declared', 'declared'])
  })

  it('states one rule shape with its numbers as design judgment, and the sources beside it', () => {
    for (const p of paths) {
      expect(p.rule).toMatchObject({ reps: 6, distinctReps: 3, settingKinds: 2, withinWeeks: 6, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 4 })
      expect(p.rule.sources.length).toBeGreaterThanOrEqual(3)
    }
    expect(social.rule.note).toMatch(/^Design judgment, not a research finding/)
    expect(partner.rule.note).toContain('only when you declare it')
  })

  it('places every path rep on a real stage, with where it happens, its cue, its crutch and when it is done', () => {
    for (const p of paths) {
      const reps = pathReps(p.id)
      expect(reps.length, p.id).toBeGreaterThan(10)
      for (const m of reps) {
        const place = m.path?.[p.id]
        expect(p.stages.some((s) => s.n === place?.stage), m.id).toBe(true)
        expect(['people', 'charisma', 'partner'], m.id).toContain(m.family)
        expect(m.settings?.length, m.id).toBeGreaterThan(0)
        for (const k of m.settings ?? []) expect(SETTING_KINDS, m.id).toContain(k)
        for (const f of [m.cue, m.crutch, m.doneWhen]) expect(f?.length ?? 0, m.id).toBeGreaterThan(5)
      }
    }
    expect(pathReps('social').map((m) => m.id)).toEqual(expect.arrayContaining(['greet-by-name', 'matched-disclosure', 'return-to-last-time', 'swap-numbers', 'follow-up-after-meeting', 'introduce-two-people', 'host-something-small', 'take-a-recurring-role', 'go-one-level-deeper']))
    expect(pathReps('partner').map((m) => m.id)).toEqual(expect.arrayContaining(['re-engage-someone', 'ask-for-an-introduction', 'say-interest-plainly', 'partner-invite']))
  })

  it('lets every stage the rule moves be met in person: three reps that move it, across two kinds of setting', () => {
    for (const p of paths) {
      for (const st of p.stages.filter((s) => s.advance !== 'declared')) {
        const moving = pathReps(p.id, st.n).filter((m) => m.path?.[p.id]?.advances && m.with === 'adult' && !m.channel)
        expect(moving.length, `${p.id} stage ${st.n}`).toBeGreaterThanOrEqual(3)
        const kinds = new Set(moving.flatMap((m) => (m.settings ?? []).filter((k) => IN_PERSON.has(k))))
        expect(kinds.size, `${p.id} stage ${st.n}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('never moves a stage with a solo, remote or online rep', () => {
    for (const p of paths) {
      for (const m of pathReps(p.id)) {
        const onlyApart = (m.settings ?? []).every((k) => k === 'remote' || k === 'solo')
        if (onlyApart || m.channel || m.with === 'remote' || !m.needs.includes('anotherPerson')) expect(m.path?.[p.id]?.advances, m.id).toBe(false)
      }
    }
  })
})

describe('the online channel, at the owner’s word', () => {
  it('is optional, off until he turns it on, never required, and bounded', () => {
    const online = partner.channels?.find((c) => c.id === 'online')
    expect(online).toMatchObject({ defaultOn: false, requiredForProgress: false, browseMinutes: 15 })
    expect(online?.maxRepsPerWeek).toBeLessThanOrEqual(2)
    expect(online?.what).toContain('one switch turns it fully off again')
    const reps = pathReps('partner').filter((m) => m.channel === 'online')
    expect(reps.map((m) => m.id).sort()).toEqual(['online-honest-profile', 'online-one-message', 'online-propose-meeting', 'online-timeboxed-browse'])
    for (const m of reps) expect(m.path?.partner?.advances, m.id).toBe(false)
    expect(social.channels).toBeUndefined()
  })
})

describe('what the paths say', () => {
  it('never rates a person or counts an outcome as success, in any path text', () => {
    const OUTCOME = /\b(rate|rates|rating|rated|score|scores|scored|scoring|rank|ranks|ranking|ranked|success|successful|succeed|succeeded|win|wins|won|conquest|matches|reply rate|attractive|attractiveness|hot|league|mate value|close the deal|pulled)\b|number of (dates|women|men|people)/i
    // A negation is guard language, not a rating: never rated, not counted.
    const NEGATED = /\b(never|not|no)\s+(rate|rates|rated|rating|scored|ranked|counted)\b/gi
    for (const p of paths) for (const t of pathTexts(p)) expect(t.replace(NEGATED, ''), t).not.toMatch(OUTCOME)
  })

  it('makes every counted rep his own act, complete whatever the answer', () => {
    const ANSWER = /\b(if they|once they|when they (say|agree|accept|reply)|they said yes|agrees|accepts|replied)\b/i
    for (const p of paths) {
      for (const m of pathReps(p.id)) {
        expect(m.doneWhen, m.id).toMatch(/^Done /)
        expect(m.doneWhen, m.id).not.toMatch(ANSWER)
        if (m.guardrail) expect(m.doneWhen, m.id).toMatch(/whatever the answer|whatever they say/)
      }
    }
    for (const id of ['partner-invite', 'say-interest-plainly', 'swap-numbers', 'online-propose-meeting', 'date-end-clearly']) {
      const m = moves.find((x) => x.id === id) as Move
      expect(m.guardrail, id).toMatch(/final/)
    }
  })

  it('lists what is never counted, and names what is left out with its reason', () => {
    for (const p of paths) {
      const never = p.neverCounted.join('; ')
      for (const w of ['yeses and noes', 'replies', 'matches', 'numbers exchanged', 'second dates', 'how many people', 'any rating of a person', 'a second ask after a no']) expect(never, p.id).toContain(w)
      for (const e of p.excluded) expect(e.why.length, e.what).toBeGreaterThan(20)
    }
    expect(partner.excluded.map((e) => e.what)).toEqual(expect.arrayContaining(['Approaching strangers in the street', 'Reading signals to decide who is interested', 'Asking again after a no']))
  })

  it('keeps the Deciding stage’s notes and checks as app content, with the monthly check’s fixed help', () => {
    const acts = partner.acts ?? []
    expect(acts.map((a) => a.id)).toEqual(['values-note', 'decide-dont-slide', 'monthly-check', 'relationship-education'])
    for (const a of acts) expect(a.stage).toBe(5)
    const check = acts.find((a) => a.id === 'monthly-check')
    expect(check?.help).toContain('1-800-799-7233')
    expect(check?.what).toContain('No model writes, softens or decides it')
    expect(partner.parents).toContain('never schedules an introduction')
  })

  it('offers the relationship course as a suggestion, never a gate (owner, 2026-09-23)', () => {
    const course = partner.acts?.find((a) => a.id === 'relationship-education')
    expect(course?.name).toBe('A relationship course, if you want one')
    expect(course?.what).toMatch(/^A suggestion, never a requirement/)
    expect(course?.what).toContain('never needed to move on or to declare a step')
    expect(course?.what).toContain('blocks nothing and is never counted, flagged or shown as missing')
    expect(partner.stages.find((s) => s.n === 5)?.what).toContain('yours to take or leave')
    // No path text makes a course, a note or a check a condition of moving on.
    const GATE = /\b(before you can|required before|must (take|complete|finish|do)|only after (a|the) course|education before any commitment)\b/i
    for (const p of paths) for (const t of pathTexts(p)) expect(t, t).not.toMatch(GATE)
  })

  it('shows the monthly check’s help only on a yes to its safety or conduct question, and nowhere else (owner, 2026-09-23)', () => {
    const acts = partner.acts ?? []
    const check = acts.find((a) => a.id === 'monthly-check')
    expect(check?.questions?.map((q) => q.helpOnYes)).toEqual([true, true, false])
    expect(check?.questions?.[0].text).toContain('made you afraid')
    expect(check?.questions?.[1].text).toContain('worried you afterwards')
    expect(check?.questions?.[2].text).toContain('a doubt')
    expect(check?.what).toContain('inside this check and nowhere else; a doubt on its own does not')
    expect(check?.what).toContain('not a general crisis screen')
    // Help belongs to a check that has a question showing it, and to no other act or path.
    for (const p of paths) for (const a of p.acts ?? []) expect(Boolean(a.help), a.id).toBe(Boolean(a.questions?.some((q) => q.helpOnYes)))
    expect(acts.filter((a) => a.help).map((a) => a.id)).toEqual(['monthly-check'])
  })
})

describe('nothing offered differently, and the evidence held back until each path is wired', () => {
  it('keeps every new rep out of the day’s draw: the Social path’s offered through its row alone since Part 24, the Partner path’s proposed until Part 27', () => {
    const wired = moves.filter((m) => m.path && isPathOnly(m))
    const proposed = moves.filter((m) => m.path && isProposed(m))
    expect(wired.length + proposed.length).toBe(28)
    for (const m of wired) expect(m.path?.social, m.id).toBeDefined()
    for (const m of proposed) expect(m.path?.social, m.id).toBeUndefined()
    const fresh = [...wired, ...proposed]
    const live = new Set(liveMoves.map((m) => m.id))
    for (const m of fresh) expect(live.has(m.id), m.id).toBe(false)
    const open: TodayState = { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: true, withHer: true, churchDay: true, noTimeCeiling: null }
    for (const block of ['morning', 'afternoon', 'evening'] as const) {
      for (const target of ['mood', 'energy', 'stress', 'focus', 'overwhelm', 'irritation'] as const) {
        const s: Situation = { block, target, key: `${block}|${target}|gettingBy`, band: 'gettingBy', reading: 50, targetPosition: 3 }
        for (const c of candidatesFor(s, open).candidates) if (c.id !== NOTHING) expect(live.has(c.id), c.id).toBe(true)
      }
    }
    expect(moves.filter((m) => !isProposed(m) && !isPathOnly(m)).length).toBe(99)
  })

  it('backs each path with verified cards that stay drafts until the path is wired, and disputed ones never cited', () => {
    for (const p of paths) {
      // Part 24 wired the Social path, so its cards are admitted; the Partner path's wait for Part 27.
      const wired = p.id === 'social'
      for (const id of p.cards) {
        const c = cardById(id)
        expect(c, id).toBeDefined()
        expect(wired ? ['admitted', 'disputed'] : ['draft', 'disputed'], id).toContain(c?.status)
        for (const s of c?.sources ?? []) expect(s.doi, `${id}: ${s.cite}`).toMatch(/^10\./)
      }
    }
    const disputed = paths.flatMap((p) => p.cards).filter((id) => cardById(id)?.status === 'disputed')
    expect(disputed.sort()).toEqual(['divorce-prediction-disputed', 'love-languages-disputed', 'matching-algorithms-disputed', 'positive-self-statements-disputed', 'power-posing-disputed'])
    // The follow-up-question card and rep, lowered for their contested source.
    expect(cardById('asking-questions-liking')).toMatchObject({ grade: 'D', replication: 'mixed', status: 'admitted' })
    expect(moves.find((m) => m.id === 'ask-follow-up')?.source.strength).toBe('weak')
  })
})
