import { json, requireAdmin } from '../http.js';
import { select } from '../supabase.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await select('social_posts', 'select=*&order=created_at.desc&limit=200');
    json(res, 200, { ok: true, posts: rows });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
