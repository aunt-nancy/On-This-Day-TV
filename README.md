# On This Day — Locked Landing Build

This package restores the approved landing-page structure:
1. Black masthead: ON THIS DAY / HISTORY AS IT HAPPENED
2. Current date + TODAY IN HISTORY + sepia newspaper-reader image
3. Parchment ON THIS DAY three-era board
   - 200 Years Ago: short left box
   - 100 Years Ago: large center box, Major American Press ↔ Black Press
   - 76 Years Ago: short right box
4. Real Sources strip
5. Community Press Voices immediately below
6. No “TV” in the public-facing masthead or page title.

All files are flat at repository root to simplify manual GitHub upload.
Upload/overwrite all files in the repository root. Vercel will redeploy automatically after the GitHub commit.

## Width rebalance
- Side era tiles widened substantially.
- 100-year center remains dominant but no longer consumes ~60% of the board.
- Desktop ratio is approximately 27% / 46% / 27%.

## Community Press ranking rule
- African American / Black Press is permanently fixed as the center comparison tile.
- It always compares the day's major American headline with Black press coverage.
- British American and German American press are now standing community categories.
- All non-Black community tiles are ranked by a weighted combination of:
  - population significance (55%)
  - relevance/strength of that day's historical headline (45%)
- Agent workflows can update `data-headline-weight` daily.
- Black Press never moves from the center.
