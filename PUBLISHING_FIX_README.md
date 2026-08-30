# On This Day — Partial Publishing Fix

Root cause fixed:
- The old code marked the ENTIRE edition `needs_human` whenever any blocking discrepancy existed.
- `/api/content/today` serves only `published` editions.
- Therefore one disputed story could prevent every verified article from appearing.

New rule:
- Only explicitly disputed stories are held.
- Verified, undisputed stories publish immediately.
- Edition-level human review is used only for genuine edition-wide problems.
- Editor model failure cannot erase verified work: a deterministic fallback edition publishes verified safe stories.
- `/api/content/today` now reconstructs the homepage from the safe persisted `stories` rows.
- `/api/admin/publishing` shows exactly how many articles are stored and whether the public site is serving them.
- Admin Newsroom includes a Publishing Status panel.

No environment-variable changes.
No Supabase schema changes.
No domain changes.
