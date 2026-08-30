import { json, requireAdmin } from '../http.js';
import { select } from '../supabase.js';
import { environmentStatus } from '../config.js';
import {
  AGENTS,
  EXPECTED_AGENT_COUNT,
  AGENT_ROSTER_VERSION,
  assertAgentRoster,
} from '../agents.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const roster = assertAgentRoster();

    const [runs, jobs, discrepancies] = await Promise.all([
      select('agent_runs', 'select=*&order=started_at.desc&limit=20'),
      select('agent_jobs', 'select=*&order=created_at.desc&limit=500'),
      select('discrepancies', 'select=*&status=eq.open&order=created_at.desc&limit=100'),
    ]);

    const latestRun = runs[0] || null;
    const latestJobs = latestRun ? jobs.filter(j => j.run_id === latestRun.id) : [];

    json(res, 200, {
      ok: true,
      architecture: 'roster19_enforced_single_router',
      rosterVersion: AGENT_ROSTER_VERSION,
      roster,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
      environment: environmentStatus(),
      agents: AGENTS,
      runs,
      jobs,
      latestRun,
      latestJobs,
      discrepancies,
    });
  } catch (error) {
    json(res, 500, {
      ok: false,
      architecture: 'roster19_enforced_single_router',
      rosterVersion: AGENT_ROSTER_VERSION,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
      error: error.message,
    });
  }
}
