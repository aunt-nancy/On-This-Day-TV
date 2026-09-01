# ON THIS DAY TV — RC6 BACKEND / NEWSROOM ONLY

PURPOSE
- Preserves the existing locked public website design.
- Replaces only API, automatic scheduler, newsroom engine, agent execution, approval logic, and admin newsroom page.
- Contains NO public homepage, public CSS, public content pages, or public artwork.

DO NOT DELETE OR REPLACE existing public files such as:
- index.html
- styles.css
- app.js
- today.html
- archive.html
- community.html
- regional.html
- sources.html
- about.html
- existing public images/artwork

DEPLOYMENT ORDER AFTER A DESIGN REGRESSION
1. Revert the GitHub commit that overwrote the public site with the RC6 flat-root package (or otherwise restore the last known-good public-site commit).
2. Confirm the public design is back.
3. Upload the contents of THIS package to the repository root, preserving api/, lib/, and test/ directories.
4. Do not rerun Supabase SQL.
5. Confirm admin.html shows Build RC6 and the public design remains unchanged.

AUTOMATIC OPERATION
The newsroom remains automatic. Only approval decisions are manual.
