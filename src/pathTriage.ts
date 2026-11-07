// Triage of a goal, by rules alone (P5 of the AI-generated Paths design, 2026-11-06): what you want to improve,
// read against closed lists before any model sees it. Six routes: refuse (harm, coercion or deception of others,
// illegality, monitoring someone); redirect (risk to yourself: the app's own help, never model-written, and no
// Path); existing (a Path or a feature already covers it); not a Path (a one-off task); unclear (too vague to
// build on: one question back); else fits. The same code runs on the phone and in the Worker, and a model's own
// triage may only make the route more conservative, never less. Nothing here is personal: it holds lists only.

export type TriageRoute = 'refuse' | 'redirect' | 'existing' | 'notAPath' | 'unclear' | 'fits'
export type ExistingTarget = 'social' | 'partner' | 'speaking' | 'learning' | 'workout'
export type RedirectKind = 'selfHarm' | 'eating' | 'medication' | 'abuse' | 'clinical'
export type RefuseKind = 'others' | 'deception' | 'monitoring' | 'illegal'

export interface Triage {
  route: TriageRoute
  /** For existing: what already covers it. */
  to?: ExistingTarget
  /** For redirect or refuse: which list it met. */
  kind?: RedirectKind | RefuseKind
  /** The words that matched, for the record; never shown as a judgement. */
  matched?: string
  /** For redirect: whether a Path may follow the help, as practice beside it (a clinical word), or not at all. */
  practice?: boolean
}

/** The routes from the most to the least conservative: a model may move a goal only toward the front. */
export const ROUTE_ORDER: readonly TriageRoute[] = ['refuse', 'redirect', 'existing', 'notAPath', 'unclear', 'fits']

/** The more conservative of two routes. */
export function moreConservative(a: TriageRoute, b: TriageRoute): TriageRoute {
  return ROUTE_ORDER.indexOf(a) <= ROUTE_ORDER.indexOf(b) ? a : b
}

