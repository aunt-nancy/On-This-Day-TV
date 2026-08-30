import { waitUntil } from '@vercel/functions';
import { json, requireAdmin, requireMethod, readBody } from '../http.js';
import { STAGE_ORDER, nextStage, runQueuedStage } from '../queued-pipeline.js';

function backgroundIllustrator(runId) {
  return runQueuedStage(runId, 'illustrator').catch(error => {
    console.error('[Illustrator background activation failed]', {
      runId,
      error: error?.message || String(error),
    });
  });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;

  const body = await readBody(req);
  const runId = body.runId;
  const agentKey = body.agentKey;

  if (!runId || !agentKey) {
    return json(res, 400, { ok: false, error: 'runId and agentKey are required' });
  }

  if (!STAGE_ORDER.includes(agentKey)) {
    return json(res, 400, { ok: false, error: `Unknown stage: ${agentKey}` });
  }

  try {
    const result = await runQueuedStage(runId, agentKey);
    const next = result.continue ? nextStage(agentKey) : null;

    let illustratorAutoScheduled = false;

    if (agentKey === 'editor_producer' && result.ok) {
      waitUntil(backgroundIllustrator(runId));
      illustratorAutoScheduled = true;
    }

    return json(res, 200, {
      ok: Boolean(result.ok),
      runId,
      agentKey,
      nextAgent: next,
      inProgress: Boolean(result.inProgress),
      jobId: result.jobId || null,
      continue: Boolean(result.continue),
      illustratorAutoScheduled,
      error: result.error || null,
      output: result.output || null,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      runId,
      agentKey,
      continue: false,
      error: error.message,
    });
  }
}
