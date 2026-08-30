# On This Day — Source Verification Stability Rollback

WHAT BROKE
A live run showing 5/16 proves the browser/server was still using an older 16-agent build.
That older flow also let Agent #4 Source Verification make one large all-or-nothing model request.
If that JSON response failed, Source Verification failed and the staged runner stopped.

THIS BUILD RESTORES THE WORKING BEHAVIOR WITHOUT REMOVING THE 19-AGENT FEATURES

1. SOURCE VERIFICATION IS SMALL-BATCH
- top research candidates are selected by editorial importance;
- verification runs in batches of at most 3 candidates;
- at most 2 verification calls run simultaneously;
- a failed batch is retried one candidate at a time;
- one malformed candidate can never fail the entire Source Verification stage.

2. SOURCE VERIFICATION NO LONGER FREEZES THE RUN
The stage returns a completed verification object containing everything safely verified.
Unverifiable candidates are recorded as discrepancies and excluded from publication.

3. EXISTING ROLLING PUBLICATION IS PRESERVED
After the safe verification results are merged, the existing rolling-publish code runs normally.
200-year and 75-year side recovery remains intact.

4. 19-AGENT ROSTER ENFORCEMENT IS PRESERVED
The server still refuses a new run unless registry, server stage order, and Admin are all exactly 19.

5. OLD 16-AGENT ADMIN CACHE IS DISABLED
Vercel now sends:
Cache-Control: no-store
for admin.html and all /api routes.

6. ADMIN PROGRESS ALWAYS USES 19
The progress denominator is EXPECTED_AGENT_COUNT, not a stale array length.

BUILD
2026-08-30.verification-stable19.1

UPLOAD
Upload the CONTENTS of this ZIP to the repository root, preserving all folders.

AFTER PRODUCTION READY
Open a NEW URL:
https://www.onthisday.tv/admin.html?build=verification-stable19-1

It must say:
LIVE ROSTER VERIFIED: 19/19 agents

Do not resume the current 5/16 run. It was created by the stale 16-agent build.
Start a NEW run only after the 19/19 verification appears.
