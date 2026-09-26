import { afterEach, describe, expect, it, vi } from 'vitest'
import { BANNED_WORDS, CAUSAL_WORDS, GRADE_PHRASES, MODES, numbersIn, validateOutput, validateReview, type Mode } from './brainShared'
import { copy } from './copy'
import type { Fact } from './facts'
import { firmMode, firmOn, firmPrefOf } from './firmFlow'
import { adaptiveFirmness, allowedFirmness, CHOICE, coachFirmness, DEFAULT_FIRMNESS, deliver, deliverySignals, FIRM_FLOOR, FIRMNESS_PREFS, FIRMNESSES, firmnessRefusal, HOW_FIRM, isFirmness, isFirmnessPref, THERAPY_SPEAK, type DeliverySignals, type Firmness, type FirmnessPref } from './firmness'
import { admitted, cardById } from './library'
import { phoneReview, rankLines, SITUATIONS, type Choice } from './situations'
import { sheetOf, SITUATION_SHEETS } from './situationFixtures'

// How firm (Pass 2): Adaptive, Supportive, Balanced and Hard Coach change how directly a line is
// said, never what it says. Every one of the phone's situations, in all seven modes, is said at
// every setting and held to the same facts, numbers, evidence phrase, causal status, citations,
// action (the advice's one tap) and score; only the delivery moves, and the ways it may move are
// checked here: warmer, or firmer and less cushioned, never harsher about the person, never more
// certain than the evidence, never silent about a real pattern.

const lineAt = (id: string, pref: FirmnessPref | null): Choice => {
  const c = rankLines(SITUATION_SHEETS[id](), [], [], undefined, pref).find((x) => x.situationId === id)
  if (!c) throw new Error(`${id} is not true on its own fixture`)
  return c
}
const signalsOf = (id: string): DeliverySignals => {
  const c = lineAt(id, 'balanced')
  const grades = c.cardIds.flatMap((cid) => {
    const card = cardById(cid)
    return card && card.status === 'admitted' ? [card.grade] : []
  })
  return deliverySignals(c.mode as Mode, c.factIds, grades, SITUATION_SHEETS[id]())
}

/** What each situation must keep saying at every firmness: its facts, its evidence and causal status, and its advice. */
const KEEP: Record<string, string[]> = {
  stretch: ['a stretch is starting', 'one easy move a day, kept', 'the mood follows the doing'],
  'necessities-missed': ['necessities missed in three days', 'an early sign of a stretch', 'the smallest one first, before any move'],
  'loneliness-high': ['loneliness read', 'one small contact today', 'a message or a question to someone', 'better than', 'expect'],
  'cue-switch': ['kept 1 of 4 plans', 'plans stall on the cue, not on the will', 'after her bedtime'],
  'first-skill': ['has no current skill yet', 'the one thing to work on now', 'on its card under aims'],
  'caffeine-sleep-shorter': ['after days with', 'like for like', 'an association in your record'],
  'step-stalled': ['no session recorded in 9 days', 'the smaller version today'],
  'nap-read': ['mornings after a nap', 'short naps help the afternoon; long ones bring more grogginess after'],
  'workout-evenings': ['an association in your record, not yet a finding', 'the evidence for exercise and mood is strong'],
  'workout-flat': ['the evidence for exercise and mood is strong', 'timing may be why'],
  'social-recovery': ['an association, not a cause', 'a quieter day after a lot of company is common'],
  'cue-holds': ['has held 4 of 4 times', 'keep that cue'],
  'say-when': ['say when, one tap', 'a plan tied to a moment is kept more often than a wish is'],
  'afternoon-walk': ['the afternoon usually reads 40', 'ten', 'midday', 'mood at once, whatever you expect of it'],
  'partly-honest': ['partly, 3 times this week', 'smaller version is the honest size', 'the one that gets kept'],
  'card-long-unclear': ['12 observations and no clear difference', 'the alternative or retire the card', 'no reason to keep it'],
  'card-promising': ['promising, 8 observations', 'one more week before believing it'],
  'caffeine-late': ['a meta-analysis of trials', 'that runs past midnight'],
  'church-morning': ['mornings after church read 48 against 60', 'the recovery gap is a fact of the day'],
  'steady-moving': ['steady, 5 of 6 blocks inside the usual', 'progress that is recorded carries part of the effect by itself'],
  'fresh-start': ['people begin goals more often right after a fresh start', 'is the one to restart'],
  'nothing-holds': ['rest is a move'],
  'direction-counts': ['your direction', 'counts, not a verdict'],
  'forecast-wide': ['a guess', 'your own reading at the check-in is the better guide today'],
  'caffeine-sleep-even': ['no difference yet', 'self-reported sleep is known to miss caffeine’s effect'],
  'commitment-fading': ['3 sittings in the two weeks before, none in the last two', 'usually let go', 'the smallest sitting to a moment today'],
  'commitment-thinning': ['none in the last seven days, after 3 the week before', 'short sitting', 'to a moment today'],
  'cadence-dropping': ['check-ins went from about 12 a week to 4', 'before the record goes quiet', 'make it lighter', 'short depth asks three readings'],
  'loop-closed': ['the record shows 1 step started', 'that is the loop closing'],
  'loop-planned': ['its moment passed without a start', 'the step, or a smaller one, to a moment that has held before'],
  'loop-open': ['nothing on it since', 'not useful', 'smaller version to a moment today'],
  'short-night-today': ['lowers mood more than it lowers thinking', 'a nap under half an hour before mid-afternoon', 'supported repair'],
  'short-sleep-afternoons': ['afternoons after short nights', 'regular sleep times went with better health than long sleep did'],
  'propose-test': ['never tested it', 'one tap', 'against nothing extra', 'its card will say what your record finds'],
}

