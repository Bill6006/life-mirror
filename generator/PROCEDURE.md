# Drafting a Path: the generator's procedure

The model researches and drafts; the compiler (`src/pathCompile.ts`) decides what the finished Path may contain.
Nothing you write reaches the phone unless it compiles, and the owner starts it only after reading it on one
screen. Your job is a **dossier**: one JSON object in the `Dossier` shape of `src/pathCompile.ts`, and nothing else.
The compiler reports every reason at once; read them all, fix them all, and compile again.

## What you are given

- **The goal**, in the person's words, and the intake's answers (where it should show up, a month they would be
  proud of, minutes a week, anything off-limits). The goal has already passed the rules' triage
  (`src/pathTriage.ts`) as "fits", or as a clinical word with practice allowed behind the app's own help.
- **The library**: admitted claim cards, each with its claim, effect, population, caveats, grade and origin. Cite
  only these ids. Never write a citation, an author, a year or a number that is not in a card.
- **The method library** (`src/methods.json`): each method with the cards behind it, where it works and fails.
  Every rep names one method from it; the blocked list is never used.
- **The Paths that exist**, when you are shown them. A goal they already cover is composed onto their reps
  (`shared`), counted once, never duplicated.

## What you decide, in order

1. **Classify.** The goal types it mixes, from the closed list: `skill` (a task analysis, levels, feedback,
   transfer, maintenance), `exposure` (where fear may limit the person: testing predictions, varied, never a
   strict ladder), `habitOfStarting` (a stable cue for starting the rep, never the live performance), `knowledge`
   (spaced retrieval), `lifestyle` (self-monitoring, goals, feedback and plans). If the goal is too vague to build
   on, or the library holds nothing a strand could stand on, set `triage.route` to `abstain` with the reason and
   what would be needed. An abstention is the goal and its triage alone: build nothing else.
2. **Take the goal apart, setting by setting.** For each setting the goal reaches (the intake's "where it should
   show up" first), say what being good at it looks like there and which observable acts show it. A setting with
   skills of its own gets its own strand or its own behaviours; it is never a rung passed on the way to another.
   Then the components (what a person must be able to do), each with its basis as an origin label (`direct`,
   `indirect`, `mechanism`, `expert`, `inference`, `judgment`) and the cards behind it. Each component is shown
   by at least one behaviour (`shows`), or is marked `composite` and built from its parts by links into it.
   Name every layer the goal implies, from the evidence and the intake (for a goal about people, for example:
   talking one to one, joining a group, bringing people together, a commitment that recurs): each gets components
   and reps, or an `excluded` entry that names it and says why. When components differ by setting and by how they
   can be confirmed (a conversation is checked by you alone; a talk can be recorded or handed over), give each group
   its own strand, with its own gates and its own focus at the start.
3. **Preconditions.** For every component and every rep, ask what must already exist: a way to reach the person,
   someone talked with before, someone's yes to a plan, a partner. Write a rep's as `needs` from the closed list.
   A rep that gives one (offering a way to stay in touch; a first talk) says so in `gives`, at or before the stage
   that needs it. A need nothing in the Path can produce is a component to add, or a sign the rep belongs elsewhere.
4. **Prerequisite links** between components, hard or soft, each with its basis. No cycles. A hard prerequisite is
   trained no later on its strand than what depends on it: the links must sequence the reps, not decorate them.
5. **Name the context dimensions** the evidence says must vary: how familiar the other person is, how many people,
   how much is at stake, the medium, the kind of setting.
6. **Strands, then stages.** One strand per goal type that needs its own machinery, one to three in all. Each
   strand's stages are context cells along those dimensions, from the domain: two to six, never a number chosen in
   advance. Each strand has a floor (reps, different reps, kinds of setting, within weeks, the smaller version after
   refusals, re-entry after quiet weeks), at least the compiler's floor for its kind, and its numbers are design
   judgment, said so in its decision. Beside another Path a Path's own reps take the day's People row three days in
   seven, and a third of those days goes to misses and support reps, so the strands that run together ask at most two
   reps a week in all (a nightly habit is counted on those days, however often it is done). The app draws a day's
   rep among all a stage offers alike, so at every stage the rule moves at least half the reps offered move it.
   - **Ask of every stage whether the person's own reps alone can reach it.** A part that depends on someone else's
     yes or on a relationship (being with a partner, a group that takes you in) is a strand that **waits**: off
     until the person turns it on, their word, dated, undone by turning it off. It names the strands it `pauses`
     while it is on. Its stages are your own practice once it is on, never a milestone of the relationship, and no
     stage is ever declared. Reps that need a partner sit on such a strand; the app adds its own private check.
   - **Calls and messages.** Say for each strand whether calls and messages move its stages (`remote`), and why, in
     its decision. Where the intake puts the goal in person, they do not: a rep done by message supports only.
   - **The hardest setting the intake names** (a talk, a room of strangers) is the top of a strand: the stage that
     names it holds stage-moving reps in that setting, and a one-to-one version of it stays support. Each stage's
     words describe only what its own reps offer.
7. **Reps.** Concrete, real-world, the person's own act, complete whatever anyone answers: a done-when never waits
   on a reply, a yes, an arrival or a meeting. Each: what to do, done when (beginning "Done "), where attention goes
   (`cue`), the crutch to drop, the settings, whether someone else is there (`with`: `adult` in person, `remote`
   by a call or a message; then a guardrail), the minutes (one to ninety, each within the person's minutes a week;
   the typical rep on three days in seven within them), the effort, the method, and the components it `trains`.
   No rep is counted by anyone's answer; no tactic on anyone; no treatment, cure or diagnosis. A rep never asks the
   person to record a rating, a score, stars or how it went: the app records the behaviours they check, and its
   own one-line prediction before each start. Give every stage the rule moves **one rep more** than its floor
   needs, in enough kinds of setting, so the stage holds when one rep cannot happen (no newcomer comes, a rep is
   dropped).
   Every stage the rule moves holds a rep below high effort: after refusals the app offers the stage's lightest rep,
   so it must be lighter. A rep that asks one person for something they could refuse (a plan, a date, a favour,
   their interest) says so (`asks`): the app adds its own bar, never someone who cannot freely say no. Needing
   someone else's yes keeps a thing out of the count, never out of the Path: a phase reached through a yes (a date,
   being with someone) is a strand that waits, with your own practice in it, and a strand done with a partner holds
   a rep of asking in words before anything physical. List every kind of setting a rep fits, by where it happens and
   who is there (an ask at a place your week holds, just the two of you, is both). A guardrail never makes a rep wait
   on someone else's answer: when the other person keeps
   it light, or says no, the rep is still done by your own offer. A rep that needs a plan someone agreed to is
   offered like any other, and on a day with no plan you answer that there was no chance.
