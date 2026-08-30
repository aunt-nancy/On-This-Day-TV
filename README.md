# On This Day — Single Function Backend Fix

ROOT CAUSE
Vercel Hobby allows no more than 12 Serverless Functions. Old API files from
earlier patches accumulated in GitHub, so deployments were rejected even when
the JavaScript build itself succeeded.

THIS FIX
The backend now deploys as ONE Vercel Serverless Function:

    api/router.js

All existing public/admin URLs are preserved with Vercel rewrites:
- /api/health
- /api/agents/run-all
- /api/agents/run-stage
- /api/agents/status
- /api/admin/review
- /api/admin/publishing
- /api/admin/discrepancies
- /api/content/today
- /api/social/queue
- /api/cron/daily

`.vercelignore` prevents old API endpoint files from being uploaded to Vercel,
so they no longer count against the Hobby function limit.

UPLOAD TO GITHUB ROOT, PRESERVING FOLDERS:
- .vercelignore
- vercel.json
- package.json
- api/router.js
- lib/routes/*  (all route modules)
- lib/agents.js
- lib/config.js
- lib/http.js
- lib/openai.js
- lib/prompts.js
- lib/queued-pipeline.js
- lib/social.js
- lib/supabase.js

You do NOT have to delete old API files from GitHub.
No keys, Supabase, DNS, or domain settings need to change.

SUCCESS CHECK
After Vercel says READY:
1. https://www.onthisday.tv/api/health must return JSON.
2. admin.html Refresh Status must load without "Unexpected token" errors.
3. Needs Review must show either no reviews or actual Approve/Reject cards.
