# On This Day — Editorial Homepage Refinement

FRONT-END ONLY

Replace:
- index.html
- styles.css
- app.js

This package does NOT change:
- agents
- OpenAI code
- rolling publishing engine
- API routes
- Supabase
- Vercel environment variables
- DNS/domain configuration
- admin.html
- the locked masthead HTML/CSS

WHAT CHANGED
- Removed the oversized AI-generated lead headline from the visible homepage.
- The public page now leads with the edition date and the actual verified story cards.
- 100-year comparison remains the dominant center desk.
- Major American Press and Black Press each receive a clean editorial column.
- No illustration is used in the center tile.
- Generic side-tile placeholder illustrations are removed.
- Story summaries, publication, issue date, archive/page metadata, and direct original-source links are rendered when available.
- Missing/unverified stories are hidden instead of displaying generic placeholder language.
- Long headlines automatically receive smaller typography instead of taking over the page.
- Up to four verified secondary 100-year headlines appear below the featured comparison.
- If only one center comparison story is available, it expands cleanly rather than leaving an empty fake card.
- If a side era has no verified story, that entire side card disappears and the layout rebalances.

IMPORTANT
The current backend still uses its stabilization-era key y76. This frontend reads the year from the published payload rather than hard-coding the visible year. No 75/76 backend change is included in this visual package.
