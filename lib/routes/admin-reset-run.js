import { json, requireAdmin, requireMethod } from '../http.js';
import { select, update } from '../supabase.js';

function now() {
  return new Date().toISOString();
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const runs = await select(
      'agent_runs',
      'select=*&order=started_at.desc&limit=1'
    ).catch(() => []);

    const run = runs[0] || null;

    if (!run?.id) {
      return json(res, 200, {
        ok: true,
        reset: false,
        message: 'No current newsroom run exists.',
      });
    }

    // Stop every unfinished job in the latest run, regardless of how old it is.
    // Two updates are used for compatibility with existing PostgREST helpers.
    await update('agent_jobs', `run_id=eq.${run.id}&status=eq.running`, {
      status: 'failed',
      error: 'Force-reset by Admin. Previous browser/function state was abandoned.',
      finished_at: now(),
    }).catch(() => {});

    await update('agent_jobs', `run_id=eq.${run.id}&status=eq.queued`, {
      status: 'failed',
      error: 'Force-reset by Admin before execution.',
      finished_at: now(),
    }).catch(() => {});

    if (run.status === 'running') {
      await update('agent_runs', `id=eq.${run.id}`, {
        status: 'failed',
        error: 'Force-reset by Admin to clear a stuck newsroom run.',
        finished_at: now(),
      }).catch(() => {});
    }

    return json(res, 200, {
      ok: true,
      reset: true,
      runId: run.id,
      message: 'Current run and all unfinished jobs were force-reset.',
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message,
    });
  }
}
