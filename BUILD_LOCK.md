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
