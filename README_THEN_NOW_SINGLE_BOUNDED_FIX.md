# On This Day — Agent #13 Then & Now Single / Bounded Fix

ROOT CAUSE
Then & Now had two execution paths:
1. an early hidden invocation inside Source Verification; and
2. the real Agent #13 stage.

The early invocation could begin late in a long Source Verification request. If the hosting request was terminated, the Agent #13 job row could remain RUNNING even though no useful work was still happening.

FIX
- Removed the hidden early Then & Now execution from Source Verification.
- Agent #13 is now the ONLY Then & Now execution path.
- Agent #13 gets one OpenAI attempt only.
- Hard OpenAI request budget: 45 seconds.
- Low reasoning and 1,200 max output tokens.
- No JSON repair/retry chain for this optional feature.
- If the request times out, returns malformed JSON, or cannot establish a strong present-day connection, Agent #13 completes safely with show=false/skipped.
- A stranded Then & Now RUNNING job is reclaimable after 75 seconds.
- Agent #13 remains noncritical, so #14–#19 continue.

LOCKED ARCHITECTURE PRESERVED
- all 19 agents
- bounded-parallel/nonblocking runner
- direct Run All server path
- rolling publish
- 200/100/75 editorial structure
- Then & Now feature itself
- Recipe, Illustrator, social agents
- public design untouched

BUILD
2026-08-30.19agent-thennow-bounded.1

AFTER DEPLOYMENT
1. Confirm /api/health shows this build and 19 agents.
2. Reload Admin.
3. Click Resume Current Run.
   The existing 12+ minute #13 job is far beyond the 75-second reclaim window, so it will be cleared and Agent #13 will rerun once under the new 45-second limit.
4. Whether Then & Now succeeds or safely skips, #14–#19 must continue.
