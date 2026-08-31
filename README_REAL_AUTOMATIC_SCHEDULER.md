# On This Day — Real Automatic Newsroom Scheduler

ROOT CAUSE
The existing cron route was intentionally a no-op. It returned:

    status: manual_staged_runner_active

Therefore the Pacific date fix did not create a new August 31 edition.
Nothing was automatically starting the 19-agent newsroom.

THIS BUILD MAKES THE NEWSROOM AUTOMATIC

FOUR PACIFIC-TIME WINDOWS
00:00 — Morning / new-day kickoff
12:00 — Afternoon
18:00 — Evening
22:00 — Late Breaking

SERVERLESS-SAFE WORKER
Vercel wakes the worker every 2 minutes.
When idle, it returns immediately.
When a scheduled run is active, it advances only the current eligible wave.

LOCKED BOUNDED-PARALLEL BEHAVIOR
- Research: maximum 2 concurrent agents
- Context + translation: maximum 2
- Post-publish features: maximum 3
- Critical publisher/verification stages remain ordered
- Noncritical failures do not stop later eligible work
- No single long 19-agent serverless invocation

#12 PUBLISHING
Editor & Producer — Closing Desk is automatically invoked after:
research -> context/translation -> verification -> rights -> discrepancy control.

The rolling publish from #4 remains available for early verified content, while
#12 remains the final website Closing Desk publisher.

IDEMPOTENT
Each publishing window is created only once per site date.
Cron retries cannot create duplicate automatic runs for the same slot.

IMPORTANT VERCEL AUTH
Vercel sends Cron authentication from an environment variable specifically
named CRON_SECRET.

You already have OTD_CRON_SECRET. Add ONE alias in Vercel:

    CRON_SECRET = the exact same value as OTD_CRON_SECRET

Do not create a different secret.

This is necessary because the current code already accepts either variable,
but Vercel's Cron platform sends the Authorization header using CRON_SECRET.

BUILD
2026-08-31.19agent-real-automatic-scheduler.1
