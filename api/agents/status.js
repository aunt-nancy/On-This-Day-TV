import { json, requireAdmin } from '../../lib/http.js';
import { select } from '../../lib/supabase.js';
import { environmentStatus } from '../../lib/config.js';
import { AGENTS } from '../../lib/agents.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const [runs, jobs, discrepancies] = await Promise.all([
      select('agent_runs', 'select=*&order=started_at.desc&limit=20'),
      select('agent_jobs', 'select=*&order=started_at.desc&limit=100'),
      select('discrepancies', 'select=*&status=eq.open&order=created_at.desc&limit=100'),
    ]);
    json(res, 200, { ok: true, environment: environmentStatus(), agents: AGENTS, runs, jobs, discrepancies });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
