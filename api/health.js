import { json } from '../lib/http.js';
import { environmentStatus, AGENT_VERSION } from '../lib/config.js';
import { AGENTS } from '../lib/agents.js';

export default async function handler(req, res) {
  json(res, 200, {
    ok: true,
    service: 'On This Day Autonomous Newsroom',
    agentVersion: AGENT_VERSION,
    environment: environmentStatus(),
    agents: AGENTS,
    timestamp: new Date().toISOString(),
  });
}
