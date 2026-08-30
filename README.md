# Vercel Queue Path Build Fix

The failed deployment error was:

`The pattern "api/queues/agent.js" defined in "functions" doesn't match any Serverless Functions inside the "api" directory.`

This fix moves the queue consumer to:

`api/queue-worker.js`

and updates the Vercel function trigger accordingly.

Upload/replace:
- api/queue-worker.js
- vercel.json
- package.json

No environment-variable, Supabase, DNS, or design changes are required.
The old `api/queues/agent.js` can remain in the repository; it is no longer referenced by `vercel.json`.
