import { json, requireCron } from '../../lib/http.js';
import { runAllAgents } from '../../lib/pipeline.js';

export default async function handler(req, res) {
  if (!requireCron(req, res)) return;
  try {
    const result = await runAllAgents({ trigger: 'vercel_cron' });
    json(res, 200, result);
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
