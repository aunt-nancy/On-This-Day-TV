# On This Day — Illustrator HARD Activation Fix

The prior Illustrator was registered but still depended on the browser reaching its post-publish wave.
This build removes that weakness.

ACTIVATION PATH #1 — AUTOMATIC SERVER-SIDE
After Editor & Producer — Closing Desk completes, Vercel waitUntil() starts the Illustrator
in the background. Closing or refreshing the browser cannot stop this trigger.

ACTIVATION PATH #2 — MANUAL OVERRIDE
Admin now has a dedicated "Run Illustrator Now" button. It directly runs Illustrator against the
latest edition without rerunning the entire newsroom.

SELF-HEALING
If the 200-year or 75-year side story is missing, Illustrator performs the focused verified
side-era recovery itself, writes the recovered headline into the live edition, then generates art.

VISIBLE FAILURE
The Illustrator no longer silently skips when generation fails. If it activates but creates zero
usable images, its job becomes FAILED with the exact GPT-Image-2 or Supabase Storage error.

IMAGE API
- model: gpt-image-2
- endpoint: /v1/images/generations
- size: 1536x1024
- quality: low
- uses existing OTD_OPENAI_KEY

FILES TO REPLACE
- package.json
- admin.html
- index.html
- styles.css
- app.js
- lib/agents.js
- lib/prompts.js
- lib/queued-pipeline.js
- lib/imagegen.js
- lib/supabase-storage.js
- lib/routes/agents-run-stage.js

No DNS, API router, Supabase database schema, masthead, or locked layout changes.

AFTER VERCEL IS READY
You do not need a full new newsroom run just to test this.
Open Admin -> Refresh Status -> Run Illustrator Now.
The result will either generate the images or display the exact error that blocks generation.
