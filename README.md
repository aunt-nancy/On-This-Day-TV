# On This Day — Staged Backend Sync

Your new admin.html is live, but its matching API routes are not all live.

The visible symptom is:
Unexpected token 'T' ... is not valid JSON

That means admin.html is calling an endpoint such as /api/admin/review,
but Vercel is returning a text/404 error page instead of JSON.

Upload this folder structure to the repository root and replace matching files.

Important:
- Preserve folders exactly: api/admin, api/agents, api/content, api/cron, api/social, lib.
- Do not flatten these files into the repository root.
- Replace package.json and vercel.json at the repository root.
- vercel.json in this package contains NO queue trigger and NO api/queues/agent.js reference.
- No environment-variable, Supabase, DNS, or design changes are required.

After Vercel is Ready:
1. Open /api/admin/review in the browser while authenticated through admin.html.
2. Refresh admin.html.
3. Needs Review should show either "No articles currently require human review"
   or actual review cards, not a JSON parsing error.
