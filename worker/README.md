# The brain

A Worker under your own Cloudflare account, on the free tier. Once a day it reads the fact
sheet the phone wrote to the database, the evidence library as the app ships it, and what was
said recently; asks a model on Workers AI for one line; checks that line against the facts; and
writes it back as a row of its own app. The phone shows it at the head of the brief. A line may
offer one tap (pin a step to a moment today, make the check-in lighter, or set a test the record
has never run); the offer is checked against the facts here, and again on the phone at the tap.
On Sunday, beside the day's line, it writes the week reviewed in three parts: what held, what
did not, one change; each part held to the rules of a line. Every
fifteen minutes it looks for a plan whose moment has come and sends a content-free push; the
phone composes the reminder from the plan it recorded. Forty-five minutes on, if the step is
still not started, it sends one more, once, and never again for that plan. It also sends the three content-free
check-in pings (07:30, 13:00, 19:30 local), which the repository used to send. Nothing here is paid for. If the free
tier or a model goes away, the phone's own line stands.

The free models never see a check-in: only the derived facts, which carry the last few notes you
typed at a check-in, word for word, so the line can read them as context. The Worker holds its own database token, the
push address and the push key as secrets you paste; none of them is in this folder, in tests,
in the pipeline or in logs.

## Claude as the writer (Parts 30 and 31)

With `CLAUDE_WRITER = "on"` the day's line and Sunday's review are written by Claude, under your
own claude.ai account, through a routine:

1. When the line is due, the Worker marks the day's task, then fires the routine. The fire has
   no idempotency key, so the mark comes first. The fire's only text is the task, the day and
   the writer model alias from Settings → Brain.
2. The run asks `GET /claude/briefing` for the day's briefing. The Worker builds it through the
   private retrieval layer (`src/retrieval.ts`): the governing rules, then your Brain switches,
   then the task's profile. Every read is logged by category, count and size, never content.
   The run may ask `GET /claude/context` for more, filtered and capped at twenty reads and 64 KB.
3. The run posts its answer to `POST /claude/line`. The Worker checks it as it checks any line:
   the validator, the day guard, the repeat check, and the surface rules for private names and
   dating. It allows one corrected retry, then stores the line with who wrote it.
4. A failed fire (a 429, a paused routine, a server error), two refusals, or no valid line
   within twenty minutes, and the free chain writes; failing that, the phone's own line stands.

The three `/claude/` addresses answer only the bridge key, which Anthropic's agent proxy adds to
the run's requests after they leave its machine, so the key never reaches Claude. The routine's
instructions live in its own private repository, `life-mirror-bridge`. `CLAUDE_BRIDGE_KEY` and
`CLAUDE_FIRE_TOKEN` are secrets like the rest. No model is ever paid for: Claude runs within your
plan's included allowance, with usage credits off.

## Once

1. `npx wrangler login` (opens the browser to your Cloudflare account).
2. In the Turso dashboard, create a token for the `life-record` database (read and write). Paste it:
   `npx wrangler secret put TURSO_TOKEN --config worker/wrangler.toml`
3. The push address: Settings → Reminders → The ping → Copy address gives the same JSON you gave the repository secret:
   `npx wrangler secret put PUSH_SUBSCRIPTION --config worker/wrangler.toml`
4. The private half of the push key (the same value as the repository's `VAPID_PRIVATE_KEY`):
   `npx wrangler secret put VAPID_PRIVATE_KEY --config worker/wrangler.toml`
5. Optional, to run a job by hand: any long random string:
   `npx wrangler secret put RUN_KEY --config worker/wrangler.toml`
6. Deploy: `npm run worker:deploy`

Wrangler asks you to confirm the free plan's Workers AI usage the first time.

## Check

- `https://life-mirror-brain.<your-subdomain>.workers.dev/health` answers `{"ok":true}`.
- With a run key: `/run/push?key=…&kind=test` shows a test notification on the phone; `/run/brief?key=…&force=1` writes today's line now (the phone shows it after its next sync, within fifteen minutes or at open), and `&writer=claude` or `&writer=free` picks the writer; `/run/review?key=…&force=1` writes the week's review now; `/run/cues?key=…` sends a reminder for any plan whose moment has come.
- `/run/brief-report?key=…` lists the last thirty lines by their days, trigger, writer and refusals, never their words; `/run/bridge-report?key=…` lists each day's Claude task and how it ended.
- The Cloud screen on the phone says when the brain last wrote and with which model.

## What it costs

Workers AI gives 10,000 neurons a day free; one line costs on the order of a hundred. The
database reads are a few rows a day. Cron triggers and requests are far inside the free plan.

## If it stops

The phone's own line takes over at once; nothing on the phone waits for the Worker. To move the
brain elsewhere, `worker/src` is the whole of it: a store over the `records` table, a model
runner, the prompt, and the validator shared with the app.
