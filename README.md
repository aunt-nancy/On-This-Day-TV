# On This Day — Rolling Publish Engine

PURPOSE
The public site must not remain empty while the full 16-agent newsroom finishes.

NEW PRODUCTIVITY RULE
1. Editor Opening sets the assignment.
2. Black Press + Major Press run together.
3. Source Verification verifies the core stories.
4. VERIFIED TEXT-FIRST STORIES ARE PUBLISHED IMMEDIATELY.
5. Regional + Community research then runs in parallel.
6. Context, Translation, Rights, Discrepancy, and Editor Closing enrich/refine the already-live edition.
7. Visual and Social work remains post-publication.

This means the first public articles no longer wait for Regional, Community, Context,
Rights, Discrepancy, Editor polish, Visual Archive, or Social agents.

SAFETY
- Only Source Verification output is eligible for rolling publication.
- Story-specific verification discrepancies hold that specific story.
- Explicit edition-level verification problems hold the rolling edition.
- Rolling publication is text-first with original summaries and source links; visuals stay out until later rights/visual work.
- Supporting Regional/Community stories receive a supplemental verification pass during Editor Closing before being added.

STALL / VISIBILITY CONTROLS
- OpenAI request hard timeout remains in place.
- Stale RUNNING cleanup remains in place.
- Admin page auto-refreshes every 10 seconds.
- RUNNING cards show elapsed time.

FILES TO REPLACE
- admin.html
- lib/openai.js
- lib/queued-pipeline.js
- lib/routes/agents-run-stage.js
- lib/routes/agents-run-all.js
- lib/routes/agents-status.js

AFTER DEPLOYMENT
Start a NEW run. Do not resume the old run.

EXPECTED BEHAVIOR
The first publication checkpoint is now Source Verification, not Editor Closing.
There is no guarantee that usable historical sources will always be found within a fixed
number of minutes, but the software will no longer intentionally keep verified core
stories off the site while nonessential agents continue.
