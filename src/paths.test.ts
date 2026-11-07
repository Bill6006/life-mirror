import { describe, expect, it } from 'vitest'
import { guardrailOf, isPathOnly, isProposed, liveMoves, moves, ONE_STRAND, onStage, pathReps, paths, SETTING_KINDS, strandsOf, type Move, type Path } from './catalogue'
import { MONTHLY_PARTS, VALUES_PARTS } from './db'
import { NEGATED_OUTCOME, OUTCOME_WORDS } from './brainShared'
import { cardById } from './library'
import { candidatesFor, NOTHING, type Situation, type TodayState } from './offers'

// The Social and Partner paths as content (Parts 23 and 26): read and vetoed before anything
// behaves differently. Every stage the rule moves can be met in person; online and remote reps
// move nothing; no path text rates a person or counts an outcome; nothing proposed is offered.

const social = paths.find((p) => p.id === 'social') as Path
const partner = paths.find((p) => p.id === 'partner') as Path
const speaking = paths.find((p) => p.id === 'speaking') as Path
// The two Paths the plan names, whose shape these pins hold; the speaking Path (P4) has its own below.
const twoPaths = [social, partner]
const IN_PERSON = new Set(['recurring', 'errand', 'group', 'oneToOne'])

/** Every text a path shows: its own words and each of its reps', never its lists of what is left out or never counted. */
function pathTexts(p: Path): string[] {
  const out = [p.what, p.counted, ...(p.parents ? [p.parents] : [])]
  for (const st of p.stages) out.push(st.what, st.notProgress)
  for (const ch of p.channels ?? []) out.push(ch.what)
  for (const a of p.acts ?? []) out.push(a.name, a.what, ...(a.questions ?? []).map((q) => q.text), ...(a.parts ?? []).flatMap((x) => [x.name, x.prompt]), ...(a.considerations ?? []).map((x) => x.text))
  for (const m of pathReps(p.id)) out.push(m.name, m.what, m.cue ?? '', m.crutch ?? '', m.doneWhen ?? '', guardrailOf(m, p.id) ?? '')
  return out
}

