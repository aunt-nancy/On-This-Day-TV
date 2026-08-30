import { json, requireAdmin, requireMethod, readBody } from '../http.js';
import { createQueuedRun, STAGE_ORDER } from '../queued-pipeline.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;

  const body = await readBody(req);
  try {
    const { run, context } = await createQueuedRun({
      date: body.date,
      trigger: 'manual_staged',
    });

    json(res, 201, {
      ok: true,
      runId: run.id,
      editionDate: context.editionDate,
      firstAgent: STAGE_ORDER[0],
      stages: STAGE_ORDER,
      architecture: 'rolling_publish_parallel_waves',
    });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
