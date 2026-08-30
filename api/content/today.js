import { json } from '../../lib/http.js';
import { select } from '../../lib/supabase.js';

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let editions = await select('editions', `select=*&edition_date=eq.${today}&status=eq.published&limit=1`);
    if (!editions.length) editions = await select('editions', 'select=*&status=eq.published&order=edition_date.desc&limit=1');
    if (!editions.length) return json(res, 200, { ok: true, edition: null });
    json(res, 200, { ok: true, edition: editions[0] });
  } catch (error) {
    json(res, 200, { ok: false, edition: null, error: error.message });
  }
}
