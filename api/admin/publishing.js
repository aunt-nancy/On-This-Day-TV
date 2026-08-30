import { json, requireAdmin } from '../../lib/http.js';
import { select } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const editions = await select('editions', 'select=*&order=updated_at.desc&limit=10');
    const latest = editions[0] || null;
    const stories = latest
      ? await select('stories', `select=*&edition_id=eq.${latest.id}&order=position.asc`)
      : [];
    const discrepancies = latest
      ? await select('discrepancies', `select=*&edition_id=eq.${latest.id}&status=eq.open&order=created_at.desc`)
      : [];

    json(res, 200, {
      ok: true,
      latestEdition: latest,
      publishedStoryCount: stories.length,
      stories,
      openDiscrepancies: discrepancies,
      publicEndpointWillServe: Boolean(latest?.status === 'published' && stories.length),
    });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
