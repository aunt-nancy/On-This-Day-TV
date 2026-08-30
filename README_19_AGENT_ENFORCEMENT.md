# On This Day — FULL 19-Agent Server Enforcement

The latest feature package DID contain 19 agents, but it did not include the entire single-function
server/router bundle. The live Vercel deployment could therefore continue serving an older bundled
API build.

This package fixes that by replacing the full server bundle.

EXPECTED LIVE ROSTER
19 agents
Roster version: 2026-08-30.roster19.1

THE SERVER NOW REFUSES TO START A RUN UNLESS
- AGENTS.length is exactly 19
- STAGE_ORDER.length is exactly 19
- all agent keys and stage keys match
- priorities 1 through 19 are present exactly once

ADMIN
Run All Agents stays disabled until the live server reports:
LIVE ROSTER VERIFIED: 19/19 agents

If an older server is live, Admin shows ROSTER MISMATCH instead of silently starting a 16/17-agent run.

HEALTH CHECK
/api/health now returns:
- rosterVersion
- roster.expected
- roster.actual
- agents
- agentVersion

The API router also sends:
X-OTD-Build: 2026-08-30.roster19.1

THIS IS A FULL SERVER BUNDLE
It includes api/router.js, vercel.json, all server routes/libs, current admin, current frontend,
Then & Now, Recipe From the Archives, and Illustrator job control.

UPLOAD
Upload the CONTENTS of this ZIP to the GitHub repository root and preserve the folders.

AFTER VERCEL SAYS PRODUCTION READY
Open:
https://www.onthisday.tv/api/health

You should see:
"rosterVersion":"2026-08-30.roster19.1"
"expected":19
"actual":19

Then open Admin. It must say:
LIVE ROSTER VERIFIED: 19/19 agents

Do not start a new run unless that exact verification appears.
