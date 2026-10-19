# QA tools: deliberate breaks, live checks, snapshot pairing

Nothing here ships or is imported by the app. Each tool finds the repository root from its own place,
so it runs from any clone. Outputs go to `qa/out/`, which is never committed.

## Deliberate breaks (`*_breaks.py`)

Each runner holds a table of breaks. A break undoes one change, and the test that guards it must turn
red. Rules every runner keeps:

- The table is read as data. Never `exec` a runner's head to get at it.
- Each break first runs its test green as a baseline. A break whose baseline is already red counts
  for nothing.
- Each break is exactly one replacement, and the file is restored byte for byte afterwards.
- An empty test list is refused, because it would run every test.

| Runner | Covers | Last result |
| --- | --- | --- |
| `stage1_breaks.py` | stage 1, items a–s and agreed items 4–6, and item q's last instance (2026-10-17) | 33 of 33 caught; re-run against batch 2b's code and the UI cleanups', still 33 of 33; against stage 3's groups 1 to 4, 33 of 33, then 35 of 35 with item q's two |
| `batch2_breaks.py` | batch 2a: the foundations, the claims log, the journal's capture, the wipe | 14 of 14; 14 of 14 at every re-run since, the last against stage 3's group 4 |
| `batch2b_breaks.py` | batch 2b: the journal in the Brain, the coach's stated limits | 26 of 26; re-run against the UI cleanups' code and stage 3's, 26 of 26 |
| `ui_cleanup_breaks.py` | the UI cleanups: Let it out in the note's card, the Aims cards, the skill coach's flow | 16 of 16; re-run against stage 3's code, 16 of 16; two retired 2026-10-18 (the card's "after today's line", which the owner's new D7 replaced) |
| `audit_fixes_breaks.py` | the audit's eight fixes and the new D7 (2026-10-18): the Worker's minute, a suggestion at once and reviews after the line, only runs that reached Claude counted, a refused fire's wait; the phone's wait words, its look before any pull; the Aims cards' actions first and counts under Details, the review's evidence under Why; "Anything behind it?"; "not asked"; the test tap's sentence; the field hints and "check-in?" kept whole | one break (only-reached-count) missed on its first run, its test made stronger; then 33 of 33 against the final code (e19fc40), each from a green baseline |
| `repair_breaks.py` | the learning repair, stages R1 to R3 (2026-10-19): the replay's test order and week fits and its responses (guarded by stress/equivalence.ts); what counts as a randomized decision; what an answer means; the day's context; a rebuild stopping before a new draw; behind the switch, the draw in the app; the switch shipped gated; the learning week: an invitation standing until answered, a week counting its days, the answers read back from the day's record and an answer making that record when the day has none, the week's line following the switch, the invitation's controls in the themes audit, the preview opening only in an automated test browser | 13 of 14 first: dropping the replay's week fits changed no call, so the harness now compares the replayed week too; then 14 of 14; with R3's five, 19 of 19; with an answer making the day's record and the invitation's controls in the themes audit, 21 of 21 against the committed R3 (131fa97) |
| `stage3_breaks.py` | stage 3: group 3 (in the moment): Anything going on?, the evening's matching pattern; group 1 (the Brain with a memory): the memory of each line seen, the weekly view's facts, trends read by the week, their filing in the Worker and the free chain kept off them; group 2 (timing): the reminder's moment, the chips' order, the retired follow-up; group 4 (the record shown back): a check-in's note on its summary, Your words, the line left after a session, Her from the current rung, the month, the workouts read; the watched daylight test's race: a field just shown keeps what is typed into it | group 3, 10 of 10; groups 1 and 2, 47 of 47 (one first missed and its test made stronger, then caught); group 4, 27 of 27 (one first missed and its test made stronger, then caught); all 84 against group 4's final code, 84 of 84; the field race, 2 of 2 |
| `stage3_item5_breaks.py` | stage 3, item 5 (the check-in and the readings put to use): a move drawn again when the day changes, Out among people today, sleep asked late, Motivation and Confidence in turn, Outside a while today, Something sweet and when the last caffeine was, the newer chips counted and compared only where shown, Social energy's steer, the expectancy tap, your own chips | 58 of 61 first: three missed and their tests made stronger, then caught, 61 of 61 |
| `stage3_item6_breaks.py` | stage 3, item 6 (weather as context): one request a day naming only the area to one decimal and two dates, with no referrer; nothing asked while off or without a place; a failure not tried again that day; only the units asked; a day missing anything unknown, never dry; the days' own records, none made up; rain this hour or the next keeping an outdoor move waiting, only while on; the comparisons at 14 days, a day without weather on neither side; the sheet only while on, values only; the Worker's filing, the free chain and Claude's rule; a cause refused; the switch on this phone alone; the export; the screens saying first, and wherever the area goes, what is sent | 45 of 46 first: one missed and its test made stronger, then caught, 46 of 46 |

