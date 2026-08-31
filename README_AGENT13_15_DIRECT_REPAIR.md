# On This Day — Direct Repair for Agent #13 and Agent #15

The approved bounded-parallel/nonblocking runner is NOT changed.

AGENT #13 — THEN & NOW
Root defect:
- OpenAI had a timeout.
- Supabase REST reads/writes did not.
- A DB call could therefore leave the job RUNNING indefinitely even after the AI request ended.

Repair:
- every Supabase REST operation now has a hard 15-second timeout;
- the entire Then & Now task has a 65-second deadline;
- its OpenAI research request is capped at 40 seconds, one attempt, no JSON retry chain;
- if it cannot finish, Then & Now completes safely as skipped/show=false;
- status refresh automatically finalizes a stale Then & Now job after 90 seconds as COMPLETE/SKIPPED, not RUNNING and not an endless retry.

AGENT #15 — ILLUSTRATOR
Root defect shown in Admin:
Supabase returned HTTP 400 with a JSON payload containing:
- statusCode: 404
- code: NoSuchBucket
- message: Bucket not found

The old code only treated literal HTTP 404 as a missing bucket, so it threw before bucket creation.

Repair:
- correctly recognizes Supabase's 400 + NoSuchBucket response as "bucket missing";
- automatically creates the public `illustrations` bucket;
- handles already-exists responses idempotently;
- makes an existing private bucket public;
- all Storage requests have hard timeouts;
- Illustrator preflights Storage before spending image-generation time.

BUILD
2026-08-30.19agent-agent13-15-direct.1
