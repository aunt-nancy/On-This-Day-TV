import { json, requireAdmin, requireMethod, readBody } from '../../lib/http.js';
import { insert, select, update } from '../../lib/supabase.js';

function storyFromVerified(story, editionId, position = 999) {
  return {
    edition_id: editionId,
    era_key: story.eraKey || '',
    era_year: story.eraYear || null,
    event_key: story.eventKey || '',
    role: /black|african/i.test(String(story.community || '')) ? 'black_press' : 'story',
    community: story.community || '',
    title: story.title || '',
    summary: story.summary || '',
    publication: story.publication || '',
    city: story.city || '',
    issue_date: story.issueDate || null,
    page: story.page || '',
    archive: story.archive || '',
    source_url: story.sourceUrl || '',
    language: story.language || '',
    article_type: story.articleType || '',
    confidence: Number(story.confidence || 0),
    verification_notes: story.verificationNotes || '',
    position,
  };
}

function identifiers(discrepancy) {
  const evidence = discrepancy?.evidence || {};
  return {
    eventKey: evidence.eventKey || evidence.event_key || '',
    sourceUrl: evidence.sourceUrl || evidence.source_url || '',
  };
}

async function verifiedStoryFor(discrepancy) {
  const jobs = await select(
    'agent_jobs',
    `select=*&run_id=eq.${discrepancy.run_id}&agent_key=eq.source_verification&status=eq.complete&order=finished_at.desc&limit=1`
  );
  const stories = jobs[0]?.output?.verifiedStories || [];
  const ids = identifiers(discrepancy);

  if (ids.eventKey) {
    const match = stories.find(story => story.eventKey === ids.eventKey);
    if (match) return match;
  }
  if (ids.sourceUrl) {
    const match = stories.find(story => story.sourceUrl === ids.sourceUrl);
    if (match) return match;
  }
  return null;
}

async function refreshEditionStatus(editionId) {
  if (!editionId) return;
  const [blocking, stories] = await Promise.all([
    select(
      'discrepancies',
      `select=id&edition_id=eq.${editionId}&severity=eq.blocking&status=eq.open`
    ).catch(() => []),
    select('stories', `select=id&edition_id=eq.${editionId}`).catch(() => []),
  ]);

  if (stories.length) {
    await update('editions', `id=eq.${editionId}`, {
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else if (!blocking.length) {
    await update('editions', `id=eq.${editionId}`, {
      status: 'draft',
      updated_at: new Date().toISOString(),
    });
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const discrepancies = await select(
        'discrepancies',
        'select=*&status=eq.open&order=created_at.desc'
      );
      return json(res, 200, { ok: true, discrepancies });
    }

    if (!requireMethod(req, res, ['PATCH'])) return;
    const body = await readBody(req);

    if (!body.id || !['approve','reject'].includes(body.action)) {
      return json(res, 400, {
        ok: false,
        error: 'id and action (approve|reject) are required',
      });
    }

    const rows = await select('discrepancies', `select=*&id=eq.${body.id}&limit=1`);
    const discrepancy = rows[0];
    if (!discrepancy) {
      return json(res, 404, { ok: false, error: 'Discrepancy not found' });
    }

    let publishedStory = null;

    if (body.action === 'approve') {
      const story = await verifiedStoryFor(discrepancy);

      if (story && discrepancy.edition_id) {
        const ids = identifiers(discrepancy);
        const existingQuery = ids.eventKey
          ? `select=id&edition_id=eq.${discrepancy.edition_id}&event_key=eq.${encodeURIComponent(ids.eventKey)}&limit=1`
          : ids.sourceUrl
            ? `select=id&edition_id=eq.${discrepancy.edition_id}&source_url=eq.${encodeURIComponent(ids.sourceUrl)}&limit=1`
            : '';

        const existing = existingQuery
          ? await select('stories', existingQuery).catch(() => [])
          : [];

        if (!existing.length) {
          const editable = {
            ...story,
            title: body.title || story.title,
            summary: body.summary || story.summary,
          };
          const inserted = await insert(
            'stories',
            storyFromVerified(editable, discrepancy.edition_id),
          );
          publishedStory = inserted[0] || null;
        }
      }

      await update('discrepancies', `id=eq.${body.id}`, {
        status: 'resolved',
        human_resolution: body.note || 'Approved by administrator for publication.',
        resolved_at: new Date().toISOString(),
      });
    } else {
      await update('discrepancies', `id=eq.${body.id}`, {
        status: 'dismissed',
        human_resolution: body.note || 'Rejected by administrator; story held from publication.',
        resolved_at: new Date().toISOString(),
      });
    }

    await refreshEditionStatus(discrepancy.edition_id);

    json(res, 200, {
      ok: true,
      action: body.action,
      publishedStory,
      message: body.action === 'approve'
        ? 'Approved. The verified story is now eligible to appear publicly.'
        : 'Rejected. The disputed story remains off the public site.',
    });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