8. **Measurement**, in P2's shape: per strand the behaviours a rep checks (your own acts, never anyone's reaction),
   written stage by stage from each stage's `what`; per stage a gate whose `requires` names the behaviours that
   stage exists for (behaviours met, separate weeks, kinds of setting). **Pick each stage's check source from its
   settings:** your own checks for a conversation (the person you talked with is never asked to check you); a
   recording only of yourself alone; a hand-over only to someone in an audience (a group, in person). A gate asks
   for a check from outside the moment (`confirmed`) only where two or more of its reps can give one; otherwise it
   rests on your own checks, and the decision says so. A strand's first stage never waits on someone else: its
   check from outside the moment, if any, is one you can always give alone, a recording of yourself. Every component a strand trains before its last stage is
   shown by a behaviour some gate of that strand requires: one no gate asks for is never measured. A strand's last
   stage has no gate: reaching it is the end, and what must be shown is shown at the stages before it. An attempt
   cap of four to twelve, with a decision saying why (eight unless you have a reason), and checks again later
   (about a month and three months, then about every six).
9. **The start, from the domain.** A Path most of whose stage-moving reps are done with someone opens on the app's
   `socialFear` screen and holds an exposure strand a yes opens; a strand of kind `exposure`, or a goal with a
   clinical word, opens on one of the app's own screens (`socialFear` or `fear`), named by id: you never write its
   questions or its help. Its focus choices name where it starts: a strand that neither waits nor is the one a yes
   opens, or one choice for all of those. A question the intake did not ask is never left as an uncertainty when
   the start screen asks it; anything else the intake did not ask, state the default you assumed and what would
   change it.
10. **Decisions.** One record per element: the structure, each strand (`strand:<id>`), each strand's gates
   (`gate:<id>`), the start, the maintenance, the floor (`rule`), the attempt cap (`cap`) and the timeline, and any
   rep whose shape needs a
   reason: what was decided, on what basis, its origin, the cards, how unsure it is, and what would change it. Most
   of a new Path is design judgment: say so plainly. A guardrail or a reason for leaving something out that states
   a finding cites the card it rests on.
11. **Evidence, component by component.** For each component, read every card on it before choosing reps: the
   strongest tested intervention for it, the populations it was tested in, its caveats. Prefer a tested programme
   or trial over a mechanism; say plainly where nothing tested exists.
12. **Plain words.** About how long it runs (months, not a promise), what counts and what is never counted, what is
   left out and why, and a name of one or two words.

## What you never do

- Invent evidence, or cite a card for more than it says.
- Copy a Path you are not shown, or force a fixed number of stages.
- Write help text, referral text, a private check or a start screen's questions: the app owns them.
- Write the provenance: the harness that runs you stamps the run, the model, this procedure's hash and the day.
- Put the person's own words into a search query.
