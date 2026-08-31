import health from '../lib/routes/health.js';
import agentsRunAll from '../lib/routes/agents-run-all.js';
import agentsRunStage from '../lib/routes/agents-run-stage.js';
import agentsStatus from '../lib/routes/agents-status.js';
import adminReview from '../lib/routes/admin-review.js';
import adminPublishing from '../lib/routes/admin-publishing.js';
import adminDiscrepancies from '../lib/routes/admin-discrepancies.js';
import adminResetRun from '../lib/routes/admin-reset-run.js';
import contentToday from '../lib/routes/content-today.js';
import socialQueue from '../lib/routes/social-queue.js';
import cronDaily from '../lib/routes/cron-daily.js';

const ROUTES = {
  'health': health,
  'agents/run-all': agentsRunAll,
  'agents/run-stage': agentsRunStage,
  'agents/status': agentsStatus,
  'admin/review': adminReview,
  'admin/publishing': adminPublishing,
  'admin/discrepancies': adminDiscrepancies,
  'admin/reset-run': adminResetRun,
  'content/today': contentToday,
  'social/queue': socialQueue,
  'cron/daily': cronDaily,
};

export default async function handler(req, res) {
  res.setHeader('X-OTD-Build', '2026-08-30.19agent-thennow-bounded.1');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'https://www.onthisday.tv');
  const route = String(req.query?.route || url.searchParams.get('route') || '')
    .replace(/^\/+|\/+$/g, '');

  const target = ROUTES[route];

  if (!target) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      ok: false,
      error: `Unknown API route: ${route || '(missing)'}`,
    }));
  }

  return target(req, res);
}
