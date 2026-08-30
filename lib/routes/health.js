import { json } from '../http.js';
import { environmentStatus, AGENT_VERSION } from '../config.js';
import {
  AGENTS,
  EXPECTED_AGENT_COUNT,
  AGENT_ROSTER_VERSION,
  assertAgentRoster,
} from '../agents.js';

export default async function handler(req, res) {
  try {
    const roster = assertAgentRoster();

    json(res, 200, {
      ok: true,
      service: 'On This Day Autonomous Newsroom',
      agentVersion: AGENT_VERSION,
      rosterVersion: AGENT_ROSTER_VERSION,
      roster,
      environment: environmentStatus(),
      agents: AGENTS,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    json(res, 500, {
      ok: false,
      service: 'On This Day Autonomous Newsroom',
      rosterVersion: AGENT_ROSTER_VERSION,
      expectedAgentCount: EXPECTED_AGENT_COUNT,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
