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


## Graphics fill update
- Added decorative historical graphics to fill open visual areas across the site.
- Side and center landing papers now include visual art blocks.
- Added a homepage graphic showcase section.
- Added visual bands to all inner pages.
- Added reusable SVG artwork files:
  - art-press.svg
  - art-frontpage.svg
  - art-map.svg
  - art-voices.svg
  - art-archive.svg

## Center headline revision
- Removed the redundant second "ON THIS DAY" heading from the parchment news board.
- The center of the page now presents the day's major 100-year headline.
- The headline is followed by "Major American Press ↔ African American / Black Press."
- The 100-year comparison remains the dominant center tile immediately below.
- The headline can be populated programmatically with `window.OnThisDay.setMajorHeadline(...)`.


## Minimal illustration locked revision
- Horizontal masthead left untouched.
- Center 100-year tile left text-first and illustration-free.
- Removed the comparison subtitle beneath the center headline area.
- Supporting illustrations were reduced and placed only in side tiles and small page/card headers.
- Interior visual bands and showcase cards were scaled down so articles and source links remain dominant.
