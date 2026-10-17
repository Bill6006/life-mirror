# Life Mirror: notes for Claude sessions

This repository is public. The owner's private documents are not in it.

## First

- Read `WORKING.md` in the private copy (below) in full before acting, and again after the conversation is compacted.
  It holds the owner's working preferences, the hard rules and the lessons of every earlier session.
- Work autonomously. Stop only where the owner's GO prompt says to.
- At a stop, ask for one decision: your recommendation first with its reason and cost, then a one-line reply the
  owner can paste. Never a cold list of options.

## Where the plan lives

`PLAN.md`, `PROGRESS.md` and `REVIEW_EXECUTION_PLAN.md` live in the private repository
`Bill6006/life-mirror-private`. Use the copy your session already has:

- **A cloud session:** the owner attaches both repositories when starting it, with the **+** beside the repository.
  - The private one is then a sibling folder, `../life-mirror-private`, and the session starts in the folder above
    both.
  - Use that copy, and never clone a second one.
  - It starts on a detached HEAD, so run `git checkout -B main origin/main` in it before editing.
- **The owner's computer:** a clone at `private/` in this repository's root, gitignored here. Run
  `git -C private pull --ff-only` before reading it.
- **If neither copy exists, stop and tell the owner.**
  - A cloud session can reach the private repository only if it was attached when the session started.
  - Never reconstruct the plan from memory or from a summary.

The working rules, the agreed order, the gates and the current checkpoint are in those documents. Start with the
checkpoint at the head of `REVIEW_EXECUTION_PLAN.md`.

## Never rely on summarized chat memory

- Before acting on any plan item, read its exact text in the private copy. Quote the lines you build from in your
  report.
- After the conversation has been compacted, re-read the relevant sections before you continue. A summary is a
  paraphrase, and paraphrased rules drift.
- Copy stop conditions, gates and the owner's decisions word for word. Never shorten them.

## Never copy private content here

- Nothing from the private repository goes into this one. That covers files, commits, commit messages, tests,
  screenshots, catalogue text, issues and pull requests.
- CI refuses to ship if `PLAN.md`, `PROGRESS.md`, `REVIEW_EXECUTION_PLAN.md` or anything under `private/` is tracked.
- No secrets go into either repository. Tokens and keys stay in `worker/.dev.vars`, which is local and gitignored,
  and in the Worker's own secrets.

## Keeping the ledger

- When status changes, update `PROGRESS.md`, and the plan's checkpoint where it says so.
- Commit in the private copy by explicit paths, separately from any commit here. Push with
  `git push origin main` (from a cloud copy, `git push origin HEAD:main` also works).
- The cloud refuses branch deletion in the private repository. Push only to `main` there.
