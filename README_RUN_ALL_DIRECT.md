# On This Day — Direct Run All Repair

ROOT CAUSE
Admin still contained a duplicate browser-side roster gate:

    runButton.disabled = !rosterOK

That line ran on every status refresh. Therefore a failed/stale prior job or
an imperfect status/preflight response could keep Run All disabled even though
/api/agents/run-all itself was healthy and already performs the authoritative
19-agent validation.

FIX
- Removed every status-driven disable of Run All.
- Removed the browser preflight from the Run All click path.
- Run All now performs one direct POST to /api/agents/run-all.
- The server remains the sole authority for:
  - admin authentication
  - environment readiness
  - 19-agent roster validation
  - 19-stage validation
  - creation/superseding of runs
- The button is disabled only during the short create-run HTTP request.
- It is ALWAYS re-enabled in `finally`.
- The newsroom pipeline continues fire-and-forget after the run is created.
- If the server refuses the run, Admin displays the exact server error.
- A failed #2 from an older run cannot disable Run All.

NO OTHER CHANGES
- 19 agents remain intact.
- bounded-parallel/nonblocking runner remains intact.
- no public design files are included.
- no editorial features are removed or changed.

BUILD
2026-08-30.19agent-runall-direct.1
