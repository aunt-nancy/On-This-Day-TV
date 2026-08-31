import { json, requireAdmin } from '../http.js';
import { select, update } from '../supabase.js';
import { environmentStatus } from '../config.js';
import {
  AGENTS,
  EXPECTED_AGENT_COUNT,
  AGENT_ROSTER_VERSION,
  assertAgentRoster,
} from '../agents.js';

const STALE_RUNNING_MS = 4 * 60 * 1000;

function jobAgeMs(job) {
  const started = new Date(job?.started_at || 0).getTime();
  if (!Number.isFinite(started) || started <= 0) return Infinity;
  return Date.now() - started;
}

async function expireStaleRunningJobs(jobs = []) {
  const stale = jobs.filter(job =>
    job?.status === 'running' &&
    jobAgeMs(job) >= STALE_RUNNING_MS
  );

  if (!stale.length) return [];

  await Promise.all(
    stale.map(job =>
      update('agent_jobs', `id=eq.${job.id}`, {
        status: 'failed',
        error: 'Auto-reset stale RUNNING job after 4 minutes. The prior function/request is no longer considered active.',
        finished_at: new Date().toISOString(),
      }).catch(() => null)
    )
  );

  return stale.map(job => ({
    id: job.id,
    run_id: job.run_id,
    agent_key: job.agent_key,
    age_ms: jobAgeMs(job),
  }));
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const roster = assertAgentRoster();

    let [runs, jobs, discrepancies] = await Promise.all([
      select('agent_runs', 'select=*&order=started_at.desc&limit=20'),
      select('agent_jobs', 'select=*&order=created_at.desc&limit=500'),
      select('discrepancies', 'select=*&status=eq.open&order=created_at.desc&limit=100'),
    ]);

    const staleJobsReset = await expireStaleRunningJobs(jobs);

    // Re-read jobs after reset so Admin immediately sees FAILED instead of
    // another refresh still showing the stale RUNNING row.
    if (staleJobsReset.length) {
      jobs = await select('agent_jobs', 'select=*&order=created_at.desc&limit=500');
    }

    const latestRun = runs[0] || null;
    const latestJobs = latestRun ? jobs.filter(j => j.run_id === latestRun.id) : [];

    json(res, 200, {
      ok: true,
      architecture: '19agent_bounded_nonblocking_stale_reset',
      rosterVersion: AGENT_ROSTER_VERSION,
      roster,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
      staleRunningThresholdSeconds: STALE_RUNNING_MS / 1000,
      staleJobsReset,
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
      architecture: '19agent_bounded_nonblocking_stale_reset',
      rosterVersion: AGENT_ROSTER_VERSION,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
      error: error.message,
    });
  }
}