Run all of a runner's breaks with `python qa/batch2b_breaks.py`, or name ids to run only those:
`python qa/batch2b_breaks.py coach-limits-said`.

`ui_cleanup_breaks.py`, `stage3_breaks.py`, `stage3_item5_breaks.py` and `stage3_item6_breaks.py` guard with browser
tests, which serve the built folder, so they rebuild the app after each replacement and after each restore; the three
stage 3 runners run Vitest for the breaks a unit test guards. `PW_CONFIG=<config>` picks the Playwright config.

## Live checks (`live-*.mjs`, `common.mjs`)

Each opens the live site in fresh throwaway Playwright contexts, with stand-in records only and no
cloud token, except `live-skillcoach.mjs`: its cloud is a stand-in answered inside the page, never reached, and its token
is made up and written into the app's own storage. Pass the expected short commit: `node qa/live-b2b.mjs 4d650b1`. Each checks the build
stamp first, then that batch's features. Each also confirms the page reached no host but the site
itself, and threw no page error.

| Script | Batch | Last result |
| --- | --- | --- |
| `live-pass1b.mjs` | Pass 1B | 11 of 11 at af6123c |
| `live-stage1.mjs` | stage 1 | 18 of 18 at b6623bb |
| `live-b2a.mjs` | batch 2a | 14 of 14 at fd924d2 |
| `live-b2b.mjs` | batch 2b | 10 of 10, twice, at 4d650b1 |
| `live-ui-cleanups.mjs` | the UI cleanups | 18 of 18 against a local preview; 7 of 18 against the build before them, every cleanup's check failing |
| `live-stage3.mjs` | stage 3, group 3 | 8 of 8 against a local preview; 4 of 8 against the build before it, every feature check failing |
| `live-stage3b.mjs` | stage 3, groups 1 and 2 | 8 of 8 against a local preview; 3 of 8 against the build before it, every feature check failing |
| `live-stage3c.mjs` | stage 3, group 4 | 11 of 11 against a local preview; 2 of 11 against the build before it, every feature check failing |
| `live-stage3d.mjs` | stage 3, item 5 | 13 of 13 against a local preview, three times; 2 of 13 against the build before it, every feature check failing |
| `live-stage3e.mjs` | stage 3, item 6, weather | 13 of 13 against a local preview, five times; 4 of 13 against the build before it, every check of the feature failing; the weather service is answered in the page and never reached. Since 2026-10-18 its moments are by London's clock and its pages in London's zone, the stand-in area's: 13 of 13 from a New York machine against e8afea2, where it was 12 of 13 |
| `live-skillcoach.mjs` | the skill coach the way the owner uses it, with the cloud copy on (the audit's fix 4), and the new D7 | 14 of 14 on the live site at c8e2048 |
| `live-repair.mjs` | the learning repair in its preview (stages R2 and R3): a check-in's move drawn by the repair, the learning week's invitation and Yes, nothing shown with the preview closed | 10 of 10 against a local preview of 131fa97; 5 of 10 against the build before it (8ab0029), every feature check failing |

Wait for each element before reading it. Two of batch 2b's first misses were the script reading the
screen before it rendered.

`LIVE_URL=<url>` points `live-ui-cleanups.mjs`, the five `live-stage3*.mjs` scripts, `live-skillcoach.mjs` and `live-repair.mjs` at a local preview to prove
the script itself, and `CHROMIUM_PATH=<path>` launches a browser where Playwright's own is not installed.

## Snapshot pairing (`snappair.py`)

Renaming a Vitest `describe` silently writes new snapshots and leaves the old ones obsolete. Before
trusting a green run after such a rename, pair each new entry with its predecessor and read the diff:

`python qa/snappair.py <file.snap> "<old title>" "<new title>" [--full]`

## Screens (`shots-journal-brain.mjs`)

These are the journal-in-the-Brain screens, taken from a local preview with stand-in rows. Start the
preview with `npx vite preview --host 127.0.0.1 --port 4179`, then run
`node qa/shots-journal-brain.mjs`.
