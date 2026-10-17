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
| `stage1_breaks.py` | stage 1, items a–s and agreed items 4–6 | 33 of 33 caught; re-run against batch 2b's code and the UI cleanups', still 33 of 33 |
| `batch2_breaks.py` | batch 2a: the foundations, the claims log, the journal's capture, the wipe | 14 of 14; re-run twice, 14 of 14 |
| `batch2b_breaks.py` | batch 2b: the journal in the Brain, the coach's stated limits | 26 of 26; re-run against the UI cleanups' code, 26 of 26 |
| `ui_cleanup_breaks.py` | the UI cleanups: Let it out in the note's card, the Aims cards, the skill coach's flow | 16 of 16 |
| `stage3_breaks.py` | stage 3: group 3 (in the moment): Anything going on?, the evening's matching pattern; group 1 (the Brain with a memory): the memory of each line seen, the weekly view's facts, trends read by the week, their filing in the Worker and the free chain kept off them; group 2 (timing): the reminder's moment, the chips' order, the retired follow-up | group 3, 10 of 10; groups 1 and 2, 47 of 47 (one first missed and its test made stronger, then caught) |

Run all of a runner's breaks with `python qa/batch2b_breaks.py`, or name ids to run only those:
`python qa/batch2b_breaks.py coach-limits-said`.

`ui_cleanup_breaks.py` and `stage3_breaks.py` guard with browser tests, which serve the built folder, so
they rebuild the app after each replacement and after each restore; `stage3_breaks.py` runs Vitest for
the breaks a unit test guards. `PW_CONFIG=<config>` picks the Playwright config.

## Live checks (`live-*.mjs`, `common.mjs`)

Each opens the live site in fresh throwaway Playwright contexts, with stand-in records only and no
cloud token. Pass the expected short commit: `node qa/live-b2b.mjs 4d650b1`. Each checks the build
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

Wait for each element before reading it. Two of batch 2b's first misses were the script reading the
screen before it rendered.

`LIVE_URL=<url>` points `live-ui-cleanups.mjs`, `live-stage3.mjs`, `live-stage3b.mjs` and `live-stage3c.mjs` at a
local preview to prove the script itself, and `CHROMIUM_PATH=<path>` launches a browser where Playwright's own is
not installed.

## Snapshot pairing (`snappair.py`)

Renaming a Vitest `describe` silently writes new snapshots and leaves the old ones obsolete. Before
trusting a green run after such a rename, pair each new entry with its predecessor and read the diff:

`python qa/snappair.py <file.snap> "<old title>" "<new title>" [--full]`

## Screens (`shots-journal-brain.mjs`)

These are the journal-in-the-Brain screens, taken from a local preview with stand-in rows. Start the
preview with `npx vite preview --host 127.0.0.1 --port 4179`, then run
`node qa/shots-journal-brain.mjs`.
