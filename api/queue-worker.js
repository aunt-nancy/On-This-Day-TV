import { QUEUE_TOPIC, nextStage, runQueuedStage } from '../../lib/queued-pipeline.js';
import { send, handleNodeCallback } from '../../lib/queue.js';

export default handleNodeCallback(
  async (message, metadata) => {
    const runId = message?.runId;
    const agentKey = message?.agentKey;

    if (!runId || !agentKey) {
      throw new Error('Queue message requires runId and agentKey.');
    }

    const result = await runQueuedStage(runId, agentKey);

    if (!result.continue) return;

    const next = nextStage(agentKey);
    if (!next) return;

    // Small pacing delay between model calls prevents OpenAI TPM spikes.
    const delaySeconds = ['major_press','black_press','regional_local','community_press'].includes(agentKey) ? 3 : 1;

    await send(
      QUEUE_TOPIC,
      { runId, agentKey: next },
      {
        idempotencyKey: `${runId}:${next}`,
        retentionSeconds: 86400,
        delaySeconds,
      }
    );
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (error, metadata) => {
      if (metadata.deliveryCount >= 4) return { acknowledge: true };
      const delay = Math.min(90, 10 * Math.pow(2, Math.max(0, metadata.deliveryCount - 1)));
      return { afterSeconds: delay };
    },
  }
);
