# On This Day TV — Consolidated Automatic Rebuild RC2

RC2 corrects the public/private boundary from RC1.

## What stays unchanged
The approved public On This Day TV site design is preserved: the locked masthead, navigation, history board, 200/100/75-era layout, Real Sources strip, Community Press Voices grid, public inner-page design, colors, typography, and vintage newspaper visual system.

The frontend JavaScript only replaces placeholder editorial text with the verified automatic edition returned by the newsroom APIs. It does not redesign the site.

## What is rebuilt
The internal newsroom is a single automatic pipeline. Vercel Cron wakes `/api/cron/newsroom`; the system creates or resumes the daily run, advances the newsroom, retries failures automatically, publishes safe verified material, queues only genuine exceptions for approval, and continues downstream work after an approval/rejection without a manual Resume action.

## One-time deployment
1. Run `schema.sql` once in the existing On This Day TV Supabase project.
2. Deploy this complete folder/ZIP to the existing On This Day TV Vercel project, replacing the prior code package.
3. Keep the existing environment values and set/verify: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ADMIN_TOKEN`, and `CRON_SECRET`.
4. `CRON_SECRET` may be the same value previously used for `OTD_CRON_SECRET`.
5. Verify `/api/health`, then allow the automatic cron to advance the newsroom.
6. Use `/admin.html` only for approvals and operations visibility.

## Public site rule
Do not replace the public site with a new design during newsroom work. Public changes are limited to live verified content, date/year accuracy, and source links.


## AUTOMATIC SCHEDULER CONTRACT — RC4
- Vercel Cron is registered at `/api/cron/newsroom` every minute.
- Production MUST have an environment variable named exactly `CRON_SECRET`.
- `OTD_CRON_SECRET` alone does not count as scheduler-ready because Vercel does not use that variable name to populate its Authorization header.
- The newsroom admin must visibly report scheduler BLOCKED instead of showing a misleading healthy state when `CRON_SECRET` is absent.
- There are no normal manual Start/Resume/Run-All controls. The cron tick creates and advances the daily run automatically.
