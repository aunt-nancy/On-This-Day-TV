export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function requireMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    json(res, 405, { ok: false, error: `Method ${req.method} not allowed` });
    return false;
  }
  return true;
}

export function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function requireAdmin(req, res) {
  const configured = process.env.OTD_ADMIN_TOKEN || process.env.ADMIN_TOKEN;
  if (!configured) {
    json(res, 503, { ok: false, error: 'ADMIN_TOKEN is not configured' });
    return false;
  }
  if (bearerToken(req) !== configured) {
    json(res, 401, { ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function requireCron(req, res) {
  // Vercel Cron uses the environment variable named exactly CRON_SECRET to
  // construct the Authorization header. Do not treat a differently named alias
  // as scheduler-ready: that produced the misleading all-READY newsroom state.
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    json(res, 503, { ok: false, error: 'CRON_SECRET is not configured. Vercel Cron cannot authenticate the automatic newsroom.' });
    return false;
  }
  if (bearerToken(req) !== configured) {
    json(res, 401, { ok: false, error: 'Unauthorized cron invocation' });
    return false;
  }
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { raw }; }
}
