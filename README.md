# Queue worker existing-folder fix

Vercel rejected the prior path because it could not find `api/queue-worker.js`.

This version places the queue consumer inside the existing API folder that Vercel already recognizes:

`api/agents/queue-worker.js`

Upload these exact files:
- `api/agents/queue-worker.js`
- `vercel.json`
- `package.json`

Important:
- In GitHub, open the existing `api` folder, then the existing `agents` folder, and upload `queue-worker.js` there.
- Do not upload `queue-worker.js` at the repository root.
- Replace `vercel.json` and `package.json` at the repository root.
- No Vercel variables, Supabase settings, keys, DNS, or design changes are needed.

The old `api/queues/agent.js` and root `api/queue-worker.js` may remain; the new configuration ignores them.
