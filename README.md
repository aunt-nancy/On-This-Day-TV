# ON THIS DAY TV — CONSOLIDATED AUTOMATIC REBUILD RC1

**Build ID:** `2026-08-31.consolidated-automatic-rc1`

This is a clean rebuild, not another patch to the old 16/19-agent chain.

## Locked operating rule

Normal daily operation is automatic:

`Pacific date → opening desk → major-press lead discovery → community/regional research → context/translation → source verification → archival visuals → rights review → discrepancy gate → safe edition publication → optional features → social/video package → distribution queue`

The public edition does **not** wait for an unrelated disputed item. A genuine exception is placed in `otd_approvals`. The admin page contains Approve/Reject actions only; there are no normal Start/Resume/Run-All controls. After an approval, the Closing Desk and all downstream stages are automatically re-queued.

## Clean database boundary

This build deliberately uses new tables prefixed `otd_` so it does not depend on, overwrite, or inherit foreign-key assumptions from the experimental legacy newsroom tables:

- `otd_runs`
- `otd_agent_jobs`
- `otd_sources`
- `otd_approvals`
- `otd_editions`
- `otd_stories`
- `otd_social_queue`

The old tables can remain in Supabase while RC1 is tested. They are not read by this build.

## One-time deployment setup

1. Run `schema.sql` in the existing Supabase project.
2. Deploy this whole folder to the On This Day Vercel project.
3. Confirm these Vercel environment variables:
   - `OTD_OPENAI_KEY` (or `OPENAI_API_KEY`)
   - `SUPABASE_URL` — project root URL, with or without `/rest/v1`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OTD_ADMIN_TOKEN` (or `ADMIN_TOKEN`)
   - `CRON_SECRET` (recommended: same value already used for `OTD_CRON_SECRET`)
   - optional `PUBLIC_SITE_URL`
4. Keep `CRON_SECRET` available to Vercel Cron. The cron calls `/api/cron/newsroom` every 2 minutes; the worker is idempotent and starts only one `daily` run per Pacific calendar date.
5. Open `/api/health`. It should report `ready: true`, 19 agents, and the RC1 build ID.
6. Open `/admin.html`. Enter the admin token. It is an operations/approvals view—not a runner.

## Models

Defaults use current GPT-5.6 API model IDs:

- research/high-volume desks: `gpt-5.6-luna`
- verification/control: `gpt-5.6-terra`
- opening/closing editor: `gpt-5.6-terra`

Override with `OTD_RESEARCH_MODEL`, `OTD_VERIFY_MODEL`, or `OTD_EDITOR_MODEL` without code changes.

## Source discipline

The research prompts include the expanded source hierarchy: Library of Congress/Chronicling America, American Antiquarian Society, Howard/Moorland-Spingarn and Black Press Archives, Schomburg, Hoji Shinbun, Recovering the U.S. Hispanic Literary Heritage, university/state newspaper digitization programs, and newspaper historical backfiles. The code requires a source URL for any story that reaches the public edition and records verified source metadata in `otd_sources`.

OCR is discovery, not proof. A failed search is recorded as “not found in the issues searched,” not as proof that an event was ignored.

## Visual design

The approved homepage structure, navy/cream/burgundy/gold/green palette, serif newspaper typography, 200/100/75-year eras, and Community Press Voices placement are preserved. The prior Regional/Local/“What America Wasn’t Seeing” four-card row is not reintroduced below the source strip.

The Illustrator/Visual Placement role no longer generates files into a fragile storage bucket. It chooses rights-cleared archival assets already identified by the Visual Archive + Rights desks. If no safe asset exists, the locked design keeps its static treatment.

## Social distribution

The Social Editor prepares platform-native material for YouTube, Facebook, Instagram, TikTok, X, and Threads. All items are stored in `otd_social_queue`. If `SOCIAL_WEBHOOK_URL` is configured, the distribution stage sends the package there automatically. Without an authorized platform adapter/webhook, the content remains automatically prepared and queued rather than blocking the newsroom.

## Local verification

Run:

```bash
npm run check
npm test
```

RC1 is considered successful only when a scheduled run produces a sourced `otd_editions` record that `/api/content/today` serves into the approved homepage. Agent status alone is not the success criterion.
