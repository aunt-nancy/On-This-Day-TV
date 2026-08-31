# On This Day — 19-Agent Force Reset + Unlocked Run Button

ROOT CAUSE OF THE LAST "STILL STUCK"
There were TWO independent locks:

1. A stale RUNNING database row.
2. The browser's Run All button was still inside `await runParallelPipeline(...)`.
   Even after the database row was reset, the button could remain disabled until that old JavaScript promise returned.

THIS BUILD REMOVES BOTH LOCKS.

FORCE RESET CURRENT RUN
Admin now calls `/api/admin/reset-run`.

That endpoint immediately:
- finds the latest run;
- marks ALL RUNNING jobs failed;
- marks ALL QUEUED jobs failed;
- closes the current run;
- does not wait for age thresholds.

RUN ALL IS NO LONGER HELD BY THE PIPELINE
Run All now:
1. creates a fresh run;
2. releases the button immediately;
3. starts the bounded-parallel pipeline without awaiting the whole newsroom.

A slow or aborted stage can therefore never leave Run All disabled for 20+ minutes.

NEW RUN CLEANUP
Creating a new run now supersedes both RUNNING and QUEUED jobs from the prior run.

BROWSER STAGE TIMEOUT
Reduced from 190 seconds to 120 seconds.

PRESERVED
- 19 agents
- bounded-parallel/nonblocking research
- resilient Source Verification
- rolling publication
- 200/75 side recovery
- Then & Now
- Recipe
- Illustrator
- local Short-Form Video
- locked design

BUILD
2026-08-30.19agent-force-reset-unlock.1

AFTER DEPLOYMENT
1. Confirm /api/health shows this exact build and 19 agents.
2. Reload Admin.
3. Click Force Reset Current Run once.
4. Click Run All Agents.
The Run All button should become available again almost immediately after the new run is created.
