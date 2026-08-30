import { json } from '../../lib/http.js';
import { select } from '../../lib/supabase.js';

function isBlack(story) {
  return story?.role === 'black_press' || /black|african/i.test(String(story?.community || ''));
}

function storyPayload(story) {
  if (!story) return {};
  return {
    eventKey: story.event_key || '',
    eraKey: story.era_key || '',
    eraYear: story.era_year || null,
    title: story.title || '',
    summary: story.summary || '',
    publication: story.publication || '',
    city: story.city || '',
    issueDate: story.issue_date || null,
    page: story.page || '',
    archive: story.archive || '',
    sourceUrl: story.source_url || '',
    community: story.community || '',
    confidence: Number(story.confidence || 0),
  };
}

function best(rows, eraKey, predicate = () => true) {
  return rows
    .filter(row => row.era_key === eraKey && predicate(row))
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
}

function assemble(rows, edition) {
  const y200 = best(rows, 'y200');
  const y76 = best(rows, 'y76');
  const y100Black = best(rows, 'y100', isBlack);
  const y100Major = best(rows, 'y100', row => !isBlack(row));
  const used = new Set([y200, y76, y100Black, y100Major].filter(Boolean).map(x => x.id));
  const secondary = rows.filter(row => row.era_key === 'y100' && !used.has(row.id)).slice(0, 6).map(storyPayload);
  const leadHeadline =
    edition.lead_headline ||
    y100Major?.title ||
    y100Black?.title ||
    y200?.title ||
    y76?.title ||
    '';

  return {
    ...(edition.payload || {}),
    editionDate: edition.edition_date,
    leadHeadline,
    years: edition.years || {},
    stories: {
      y200: storyPayload(y200),
      y100: {
        major: storyPayload(y100Major),
        black: storyPayload(y100Black),
        secondary,
      },
      y76: storyPayload(y76),
    },
    publicationStatus: 'published',
  };
}

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let editions = await select('editions', `select=*&edition_date=eq.${today}&status=eq.published&limit=1`);
    if (!editions.length) editions = await select('editions', 'select=*&status=eq.published&order=edition_date.desc&limit=1');
    if (!editions.length) return json(res, 200, { ok: true, edition: null });

    const edition = editions[0];
    const stories = await select(
      'stories',
      `select=*&edition_id=eq.${edition.id}&order=position.asc`
    ).catch(() => []);

    const payload = assemble(stories, edition);
    json(res, 200, {
      ok: true,
      edition: { ...edition, payload },
      storyCount: stories.length,
    });
  } catch (error) {
    json(res, 200, { ok: false, edition: null, error: error.message });
  }
}
