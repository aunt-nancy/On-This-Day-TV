import { json, requireCron } from '../http.js';

export default async function handler(req, res) {
  if (!requireCron(req, res)) return;
  json(res, 200, {
    ok: true,
    status: 'manual_staged_runner_active',
    message: 'The newsroom currently uses staged Vercel requests from Admin to avoid serverless timeout/stale RUNNING failures.',
  });
}
