# On This Day — Side Headline Serving Fix

REQUESTED VISUAL CHANGE
Removed from the Black Press community box:
- Major American Press — Lead headline and framing
- Black Press — Headline, framing, context, and emphasis

EXACT SIDE-HEADLINE BLOCKER
The backend could recover and save y200/y76 in `editions.payload.stories`, but
`/api/content/today` rebuilt the public story object only from the separate
`stories` table.

When the duplicate y200/y76 relational row was missing or delayed, the route did:

    storyPayload(null) -> {}

and overwrote the already-valid edition payload story.

Then app.js received an empty side story and returned from `bindPaper()` without
changing the static card. That is why the visitor kept seeing the generic
"Today's verified lead headline" copy.

FIX
- /api/content/today now prefers a verified stories-table row when present.
- If the row is absent, it preserves the already-published edition payload story.
- A story must have both title and source URL before it is shown.
- API now reports sideStoryStatus for y200 and y76 so future failures are immediately diagnosable.
- Static generic side headline is replaced by "Headline pending verification" only when no verified source exists.
- The actual verified headline replaces it automatically as soon as either storage path contains the story.

NOT CHANGED
- 19 agents
- locked bounded-parallel/nonblocking runner
- Then & Now bounded fix
- national/same-event logic
- 75-year calculation
- masthead/layout/styles

BUILD
2026-08-30.19agent-side-headline-serving.1
