# On This Day — 200/75 Major Headline + 14pt Community Body Fix

CHANGES

1. Community Press Voices body text is now exactly 14pt.
2. The Major American Press research desk must identify a strong lead headline for:
   - 200 years ago
   - 100 years ago
   - 75 years ago (internal compatibility key remains y76)
3. Source Verification must verify and rank the strongest lead in each era.
4. The 200-year and 75-year side tiles now use an importance-weighted lead selector instead of simply taking the highest-confidence story.
5. Routine local/society items are down-ranked when a more consequential verified headline exists.

LOCKED / NOT CHANGED
- public layout
- masthead
- card sizes/positions
- 100-year same-event community comparison logic
- Community Press fallback logic
- 75 Years Ago display
- Supabase schema
- API routes
- Vercel environment
- DNS

REPLACE ONLY
- styles.css
- lib/prompts.js
- lib/queued-pipeline.js

A NEW RUN is required before the 200-year and 75-year tiles can receive newly researched lead headlines.
