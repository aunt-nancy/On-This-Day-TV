# ON THIS DAY TV — CONSOLIDATED AUTOMATIC REBUILD — BUILD LOCK

## Public site — LOCKED
- The existing On This Day TV public-facing design is preserved.
- Do not redesign the homepage, public inner pages, typography, color scheme, layout system, navigation, or Community Press Voices presentation as part of newsroom engineering.
- The public CSS and page structure come from the approved locked public-site generation. Backend data may replace placeholder copy with verified live edition content without changing the visual design.
- The three eras are 200, 100, and 75 years ago.
- Community Press Voices remains directly below the Real Sources / Multiple Perspectives / Context Across Time / Our Voices strip.

## Newsroom — REBUILT
- Normal newsroom operation is automatic.
- Human intervention is limited to genuine approval decisions and emergency administration.
- No normal Start New Run, Run All Agents, Resume Current Run, or agent-babysitting workflow.
- A scheduled worker automatically creates, advances, retries, publishes, and distributes the daily edition.
- One held or rejected story must not block unrelated verified stories.
- Approved/rejected items automatically reflow through downstream publication; no manual resume is required.
- One run state, one scheduler, one retry system, one approval queue, one publishing path.

## Data contract
- Canonical path: date -> research candidates -> verified sources -> approval exceptions -> edited edition -> public site -> social/video outputs.
- Canonical era keys: y200, y100, y75. Do not reintroduce the legacy y76 data key.
- Published stories must retain a real source URL and source metadata.
- OCR/translation may aid discovery; publication claims must come from verified source evidence.


## AUTOMATIC SCHEDULER CONTRACT — RC4
- Vercel Cron is registered at `/api/cron/newsroom` every minute.
- Production MUST have an environment variable named exactly `CRON_SECRET`.
- `OTD_CRON_SECRET` alone does not count as scheduler-ready because Vercel does not use that variable name to populate its Authorization header.
- The newsroom admin must visibly report scheduler BLOCKED instead of showing a misleading healthy state when `CRON_SECRET` is absent.
- There are no normal manual Start/Resume/Run-All controls. The cron tick creates and advances the daily run automatically.

- **Major Press split-era reliability is locked:** the y100 lead is researched first; y200 and y75 run as bounded side-era subdesks; the results merge automatically into Major American Press. Do not restore one oversized three-era web-search call.


## Verification execution lock
Source Verification must remain bounded and resumable. Do not collapse all source candidates back into one long web-search call. Hidden verification batch jobs are implementation details and must not inflate the visible 19-agent completion count.

## HEALTH + TIMEOUT CONTRACT — RC7
- The physical `api/health.js` entrypoint must remain a thin forwarder to the canonical health route. Vercel may serve the physical file before applying a rewrite.
- Explicit per-stage OpenAI timeouts are authoritative, including the 60-second Major Press subdesk budget and 55-second Source Verification batch budget.
- The longer archival-search default applies only when a search-backed stage does not provide its own timeout.
- Deployed physical API entrypoints are limited to the canonical router and its required thin forwarders. Retired queue workers, manual run controls, and parallel legacy status/publishing APIs must not return.
