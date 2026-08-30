import { json, requireAdmin, requireMethod, readBody } from '../../lib/http.js';
import { createQueuedRun, QUEUE_TOPIC, STAGE_ORDER } from '../../lib/queued-pipeline.js';
import { send } from '../../lib/queue.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;

  const body = await readBody(req);

  try {
    const { run, context } = await createQueuedRun({ date: body.date, trigger: 'manual_queue' });
    const first = STAGE_ORDER[0];
    const queued = await send(
      QUEUE_TOPIC,
      { runId: run.id, agentKey: first },
      {
        idempotencyKey: `${run.id}:${first}`,
        retentionSeconds: 86400,
      }
    );

    json(res, 202, {
      ok: true,
      queued: true,
      runId: run.id,
      editionDate: context.editionDate,
      firstAgent: first,
      messageId: queued.messageId || null,
      architecture: 'durable_queue',
    });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