const REFUSE: readonly [RefuseKind, RegExp][] = [
  ['others', /\b(get|make|win) (my |an? )?(ex|her|him|them|someone|somebody|a (girl|guy|woman|man)) (back|to (want|love|like|need|forgive|choose|date|sleep with) (me|us))\b|\bmake (her|him|them|someone|somebody) (love|want|like|need|fall for|obsess over) (me|us)\b|\b(win|get) (her|him|them) back\b/],
  ['others', /\b(manipulat\w*|gaslight\w*|guilt[- ]?trip\w*|coerc\w*|intimidat\w*|threaten\w*|revenge|get back at|humiliat\w*|bully\w*)\b|\b(pressure|force|push|talk) (her|him|them|someone|somebody|people|my (partner|wife|husband|girlfriend|boyfriend)) (into|to)\b|\bhurt (him|her|them|someone|somebody|people)\b/],
  ['others', /\b(pick ?up (women|girls|men|guys)|pickup artist|negging|seduc\w*)\b/],
  ['deception', /\b(lie to|deceiv\w*|scam\w*|con (people|someone|somebody)|fake (being|an? |my )|cheat (on|at)|catfish\w*|dark psychology|mind control|hypnoti[sz]e (her|him|them|someone|people))\b|\b(persuade|influence|convince) .{0,40}\bwithout (them|her|him|people|anyone) (knowing|noticing|realising|realizing)\b|\bcovert(ly)? (influence|persuasion|persuade|manipulation)\b/],
  ['monitoring', /\b(stalk\w*|spy on|track (her|him|them|my (partner|wife|husband|girlfriend|boyfriend|ex))|monitor (her|his|their|my (partner|wife|husband|girlfriend|boyfriend|ex)(?:'s)?) (phone|messages|location|texts)|read (her|his|their) (messages|texts|phone)|check (her|his|their) phone)\b/],
  ['illegal', /\b(steal\w*|shoplift\w*|hack (into|someone|somebody|an? account)|launder\w*|evade (tax|taxes)|tax evasion|buy (drugs|weed illegally)|sell drugs|drive drunk|without a licen[cs]e)\b/],
]

const REDIRECT: readonly [RedirectKind, RegExp][] = [
  ['selfHarm', /\b(suicid\w*|kill myself|end (my|it all)|end my life|self[- ]?harm\w*|cut(ting)? myself|hurt(ing)? myself|not (want|wanting) to (live|be alive|wake up))\b/],
  ['eating', /\b(anorexi\w*|bulimi\w*|purg(e|es|ed|ing)|binge(ing| eating)?|starv\w*|stop eating|skip(ping)? meals|eat (less than|under) \d+|lose \d+ ?(pounds|lbs|lb|kg|kilos|kilograms) (in|by|within) (a|one|two|three|\d+) (day|days|week|weeks)|crash diet\w*|extreme diet\w*|water fast\w*|fast(ing)? for (\d+|several|many|a few) (days|weeks)|lose weight fast|lose weight quickly|get skinny)\b/],
  ['medication', /\b(come off|coming off|stop taking|quit taking|wean (myself )?off|taper( off)?) (my )?(meds|medication|medications|pills|antidepressants|benzos|lithium|insulin)\b|\b(withdraw(al)? from|detox (from|myself)|cold turkey)\b|\b(stop|quit|give up|cut (down|back) on) (drinking|alcohol|booze|weed|cannabis|opioids|painkillers|pills|drugs|benzos)\b/],
  ['abuse', /\b(abuse[sd]? me|abusive (partner|husband|wife|boyfriend|girlfriend|relationship)|domestic (violence|abuse)|(hits|beats|chokes|hurts) me|afraid of my (partner|husband|wife|boyfriend|girlfriend))\b/],
  ['clinical', /\b(cure|treat|heal|fix|get rid of|get over|overcome|beat|manage) (my )?(depression|anxiety|social anxiety|ptsd|ocd|adhd|bipolar|trauma|panic( attacks)?|phobia|eating disorder|addiction|insomnia)\b|\b(psychosis|hearing voices|hallucinat\w*|panic attacks (every|each|daily)|diagnos(e|is|ed) (me|myself|my))\b/],
]

const EXISTING: readonly [ExistingTarget, RegExp][] = [
  ['partner', /\b(dating|date (more|again|someone|women|men)|go on dates|find (a |the )?(partner|girlfriend|boyfriend|wife|husband|someone to date|someone special|the one)|get married|meet (a|my) (partner|future (wife|husband))|a relationship)\b/],
  ['speaking', /\b(public speaking|speak(ing)? (in public|to (a )?(group|groups|crowd|room|audience)|up in (meetings|class|groups)|in meetings)|presentations?|give (a |better )?(talk|talks|speech|speeches)|small talk|conversations?|hold(ing)? (people's |their )?attention|tell(ing)? (better )?stories)\b/],
  ['social', /\b(make (new |more |a few |some )?friends|making friends|meet (new |more )?people|more social|be social|less lonely|loneliness|lonely|social life|social circle|connect with (more )?people|know my neighbou?rs)\b/],
  ['learning', /\b(learn(ing)? (to )?(read|play|speak|write|code|program|draw)|learn (spanish|french|german|italian|japanese|mandarin|chinese|korean|arabic|portuguese|a language|languages|piano|guitar|violin|drums|python|javascript|statistics|math|maths|chemistry|physics|history)|study (for|harder|more)|pass (the|my|a|an) .{0,30}(exam|test|certification|cert)|certification|sheet music|a course in)\b/],
  ['workout', /\b(start running|run(ning)? (a |my first )?(5k|10k|marathon|half marathon|mile)|go running|jog(ging)?|lift(ing)? weights|weight ?lifting|strength training|get (fit|stronger|in shape)|go to the gym|work ?out( more)?|workouts?|exercise (more|regularly)|build muscle|cardio|marathon)\b/],
]

const ONE_OFF = /^(book|schedule|buy|order|file|renew|cancel|pay|return|repair|fix|replace|install|sell|clean out|sort out|call|email|write to|apply for|sign up for|register for|move|pack|plan)\b(?!.*\b(every|each|daily|weekly|habit|regularly|more|better|again and again|always|routine|practi[sc]e|get comfortable|learn)\b)/

const VAGUE_WORDS = new Set(['be', 'get', 'become', 'feel', 'more', 'less', 'better', 'best', 'good', 'great', 'happy', 'happier', 'improve', 'improved', 'myself', 'me', 'my', 'life', 'self', 'a', 'an', 'the', 'person', 'version', 'of', 'to', 'and', 'in', 'general', 'overall', 'just', 'really', 'things', 'stuff', 'everything', 'together', 'on', 'track', 'want', 'i', 'productive', 'successful', 'awesome', 'amazing', 'well', 'grow', 'growth', 'level', 'up', 'work'])

/** The goal's words, lower case, punctuation gone but for apostrophes. */
export function normalized(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function first<K>(lists: readonly [K, RegExp][], text: string): { kind: K; matched: string } | null {
  for (const [kind, re] of lists) {
    const m = re.exec(text)
    if (m) return { kind, matched: m[0] }
  }
  return null
}

/** A goal, triaged by the closed lists alone. The why and anything off-limits are read for risk and harm too, never for routing. */
export function triageGoal(goal: string, also: readonly string[] = []): Triage {
  const g = normalized(goal)
  const all = [g, ...also.map(normalized)].join(' . ')
  const refuse = first(REFUSE, all)
  if (refuse) return { route: 'refuse', kind: refuse.kind, matched: refuse.matched }
  const redirect = first(REDIRECT, all)
  // A clinical word leads with the help; a Path may follow as practice beside it. The rest lead with the help alone.
  if (redirect) return { route: 'redirect', kind: redirect.kind, matched: redirect.matched, practice: redirect.kind === 'clinical' }
  const words = g.split(' ').filter(Boolean)
  if (words.length < 2 || words.every((w) => VAGUE_WORDS.has(w))) return { route: 'unclear' }
  const existing = first(EXISTING, g)
  if (existing) return { route: 'existing', to: existing.kind, matched: existing.matched }
  if (ONE_OFF.test(g)) return { route: 'notAPath', matched: g.split(' ')[0] }
  return { route: 'fits' }
}
