# Stable16 Direct Overwrite — Exact GitHub Destinations

Upload these files to the SAME paths already present in the repository.

ROOT
- admin.html
- package.json
- vercel.json

/api
- api/router.js

/lib
- lib/config.js
- lib/agents.js
- lib/prompts.js
- lib/queued-pipeline.js
- lib/openai.js
- lib/http.js
- lib/supabase.js
- lib/social.js

/lib/routes
- health.js
- agents-run-all.js
- agents-run-stage.js
- agents-status.js
- admin-review.js
- admin-publishing.js
- admin-discrepancies.js
- content-today.js
- social-queue.js
- cron-daily.js

IMPORTANT
Do not upload the outer folder name itself into GitHub.
The files above must replace the files at those exact existing paths.

FIRST PROOF
Before waiting for Vercel, open GitHub:
lib/config.js

It MUST say:
export const AGENT_VERSION = '2026-08-30.priority1-video-stable16.1';

If it still says verification-stable19.1, the files were not uploaded to the existing /lib folder.
