# On This Day — Durable Queue Newsroom

This replaces the prior single-request 16-agent pipeline.

## Why this build exists
The old Run All Agents endpoint awaited the entire newsroom inside one Vercel Function.
If that invocation timed out or was terminated, Supabase jobs remained stuck as RUNNING.

This build uses Vercel Queues:
- Run All Agents creates a run, publishes one queue message, and returns immediately.
- The queue invokes one agent per Vercel Function.
- Each agent stores COMPLETE or FAILED before the next agent is queued.
- Completed agents are idempotent and are not repeated on queue redelivery.
- Small delays between research agents prevent OpenAI token-per-minute spikes.
- Queue delivery is durable and retryable across function crashes/deployments.
- Editor & Producer saves/publishes the edition immediately, so the website can populate before social agents finish.
- The daily Vercel Cron also starts the same durable queue process.

## No new secrets required
Keep the already-connected:
- OTD_OPENAI_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OTD_ADMIN_TOKEN
- OTD_CRON_SECRET

No Supabase schema change is required.

## Files added
- lib/queued-pipeline.js
- lib/queue.js
- api/queues/agent.js

## Files replaced
- api/agents/run-all.js
- api/agents/status.js
- api/cron/daily.js
- admin.html
- package.json
- vercel.json
- corrected lib/openai.js, lib/supabase.js, lib/config.js, lib/http.js

## Deployment
Upload the full contents to the repository root, replacing existing files.
Vercel installs @vercel/queue and registers the private queue consumer during the deployment.

After deployment:
1. Open /admin.html
2. Enter admin token and 08/29/2026
3. Start New Run once
4. The page automatically polls every 5 seconds.
5. The public site begins showing the new articles when Editor & Producer completes.
