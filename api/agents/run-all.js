import { json, requireAdmin, requireMethod, readBody } from '../../lib/http.js';
import { runAllAgents } from '../../lib/pipeline.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  try {
    const result = await runAllAgents({ date: body.date, trigger: 'manual' });
    json(res, 200, result);
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
