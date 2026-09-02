# Working Publication Checkpoint — 2026-09-01

Working public-routing baseline: `c673a90f5dd6c8aec7ceb0a5fe4edc96265f1ecd` (`Route public today endpoint to authoritative OTD handler`).

This checkpoint records the state at which the authoritative Supabase edition successfully reached the public site.

Locked constraints at this checkpoint:
- Preserve the public-facing design.
- Era structure remains 200 / 100 / 75 years ago.
- America/Los_Angeles controls the edition date.
- The 19-agent workflow remains automatic and completed outputs are preserved.
- `api/content/today.js` must remain a thin forwarder to `lib/routes/content-today.js`; do not restore the legacy `editions` / `stories` endpoint or `y76` logic.
- Real exact-date source evidence is required; no fabricated placeholders may publish.
- One unresolved item must not block unrelated verified publication.

Editorial direction beginning after this checkpoint:
- Community Press Voices revolves around the 100-year headline.
- 200 years ago is treated as archival historical distance: looking back into a substantially different America and explaining the deeper past.
- 75 years ago is treated as living-memory history: reexamined with awareness that some people who lived through the era, or their close contemporaries and families, are still alive today.