/** Words that keep a tentative finding tentative, or a claim within its evidence. */
const HEDGES = /\b(association|associated|not a cause|not yet a finding|so far|may|might|could|a guess|usually|more often|measurably)\b/gi
/** Cushioning and warmth: Hard Coach carries least, Supportive most. */
const CUSHIONS = ['not a flaw in you', 'does not undo', 'says little about you', 'not a verdict', 'not of you', 'is a start', 'not the will', 'keeps the thread', 'it stays until you change it', 'it is doing the work', 'good sign', 'good news', 'would help', 'kindly', 'easy lift', 'first step', 'still there', 'that happens', 'can be small', 'worth noticing', 'that is working', 'a result too', 'than about you', 'the fix is small', 'the fix is easy', 'start small']
const cushions = (t: string) => CUSHIONS.reduce((n, c) => n + (t.toLowerCase().split(c).length - 1), 0)
const hedgesOf = (t: string) => new Set((t.match(HEDGES) ?? []).map((h) => h.toLowerCase()))
const causal = (t: string) => CAUSAL_WORDS.test(t.replace(/\bnot a cause\b/gi, ''))

describe('the gate', () => {
  afterEach(() => vi.unstubAllGlobals())
  const flag = (v: string | null) => vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'life-mirror.preview.howFirm' ? v : null) })

  it('ships closed, and nothing reads a setting while it is', () => {
    expect(HOW_FIRM).toBe('gated')
    expect(firmMode()).toBe('gated')
    expect(firmOn()).toBe(false)
    expect(firmPrefOf({ firmness: 'hardCoach' })).toBeNull()
  })

  it('previews only in an automated test browser that asks for it, and opens for everyone only with the gate', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    flag('1')
    expect(firmMode()).toBe('gated')
    vi.stubGlobal('navigator', { webdriver: true })
    flag(null)
    expect(firmMode()).toBe('gated')
    flag('1')
    expect(firmMode()).toBe('preview')
    expect(firmOn()).toBe(true)
    expect(firmMode('open')).toBe('open')
  })

  it('starts on Adaptive, and knows the four settings and the three deliveries', () => {
    expect(DEFAULT_FIRMNESS).toBe('adaptive')
    expect(FIRMNESS_PREFS).toEqual(['adaptive', 'supportive', 'balanced', 'hardCoach'])
    expect(FIRMNESSES).toEqual(['supportive', 'balanced', 'hardCoach'])
    expect(firmPrefOf(undefined, 'open')).toBe('adaptive')
    expect(firmPrefOf({ firmness: 'supportive' }, 'open')).toBe('supportive')
    for (const v of FIRMNESS_PREFS) expect(isFirmnessPref(v)).toBe(true)
    for (const v of ['gentle', 'Hard Coach', '', null, 3]) expect(isFirmnessPref(v)).toBe(false)
    expect(isFirmness('adaptive')).toBe(false)
  })
})

