# Life Mirror: notes for Claude sessions

This repository is public. The owner's private documents are not in it.

## Where the plan lives

- `PLAN.md`, `PROGRESS.md` and `REVIEW_EXECUTION_PLAN.md` live in the private repository
  `Bill6006/life-mirror-private`. Sessions read them from a clone at `private/` in this repository's root, which is
  gitignored here.
- If `private/` is missing, clone it: `git clone https://github.com/Bill6006/life-mirror-private private`.
  - If the clone fails, stop and tell the owner.
  - Never reconstruct the plan from memory or from a summary.
- If `private/` is already there, run `git -C private pull` before reading it.
- The working rules, the agreed order, the gates and the current checkpoint are in those documents. Start with the
  checkpoint at the head of `private/REVIEW_EXECUTION_PLAN.md`.

## Never rely on summarized chat memory

- Before acting on any plan item, read its exact text in `private/`. Quote the lines you build from in your report.
- After the conversation has been compacted, re-read the relevant sections before you continue. A summary is a
  paraphrase, and paraphrased rules drift.
- Copy stop conditions, gates and the owner's decisions word for word. Never shorten them.

## Never copy private content here

- Nothing from `private/` goes into this repository. That covers files, commits, commit messages, tests,
  screenshots, catalogue text, issues and pull requests.
- CI refuses to ship if `PLAN.md`, `PROGRESS.md`, `REVIEW_EXECUTION_PLAN.md` or anything under `private/` is tracked.
- No secrets go into either repository. Tokens and keys stay in `worker/.dev.vars`, which is local and gitignored,
  and in the Worker's own secrets.

## Keeping the ledger

- When status changes, update `private/PROGRESS.md`, and the plan's checkpoint where it says so.
- Commit and push in `private/` by explicit paths, as a commit separate from any here.
