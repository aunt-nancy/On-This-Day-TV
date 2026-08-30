# On This Day — Agent Resilience + Diagnostics Patch

This patch fixes the two issues exposed by the first live run:

1. One research agent failing no longer aborts the entire run.
   Research failures are recorded and passed to the Discrepancy Agent.

2. The Admin Newsroom now shows exact failed-agent errors directly.
   No more searching through the Raw Status JSON.

3. Model JSON calls retry once automatically with a smaller strict-JSON instruction.

4. Community Press research is capped at the 10 strongest supported candidates in a run,
   instead of trying to cover every community at once.

Upload and replace only:
- lib/pipeline.js
- lib/prompts.js
- admin.html

No Vercel environment changes.
No Supabase changes.
