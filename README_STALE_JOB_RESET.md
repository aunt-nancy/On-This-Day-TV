# On This Day — 19-Agent Stale Job Auto-Reset

ROOT CAUSE
The Black Press card showing RUNNING for 28+ minutes was a stranded database status,
not a live 28-minute Vercel function.

The old stale cleanup only ran when the exact same agent endpoint was invoked again.
That allowed a dead RUNNING row to remain indefinitely and made Admin appear frozen.

FIX
- Every /api/agents/status request automatically finds RUNNING jobs older than 4 minutes.
- Those stranded jobs are immediately marked FAILED with an auto-reset explanation.
- The status endpoint re-reads the database before responding, so Admin sees the correction on the same refresh.
- Black Press and the other research agents are noncritical to orchestration, so the bounded-parallel runner can continue after the stale row is cleared.
- Browser wait-for-existing time is reduced from 155 seconds to 30 seconds.
- Admin adds a Clear Stuck Jobs button.

WHAT TO DO AFTER DEPLOYMENT
1. Open Admin with a fresh page reload.
2. Enter the Admin token.
3. Click Clear Stuck Jobs once.
4. #2 should change from RUNNING to FAILED/cleared.
5. You can then click Resume Current Run OR Run All Agents for a clean new run.

The server's Run All endpoint already supersedes prior running jobs when starting a new run.

PRESERVED
- 19 agents
- bounded-parallel/nonblocking research
- rolling publishing
- Source Verification resilience
- Then & Now
- Recipe From the Archives
- Illustrator
- Short-Form Video reliability
- locked public design

BUILD
2026-08-30.19agent-stale-reset.1