describe('the phone’s lines, said at each firmness (all 34 situations, all seven modes)', () => {
  it('writes every choice as supportive, balanced and hard coach, and leaves none unresolved', () => {
    for (const [id, t] of Object.entries(copy.brain.lines as Record<string, string>)) {
      expect(t.split('⟨').length - 1, id).toBe((t.match(CHOICE) ?? []).length)
      for (const f of FIRMNESSES) expect(deliver(t, f), `${id} ${f}`).not.toMatch(/[⟨⟩]/)
      expect(deliver(t, 'balanced'), id).toBe(t.replace(CHOICE, '$2'))
    }
  })

  it('covers every situation in every mode', () => {
    expect(new Set(SITUATIONS.map((s) => s.mode))).toEqual(new Set(MODES))
    expect(Object.keys(KEEP).sort()).toEqual(SITUATIONS.map((s) => s.id).sort())
  })

  it('never changes what is said: the facts, the numbers, the evidence phrase, the causal status, the citations, the one tap and the score', () => {
    for (const s of SITUATIONS) {
      const b = lineAt(s.id, 'balanced')
      for (const pref of FIRMNESS_PREFS) {
        const x = lineAt(s.id, pref)
        const at = `${s.id} at ${pref}`
        expect({ id: x.situationId, mode: x.mode, factIds: x.factIds, cardIds: x.cardIds, action: x.action, score: x.score }, at).toEqual({ id: b.situationId, mode: b.mode, factIds: b.factIds, cardIds: b.cardIds, action: b.action, score: b.score })
        expect(numbersIn(x.text).sort(), at).toEqual(numbersIn(b.text).sort())
        for (const phrase of Object.values(GRADE_PHRASES)) expect(x.text.toLowerCase().includes(phrase), `${at}: ${phrase}`).toBe(b.text.toLowerCase().includes(phrase))
        expect(causal(x.text), at).toBe(causal(b.text))
        for (const h of hedgesOf(b.text)) expect(hedgesOf(x.text).has(h), `${at} keeps "${h}"`).toBe(true)
        for (const k of KEEP[s.id]) expect(x.text.toLowerCase(), `${at} keeps "${k}"`).toContain(k)
      }
    }
  })

  it('records the delivery it used: the setting, or under Adaptive the one the line warrants', () => {
    for (const s of SITUATIONS) {
      expect(lineAt(s.id, null).firmness, s.id).toBeUndefined()
      for (const f of FIRMNESSES) expect(lineAt(s.id, f).firmness, `${s.id} ${f}`).toBe(f)
      expect(lineAt(s.id, 'adaptive').firmness, s.id).toBe(adaptiveFirmness(signalsOf(s.id)))
      expect(lineAt(s.id, 'adaptive').text, s.id).toBe(lineAt(s.id, adaptiveFirmness(signalsOf(s.id))).text)
    }
  })

  it('makes the difference real in every mode: somewhere warmer, somewhere firmer', () => {
    for (const mode of MODES) {
      const ids = SITUATIONS.filter((s) => s.mode === mode).map((s) => s.id)
      expect(ids.some((id) => lineAt(id, 'supportive').text !== lineAt(id, 'balanced').text), `${mode}: supportive`).toBe(true)
      expect(ids.some((id) => lineAt(id, 'hardCoach').text !== lineAt(id, 'balanced').text), `${mode}: hard coach`).toBe(true)
    }
  })

  it('moves only the cushioning: least at Hard Coach, most at Supportive, and Hard Coach shorter overall', () => {
    let hard = 0
    let balanced = 0
    for (const s of SITUATIONS) {
      const [sup, bal, hc] = FIRMNESSES.map((f) => lineAt(s.id, f).text)
      expect(cushions(hc), `${s.id} hard coach`).toBeLessThanOrEqual(cushions(bal))
      expect(cushions(bal), `${s.id} supportive`).toBeLessThanOrEqual(cushions(sup))
      hard += hc.length
      balanced += bal.length
    }
    expect(hard).toBeLessThan(balanced)
  })

  it('keeps Balanced the even-handed middle: none of Supportive’s warmth, none of Hard Coach’s edge', () => {
    for (const [id, t] of Object.entries(copy.brain.lines as Record<string, string>)) {
      for (const m of t.matchAll(CHOICE)) {
        const bal = m[2]
        expect(['good sign', 'good news', 'would help', 'kindly', 'easy lift', 'first step', 'still there', 'that happens', 'can be small', 'worth noticing', 'that is working', 'a result too'].some((w) => bal.toLowerCase().includes(w)), `${id}: ${bal}`).toBe(false)
        expect(/\b(Do the|Make one|Switch to|Walk ten|Pin one|Make it lighter now|Step too big|Set it with)\b/.test(bal), `${id}: ${bal}`).toBe(false)
      }
    }
    // The phone's week review says what held and what did not the same at every firmness; only its one change is delivered.
    const sheet = sheetOf([
      { id: 'week.today', tags: [], text: '', values: { weekday: 'Sunday', bedtime: '20:00', hour: 9 } },
      { id: 'aim.1', tags: [], text: '', values: { kind: 'certification', name: 'Orrish', skill: 'Twenty words' } },
      { id: 'trajectory.1', tags: [], text: '', values: { aimId: 1, name: 'Orrish', w3: 2, w2: 1, w1: 0, w0: 0, d0: 0, ageDays: 30 } },
      { id: 'trajectory.2', tags: [], text: '', values: { aimId: 2, name: 'A walk', w3: 2, w2: 2, w1: 2, w0: 3, d0: 3, ageDays: 30 } },
    ] as Fact[])
    const parts = FIRMNESS_PREFS.map((f) => phoneReview(sheet, [], f))
    for (const p of parts) expect({ held: p.held, didNot: p.didNot }).toEqual({ held: parts[2].held, didNot: parts[2].didNot })
    expect(new Set(parts.map((p) => p.change)).size).toBeGreaterThan(1)
  })

  it('never turns on the person, reassures falsely, slips into therapy-speak or raises its voice, at any firmness', () => {
    for (const s of SITUATIONS) {
      for (const f of FIRMNESSES) {
        const t = lineAt(s.id, f).text
        expect(firmnessRefusal(t), `${s.id} ${f}: ${t}`).toBeNull()
        for (const w of BANNED_WORDS) expect(new RegExp(`\\b${w}\\b`, 'i').test(t), `${s.id} ${f}: ${w}`).toBe(false)
      }
    }
  })
})

