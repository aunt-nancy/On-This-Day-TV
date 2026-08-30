# Turn On All Agents — Exact Setup

The code includes 16 active newsroom and social agents. They are not merely mockups: Vercel functions call the OpenAI Responses API, use web search, store results in Supabase, publish automatically when verification passes, and hold only unresolved discrepancies for human review.

## 1. Upload this entire build to the GitHub repository root
Commit all files, including the `api`, `lib`, and `supabase` folders plus `package.json` and `vercel.json`. Vercel redeploys automatically.

## 2. Run the Supabase schema once
Open Supabase → SQL Editor → New query. Paste the complete contents of `supabase/schema.sql` and select Run.

## 3. Add Vercel environment variables
Project → Settings → Environment Variables. Add all Production variables:
- OPENAI_API_KEY
- OPENAI_MODEL = gpt-5.6-luna
- OPENAI_VERIFY_MODEL = gpt-5.6-terra
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ADMIN_TOKEN (create a long random value)
- CRON_SECRET (create a different long random value)
- PUBLIC_SITE_URL = https://www.onthisday.tv

Redeploy after saving variables.

## 4. Verify the agents
Open `/api/health`. `environment.ready` must be true.
Open `/admin.html`, enter ADMIN_TOKEN, and select Run All Agents.

## 5. Automatic daily run
`vercel.json` registers `/api/cron/daily` at 08:00 UTC daily. On the Hobby plan, the exact minute can vary within the hour. The function can run for up to 5 minutes with Fluid Compute.

## 6. Social agents
Social Editor, Short-Form Video, Distribution, and Engagement/Trends agents are active. Without platform credentials, they generate and queue finished platform-native posts with status `waiting_credentials`. Add a `SOCIAL_WEBHOOK_URL` for one-step delivery to an approved social scheduler, or add each platform credential after API approvals.

## Locked editorial behavior
- African American / Black Press is always the central 100-year comparison.
- British and German community press remain represented.
- Surrounding community tiles are ranked by population significance and/or the headline of the day.
- The horizontal masthead is not changed.
- No illustration is inserted into the center tile.
- Human intervention occurs only for unresolved discrepancies.