describe('the two paths, as the plan names them', () => {
  it('has Social in six stages and Partner in seven, in the plan’s order', () => {
    expect(social.stages.map((s) => s.name)).toEqual(['Presence', 'One step past hello', 'Sustain and reciprocate', 'Voice in a group', 'Initiate', 'Host, lead, deepen'])
    expect(partner.stages.map((s) => s.name)).toEqual(['Meeting', 'Initiating', 'Expressing interest and inviting', 'Dating', 'Deciding', 'Building', 'Keeping'])
    expect(partner.stages.map((s) => s.advance)).toEqual(['counts', 'counts', 'counts or a date', 'declared', 'declared', 'declared', 'declared'])
  })

  it('states one rule shape with its numbers as design judgment, and the sources beside it', () => {
    for (const p of twoPaths) {
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
        // On a Path with strands, the stage is its strand's.
        const stages = strandsOf(p).find((s) => s.id === (place?.strand ?? ONE_STRAND))?.stages ?? []
        expect(stages.some((s) => s.n === place?.stage), m.id).toBe(true)
        // A rep spans stages only among those you declare, never among those the rule counts.
        if (place?.through !== undefined) {
          expect(place.through, m.id).toBeGreaterThan(place.stage)
          expect(stages.some((s) => s.n === place.through), m.id).toBe(true)
          for (let n = place.stage; n <= place.through; n++) expect(stages.find((s) => s.n === n)?.advance, `${m.id} at ${n}`).toBe('declared')
        }
        expect(['people', 'charisma', 'partner', 'speaking'], m.id).toContain(m.family)
        expect(m.settings?.length, m.id).toBeGreaterThan(0)
        for (const k of m.settings ?? []) expect(SETTING_KINDS, m.id).toContain(k)
        for (const f of [m.cue, m.crutch, m.doneWhen]) expect(f?.length ?? 0, m.id).toBeGreaterThan(5)
      }
    }
    expect(pathReps('social').map((m) => m.id)).toEqual(expect.arrayContaining(['greet-by-name', 'matched-disclosure', 'return-to-last-time', 'swap-numbers', 'follow-up-after-meeting', 'introduce-two-people', 'host-something-small', 'take-a-recurring-role', 'go-one-level-deeper']))
    expect(pathReps('partner').map((m) => m.id)).toEqual(expect.arrayContaining(['re-engage-someone', 'ask-for-an-introduction', 'say-interest-plainly', 'partner-invite']))
  })

  it('lets every stage the rule moves be met in person: three reps that move it, across two kinds of setting', () => {
    for (const p of twoPaths) {
      for (const st of p.stages.filter((s) => s.advance !== 'declared')) {
        const moving = pathReps(p.id, st.n).filter((m) => m.path?.[p.id]?.advances && m.with === 'adult' && !m.channel)
        expect(moving.length, `${p.id} stage ${st.n}`).toBeGreaterThanOrEqual(3)
        const kinds = new Set(moving.flatMap((m) => (m.settings ?? []).filter((k) => IN_PERSON.has(k))))
        expect(kinds.size, `${p.id} stage ${st.n}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('never moves a stage with a solo, remote or online rep', () => {
    for (const p of twoPaths) {
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
    // The validator's own lists (Part 27): a negation is guard language, not a rating: never rated, not counted.
    for (const p of paths) for (const t of pathTexts(p)) expect(t.replace(NEGATED_OUTCOME, ''), t).not.toMatch(OUTCOME_WORDS)
  })

  it('makes every counted rep his own act, complete whatever the answer', () => {
    const ANSWER = /\b(if they|once they|when they (say|agree|accept|reply)|they said yes|agrees|accepts|replied)\b/i
    for (const p of paths) {
      for (const m of pathReps(p.id)) {
        expect(m.doneWhen, m.id).toMatch(/^Done /)
        expect(m.doneWhen, m.id).not.toMatch(ANSWER)
        if (m.guardrail && /final/.test(m.guardrail)) expect(m.doneWhen, m.id).toMatch(/whatever the answer|whatever they say/)
      }
    }
    for (const id of ['partner-invite', 'say-interest-plainly', 'swap-numbers', 'online-propose-meeting', 'date-end-clearly', 'suggest-a-playful-date', 'date-ask-before-a-kiss']) {
      const m = moves.find((x) => x.id === id) as Move
      expect(m.guardrail, id).toMatch(/final/)
    }
  })

  it('lists what is never counted, and names what is left out with its reason', () => {
    for (const p of twoPaths) {
      const never = p.neverCounted.join('; ')
      for (const w of ['yeses and noes', 'replies', 'matches', 'numbers exchanged', 'second dates', 'how many people', 'any rating of a person', 'a second ask after a no']) expect(never, p.id).toContain(w)
      for (const e of p.excluded) expect(e.why.length, e.what).toBeGreaterThan(20)
    }
    expect(partner.excluded.map((e) => e.what)).toEqual(expect.arrayContaining(['Approaching strangers in the street', 'Reading signals to decide who is interested', 'Asking again after a no']))
  })

  it('keeps the Partner path’s notes and checks as app content: values from the start, the rest from Dating, the course at Deciding, with the check’s fixed help (owner, 2026-09-23)', () => {
    const acts = partner.acts ?? []
    expect(acts.map((a) => a.id)).toEqual(['values-note', 'decide-dont-slide', 'introducing-a-child', 'monthly-reflection', 'monthly-check', 'relationship-education'])
    const dating = partner.stages.find((s) => s.name === 'Dating')?.n
    const deciding = partner.stages.find((s) => s.name === 'Deciding')?.n
    expect(acts.map((a) => [a.id, a.stage])).toEqual([
      ['values-note', 1],
      ['decide-dont-slide', dating],
      ['introducing-a-child', dating],
      ['monthly-reflection', dating],
      ['monthly-check', dating],
      ['relationship-education', deciding],
    ])
    // The values note in three parts, and the monthly reflection in three, the parts the store keeps.
    expect(acts.find((a) => a.id === 'values-note')?.parts?.map((x) => x.id)).toEqual([...VALUES_PARTS])
    expect(acts.find((a) => a.id === 'monthly-reflection')?.parts?.map((x) => x.id)).toEqual([...MONTHLY_PARTS])
    expect(acts.find((a) => a.id === 'values-note')?.what).toContain('about direction and conduct rather than traits')
    // Its questions concern someone you are dating, and every later stage says it stays yours.
    expect(partner.stages.find((s) => s.n === dating)?.what).toContain('monthly private check')
    expect(partner.stages.find((s) => s.n === deciding)?.what).not.toContain('monthly')
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

describe('the Partner revision: learning fit and choosing deliberately (owner, 2026-09-23)', () => {
  const LIGHTER = ['talk-ordinary-week', 'talk-working-toward', 'talk-your-people']
  const WEIGHTIER = ['talk-children-family', 'talk-faith', 'talk-work-money-home']
  const PLANNING = ['plan-money-together', 'plan-a-week-together', 'plan-parenting-roles', 'plan-faith-at-home']
  const rep = (id: string) => moves.find((m) => m.id === id) as Move

  it('says who may read the values note, now that Claude may (Part 30, the owner’s wording of 2026-09-23)', () => {
    const values = partner.acts?.find((a) => a.id === 'values-note')
    expect(values?.what).toContain('It stays private in Life Mirror; Claude may use it when your Brain settings allow the Partner path and reflections.')
    expect(values?.what).not.toContain('Only you read it')
  })

  it('offers the lighter direction talks at Dating first, and the weightier ones once those are done', () => {
    for (const id of [...LIGHTER, ...WEIGHTIER]) expect(rep(id).path?.partner?.stage, id).toBe(4)
    for (const id of LIGHTER) expect(rep(id).path?.partner?.after, id).toBeUndefined()
    for (const id of WEIGHTIER) expect(rep(id).path?.partner?.after, id).toEqual(LIGHTER)
    for (const id of PLANNING) expect(rep(id).path?.partner?.stage, id).toBe(5)
    // Every talk is your own act: ask, listen and say your own, whatever was said; none moves a stage.
    for (const id of [...LIGHTER, ...WEIGHTIER, ...PLANNING]) {
      expect(rep(id).path?.partner?.advances, id).toBe(false)
      expect(rep(id).doneWhen, id).toMatch(/whatever (was said|you decided)/)
      expect(rep(id).status, id).toBe('path')
    }
  })

  it('keeps a faith talk with the faith family, and every other text free of faith', () => {
    expect(moves.filter((m) => m.hiddenWith === 'faith').map((m) => m.id).sort()).toEqual(['plan-faith-at-home', 'talk-faith'])
    for (const st of partner.stages) expect(st.what, st.name).not.toMatch(/faith/i)
  })

  it('wires the romantic register (Pass 3, R1): your own acts, said plainly, never a read signal, a touch or a tactic; a kiss asked for in words on a declared date day alone', () => {
    const R1 = ['share-what-made-you-laugh', 'say-what-you-like-about-them', 'suggest-a-playful-date', 'date-glad-to-see-you', 'date-ask-before-a-kiss', 'retell-a-shared-laugh']
    for (const id of R1) {
      const m = rep(id)
      expect(m.status, id).toBe('path')
      expect(m.with, id).toBe('adult')
      // What the rep asks: never a signal to read, a touch, a line or a game (the crutch names the habit it replaces, so it is not read here).
      const asks = [m.name, m.what, m.cue, m.doneWhen, m.guardrail ?? ''].join(' ')
      expect(asks, id).not.toMatch(/\b(?:touch\w*|hand on|lean in|signals?|body language|read (?:her|him|them|their)|negg\w*|hard to get|jealous|pick-?up line|opener)\b/i)
    }
    expect(rep('share-what-made-you-laugh').path).toMatchObject({ social: { stage: 3, advances: true }, partner: { stage: 2, advances: true } })
    expect(rep('date-ask-before-a-kiss').path?.partner).toMatchObject({ stage: 4, onDate: true })
    expect(rep('date-ask-before-a-kiss').guardrail).toBe('Anything other than a clear yes is final: after a no or a not yet, leave the next move to them.')
    expect(rep('say-interest-plainly').what).toContain('leaves no doubt it is romantic')
    expect(rep('partner-invite').what).toContain('said as a date')
    // The cards behind them: verified and admitted; the three ideas the research refuted, disputed.
    for (const id of ['humour-and-liking', 'humour-kind-not-cutting', 'stated-interest', 'responsiveness-and-desire', 'compliments-underestimated', 'warmth-follows-attention', 'overperception-projection', 'consent-clarity']) expect(cardById(id)?.status, id).toBe('admitted')
    for (const id of ['token-resistance-disputed', 'hard-to-get-disputed', 'touch-in-courtship-disputed']) expect(cardById(id)?.status, id).toBe('disputed')
  })

  it('offers a rep about a date on a declared date day, and the rest of Dating on any day', () => {
    expect(pathReps('partner', 4).filter((m) => m.path?.partner?.onDate).map((m) => m.id).sort()).toEqual(['date-ask-and-listen', 'date-ask-before-a-kiss', 'date-attention', 'date-end-clearly', 'date-glad-to-see-you', 'date-share-something-real'])
    for (const id of [...LIGHTER, ...WEIGHTIER, 'thank-them-specifically', 'reappraise-a-conflict']) expect(rep(id).path?.partner?.onDate, id).toBeUndefined()
  })

  it('offers thanks and reappraisal from Dating through Keeping, reappraisal labelled for what it rests on and guarded', () => {
    for (const id of ['thank-them-specifically', 'reappraise-a-conflict']) for (const n of [4, 5, 6, 7]) expect(onStage(rep(id), 'partner', n), `${id} at ${n}`).toBe(true)
    const reap = rep('reappraise-a-conflict')
    expect(reap.source.strength).toBe('weak')
    expect(reap.source.what).toContain('married couples')
    expect(reap.source.what).toContain('never tested in dating couples')
    expect(reap.guardrail).toMatch(/ordinary disagreement.*Never for explaining away something serious, or something that keeps happening/)
    expect(cardById('conflict-reappraisal')?.caveats).toContain('never tested in dating couples')
  })

  it('lays out what a parent may weigh before an introduction, each tagged by its evidence, and never schedules or recommends one', () => {
    const child = partner.acts?.find((a) => a.id === 'introducing-a-child')
    expect(child?.what).toContain('never schedules an introduction and never recommends one')
    expect(child?.considerations?.length).toBeGreaterThanOrEqual(5)
    for (const x of child?.considerations ?? []) {
      expect(['evidence', 'adjacent', 'opinion'], x.text).toContain(x.basis)
      expect(x.source.length, x.text).toBeGreaterThan(5)
    }
    expect(child?.considerations?.some((x) => x.basis === 'opinion')).toBe(true)
    const texts = [child?.what ?? '', ...(child?.considerations ?? []).map((x) => x.text)]
    const SCHEDULE = /\b(\d+\s*(days?|weeks?|months?)|should (introduce|wait)|wait until|ready to introduce|time to introduce|recommend(s|ed)? (an|the) introduction)\b/i
    for (const t of texts) expect(t, t).not.toMatch(SCHEDULE)
  })

  it('backs the revision with verified cards that no line on the free models can reach', () => {
    const fresh = ['goal-mutuality', 'relationship-talk-avoided', 'disclosure-pacing', 'children-agreement', 'money-talk', 'faith-fit', 'feeling-appreciated', 'relationship-over-time', 'memory-drifts', 'reflection-light', 'momentum-and-doubts', 'child-introduction', 'kind-reading-limits', 'money-together', 'fairness-and-appreciation']
    for (const id of fresh) {
      const c = cardById(id)
      expect(c, id).toBeDefined()
      expect(c?.status, id).toBe('admitted')
      expect(partner.cards, id).toContain(id)
      // The Worker's guard admits a card tagged relationship only when a sheet fact carries that tag, which none does.
      expect(c?.tags, id).toContain('relationship')
      for (const s of c?.sources ?? []) expect(s.doi, id).toMatch(/^10\./)
    }
  })
})

describe('the day’s draw unchanged, and the evidence admitted once each path is wired', () => {
  it('keeps every new rep out of the day’s draw: each path’s own reps offered through its row alone, the Social path’s since Part 24, the Partner path’s since Part 27 and the speaking Path’s since P4', () => {
    const wired = moves.filter((m) => m.path && isPathOnly(m))
    const proposed = moves.filter((m) => m.path && isProposed(m))
    // Pass 3 (R1): six reps wired, one shared with the Social path and five the Partner path's alone.
    // P4: the speaking Path's eighteen reps, its alone.
    expect(wired.length).toBe(62)
    expect(proposed.map((m) => m.id)).toEqual([])
    expect(wired.filter((m) => !m.path?.social).length).toBe(50)
    expect(wired.filter((m) => m.path?.speaking && !m.path?.social && !m.path?.partner).length).toBe(18)
    for (const m of wired) expect(m.path?.social ?? m.path?.partner ?? m.path?.speaking, m.id).toBeDefined()
    const fresh = wired
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

  it('backs each path with verified cards, admitted once the path was wired, and disputed ones never cited', () => {
    for (const p of paths) {
      // Part 24 wired the Social path and Part 27 the Partner path, so every card is admitted or disputed.
      for (const id of p.cards) {
        const c = cardById(id)
        expect(c, id).toBeDefined()
        expect(['admitted', 'disputed'], id).toContain(c?.status)
        for (const s of c?.sources ?? []) expect(s.doi, `${id}: ${s.cite}`).toMatch(/^10\./)
      }
    }
    const disputed = twoPaths.flatMap((p) => p.cards).filter((id) => cardById(id)?.status === 'disputed')
    expect(disputed.sort()).toEqual(['divorce-prediction-disputed', 'hard-to-get-disputed', 'love-languages-disputed', 'matching-algorithms-disputed', 'positive-self-statements-disputed', 'power-posing-disputed', 'token-resistance-disputed', 'touch-in-courtship-disputed'])
    // The speaking Path cites a disputed card only beside what it leaves out.
    expect(speaking.cards.filter((id) => cardById(id)?.status === 'disputed').sort()).toEqual(['learning-styles-disputed', 'positive-self-statements-disputed', 'power-posing-disputed', 'smart-goals-disputed'])
    // The follow-up-question card and rep, lowered for their contested source.
    expect(cardById('asking-questions-liking')).toMatchObject({ grade: 'D', replication: 'mixed', status: 'admitted' })
    expect(moves.find((m) => m.id === 'ask-follow-up')?.source.strength).toBe('weak')
  })
})

describe('the speaking Path (P4), compiled once by hand', () => {
  it('is labelled experimental, keeps to itself, and holds three strands in the design’s order', () => {
    expect(speaking.label).toBe('experimental')
    expect(speaking.traits).toMatchObject({ sheet: false, coach: false, privacy: 'own', rowShare: 3, icon: 'speaking' })
    expect(speaking.builtIn).toBeUndefined()
    expect(speaking.changes?.map((c) => [c.version, c.reason, c.major])).toEqual([['1', 'design', true]])
    expect(speaking.strands?.map((s) => [s.id, s.stages.map((st) => st.name)])).toEqual([
      ['conversation', ['Questions that follow', 'A short story', 'A voice in a group']],
      ['speaking', ['Recorded alone', 'A few people you know', 'A meeting or a group', 'A short talk']],
      ['nerves', ['A first step', 'Earlier and longer', 'The talk you would avoid']],
    ])
  })

  it('keeps the Paths’ floor, one kind of setting on the strand that starts alone, four reps across two on Nerves', () => {
    expect(speaking.rule).toMatchObject({ reps: 6, distinctReps: 3, settingKinds: 2, withinWeeks: 6, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 4 })
    expect(speaking.rule.sources.length).toBeGreaterThanOrEqual(3)
    const rules = Object.fromEntries((speaking.strands ?? []).map((s) => [s.id, s.rule]))
    expect(rules.conversation).toMatchObject({ reps: 6, distinctReps: 3, settingKinds: 2, withinWeeks: 6 })
    expect(rules.speaking).toMatchObject({ reps: 6, distinctReps: 3, settingKinds: 1, withinWeeks: 6 })
    expect(rules.nerves).toMatchObject({ reps: 4, distinctReps: 2, settingKinds: 1, withinWeeks: 6 })
    for (const r of Object.values(rules)) expect(r?.note, 'every number is design judgment').toMatch(/^Design judgment/)
  })

  it('moves a stage alone only on the Speaking strand’s first, by a recording of yourself, never remote or online', () => {
    for (const m of pathReps('speaking')) {
      const place = m.path?.speaking
      const alone = (m.settings ?? []).every((k) => k === 'solo')
      if (alone && place?.advances) {
        expect([place.strand, place.stage], m.id).toEqual(['speaking', 1])
        expect(m.record, m.id).toBe(true)
      }
      if (m.record) expect(m.with, m.id).toBeUndefined()
      expect(m.channel, m.id).toBeUndefined()
      expect((m.settings ?? []).includes('remote'), m.id).toBe(false)
    }
    expect(pathReps('speaking', 1, 'speaking').filter((m) => m.record).map((m) => m.id).sort()).toEqual(['read-aloud', 'sp-record-point', 'story-recording'])
  })

  it('puts a guardrail on every rep with someone there or a recording, adding one to a shared rep without changing Social’s', () => {
    const YOURS = 'Your part only: how anyone answers is theirs, never counted.'
    const RECORD = 'Record only yourself; the recording stays on this phone.'
    for (const m of pathReps('speaking')) if (m.with === 'adult' || m.record) expect([YOURS, RECORD], m.id).toContain(guardrailOf(m, 'speaking'))
    const shared = pathReps('speaking').filter((m) => m.family !== 'speaking')
    expect(shared.map((m) => m.id).sort()).toEqual(['ask-follow-up', 'ask-one-question', 'matched-disclosure', 'read-aloud', 'return-to-last-time', 'say-one-full-thought', 'start-a-topic', 'story-recording', 'tell-one-short-story'])
    for (const m of shared) {
      expect(m.guardrail, `${m.id} keeps its own`).toBeUndefined()
      expect(guardrailOf(m, 'social'), m.id).toBeUndefined()
    }
  })

  it('never counts anyone’s reaction, and names what it leaves out beside a disputed card', () => {
    expect(speaking.neverCounted).toEqual(['anyone’s reaction, yes or no', 'how many people listened', 'laughs, replies or applause'])
    expect(speaking.excluded.map((e) => e.what)).toEqual(['Power posing', 'Positive self-statements', 'Matching to a learning style', 'The SMART-goal template'])
    for (const e of speaking.excluded) expect(e.why, e.what).toMatch(/\(a disputed card\)\.$/)
  })

  it('opens with the two starting questions, the fixed help that opens Nerves, and the choice of focus', () => {
    expect(speaking.start?.questions.map((q) => q.id)).toEqual(['avoid', 'afraid'])
    expect(speaking.start?.opens).toBe('nerves')
    expect(speaking.start?.help).toContain('a doctor or a psychologist can help')
    expect(speaking.start?.help).toContain('practice, not treatment')
    expect(speaking.start?.focus.map((f) => f.id)).toEqual(['conversation', 'speaking', 'both'])
  })

  it('measures behaviours per strand, with gates confirmed from outside the moment on the Speaking strand, a cap and checks again later', () => {
    const m = speaking.measurement
    expect(m?.strands.map((s) => [s.strand, s.behaviours.length, Boolean(s.record), Boolean(s.handOver)])).toEqual([
      ['conversation', 4, false, false],
      ['speaking', 4, true, true],
      ['nerves', 3, false, false],
    ])
    expect(m?.gates.map((g) => [g.strand, g.stage, g.met, g.weeks, g.confirmed, g.kinds])).toEqual([
      ['conversation', 1, 2, 2, 0, 2],
      ['conversation', 2, 2, 2, 0, 2],
      ['speaking', 1, 3, 2, 1, 1],
      ['speaking', 2, 3, 2, 1, 2],
      ['speaking', 3, 3, 2, 1, 2],
      ['nerves', 1, 2, 2, 0, 1],
      ['nerves', 2, 2, 2, 0, 1],
    ])
    expect(m?.cap).toBe(8)
    expect(m?.maintenance).toEqual({ at: [30, 90], every: 180 })
  })

  it('records each decision with its origin, its cards, its uncertainty and what would change it', () => {
    expect(speaking.decisions?.map((d) => [d.id, d.origin])).toEqual([
      ['structure', 'judgment'],
      ['conversation-order', 'expert'],
      ['conversation-gate', 'judgment'],
      ['speaking-order', 'judgment'],
      ['speaking-gate', 'judgment'],
      ['nerves-strand', 'indirect'],
      ['start-help', 'direct'],
      ['maintenance', 'inference'],
      ['attention', 'indirect'],
      ['floor', 'judgment'],
      ['reps-real', 'indirect'],
      ['timeline', 'inference'],
    ])
    expect(speaking.timeline).toBe('Months, step by step, with no fixed end: a first pass at nerves is about eight to sixteen weeks, and the skills take longer.')
    for (const d of speaking.decisions ?? []) {
      for (const id of d.cards) expect(speaking.cards, `${d.id}: ${id}`).toContain(id)
      expect(d.uncertainty.length, d.id).toBeGreaterThan(20)
      expect(d.change.length, d.id).toBeGreaterThan(20)
    }
  })
})
