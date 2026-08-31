# ON THIS DAY TV — RC1 BUILD LOCK

This file is the release-level source of truth for the consolidated automatic rebuild.
Later work must not silently reverse these rules.

## 1. Operating model — LOCKED

- Normal newsroom operation is automatic.
- The scheduled worker starts the daily Pacific-date edition automatically.
- Research, verification, context, translation triage, visual sourcing, rights review, discrepancy control, editing, publishing, feature preparation, social preparation, retry/recovery, and distribution handoff advance automatically.
- The only normal human workflow action is **Approve** or **Reject** on a genuine exception.
- There are no normal Start Run, Run All Agents, Resume, Reset, or Continue controls.
- A story-level hold excludes that specific source/story and does not freeze unrelated stories or other coverage of the same event.
- Edition-wide waiting is reserved for a genuine edition-wide exception.

## 2. Historical frame — LOCKED

The three public eras are:

- `y200` — 200 years ago
- `y100` — 100 years ago; dominant center desk
- `y75` — 75 years ago

Do not reintroduce the legacy `y76` compatibility name.

## 3. Editorial model — LOCKED

- Major American Press establishes the featured 100-year national event.
- Black Press and other Community Press coverage may be shown as a comparison only when it covers that same verified event.
- Different framing and emphasis are encouraged; unrelated events may not be combined into a synthetic comparison.
- If a community does not have verified same-event coverage, its strongest verified same-date headline may appear as a clearly labeled community lead instead.
- A missing search result is not evidence that a newspaper ignored an event.

## 4. Source discipline — LOCKED

- Published stories require a working source URL and identifiable source record.
- Prefer original issue scans and institutional archives.
- OCR is for discovery, not proof.
- Preserve publication, issue date, page when available, archive, language/community, article type, and verification notes.
- Never invent a newspaper, headline, page, archive, quotation, translation, or URL.
- Visuals must use the Visual Archive → Rights → Placement contract. Ordinary archive HTML pages may not be treated as image files.

## 5. Public design — LOCKED

Preserve the approved visual system:

- dark navy header/footer
- cream/parchment editorial background
- burgundy, gold, green, and navy accents
- serif newspaper typography
- sepia/archival imagery
- framed editorial cards and divider rules
- the existing horizontal historical-news masthead treatment

The `Real Sources / Multiple Perspectives / Context Across Time / Our Voices` strip is followed by **Community Press Voices**.
Do not restore the removed Regional Reporting / Local Reporting / “What America Wasn’t Seeing” four-card row in that position.

## 6. Community Press Voices — LOCKED

Community Press Voices is a first-class newsroom lane, not a decorative secondary feature.
The source system includes Black Press, Spanish-language/Latino press, Chinese American press, Japanese American press, Jewish American press, Indigenous/Native press, German American press, British American press, Irish American press, Italian American press, and additional communities when source records support them.

## 7. Architecture — LOCKED

One canonical path:

`Pacific date → opening assignment → major lead research → supporting press research → context/translation → independent verification → visual archive → rights review → discrepancy/approval gate → closing desk → edition → public site → features/social → distribution`

One database namespace: `otd_*`.
One scheduler route.
One run-state model.
One approval system.
One public-edition API contract.

Do not layer a second runner, reset mechanism, legacy table dependency, or alternate publishing path on top of RC1.

## 8. Success gate — LOCKED

A successful run is **not** “the agents ran.”

RC1 is successful when a scheduled run produces a real, sourced edition that is stored, served by the public content API, and rendered into the approved public site while requiring human action only for genuine approval items.
