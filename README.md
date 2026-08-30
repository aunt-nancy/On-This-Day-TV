# On This Day — Agent Priority Reorganization

This reorganization keeps 16 agent roles but changes the hierarchy:

PRIORITY RANK
1. Editor & Producer — Opening Desk
2. African American / Black Press Research
3. Major American Press Research
4. Source Verification
5. Discrepancy & Exception
6. Regional & Local Press
7. Community Press Voices
8. Historical Context
9. Rights & Reuse
10. Historical Translation
11. Visual Archive
12. Editor & Producer — Closing Desk
13. Social Editor
14. Short-Form Video
15. Engagement & Trends
16. Social Distribution

EFFICIENCY CHANGES
- Date calculation is now an internal preflight, not a separate agent slot.
- Editor Opening assigns scope before research begins.
- Black Press is searched before Major Press because it is a defining feature of the product.
- Research is capped and follows the editor's assignment plan.
- Translation uses no model call when there are no non-English candidates.
- Visual Archive runs only after Source Verification, so it searches for visuals tied to verified stories instead of broad discovery.
- Editor Closing receives the original assignment agenda and publishes verified safe stories.
- Resumable Admin behavior is preserved.

EXECUTION ORDER
Editor Opening → Black Press → Major Press → Regional → Community → Context →
conditional Translation → Source Verification → Visual Archive → Rights →
Discrepancy → Editor Closing/Publish → Social Editor → Video → Trends → Distribution.

Priority rank is NOT the same as execution order. High-priority verification still waits until its required research exists.

UPLOAD/REPLACE
- lib/agents.js
- lib/prompts.js
- lib/queued-pipeline.js
- admin.html

No Supabase schema, Vercel environment, DNS, or public-page design changes are required.

Because the stage keys changed (Date Agent removed; Editor Opening added), start a NEW run after deployment rather than resuming an older run.
