import { json } from '../http.js';
import { select } from '../supabase.js';
import { siteDateISO, SITE_TIME_ZONE } from '../site-date.js';

function text(value) {
  return String(value || '').trim();
}

function isBlack(story) {
  return story?.role === 'black_press' ||
    /black|african/i.test(String(story?.community || ''));
}

function storyPayload(story) {
  if (!story) return {};

  // Accept either a database story row (snake_case) or an already-published
  // edition payload story (camelCase). This is intentional: the edition
  // payload is authoritative fallback content and must never be erased just
  // because the duplicate relational row was not written or was delayed.
  return {
    eventKey: story.event_key ?? story.eventKey ?? '',
    sourceDesk: story.source_desk ?? story.sourceDesk ?? '',
    comparisonType: story.comparison_type ?? story.comparisonType ?? '',
    coverageScope: story.coverage_scope ?? story.coverageScope ?? '',
    nationalImportance: Number(story.national_importance ?? story.nationalImportance ?? 0),
    eraKey: story.era_key ?? story.eraKey ?? '',
    eraYear: story.era_year ?? story.eraYear ?? null,
    title: story.title || '',
    summary: story.summary || '',
    publication: story.publication || '',
    city: story.city || '',
    issueDate: story.issue_date ?? story.issueDate ?? null,
    page: story.page || '',
    archive: story.archive || '',
    sourceUrl: story.source_url ?? story.sourceUrl ?? '',
    community: story.community || '',
    confidence: Number(story.confidence || 0),
  };
}

function usable(story) {
  return Boolean(story && text(story.title) && text(story.sourceUrl ?? story.source_url));
}

function best(rows, eraKey, predicate = () => true) {
  return rows
    .filter(row =>
      row.era_key === eraKey &&
      text(row.title) &&
      text(row.source_url) &&
      predicate(row)
    )
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
}

function choose(dbStory, payloadStory) {
  if (dbStory) return storyPayload(dbStory);
  if (usable(payloadStory)) return storyPayload(payloadStory);
  return {};
}

function assemble(rows, edition) {
  const existing = edition?.payload || {};
  const existingStories = existing?.stories || {};

  const dbY200 = best(rows, 'y200');
  const dbY76 = best(rows, 'y76');
  const dbY100Black = best(rows, 'y100', isBlack);
  const dbY100Major = best(rows, 'y100', row => !isBlack(row));

  // DATABASE ROW FIRST; PUBLISHED PAYLOAD SECOND.
  // The old route returned storyPayload(null) => {} and thereby erased a
  // successfully recovered payload story. That was the blocker leaving the
  // generic side-card headline visible.
  const y200 = choose(dbY200, existingStories?.y200);
  const y76 = choose(dbY76, existingStories?.y76);
  const y100Black = choose(dbY100Black, existingStories?.y100?.black);
  const y100Major = choose(dbY100Major, existingStories?.y100?.major);

  const usedIds = new Set(
    [dbY200, dbY76, dbY100Black, dbY100Major]
      .filter(Boolean)
      .map(row => row.id)
  );

  const dbSecondary = rows
    .filter(row =>
      row.era_key === 'y100' &&
      !usedIds.has(row.id) &&
      text(row.title) &&
      text(row.source_url)
    )
    .slice(0, 6)
    .map(storyPayload);

  const secondary = dbSecondary.length
    ? dbSecondary
    : (Array.isArray(existingStories?.y100?.secondary)
        ? existingStories.y100.secondary.map(storyPayload).filter(usable)
        : []);

  const leadHeadline =
    edition.lead_headline ||
    y100Major.title ||
    y100Black.title ||
    y200.title ||
    y76.title ||
    existing.leadHeadline ||
    '';

  return {
    ...existing,
    editionDate: edition.edition_date,
    leadHeadline,
    years: edition.years || existing.years || {},
    stories: {
      ...existingStories,
      y200,
      y100: {
        ...(existingStories?.y100 || {}),
        major: y100Major,
        black: y100Black,
        secondary,
      },
      y76,
    },
    publicationStatus: 'published',

    // Diagnostic only; harmless to the public page and makes future debugging
    // immediate instead of guessing.
    sideStoryStatus: {
      y200: {
        available: Boolean(y200.title && y200.sourceUrl),
        source: dbY200 ? 'stories_table' : (usable(existingStories?.y200) ? 'edition_payload' : 'missing'),
      },
      y76: {
        available: Boolean(y76.title && y76.sourceUrl),
        source: dbY76 ? 'stories_table' : (usable(existingStories?.y76) ? 'edition_payload' : 'missing'),
      },
    },
  };
}

export default async function handler(req, res) {
  try {
    const today = siteDateISO();

    let editions = await select(
      'editions',
      `select=*&edition_date=eq.${today}&status=eq.published&order=updated_at.desc&limit=1`
    );

    if (!editions.length) {
      editions = await select(
        'editions',
        'select=*&status=eq.published&order=edition_date.desc,updated_at.desc&limit=1'
      );
    }

    if (!editions.length) {
      return json(res, 200, { ok: true, edition: null });
    }

    const edition = editions[0];

    const stories = await select(
      'stories',
      `select=*&edition_id=eq.${edition.id}&order=position.asc`
    ).catch(() => []);

    const payload = assemble(stories, edition);

    return json(res, 200, {
      ok: true,
      edition: { ...edition, payload },
      storyCount: stories.length,
      sideStoryStatus: payload.sideStoryStatus,
      siteDate: today,
      siteTimeZone: SITE_TIME_ZONE,
    });
  } catch (error) {
    return json(res, 200, {
      ok: false,
      edition: null,
      error: error.message,
    });
  }
}
