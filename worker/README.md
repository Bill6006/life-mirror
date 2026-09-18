# The brain

A Worker under your own Cloudflare account, on the free tier. Once a day it reads the fact
sheet the phone wrote to the database, the evidence library as the app ships it, and what was
said recently; asks a model on Workers AI for one line; checks that line against the facts; and
writes it back as a row of its own app. The phone shows it at the head of the brief. Every
fifteen minutes it looks for a plan whose moment has come and sends a content-free push; the
phone composes the reminder from the plan it recorded. Nothing here is paid for. If the free
tier or a model goes away, the phone's own line stands.

The Worker never sees a check-in: only the derived facts. It holds its own database token, the
push address and the push key as secrets you paste; none of them is in this folder, in tests,
in the pipeline or in logs.

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
- With a run key: `/run/brief?key=…&force=1` writes today's line now (the phone shows it after its next sync, within fifteen minutes or at open); `/run/cues?key=…` sends a reminder for any plan whose moment has come.
- The Cloud screen on the phone says when the brain last wrote and with which model.

## What it costs

Workers AI gives 10,000 neurons a day free; one line costs on the order of a hundred. The
database reads are a few rows a day. Cron triggers and requests are far inside the free plan.

## If it stops

The phone's own line takes over at once; nothing on the phone waits for the Worker. To move the
brain elsewhere, `worker/src` is the whole of it: a store over the `records` table, a model
runner, the prompt, and the validator shared with the app.
