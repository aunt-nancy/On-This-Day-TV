import { json, requireAdmin } from '../http.js';
import { select } from '../supabase.js';
import { environmentStatus } from '../config.js';
import { AGENTS } from '../agents.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const [runs, jobs, discrepancies] = await Promise.all([
      select('agent_runs', 'select=*&order=started_at.desc&limit=20'),
      select('agent_jobs', 'select=*&order=started_at.desc&limit=200'),
      select('discrepancies', 'select=*&status=eq.open&order=created_at.desc&limit=100'),
    ]);

    const latestRun = runs[0] || null;
    const latestJobs = latestRun ? jobs.filter(j => j.run_id === latestRun.id) : [];

    json(res, 200, {
      architecture: 'rolling_publish_parallel_waves',
      ok: true,
      environment: environmentStatus(),
      agents: AGENTS,
      runs,
      jobs,
      latestRun,
      latestJobs,
      discrepancies,
    });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
