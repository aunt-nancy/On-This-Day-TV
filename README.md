# On This Day — 75 Years Ago Correction

This closes the one remaining exception under previously approved item #5.

CHANGED
- Homepage: 76 Years Ago -> 75 Years Ago
- Homepage year offset: 76 -> 75
- Today page: 76 Years Ago -> 75 Years Ago
- Archive era filter: 76 Years Ago -> 75 Years Ago
- About page format description: 76 -> 75
- Backend edition-year calculation: third era now resolves to current year - 75

IMPORTANT COMPATIBILITY NOTE
The internal property name `y76` is intentionally NOT renamed. Existing published payloads,
database rows, rendering code, prompts, and API contracts already use that key. Renaming it
would create unnecessary migration risk. Only its meaning/value is changed to 75 years ago.

NOT CHANGED
- locked design
- masthead
- community layout
- national-headline/same-event editorial logic
- agent hierarchy
- rolling publication
- Supabase schema
- API routes
- Vercel/DNS settings