describe('Adaptive', () => {
  it('chooses by what each line rests on, never one delivery for all', () => {
    const chosen = Object.fromEntries(SITUATIONS.map((s) => [s.id, adaptiveFirmness(signalsOf(s.id))]))
    const by = (f: Firmness) => Object.keys(chosen).filter((id) => chosen[id] === f).sort()
    // Firm about a real pattern that matters, or a serious warning on strong evidence.
    expect(by('hardCoach')).toEqual(['cadence-dropping', 'caffeine-late', 'card-long-unclear', 'commitment-fading', 'necessities-missed', 'step-stalled', 'stretch'])
    // Warm about good news.
    expect(by('supportive')).toEqual(['cue-holds', 'fresh-start', 'loop-closed', 'steady-moving', 'workout-evenings'])
    // Even-handed about the rest, the associations, guesses and one-day readings among them.
    expect(by('balanced')).toHaveLength(22)
    for (const id of ['caffeine-sleep-shorter', 'nap-read', 'workout-flat', 'social-recovery', 'short-sleep-afternoons', 'caffeine-sleep-even', 'forecast-wide', 'church-morning', 'card-promising', 'commitment-thinning']) expect(chosen[id], id).toBe('balanced')
  })

  it('never says anything tentative with Hard Coach certainty, and never softens a real pattern that matters', () => {
    for (const s of SITUATIONS) {
      const x = signalsOf(s.id)
      if (x.uncertain) expect(adaptiveFirmness(x), s.id).not.toBe('hardCoach')
      if (x.pattern && x.serious && !x.uncertain) {
        expect(adaptiveFirmness(x), s.id).toBe('hardCoach')
        expect(allowedFirmness('adaptive', x), s.id).not.toContain('supportive')
      }
      expect(allowedFirmness('adaptive', x), s.id).toContain(adaptiveFirmness(x))
    }
  })

  it('neither comforts nor pushes by default: nothing to go on is said even-handedly', () => {
    for (const mode of MODES.filter((m) => m !== 'encouragement')) expect(adaptiveFirmness({ mode, evidence: 'thin', pattern: false, serious: mode === 'warning', uncertain: false })).toBe('balanced')
    expect(adaptiveFirmness({ mode: 'warning', evidence: 'strong', pattern: false, serious: true, uncertain: false })).toBe('hardCoach')
    expect(adaptiveFirmness({ mode: 'warning', evidence: 'strong', pattern: true, serious: true, uncertain: true })).toBe('balanced')
    expect(adaptiveFirmness({ mode: 'encouragement', evidence: 'thin', pattern: false, serious: false, uncertain: true })).toBe('supportive')
  })

  it('lets a model use any delivery the grounds allow, and only the chosen one under a set firmness', () => {
    const x = (o: Partial<DeliverySignals>): DeliverySignals => ({ mode: 'observation', evidence: 'moderate', pattern: false, serious: false, uncertain: false, ...o })
    for (const f of FIRMNESSES) expect(allowedFirmness(f, x({ uncertain: true }))).toEqual([f])
    expect(allowedFirmness('adaptive', x({ uncertain: true }))).toEqual(['supportive', 'balanced'])
    expect(allowedFirmness('adaptive', x({ mode: 'challenge', pattern: true, serious: true }))).toEqual(['balanced', 'hardCoach'])
    expect(allowedFirmness('adaptive', x({ mode: 'warning', serious: true, evidence: 'strong' }))).toEqual(['balanced', 'hardCoach'])
    expect(allowedFirmness('adaptive', x({ mode: 'encouragement' }))).toEqual(['supportive', 'balanced'])
    expect(allowedFirmness('adaptive', x({}))).toEqual(['balanced'])
  })
})

