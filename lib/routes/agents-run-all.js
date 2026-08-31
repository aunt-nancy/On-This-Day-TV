import { json, requireAdmin, requireMethod, readBody } from '../http.js';
import { createQueuedRun, STAGE_ORDER } from '../queued-pipeline.js';
import {
  AGENTS,
  EXPECTED_AGENT_COUNT,
  AGENT_ROSTER_VERSION,
  assertAgentRoster,
} from '../agents.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;

  const body = await readBody(req);

  try {
    const roster = assertAgentRoster();

    if (STAGE_ORDER.length !== EXPECTED_AGENT_COUNT) {
      throw new Error(
        `Stage-order mismatch: expected ${EXPECTED_AGENT_COUNT}, loaded ${STAGE_ORDER.length}.`
      );
    }

    const stageKeys = new Set(STAGE_ORDER);
    const agentKeys = new Set(AGENTS.map(agent => agent.key));
    const missingStages = [...agentKeys].filter(key => !stageKeys.has(key));
    const extraStages = [...stageKeys].filter(key => !agentKeys.has(key));

    if (missingStages.length || extraStages.length) {
      throw new Error(
        `Roster/stage mismatch. Missing stages: ${missingStages.join(', ') || 'none'}; extra stages: ${extraStages.join(', ') || 'none'}.`
      );
    }

    const { run, context } = await createQueuedRun({
      date: body.date,
      trigger: 'manual_roster19',
    });

    json(res, 201, {
      ok: true,
      runId: run.id,
      editionDate: context.editionDate,
      firstAgent: STAGE_ORDER[0],
      stages: STAGE_ORDER,
      agentCount: AGENTS.length,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      rosterVersion: AGENT_ROSTER_VERSION,
      roster,
      architecture: 'roster19_enforced_single_router',
    });
  } catch (error) {
    json(res, 500, {
      ok: false,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      actualAgentCount: AGENTS.length,
      rosterVersion: AGENT_ROSTER_VERSION,
      error: error.message,
    });
  }
}
