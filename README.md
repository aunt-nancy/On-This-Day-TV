# On This Day — Parallel Newsroom Engine

ROOT CAUSE FIXED
The prior browser runner was still sequential. Reordering the agents did not make them faster.
Also, OpenAI requests had no hard server-side timeout, so a browser abort could leave a Vercel
invocation and its Supabase job showing RUNNING.

WHAT THIS BUILD CHANGES

1. Bounded parallel research
   - Black Press + Major Press can work at the same time.
   - As a slot opens, Regional and Community research begin.
   - Maximum expensive research concurrency is 2 to avoid repeating the earlier 429/TPM problem.

2. Parallel analysis/verification wave
   - Source Verification, Historical Context, and conditional Translation are scheduled as a wave.
   - At most 2 model-heavy calls run simultaneously.

3. Hard AI request timeout
   - Each OpenAI HTTP request is hard-stopped server-side at ~80 seconds by default.
   - It can no longer remain RUNNING indefinitely because only the browser gave up.

4. Stale-job cleanup
   - A RUNNING agent older than 2.5 minutes is marked failed automatically before retry.
   - A fresh RUNNING job is polled instead of duplicated.

5. Smaller token reservations
   - low: 2,800
   - medium: 4,500
   - high: 6,500
   - research is explicitly capped below those defaults where appropriate.

6. No multiplied retries
   - OpenAI retries only a 429 once.
   - The newsroom retries only malformed/empty JSON once.
   - A network timeout is not multiplied into several complete research requests.

7. Discrepancy fast path
   - If verification/context/translation/rights report no actual issues, the Discrepancy Agent
     completes deterministically without spending another model call.

8. Publish first
   - Editor Closing immediately writes a deterministic verified edition to Supabase/public content.
   - Optional editor prose polishing happens after the verified edition is already published.
   - Visual Archive and social production no longer block the first public articles.

9. Post-publish production
   - Visual Archive, Social Editor, Short-Form Video, and Engagement/Trends run after publication,
     with bounded parallelism.
   - Social Distribution remains last.

FILES TO REPLACE
- admin.html
- lib/openai.js
- lib/queued-pipeline.js
- lib/routes/agents-run-stage.js
- lib/routes/agents-run-all.js
- lib/routes/agents-status.js

DO NOT CHANGE
- Supabase schema
- environment variables
- DNS/domain
- masthead
- landing page
- API router
- 75/76-year stabilization setting

AFTER DEPLOYMENT
Start a NEW run. Do not resume the currently stuck run. createQueuedRun will supersede its DB state.