describe('the coach’s People row wording', () => {
  it('takes the setting, never firmer than Balanced on the Partner path, and under Adaptive is warmer after a No or a Partly and never pushed', () => {
    expect(coachFirmness('hardCoach', 'social', [])).toBe('hardCoach')
    expect(coachFirmness('hardCoach', 'partner', [])).toBe('balanced')
    expect(coachFirmness('supportive', 'partner', [])).toBe('supportive')
    expect(coachFirmness('balanced', 'social', ['no'])).toBe('balanced')
    expect(coachFirmness('adaptive', 'social', ['no', 'done'])).toBe('supportive')
    expect(coachFirmness('adaptive', 'social', ['partly'])).toBe('supportive')
    expect(coachFirmness('adaptive', 'social', ['done'])).toBe('balanced')
    expect(coachFirmness('adaptive', 'partner', [])).toBe('balanced')
    for (const pref of FIRMNESS_PREFS) for (const last of [[], ['no'], ['done']]) expect(coachFirmness(pref, 'partner', last)).not.toBe('hardCoach')
  })
})

describe('the floor under every firmness', () => {
  it('refuses the person turned on, false comfort, macho theatre, therapy-speak and shouting', () => {
    for (const t of ['No excuses: pin it today.', 'You never follow through on this.', 'I am disappointed in how this week went.', 'Shame on you for skipping it.', 'Come on, get it together.', 'Beast mode: crush it today.', 'Don’t worry, everything will be fine.', 'You’ve got this.', 'Be gentle with yourself today.', 'Hold space for that feeling.', 'Pin it today!']) expect(firmnessRefusal(t), t).not.toBeNull()
    expect(FIRM_FLOOR.test('Pin the smallest sitting to a moment today.')).toBe(false)
    expect(THERAPY_SPEAK.test('Read today’s numbers kindly.')).toBe(false)
    expect(firmnessRefusal('Orrish: none in the last two weeks. Pin the smallest sitting to a moment today.')).toBeNull()
  })
})

