import { json, requireAdmin, requireMethod, readBody } from '../../lib/http.js';
import { select, update } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      const rows = await select('discrepancies', 'select=*&status=eq.open&order=created_at.desc');
      return json(res, 200, { ok: true, discrepancies: rows });
    }
    if (!requireMethod(req, res, ['PATCH'])) return;
    const body = await readBody(req);
    if (!body.id || !body.status) return json(res, 400, { ok: false, error: 'id and status are required' });
    const rows = await update('discrepancies', `id=eq.${body.id}`, {
      status: body.status,
      human_resolution: body.humanResolution || '',
      resolved_at: new Date().toISOString(),
    });
    json(res, 200, { ok: true, discrepancy: rows[0] || null });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
