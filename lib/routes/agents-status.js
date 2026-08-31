import { json, requireAdmin } from '../http.js';
import { select, update } from '../supabase.js';
import { environmentStatus } from '../config.js';
import {
  AGENTS,
  EXPECTED_AGENT_COUNT,
  AGENT_ROSTER_VERSION,
  assertAgentRoster,
} from '../agents.js';

function jobAgeMs(job) {
  const started = new Date(job?.started_at || 0).getTime();
  if (!Number.isFinite(started) || started <= 0) return Infinity;
  return Date.now() - started;
}

function staleLimitMs(agentKey) {
  if (agentKey === 'then_now') return 90 * 1000;
  if (agentKey === 'illustrator') return 3 * 60 * 1000;
  if (['black_press','major_press','regional_local','community_press','source_verification'].includes(agentKey)) {
    return 4 * 60 * 1000;
  }
  return 3 * 60 * 1000;
}

async function expireStaleRunningJobs(jobs = []) {
  const stale = jobs.filter(job =>
    job?.status === 'running' &&
    jobAgeMs(job) >= staleLimitMs(job.agent_key)
  );

  if (!stale.length) return [];

  await Promise.all(
    stale.map(async job => {
      const isThenNow = job.agent_key === 'then_now';

      const patch = isThenNow
        ? {
            status: 'complete',
            output: {
              agent: 'then_now',
              status: 'complete',
              show: false,
              skipped: true,
              reason: 'Then & Now exceeded its bounded execution lease and was safely skipped.',
              discrepancies: [],
              confidence: 0,
            },
            error: null,
            finished_at: new Date().toISOString(),
          }
        : {
            status: 'failed',
            error: `Auto-reset stale RUNNING job after ${Math.round(staleLimitMs(job.agent_key)/1000)} seconds.`,
            finished_at: new Date().toISOString(),
          };

      return update('agent_jobs', `id=eq.${job.id}`, patch).catch(() => null);
    })
  );

  return stale.map(job => ({
    id: job.id,
    run_id: job.run_id,
    agent_key: job.agent_key,
    age_ms: jobAgeMs(job),
    finalized_as: job.agent_key === 'then_now' ? 'complete_skipped' : 'failed',
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

    if (staleJobsReset.length) {
      jobs = await select('agent_jobs', 'select=*&order=created_at.desc&limit=500');
    }

    const latestRun = runs[0] || null;
    const latestJobs = latestRun ? jobs.filter(j => j.run_id === latestRun.id) : [];

    json(res, 200, {
      ok: true,
      architecture: '19agent_bounded_nonblocking_agent_leases',
      rosterVersion: AGENT_ROSTER_VERSION,
      roster,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
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
      architecture: '19agent_bounded_nonblocking_agent_leases',
      rosterVersion: AGENT_ROSTER_VERSION,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
      error: error.message,
    });
  }
}