describe('a model’s line, held to How firm once its gate is open', () => {
  const napSheet = sheetOf([
    { id: 'week.today', tags: [], text: '', values: { weekday: 'Friday', bedtime: '20:00', hour: 8 } },
    { id: 'assoc.napped', tags: [], text: '', values: { times: 5, diff: -6 }, tier: 'promising' },
  ] as Fact[])
  const fadeSheet = sheetOf([
    { id: 'week.today', tags: [], text: '', values: { weekday: 'Friday', bedtime: '20:00', hour: 8 } },
    { id: 'aim.1', tags: [], text: '', values: { kind: 'certification', name: 'Orrish', skill: 'Twenty words' } },
    { id: 'trajectory.1', tags: [], text: '', values: { aimId: 1, name: 'Orrish', w3: 3, w2: 0, w1: 0, w0: 0, ageDays: 30 } },
  ] as Fact[])
  const cards = admitted()
  const nap = (text: string, firmness?: string) => ({ mode: 'observation', text, factIds: ['assoc.napped'], cardIds: ['naps-cognition'], action: null, ...(firmness ? { firmness } : {}) })
  const fade = (text: string, firmness?: string) => ({ mode: 'challenge', text, factIds: ['trajectory.1', 'aim.1'], cardIds: ['implementation-intentions'], action: { kind: 'plan', aimId: 1, cue: 'afterBedtime' }, ...(firmness ? { firmness } : {}) })
  const NAP = 'Mornings after a nap read 6 lower than the others, 5 naps: an association in your record.'
  const FADE = 'Orrish: 3 sittings three weeks ago, none since. Pin the smallest sitting to a moment today.'

  it('checks nothing while the gate is closed: the same answer passes, and no delivery is recorded', () => {
    const v = validateOutput(nap(NAP, 'hardCoach'), napSheet, cards)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.value.firmness).toBeUndefined()
  })

  it('asks for the delivery used, and holds a set firmness to itself', () => {
    expect(validateOutput(nap(NAP), napSheet, cards, 60, undefined, { pref: 'adaptive' })).toMatchObject({ ok: false, reason: 'firmness must be supportive, balanced or hardCoach' })
    expect(validateOutput(nap(NAP, 'balanced'), napSheet, cards, 60, undefined, { pref: 'supportive' })).toMatchObject({ ok: false, reason: expect.stringContaining('How firm is set to Supportive') })
    expect(validateOutput(nap(NAP, 'supportive'), napSheet, cards, 60, undefined, { pref: 'supportive' })).toMatchObject({ ok: true, value: { firmness: 'supportive' } })
  })

  it('refuses Hard Coach under Adaptive where the evidence is tentative, and takes the same words Balanced', () => {
    expect(validateOutput(nap(NAP, 'hardCoach'), napSheet, cards, 60, undefined, { pref: 'adaptive' })).toMatchObject({ ok: false, reason: expect.stringContaining('Hard Coach needs a real pattern') })
    expect(validateOutput(nap(NAP, 'balanced'), napSheet, cards, 60, undefined, { pref: 'adaptive' })).toMatchObject({ ok: true, value: { firmness: 'balanced' } })
  })

  it('keeps a chosen Hard Coach within the evidence: an association still said as one, never a cause, never a stronger grade', () => {
    expect(validateOutput(nap(NAP, 'hardCoach'), napSheet, cards, 60, undefined, { pref: 'hardCoach' })).toMatchObject({ ok: true, value: { firmness: 'hardCoach' } })
    expect(validateOutput(nap('Naps cause your mornings to read 6 lower, 5 naps. Stop napping.', 'hardCoach'), napSheet, cards, 60, undefined, { pref: 'hardCoach' })).toMatchObject({ ok: false, reason: expect.stringContaining('never more certain') })
    expect(validateOutput(nap('Mornings after a nap read 6 lower, 5 naps. Skip the long ones.', 'hardCoach'), napSheet, cards, 60, undefined, { pref: 'hardCoach' })).toMatchObject({ ok: false, reason: expect.stringContaining('never more certain') })
    // The grade of the cited card bounds the evidence phrase at every firmness alike.
    for (const f of FIRMNESSES) expect(validateOutput(nap('There is strong evidence here: mornings after a nap read 6 lower, 5 naps, an association.', f), napSheet, cards, 60, undefined, { pref: f })).toMatchObject({ ok: false, reason: expect.stringContaining('beyond the cited cards') })
  })

  it('never softens a real pattern that matters under Adaptive, and a chosen Supportive still says it with its count', () => {
    expect(validateOutput(fade(FADE, 'supportive'), fadeSheet, cards, 60, undefined, { pref: 'adaptive' })).toMatchObject({ ok: false, reason: expect.stringContaining('never softens') })
    expect(validateOutput(fade(FADE, 'hardCoach'), fadeSheet, cards, 60, undefined, { pref: 'adaptive' })).toMatchObject({ ok: true, value: { firmness: 'hardCoach' } })
    expect(validateOutput(fade(FADE, 'balanced'), fadeSheet, cards, 60, undefined, { pref: 'adaptive' })).toMatchObject({ ok: true })
    expect(validateOutput(fade('Orrish has gone quiet lately; the smallest sitting is enough to pick it back up. Pin it to a moment today.', 'supportive'), fadeSheet, cards, 60, undefined, { pref: 'supportive' })).toMatchObject({ ok: false, reason: expect.stringContaining('never silent') })
    expect(validateOutput(fade('Orrish: 3 sittings three weeks ago, and it has gone quiet since; the smallest sitting picks it back up. Pin it to a moment today.', 'supportive'), fadeSheet, cards, 60, undefined, { pref: 'supportive' })).toMatchObject({ ok: true })
  })

  it('refuses the person turned on at every firmness, the same words that pass otherwise', () => {
    for (const f of FIRMNESSES) {
      expect(validateOutput(fade('No excuses. Orrish: 3 sittings three weeks ago, none since. Pin the smallest sitting to a moment today.', f), fadeSheet, cards, 60, undefined, { pref: f })).toMatchObject({ ok: false, reason: expect.stringContaining('never the person') })
      expect(validateOutput(fade('You never keep this up. Orrish: 3 sittings three weeks ago, none since.', f), fadeSheet, cards, 60, undefined, { pref: f })).toMatchObject({ ok: false })
    }
  })

  it('checks the week’s review the same way: one delivery for its three parts', () => {
    const review = (firmness: string, held = 'Orrish had 3 sittings three weeks ago.') => ({ held, didNot: 'None in the last two weeks.', change: 'Pin the smallest sitting to a moment each evening.', factIds: ['trajectory.1'], cardIds: [], firmness })
    expect(validateReview(review('supportive'), fadeSheet, cards, undefined, { pref: 'adaptive' })).toMatchObject({ ok: false, reason: expect.stringContaining('never softens') })
    expect(validateReview(review('hardCoach'), fadeSheet, cards, undefined, { pref: 'adaptive' })).toMatchObject({ ok: true, value: { firmness: 'hardCoach' } })
    expect(validateReview(review('balanced', 'You should know better. Orrish had 3 sittings three weeks ago.'), fadeSheet, cards, undefined, { pref: 'balanced' })).toMatchObject({ ok: false })
    expect(validateReview(review('hardCoach'), fadeSheet, cards)).toMatchObject({ ok: true })
  })
})
