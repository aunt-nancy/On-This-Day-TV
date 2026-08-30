import { AGENTS, computeEditionDate } from './agents.js';
import { assertCoreEnvironment } from './config.js';
import { runModel } from './openai.js';
import { insert, upsert, update, select, remove } from './supabase.js';
import {
  editorOpeningPrompt, researchPrompt, contextPrompt, translationPrompt, verificationPrompt,
  sideEraRecoveryPrompt, visualArchivePrompt, rightsPrompt, discrepancyPrompt, editorPrompt, thenNowPrompt, archiveRecipePrompt, socialPrompt, trendsPrompt,
} from './prompts.js';
import { dispatchPosts } from './social.js';
import { generateHistoricalIllustration } from './imagegen.js';
import { uploadPublicImage } from './supabase-storage.js';

export const QUEUE_TOPIC = 'otd-agent-work';

export const STAGE_ORDER = [
  'editor_opening',
  'black_press',
  'major_press',
  'regional_local',
  'community_press',
  'historical_context',
  'translation',
  'source_verification',
  'rights_review',
  'discrepancy_exception',
  'editor_producer',
  'then_now',
  'archive_recipe',
  'visual_archive',
  'illustrator',
  'social_editor',
  'short_form_video',
  'engagement_trends',
  'social_distribution',
];

const RESEARCH_KEYS = ['black_press','major_press','regional_local','community_press'];
const NONFATAL_KEYS = new Set([
  'editor_opening',
  ...RESEARCH_KEYS,
  'visual_archive',
  'illustrator',
  'historical_context',
  'translation',
  'social_editor',
  'short_form_video',
  'engagement_trends',
  'social_distribution',
]);

function now() { return new Date().toISOString(); }

function confidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function nextStage(agentKey) {
  const i = STAGE_ORDER.indexOf(agentKey);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

async function modelJson(prompt, options = {}) {
  try {
    const result = await runModel({ ...prompt, ...options });
    return { ...result.json, _openaiResponseId: result.responseId };
  } catch (error) {
    const message = String(error?.message || '');
    const malformed = Boolean(error?.rawText) ||
      /json|syntax|expected|unterminated|property value|array element/i.test(message);

    if (!malformed) throw error;

    const compactPrompt = {
      ...prompt,
      instructions: `${prompt.instructions}
FORMAT RECOVERY:
Return VALID JSON ONLY.
No markdown.
No literal line breaks inside JSON string values.
If this is research, return no more than 3 candidates.
Keep each summary under 45 words.
Omit any candidate that cannot be represented safely.`,
    };

    try {
      const compact = await runModel({
        ...compactPrompt,
        ...options,
        reasoning: 'low',
        maxOutputTokens: Math.min(Number(options.maxOutputTokens || 2200), 1600),
      });
      return { ...compact.json, _openaiResponseId: compact.responseId, _jsonRecovered: true };
    } catch (compactError) {
      const raw = String(error?.rawText || '').slice(0, 12000);
      if (!raw) throw compactError;

      const repair = await runModel({
        instructions: `Repair the supplied malformed JSON into valid JSON.
Do not add facts.
Do not research.
Preserve only content already present.
If a broken candidate cannot be repaired safely, omit it.
Return JSON only.`,
        input: raw,
        model: options.model,
        webSearch: false,
        reasoning: 'low',
        maxOutputTokens: 1400,
      });

      return {
        ...repair.json,
        _openaiResponseId: repair.responseId,
        _jsonRecovered: true,
        _jsonRepairMode: 'syntax_only',
      };
    }
  }
}

async function queuedJob(runId, agentKey) {
  const rows = await select(
    'agent_jobs',
    `select=*&run_id=eq.${runId}&agent_key=eq.${agentKey}&status=eq.queued&order=created_at.asc&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

async function createJob(runId, agentKey) {
  const waiting = await queuedJob(runId, agentKey);

  if (waiting?.id) {
    const rows = await update('agent_jobs', `id=eq.${waiting.id}`, {
      status: 'running',
      started_at: now(),
      error: null,
      finished_at: null,
    });
    return rows[0] || { ...waiting, status: 'running', started_at: now() };
  }

  const [job] = await insert('agent_jobs', {
    run_id: runId,
    agent_key: agentKey,
    status: 'running',
    started_at: now(),
  });
  return job;
}

async function finishJob(job, output, status = 'complete', error = null) {
  await update('agent_jobs', `id=eq.${job.id}`, {
    status,
    output,
    confidence: confidence(output?.confidence),
    discrepancy_count: Array.isArray(output?.discrepancies) ? output.discrepancies.length : 0,
    error,
    finished_at: now(),
  });
  return output;
}

async function completedOutput(runId, agentKey) {
  const rows = await select(
    'agent_jobs',
    `select=*&run_id=eq.${runId}&agent_key=eq.${agentKey}&status=eq.complete&order=finished_at.desc&limit=1`
  ).catch(() => []);
  return rows[0]?.output || null;
}

async function latestRunningJob(runId, agentKey) {
  const rows = await select(
    'agent_jobs',
    `select=*&run_id=eq.${runId}&agent_key=eq.${agentKey}&status=eq.running&order=started_at.desc&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

async function clearStaleRunningJob(runId, agentKey) {
  const running = await latestRunningJob(runId, agentKey);
  if (!running) return null;

  const ageMs = Date.now() - new Date(running.started_at || 0).getTime();
  const staleAfterMs = 150000; // 2.5 minutes; AI HTTP requests hard-stop earlier.

  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < staleAfterMs) {
    return running;
  }

  await update('agent_jobs', `id=eq.${running.id}`, {
    status: 'failed',
    error: 'Stale running job cleared automatically by the parallel newsroom engine.',
    finished_at: now(),
  }).catch(() => {});

  return null;
}

async function failedJobs(runId) {
  return select(
    'agent_jobs',
    `select=agent_key,error,output&run_id=eq.${runId}&status=eq.failed&order=started_at.desc`
  ).catch(() => []);
}

async function researchOutputs(runId) {
  const outputs = [];
  for (const key of RESEARCH_KEYS) {
    const output = await completedOutput(runId, key);
    if (output) outputs.push(output);
  }
  return outputs;
}

function flattenResearch(outputs) {
  return outputs.flatMap(output => output?.candidates || []);
}

function chooseVisuals(output) {
  return (output?.candidates || []).slice(0, 8);
}

function explicitBlockers(discrepancy = {}) {
  const blocking = Array.isArray(discrepancy.blocking) ? discrepancy.blocking : [];
  return {
    editionBlocked: blocking.some(item => String(item?.scope || '').toLowerCase() === 'edition'),
    eventKeys: new Set(blocking.map(item => item?.eventKey).filter(Boolean)),
    sourceUrls: new Set(blocking.map(item => item?.sourceUrl).filter(Boolean)),
  };
}

function safeVerifiedStories(verified = {}, discrepancy = {}) {
  const stories = Array.isArray(verified.verifiedStories) ? verified.verifiedStories : [];
  const blockers = explicitBlockers(discrepancy);
  if (blockers.editionBlocked) return [];
  return stories.filter(story => {
    if (story?.eventKey && blockers.eventKeys.has(story.eventKey)) return false;
    if (story?.sourceUrl && blockers.sourceUrls.has(story.sourceUrl)) return false;
    return true;
  });
}

function verificationOnlyGate(verified = {}) {
  const blocking = [];
  const nonBlocking = [];

  for (const raw of (verified.discrepancies || [])) {
    const item = raw || {};
    const scope = String(item.scope || '').toLowerCase();
    const eventKey = item.eventKey || item.event_key || '';
    const sourceUrl = item.sourceUrl || item.source_url || '';

    if (scope === 'edition') {
      blocking.push({ ...item, scope: 'edition' });
    } else if (eventKey || sourceUrl) {
      blocking.push({ ...item, scope: 'story', eventKey, sourceUrl });
    } else {
      nonBlocking.push(item);
    }
  }

  return {
    blocking,
    nonBlocking,
    humanReviewRequired: blocking.length > 0,
    publishable: true,
  };
}

function storyIdentity(story = {}) {
  return String(story.sourceUrl || story.eventKey || `${story.eraKey || ''}|${story.publication || ''}|${story.title || ''}`);
}

function mergeVerified(base = {}, supplement = {}) {
  const map = new Map();
  for (const story of [...(base.verifiedStories || []), ...(supplement.verifiedStories || [])]) {
    const key = storyIdentity(story);
    const existing = map.get(key);
    if (!existing || Number(story.confidence || 0) > Number(existing.confidence || 0)) {
      map.set(key, story);
    }
  }

  return {
    ...base,
    verifiedStories: [...map.values()],
    rejectedCandidates: [...(base.rejectedCandidates || []), ...(supplement.rejectedCandidates || [])],
    discrepancies: [...(base.discrepancies || []), ...(supplement.discrepancies || [])],
    confidence: Math.max(Number(base.confidence || 0), Number(supplement.confidence || 0)),
  };
}

function chooseEraStory(stories, eraKey, predicate = () => true) {
  return stories
    .filter(story => story?.eraKey === eraKey && predicate(story))
    .sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))[0] || null;
}

function sideEraLeadScore(story = {}) {
  const desk = String(story.sourceDesk || '').toLowerCase();
  const scope = String(story.coverageScope || '').toLowerCase();
  const national = Number(story.nationalImportance || 0);
  const conf = Number(story.confidence || 0);

  let score = 0;
  if (desk === 'major_press') score += 35;
  if (scope === 'national') score += 30;
  else if (scope === 'multi_state') score += 20;
  else if (scope === 'regional') score += 8;

  score += Math.max(0, Math.min(1, national)) * 35;
  score += Math.max(0, Math.min(1, conf)) * 10;

  // De-prioritize routine local/society material when better leads exist.
  const combined = `${story.title || ''} ${story.summary || ''} ${story.articleType || ''}`.toLowerCase();
  if (/marriage|wedding|society|social notice|routine municipal|local meeting|minor business/.test(combined)) {
    score -= 25;
  }

  return score;
}

function chooseSideEraMajorLead(stories = [], eraKey) {
  const candidates = stories
    .filter(story => story?.eraKey === eraKey)
    .sort((a,b) => sideEraLeadScore(b) - sideEraLeadScore(a));

  return candidates[0] || null;
}


function publicStory(story) {
  if (!story) return {};
  return {
    eventKey: story.eventKey || '',
    sourceDesk: story.sourceDesk || '',
    comparisonType: story.comparisonType || '',
    coverageScope: story.coverageScope || '',
    nationalImportance: confidence(story.nationalImportance),
    eraKey: story.eraKey || '',
    eraYear: story.eraYear || null,
    title: story.title || '',
    summary: story.summary || '',
    publication: story.publication || '',
    city: story.city || '',
    issueDate: story.issueDate || null,
    page: story.page || '',
    archive: story.archive || '',
    sourceUrl: story.sourceUrl || '',
    community: story.community || '',
    confidence: confidence(story.confidence),
  };
}

function sourceDesk(story = {}) {
  return String(story.sourceDesk || '').toLowerCase();
}
function isBlackVoice(story = {}) {
  return sourceDesk(story) === 'black_press' ||
    /black|african/i.test(String(story.community || ''));
}
function isCommunityVoice(story = {}) {
  const desk = sourceDesk(story);
  if (desk === 'black_press' || desk === 'community_press') return true;
  const community = String(story.community || '').toLowerCase();
  return /black|african|latino|spanish|hispanic|german|british|anglo|irish|chinese|italian|jewish|yiddish|japanese|indigenous|native|tribal|caribbean|filipino|south asian|armenian|greek|polish/.test(community);
}
function isMajorPress(story = {}) {
  const desk = sourceDesk(story);
  if (desk === 'major_press') return true;
  if (desk === 'black_press' || desk === 'community_press') return false;
  return /major|mainstream|national/i.test(String(story.community || ''));
}
function importance(story = {}) {
  const value = Number(story.nationalImportance ?? story.nationalImportanceScore ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
function distinctVoiceCount(stories = []) {
  const keys = new Set();
  for (const story of stories) {
    if (!isCommunityVoice(story)) continue;
    const key = String(story.community || story.sourceDesk || story.publication || '').toLowerCase().trim();
    if (key) keys.add(key);
  }
  return keys.size;
}
function chooseNationalLeadCluster(stories = []) {
  const y100 = stories.filter(story => story?.eraKey === 'y100' && story?.eventKey);
  const groups = new Map();
  for (const story of y100) {
    const key = String(story.eventKey);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(story);
  }

  const candidates = [];
  for (const [eventKey, cluster] of groups.entries()) {
    const majors = cluster.filter(isMajorPress).sort((a,b) => {
      const importanceDiff = importance(b) - importance(a);
      if (importanceDiff) return importanceDiff;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    });
    if (!majors.length) continue;

    const major = majors[0];
    const nationalScore = importance(major);
    const scope = String(major.coverageScope || '').toLowerCase();
    if (nationalScore < 0.60 && !['national','multi_state'].includes(scope)) continue;

    const voices = cluster.filter(isCommunityVoice);
    const voiceCount = distinctVoiceCount(voices);
    const scopeBonus = scope === 'national' ? 18 : scope === 'multi_state' ? 10 : 0;
    const score = (nationalScore * 100) + scopeBonus + (Math.min(voiceCount,5) * 12) +
      (Number(major.confidence || 0) * 10);

    candidates.push({eventKey,cluster,major,voices,voiceCount,score});
  }

  if (!candidates.length) return null;
  const withVoices = candidates.filter(item => item.voiceCount > 0);
  const pool = withVoices.length ? withVoices : candidates;
  return pool.sort((a,b) => b.score - a.score)[0];
}

function deterministicEdition(context, safeStories, discrepancy = {}) {
  const y200 = chooseSideEraMajorLead(safeStories, 'y200');
  const y76 = chooseSideEraMajorLead(safeStories, 'y76');
  const leadCluster = chooseNationalLeadCluster(safeStories);
  const leadEventKey = leadCluster?.eventKey || '';
  const y100Major = leadCluster?.major || null;

  const matchedVoices = leadCluster
    ? leadCluster.cluster
        .filter(story => isCommunityVoice(story) && String(story.eventKey) === leadEventKey)
        .sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    : [];

  const y100Black = matchedVoices.find(isBlackVoice) || null;

  function communityIdentity(story = {}) {
    const community = String(story.community || '').toLowerCase().trim();
    if (isBlackVoice(story)) return 'black';
    if (/latino|spanish|hispanic/.test(community)) return 'latino';
    if (/german/.test(community)) return 'german';
    if (/british|anglo/.test(community)) return 'british';
    if (/chinese/.test(community)) return 'chinese';
    if (/japanese/.test(community)) return 'japanese';
    if (/irish/.test(community)) return 'irish';
    if (/italian/.test(community)) return 'italian';
    if (/jewish|yiddish/.test(community)) return 'jewish';
    if (/indigenous|native|tribal/.test(community)) return 'indigenous';
    if (/caribbean|filipino|south asian|armenian|greek|polish/.test(community)) return 'more';
    return community || '';
  }

  const communityGroups = new Map();
  for (const story of safeStories.filter(story => story?.eraKey === 'y100' && isCommunityVoice(story))) {
    const key = communityIdentity(story);
    if (!key) continue;
    if (!communityGroups.has(key)) communityGroups.set(key, []);
    communityGroups.get(key).push(story);
  }

  const communityTiles = [];
  for (const [key, group] of communityGroups.entries()) {
    const sameEvent = group
      .filter(story => leadEventKey && String(story.eventKey || '') === leadEventKey)
      .sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0));

    const chosen = sameEvent[0] || [...group]
      .sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];

    if (!chosen) continue;

    communityTiles.push(publicStory({
      ...chosen,
      comparisonType: sameEvent.length ? 'same_event' : 'community_lead',
    }));
  }

  const usedUrls = new Set(
    [y100Major, y100Black, ...communityTiles]
      .filter(Boolean)
      .map(story => story.sourceUrl)
      .filter(Boolean)
  );

  // Different-event y100 stories can be retained as secondary/archive content.
  // They are never presented as a lens on the lead.
  const secondary = safeStories
    .filter(story =>
      story?.eraKey === 'y100' &&
      String(story.eventKey || '') !== leadEventKey &&
      !usedUrls.has(story.sourceUrl)
    )
    .slice(0,6)
    .map(publicStory);

  return {
    editionDate: context.editionDate,
    leadHeadline: y100Major?.title || y200?.title || y76?.title || '',
    leadEventKey,
    years: context.years,
    stories: {
      y200: publicStory(y200),
      y100: {
        major: publicStory(y100Major),
        black: publicStory(y100Black),
        secondary,
      },
      y76: publicStory(y76),
    },
    communityTiles,
    visuals: [],
    sourceSummary: safeStories.slice(0,20).map(story => ({
      publication: story.publication || '',
      archive: story.archive || '',
      sourceUrl: story.sourceUrl || '',
      eventKey: story.eventKey || '',
    })),
    publishedStoryKeys: safeStories.map(story => story.eventKey || story.sourceUrl).filter(Boolean),
    heldForReview: Array.isArray(discrepancy.blocking) ? discrepancy.blocking : [],
    publicationStatus: y100Major || y200 || y76 ? 'published' : 'needs_human',
  };
}

async function contextForRun(runId) {
  const rows = await select('agent_runs', `select=*&id=eq.${runId}&limit=1`);
  if (!rows.length) throw new Error(`Run ${runId} not found`);
  return { run: rows[0], context: computeEditionDate(rows[0].edition_date) };
}

export async function createQueuedRun({ date, trigger = 'manual' } = {}) {
  assertCoreEnvironment();
  const context = computeEditionDate(date);

  // Close stale prior runs for the same date so the admin page never confuses them with live work.
  const stale = await select(
    'agent_runs',
    `select=id&edition_date=eq.${context.editionDate}&status=eq.running`
  ).catch(() => []);
  for (const old of stale) {
    await update('agent_runs', `id=eq.${old.id}`, {
      status: 'failed',
      error: 'Superseded by a new national-headline same-event newsroom run.',
      finished_at: now(),
    }).catch(() => {});
    await update('agent_jobs', `run_id=eq.${old.id}&status=eq.running`, {
      status: 'failed',
      error: 'Superseded by a new national-headline same-event newsroom run.',
      finished_at: now(),
    }).catch(() => {});
  }

  const [run] = await insert('agent_runs', {
    edition_date: context.editionDate,
    status: 'running',
    trigger,
    agent_version: '2026-08-30.agent17-final-stable19.1',
    years: context.years,
    started_at: now(),
  });

  await insert(
    'agent_jobs',
    AGENTS.map(agent => ({
      run_id: run.id,
      agent_key: agent.key,
      status: 'queued',
      input: { editionDate: context.editionDate, precreated: true },
    })),
    { returning: false }
  );

  return { run, context };
}

async function persistEditionCore(run, context, editionOutput, verified, discrepancy) {
  const safeStories = safeVerifiedStories(verified, discrepancy);
  const blockers = explicitBlockers(discrepancy);
  const generatedEdition = editionOutput?.edition || {};
  const fallback = deterministicEdition(context, safeStories, discrepancy);

  // The editor may improve the presentation, but publishing is determined by
  // verified safe stories, not by whether any unrelated discrepancy exists.
  const edition = {
    ...fallback,
    ...generatedEdition,
    editionDate: context.editionDate,
    years: context.years,
    stories: generatedEdition?.stories || fallback.stories,
    publishedStoryKeys: generatedEdition?.publishedStoryKeys?.length
      ? generatedEdition.publishedStoryKeys
      : fallback.publishedStoryKeys,
    heldForReview: Array.isArray(discrepancy?.blocking) ? discrepancy.blocking : [],
  };

  const hasSafeStories = safeStories.length > 0;
  const status = hasSafeStories && !blockers.editionBlocked ? 'published' : 'needs_human';
  edition.publicationStatus = status;

  const [savedEdition] = await upsert('editions', {
    edition_date: context.editionDate,
    status,
    lead_headline: edition.leadHeadline || fallback.leadHeadline || '',
    years: context.years,
    payload: edition,
    source_summary: edition.sourceSummary || fallback.sourceSummary || [],
    published_at: status === 'published' ? now() : null,
    run_id: run.id,
    updated_at: now(),
  }, 'edition_date');

  await remove('stories', `edition_id=eq.${savedEdition.id}`).catch(() => {});
  await remove('discrepancies', `edition_id=eq.${savedEdition.id}`).catch(() => {});

  const storyRows = safeStories.map((story, index) => ({
    edition_id: savedEdition.id,
    era_key: story.eraKey,
    era_year: story.eraYear,
    event_key: story.eventKey,
    role: story.community === 'black_press' || /black|african/i.test(story.community || '') ? 'black_press' : 'story',
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
    confidence: confidence(story.confidence),
    verification_notes: story.verificationNotes || '',
    position: index,
  }));
  if (storyRows.length) await insert('stories', storyRows, { returning: false });

  const discrepancyRows = [
    ...(discrepancy?.blocking || []).map(x => ({ ...x, severity: 'blocking' })),
    ...(discrepancy?.nonBlocking || []).map(x => ({ ...x, severity: 'non_blocking' })),
  ].map(item => ({
    run_id: run.id,
    edition_id: savedEdition.id,
    discrepancy_type: item.type || 'unspecified',
    severity: item.severity,
    description: item.description || JSON.stringify(item),
    evidence: item.evidence || item,
    status: 'open',
  }));
  if (discrepancyRows.length) await insert('discrepancies', discrepancyRows, { returning: false });

  return { savedEdition, safeStories, edition };
}


async function latestEditionForDate(editionDate) {
  const rows = await select(
    'editions',
    `select=*&edition_date=eq.${encodeURIComponent(editionDate)}&order=updated_at.desc&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

async function ensureSideStoryForIllustrator(runId, context, editionRow, eraKey, verifyModel) {
  const payload = editionRow?.payload || {};
  const existing = payload?.stories?.[eraKey];

  if (existing?.title && existing?.sourceUrl) {
    return { story: existing, recovered: false };
  }

  const recovery = await modelJson(
    sideEraRecoveryPrompt(context, eraKey),
    { model: verifyModel, webSearch: true, reasoning: 'medium', maxOutputTokens: 2200 }
  );

  const story = recovery?.verifiedStory;
  if (!story?.title || !story?.sourceUrl) {
    const detail = (recovery?.discrepancies || [])
      .map(item => item?.description || JSON.stringify(item))
      .filter(Boolean)
      .join('; ');
    throw new Error(
      `${eraKey === 'y200' ? '200-year' : '75-year'} headline recovery returned no verified source${detail ? `: ${detail}` : ''}`
    );
  }

  const nextPayload = {
    ...payload,
    years: context.years,
    stories: {
      ...(payload.stories || {}),
      [eraKey]: publicStory(story),
    },
  };

  await update('editions', `id=eq.${editionRow.id}`, {
    years: context.years,
    payload: nextPayload,
    updated_at: now(),
  });

  const duplicate = await select(
    'stories',
    `select=id&edition_id=eq.${editionRow.id}&era_key=eq.${eraKey}&source_url=eq.${encodeURIComponent(story.sourceUrl)}&limit=1`
  ).catch(() => []);

  if (!duplicate.length) {
    await insert('stories', {
      edition_id: editionRow.id,
      era_key: story.eraKey || eraKey,
      era_year: story.eraYear || context.years?.[eraKey] || null,
      event_key: story.eventKey || '',
      role: 'story',
      community: story.community || 'major_press',
      title: story.title || '',
      summary: story.summary || '',
      publication: story.publication || '',
      city: story.city || '',
      issue_date: story.issueDate || null,
      page: story.page || '',
      archive: story.archive || '',
      source_url: story.sourceUrl || '',
      language: story.language || 'English',
      article_type: story.articleType || 'news',
      confidence: confidence(story.confidence),
      verification_notes: story.verificationNotes || 'Recovered for side-era lead and illustration.',
      position: eraKey === 'y200' ? 0 : 999,
    }, { returning: false });
  }

  return { story: publicStory(story), recovered: true };
}

async function persistIllustrations(editionRow, illustrations) {
  const current = await latestEditionForDate(editionRow.edition_date) || editionRow;
  const payload = current?.payload || {};

  await update('editions', `id=eq.${current.id}`, {
    payload: {
      ...payload,
      illustrations: {
        ...(payload.illustrations || {}),
        ...illustrations,
      },
    },
    updated_at: now(),
  });
}


function verificationCandidateScore(story = {}) {
  let score = Number(story.confidence || 0) * 10;
  score += Number(story.nationalImportance || 0) * 12;

  if (story.eraKey === 'y100' && story.sourceDesk === 'major_press') score += 30;
  if (story.eraKey === 'y100' && story.sourceDesk === 'black_press') score += 24;
  if (story.eraKey === 'y200') score += 18;
  if (story.eraKey === 'y76') score += 18;
  if (story.sourceDesk === 'community_press') score += 12;
  if (story.sourceDesk === 'regional_local') score += 8;

  return score;
}

function verificationWorkset(research = []) {
  const sorted = [...research]
    .filter(story => story?.title && story?.sourceUrl)
    .sort((a,b) => verificationCandidateScore(b) - verificationCandidateScore(a));

  const selected = [];
  const seen = new Set();

  function add(story) {
    if (!story) return;
    const key = story.sourceUrl || `${story.eraKey}|${story.publication}|${story.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(story);
  }

  // Guarantee side-era representation when research produced it.
  add(sorted.find(story => story.eraKey === 'y200'));
  add(sorted.find(story => story.eraKey === 'y76'));

  // Guarantee the core 100-year comparison candidates.
  sorted.filter(story => story.eraKey === 'y100' && story.sourceDesk === 'major_press').slice(0,3).forEach(add);
  sorted.filter(story => story.eraKey === 'y100' && story.sourceDesk === 'black_press').slice(0,3).forEach(add);
  sorted.filter(story => story.eraKey === 'y100' && story.sourceDesk === 'community_press').slice(0,4).forEach(add);

  // Fill remaining capacity with strongest candidates.
  sorted.forEach(story => {
    if (selected.length < 14) add(story);
  });

  return selected.slice(0,14);
}

function mergeVerificationOutputs(outputs = []) {
  const verified = new Map();
  const rejected = [];
  const discrepancies = [];
  let confidenceTotal = 0;
  let confidenceCount = 0;

  for (const output of outputs.filter(Boolean)) {
    for (const story of (output.verifiedStories || [])) {
      const key = story.sourceUrl || `${story.eventKey}|${story.publication}|${story.title}`;
      const previous = verified.get(key);
      if (!previous || Number(story.confidence || 0) > Number(previous.confidence || 0)) {
        verified.set(key, story);
      }
    }

    rejected.push(...(output.rejectedCandidates || []));
    discrepancies.push(...(output.discrepancies || []));

    const c = Number(output.confidence);
    if (Number.isFinite(c)) {
      confidenceTotal += c;
      confidenceCount += 1;
    }
  }

  const verifiedStories = [...verified.values()];
  const recommended = verifiedStories
    .filter(story => story?.eraKey === 'y100' && story?.sourceDesk === 'major_press')
    .sort((a,b) => {
      const ai = Number(a.nationalImportance || 0);
      const bi = Number(b.nationalImportance || 0);
      if (bi !== ai) return bi - ai;
      return Number(b.confidence || 0) - Number(a.confidence || 0);
    })[0]?.eventKey || '';

  return {
    agent: 'source_verification',
    status: 'complete',
    confidence: confidenceCount ? confidenceTotal / confidenceCount : 0,
    recommendedLeadEventKey: recommended,
    verifiedStories,
    rejectedCandidates: rejected,
    discrepancies,
    batchedVerification: true,
  };
}

async function verifySmallBatch(context, batch, contextual, translation, verifyModel) {
  return modelJson(
    verificationPrompt(context, batch, { contextual, translation }),
    {
      model: verifyModel,
      webSearch: true,
      reasoning: 'low',
      maxOutputTokens: batch.length === 1 ? 1300 : 1800,
    }
  );
}

async function verifyResearchResilient(context, research, contextual, translation, verifyModel) {
  const workset = verificationWorkset(research);
  if (!workset.length) {
    return {
      agent: 'source_verification',
      status: 'complete',
      confidence: 0,
      recommendedLeadEventKey: '',
      verifiedStories: [],
      rejectedCandidates: [],
      discrepancies: [{
        type: 'verification_no_candidates',
        scope: 'edition',
        description: 'Research produced no source-linked candidates for verification.',
      }],
      batchedVerification: true,
    };
  }

  const batches = [];
  for (let i = 0; i < workset.length; i += 3) {
    batches.push(workset.slice(i, i + 3));
  }

  const outputs = [];
  const batchFailures = [];

  // Two verification calls at a time: faster than serial, small enough to
  // avoid the earlier giant malformed-JSON response.
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const index = cursor++;
      const batch = batches[index];

      try {
        outputs.push(
          await verifySmallBatch(context, batch, contextual, translation, verifyModel)
        );
      } catch (error) {
        batchFailures.push({ batch, error });
      }
    }
  }

  await Promise.all([
    worker(),
    worker(),
  ]);

  // Retry failed batches candidate-by-candidate. One bad candidate can no
  // longer destroy the whole Source Verification stage.
  for (const failure of batchFailures) {
    for (const candidate of failure.batch) {
      try {
        outputs.push(
          await verifySmallBatch(context, [candidate], contextual, translation, verifyModel)
        );
      } catch (error) {
        outputs.push({
          agent: 'source_verification',
          status: 'complete',
          confidence: 0,
          verifiedStories: [],
          rejectedCandidates: [],
          discrepancies: [{
            type: 'candidate_verification_failed',
            scope: 'story',
            eventKey: candidate.eventKey || '',
            sourceUrl: candidate.sourceUrl || '',
            description: `Candidate could not be verified after batch and single-item retry: ${error.message}`,
          }],
        });
      }
    }
  }

  return mergeVerificationOutputs(outputs);
}


async function completeThenNowEarly(runId, context, edition, verifyModel) {
  const existing = await completedOutput(runId, 'then_now');
  if (existing) return existing;

  let job = null;
  try {
    job = await createJob(runId, 'then_now');

    const result = await modelJson(
      thenNowPrompt(context, edition),
      {
        model: verifyModel,
        webSearch: true,
        reasoning: 'low',
        maxOutputTokens: 1800,
      }
    );

    const finalResult = {
      ...result,
      agent: 'then_now',
      status: 'complete',
      earlyPublished: true,
    };

    const editionRow = await latestEditionForDate(context.editionDate);
    if (editionRow?.id) {
      await update('editions', `id=eq.${editionRow.id}`, {
        payload: {
          ...(editionRow.payload || edition),
          thenNow: result?.show === true ? result : { show: false },
        },
        updated_at: now(),
      });
    }

    if (job?.id) await finishJob(job.id, 'complete', finalResult);
    return finalResult;
  } catch (error) {
    const safeResult = {
      agent: 'then_now',
      status: 'complete',
      show: false,
      skipped: true,
      earlyPublished: true,
      reason: error.message,
      discrepancies: [],
    };

    if (job?.id) {
      await finishJob(job.id, 'complete', safeResult).catch(() => {});
    }

    const editionRow = await latestEditionForDate(context.editionDate);
    if (editionRow?.id) {
      await update('editions', `id=eq.${editionRow.id}`, {
        payload: {
          ...(editionRow.payload || edition),
          thenNow: { show: false },
        },
        updated_at: now(),
      }).catch(() => {});
    }

    return safeResult;
  }
}

export async function runQueuedStage(runId, agentKey) {
  assertCoreEnvironment();
  if (!STAGE_ORDER.includes(agentKey)) throw new Error(`Unknown agent stage: ${agentKey}`);

  // Completed jobs are idempotent and never rerun.
  const existing = await completedOutput(runId, agentKey);
  if (existing) return { ok: true, reused: true, output: existing, continue: true };

  // A browser refresh/resume must never launch a duplicate expensive AI call.
  // Recent work is polled; genuinely stale work is failed and may be retried.
  const alreadyRunning = await clearStaleRunningJob(runId, agentKey);
  if (alreadyRunning) {
    return {
      ok: true,
      inProgress: true,
      continue: false,
      jobId: alreadyRunning.id,
      output: null,
    };
  }

  const { run, context } = await contextForRun(runId);
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const verifyModel = process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra';
  const job = await createJob(runId, agentKey);

  try {
    let output;

    if (agentKey === 'editor_opening') {
      output = await modelJson(
        editorOpeningPrompt(context),
        { model: verifyModel, webSearch: false, reasoning: 'low', maxOutputTokens: 1800 }
      );
    } else if (RESEARCH_KEYS.includes(agentKey)) {
      const opening = await completedOutput(runId, 'editor_opening') || {};
      const majorDiscovery = agentKey === 'major_press'
        ? null
        : await completedOutput(runId, 'major_press');
      const anchorCandidates = Array.isArray(majorDiscovery?.candidates)
        ? majorDiscovery.candidates
            .filter(item => item?.eraKey === 'y100')
            .sort((a,b) => Number(b?.nationalImportance || 0) - Number(a?.nationalImportance || 0))
            .slice(0,5)
        : [];

      try {
        output = await modelJson(
          researchPrompt(agentKey, context, opening.agenda || {}, anchorCandidates),
          { model, webSearch: true, reasoning: 'low', maxOutputTokens: 3800 }
        );
      } catch (researchError) {
        const formattingFailure = /json|syntax|expected|unterminated|property value|array element/i
          .test(String(researchError?.message || ''));

        if (formattingFailure && ['regional_local','community_press'].includes(agentKey)) {
          output = {
            agent: agentKey,
            status: 'complete',
            confidence: 0,
            candidates: [],
            discrepancies: [{
              type: 'model_json_unrecoverable',
              scope: 'story',
              description: `Research completed but malformed output could not be safely repaired: ${researchError.message}`,
            }],
            searchNotes: ['No malformed candidate was accepted into publication.'],
          };
        } else {
          throw researchError;
        }
      }
    } else {
      const opening = await completedOutput(runId, 'editor_opening') || {};
      const researchOut = await researchOutputs(runId);
      const research = flattenResearch(researchOut);
      const visualOutput = await completedOutput(runId, 'visual_archive') || { candidates: [] };
      const visuals = visualOutput;

      if (agentKey === 'historical_context') {
        output = await modelJson(contextPrompt(context, research), { model, webSearch: true, reasoning: 'low', maxOutputTokens: 3000 });
      } else if (agentKey === 'translation') {
        const translatable = research.filter(item => {
          const language = String(item?.language || '').trim().toLowerCase();
          return language && !['en','eng','english'].includes(language);
        });
        if (!translatable.length) {
          output = {
            agent: 'translation',
            status: 'complete',
            skipped: true,
            reason: 'No non-English publication candidates require translation.',
            translations: [],
            needsHuman: [],
            discrepancies: [],
            confidence: 1,
          };
        } else {
          output = await modelJson(
            translationPrompt(context, translatable),
            { model, webSearch: false, reasoning: 'low', maxOutputTokens: 2600 }
          );
        }
      } else if (agentKey === 'source_verification') {
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        if (!research.length) throw new Error('No completed research candidates are available for source verification.');

        // STABILITY ROLLBACK:
        // The previous all-in-one verification request could return one giant
        // malformed JSON payload and freeze the newsroom at Agent #4.
        // Verify small batches instead and salvage safe results candidate-by-candidate.
        output = await verifyResearchResilient(
          context,
          research,
          contextual,
          translation,
          verifyModel
        );

        // SIDE-ERA RECOVERY:
        // Ranking cannot fill an empty era. If Source Verification received no
        // verified y200 or y76(approved 75-year window) story, perform one
        // focused recovery search for that era before publishing.
        const verifiedStories = Array.isArray(output.verifiedStories) ? output.verifiedStories : [];
        const missingSideEras = ['y200','y76'].filter(
          eraKey => !verifiedStories.some(story => story?.eraKey === eraKey && story?.title && story?.sourceUrl)
        );

        if (missingSideEras.length) {
          const recoveries = await Promise.all(
            missingSideEras.map(async eraKey => {
              try {
                return await modelJson(
                  sideEraRecoveryPrompt(context, eraKey),
                  { model: verifyModel, webSearch: true, reasoning: 'medium', maxOutputTokens: 2200 }
                );
              } catch (error) {
                return {
                  agent: 'side_era_recovery',
                  eraKey,
                  verifiedStory: null,
                  discrepancies: [{ description: error.message }],
                };
              }
            })
          );

          for (const recovery of recoveries) {
            if (recovery?.verifiedStory?.title && recovery?.verifiedStory?.sourceUrl) {
              output.verifiedStories = [
                ...(output.verifiedStories || []),
                recovery.verifiedStory,
              ];
            } else if (Array.isArray(recovery?.discrepancies)) {
              output.discrepancies = [
                ...(output.discrepancies || []),
                ...recovery.discrepancies.map(item => ({
                  ...item,
                  scope: item.scope || 'story',
                  eraKey: recovery.eraKey,
                  type: item.type || 'side_era_recovery',
                })),
              ];
            }
          }
        }

        // ROLLING PUBLISH:
        // As soon as core stories pass Source Verification, publish original
        // text summaries + source links. Rights/visual/social work may continue
        // without holding the public site empty.
        const verificationGate = verificationOnlyGate(output);
        const rollingSafe = safeVerifiedStories(output, verificationGate);

        if (rollingSafe.length) {
          const rollingOutput = {
            agent: 'source_verification',
            status: 'complete',
            edition: deterministicEdition(context, rollingSafe, verificationGate),
            confidence: Math.min(
              ...rollingSafe.map(story => confidence(story.confidence)).filter(Number.isFinite),
              0.75
            ),
            rollingPublish: true,
          };

          const rolling = await persistEditionCore(
            run,
            context,
            rollingOutput,
            output,
            verificationGate
          );

          const earlyThenNow = await completeThenNowEarly(
            runId,
            context,
            rolling.edition,
            verifyModel
          );

          output = {
            ...output,
            rollingPublish: {
              published: rolling.edition.publicationStatus === 'published',
              publishedStoryCount: rolling.safeStories.length,
              editionId: rolling.savedEdition.id,
              publishedAt: now(),
              mode: 'essential_content_early_publish',
              includesSideEraRecovery: true,
              thenNowCompleted: Boolean(earlyThenNow),
            },
          };
        }
      } else if (agentKey === 'then_now') {
        const editor = await completedOutput(runId, 'editor_producer');
        const edition = editor?.edition || editor;
        if (!edition) throw new Error('Published edition is unavailable for Then & Now.');

        try {
          const result = await modelJson(
            thenNowPrompt(context, edition),
            { model: verifyModel, webSearch: true, reasoning: 'medium', maxOutputTokens: 2400 }
          );

          const editionRow = await latestEditionForDate(context.editionDate);
          if (editionRow?.id) {
            await update('editions', `id=eq.${editionRow.id}`, {
              payload: {
                ...(editionRow.payload || edition),
                thenNow: result?.show === true ? result : { show: false },
              },
              updated_at: now(),
            });
          }

          output = { ...result, agent: 'then_now', status: 'complete' };
        } catch (error) {
          output = {
            agent: 'then_now',
            status: 'complete',
            show: false,
            skipped: true,
            reason: error.message,
            discrepancies: [],
          };
        }
      } else if (agentKey === 'archive_recipe') {
        try {
          const result = await modelJson(
            archiveRecipePrompt(context),
            { model, webSearch: true, reasoning: 'medium', maxOutputTokens: 2800 }
          );

          const editionRow = await latestEditionForDate(context.editionDate);
          if (editionRow?.id) {
            await update('editions', `id=eq.${editionRow.id}`, {
              payload: {
                ...(editionRow.payload || {}),
                archiveRecipe: result?.recipe || null,
              },
              updated_at: now(),
            });
          }

          output = { ...result, agent: 'archive_recipe', status: 'complete' };
        } catch (error) {
          output = {
            agent: 'archive_recipe',
            status: 'complete',
            recipe: null,
            skipped: true,
            reason: error.message,
            discrepancies: [],
          };
        }
      } else if (agentKey === 'visual_archive') {
        const verified = await completedOutput(runId, 'source_verification');
        if (!verified) throw new Error('Source Verification has not completed.');
        output = await modelJson(
          visualArchivePrompt(context, verified, opening.agenda || {}),
          { model, webSearch: true, reasoning: 'low', maxOutputTokens: 2600 }
        );
      } else if (agentKey === 'rights_review') {
        const verified = await completedOutput(runId, 'source_verification');
        if (!verified) throw new Error('Source Verification has not completed.');
        output = await modelJson(
          rightsPrompt(context, verified, chooseVisuals(visuals)),
          { model: verifyModel, webSearch: true, reasoning: 'low', maxOutputTokens: 3200 }
        );
      } else if (agentKey === 'discrepancy_exception') {
        const verified = await completedOutput(runId, 'source_verification');
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        const rights = await completedOutput(runId, 'rights_review');
        const failures = await failedJobs(runId);
        if (!verified || !rights) throw new Error('Verification and rights review must complete first.');

        const knownIssues = [
          ...(verified.discrepancies || []),
          ...(contextual.discrepancies || []),
          ...(translation.discrepancies || []),
          ...(translation.needsHuman || []),
          ...(rights.discrepancies || []),
          ...failures.filter(f => !NONFATAL_KEYS.has(f.agent_key)),
        ];

        if (!knownIssues.length) {
          output = {
            agent: 'discrepancy_exception',
            status: 'complete',
            publishable: true,
            blocking: [],
            nonBlocking: [],
            humanReviewRequired: false,
            confidence: 1,
            autoResolved: true,
            discrepancies: [],
          };
        } else {
          output = await modelJson(
            discrepancyPrompt(context, { verified, contextual, translation, rights, visuals, agentFailures: failures }),
            { model: verifyModel, webSearch: false, reasoning: 'medium', maxOutputTokens: 3200 }
          );
        }
      } else if (agentKey === 'editor_producer') {
        const coreVerified = await completedOutput(runId, 'source_verification');
        const contextual = await completedOutput(runId, 'historical_context') || {};
        const translation = await completedOutput(runId, 'translation') || {};
        const rights = await completedOutput(runId, 'rights_review');
        const discrepancy = await completedOutput(runId, 'discrepancy_exception');
        if (!coreVerified || !rights || !discrepancy) throw new Error('Editorial dependencies are incomplete.');

        // Supporting desks continue AFTER the first rolling publication. Verify
        // any new Regional/Community candidates now and fold them into the final
        // edition without delaying the first public stories.
        const supportingOutputs = [];
        for (const key of ['regional_local', 'community_press']) {
          const candidateOutput = await completedOutput(runId, key);
          if (candidateOutput) supportingOutputs.push(candidateOutput);
        }

        const alreadyVerified = new Set((coreVerified.verifiedStories || []).map(storyIdentity));
        const supportingCandidates = flattenResearch(supportingOutputs)
          .filter(story => !alreadyVerified.has(storyIdentity(story)));

        let verified = coreVerified;
        let finalDiscrepancy = discrepancy;

        if (supportingCandidates.length) {
          try {
            const supplemental = await modelJson(
              verificationPrompt(context, supportingCandidates, { contextual, translation }),
              { model: verifyModel, webSearch: true, reasoning: 'low', maxOutputTokens: 3400 }
            );
            verified = mergeVerified(coreVerified, supplemental);

            const supplementGate = verificationOnlyGate(supplemental);
            finalDiscrepancy = {
              ...discrepancy,
              blocking: [
                ...(discrepancy.blocking || []),
                ...(supplementGate.blocking || []),
              ],
              nonBlocking: [
                ...(discrepancy.nonBlocking || []),
                ...(supplementGate.nonBlocking || []),
              ],
              humanReviewRequired: Boolean(discrepancy.humanReviewRequired || supplementGate.blocking.length),
            };
          } catch (supplementError) {
            // Never take down the already-published core edition because a
            // supporting-desk enrichment call failed.
          }
        }

        const safeStories = safeVerifiedStories(verified, finalDiscrepancy);
        if (!safeStories.length) {
          throw new Error('No verified, undisputed stories are available to publish.');
        }

        // TIME-TO-PUBLISH RULE:
        // Put a deterministic verified edition on the public endpoint BEFORE
        // spending time on editorial prose polish or nonessential visuals.
        const immediateOutput = {
          agent: 'editor_producer',
          status: 'complete',
          edition: deterministicEdition(context, safeStories, finalDiscrepancy),
          confidence: Math.min(
            ...safeStories.map(story => confidence(story.confidence)).filter(Number.isFinite),
            0.75
          ),
          discrepancies: [],
          immediatePublish: true,
        };
        const immediate = await persistEditionCore(run, context, immediateOutput, verified, finalDiscrepancy);

        try {
          const polished = await modelJson(
            editorPrompt(
              context,
              { ...verified, verifiedStories: safeStories },
              contextual,
              rights,
              [],
              finalDiscrepancy,
              opening.agenda || {}
            ),
            { model: verifyModel, webSearch: false, reasoning: 'medium', maxOutputTokens: 3800 }
          );

          const polishedPersist = await persistEditionCore(run, context, polished, verified, finalDiscrepancy);
          output = {
            ...polished,
            edition: polishedPersist.edition,
            savedEditionId: polishedPersist.savedEdition.id,
            publishedStoryCount: polishedPersist.safeStories.length,
            immediatePublish: true,
          };
        } catch (editorError) {
          // The public site is already serving the verified deterministic edition.
          output = {
            ...immediateOutput,
            edition: immediate.edition,
            savedEditionId: immediate.savedEdition.id,
            publishedStoryCount: immediate.safeStories.length,
            discrepancies: [{
              type: 'editor_polish_fallback',
              description: `Verified edition published; optional editor polish did not complete: ${editorError.message}`,
            }],
          };
        }
      } else if (agentKey === 'illustrator') {
        let editionRow = await latestEditionForDate(context.editionDate);

        if (!editionRow?.id) {
          throw new Error(
            'Illustrator activation failed: no live edition exists for this date. Complete Source Verification/Editor first.'
          );
        }

        const sideResults = {};
        const recoveryErrors = [];

        for (const eraKey of ['y200','y76']) {
          try {
            sideResults[eraKey] = await ensureSideStoryForIllustrator(
              runId,
              context,
              editionRow,
              eraKey,
              verifyModel
            );
            editionRow = await latestEditionForDate(context.editionDate) || editionRow;
          } catch (error) {
            recoveryErrors.push({
              eraKey,
              type: 'side_story_recovery_failed',
              description: error.message,
            });
          }
        }

        const targets = [
          { key: 'y200', label: '200 years ago', story: sideResults?.y200?.story },
          { key: 'y76', label: '75 years ago', story: sideResults?.y76?.story },
        ].filter(item => item.story?.title && item.story?.sourceUrl);

        if (!targets.length) {
          throw new Error(
            `Illustrator activated but had zero verified side-era targets. ${recoveryErrors.map(x => `${x.eraKey}: ${x.description}`).join(' | ')}`
          );
        }

        const illustrations = {};
        const generationErrors = [];

        const generated = await Promise.allSettled(
          targets.map(async target => {
            const result = await generateHistoricalIllustration({
              story: target.story,
              eraLabel: target.label,
            });

            const safeDate = String(context.editionDate || '').replace(/[^0-9-]/g, '');
            const path = `${safeDate}/${target.key}-${runId}-${Date.now()}.png`;

            const url = await uploadPublicImage({
              objectPath: path,
              bytes: result.bytes,
              contentType: result.contentType,
            });

            return {
              key: target.key,
              value: {
                url,
                kind: 'generated_editorial_illustration',
                label: `Editorial illustration — ${target.label}`,
                model: result.model,
                responseId: result.responseId || null,
                storyEventKey: target.story.eventKey || '',
                sourceHeadline: target.story.title || '',
                sourceUrl: target.story.sourceUrl || '',
                generatedAt: now(),
              },
            };
          })
        );

        generated.forEach((result, index) => {
          const target = targets[index];

          if (result.status === 'fulfilled') {
            illustrations[result.value.key] = result.value.value;
          } else {
            generationErrors.push({
              eraKey: target.key,
              type: 'illustration_generation_failed',
              description: result.reason?.message || String(result.reason),
            });
          }
        });

        if (!Object.keys(illustrations).length) {
          throw new Error(
            `Illustrator ACTIVATED but image generation produced zero usable images. ${generationErrors.map(x => `${x.eraKey}: ${x.description}`).join(' | ')}`
          );
        }

        editionRow = await latestEditionForDate(context.editionDate) || editionRow;
        await persistIllustrations(editionRow, illustrations);

        output = {
          agent: 'illustrator',
          status: 'complete',
          activated: true,
          generatedCount: Object.keys(illustrations).length,
          targetCount: targets.length,
          recoveredSideStories: Object.fromEntries(
            Object.entries(sideResults).map(([key, value]) => [key, Boolean(value?.recovered)])
          ),
          illustrations,
          discrepancies: [...recoveryErrors, ...generationErrors],
          confidence: Object.keys(illustrations).length === targets.length ? 1 : 0.8,
          note: 'Illustrator executed independently and wrote side-era artwork to the live edition.',
        };
      } else if (agentKey === 'social_editor') {
        const editor = await completedOutput(runId, 'editor_producer');
        const edition = editor?.edition || editor;
        if (!edition) throw new Error('Published edition is unavailable for social editing.');
        output = await modelJson(
          socialPrompt('social_editor', context, edition),
          { model, webSearch: false, reasoning: 'low', maxOutputTokens: 2200 }
        );
      } else if (agentKey === 'short_form_video') {
        const editor = await completedOutput(runId, 'editor_producer');
        const edition = editor?.edition || editor;

        if (!edition) {
          output = {
            agent: 'short_form_video',
            status: 'complete',
            videos: [],
            posts: [],
            confidence: 0,
            skipped: true,
            reason: 'Published edition is unavailable for short-form video.',
            discrepancies: [],
          };
        } else {
          const major = edition?.stories?.y100?.major || {};
          const black = edition?.stories?.y100?.black || {};
          const y200 = edition?.stories?.y200 || {};
          const y76 = edition?.stories?.y76 || {};

          const leadTitle =
            major.title ||
            y200.title ||
            y76.title ||
            edition.leadHeadline ||
            'Today in American history';

          const leadSummary =
            major.summary ||
            black.summary ||
            y200.summary ||
            y76.summary ||
            '';

          const leadSource =
            major.sourceUrl ||
            black.sourceUrl ||
            y200.sourceUrl ||
            y76.sourceUrl ||
            '';

          const comparisonLine = black?.title
            ? `The Black Press covered the same moment through a different community lens: ${black.title}.`
            : 'Community press coverage adds another perspective to the historical record.';

          const scriptA = [
            `On this day in American history: ${leadTitle}.`,
            leadSummary,
            comparisonLine,
            'See the original newspaper sources and the full historical comparison on On This Day.'
          ].filter(Boolean).join(' ');

          const sideTitle = y200?.title || y76?.title || leadTitle;
          const sideSource = y200?.sourceUrl || y76?.sourceUrl || leadSource;
          const sideEra = y200?.title ? '200 years ago' : (y76?.title ? '75 years ago' : 'in the archive');

          const scriptB = [
            `A second look ${sideEra}: ${sideTitle}.`,
            y200?.title ? y200.summary : y76?.summary,
            'The full edition connects original newspaper reporting with verified historical context.'
          ].filter(Boolean).join(' ');

          const videos = [
            {
              platform: 'YouTube Shorts / Instagram Reels / TikTok',
              title: leadTitle,
              hook: `What was America reading on this day?`,
              script: scriptA.slice(0, 900),
              shots: [
                'Open on the On This Day masthead',
                'Show the verified Major American headline',
                black?.title ? 'Cut to the Black Press comparison' : 'Show a Community Press Voices tile',
                'Show the original-source link',
                'Close on onthisday.tv'
              ],
              caption: `${leadTitle} — verified historical newspaper coverage from On This Day.`,
              sourceUrl: leadSource,
              linkUrl: process.env.SITE_URL || 'https://www.onthisday.tv',
            },
            {
              platform: 'YouTube Shorts / Instagram Reels / TikTok',
              title: sideTitle,
              hook: `What made the news ${sideEra}?`,
              script: scriptB.slice(0, 900),
              shots: [
                `Show the ${sideEra} tile`,
                'Display the verified historical headline',
                'Show publication/date/source',
                'Brief historical-context card',
                'Close on onthisday.tv'
              ],
              caption: `${sideTitle} — from the On This Day historical edition.`,
              sourceUrl: sideSource,
              linkUrl: process.env.SITE_URL || 'https://www.onthisday.tv',
            }
          ];

          // Keep a posts-compatible representation for Social Distribution.
          const posts = videos.map(video => ({
            platform: 'short_form_video',
            format: 'vertical_video_script',
            title: video.title,
            body: video.script,
            caption: video.caption,
            hashtags: ['#OnThisDay', '#History', '#AmericanHistory'],
            sourceUrl: video.sourceUrl,
            linkUrl: video.linkUrl,
            scheduledWindow: '',
            mediaInstructions: video.shots.join(' | '),
          }));

          output = {
            agent: 'short_form_video',
            status: 'complete',
            generationMode: 'deterministic_verified_edition',
            videos,
            posts,
            confidence: 1,
            discrepancies: [],
            note: 'Generated locally from the verified published edition; no external AI/video endpoint was called.',
          };
        }
      } else if (agentKey === 'engagement_trends') {
        const editor = await completedOutput(runId, 'editor_producer');
        if (!editor?.edition) throw new Error('Editor & Producer has not completed.');
        const priorMetrics = await select('social_metrics', 'select=*&order=recorded_at.desc&limit=100').catch(() => []);
        output = await modelJson(
          trendsPrompt(context, editor.edition, priorMetrics),
          { model, reasoning: 'low', maxOutputTokens: 2400 }
        );
      } else if (agentKey === 'social_distribution') {
        const editor = await completedOutput(runId, 'editor_producer');
        const socialEditor = await completedOutput(runId, 'social_editor') || { posts: [] };
        const video = await completedOutput(runId, 'short_form_video') || { posts: [] };
        const discrepancy = await completedOutput(runId, 'discrepancy_exception') || {};
        const posts = [...(socialEditor.posts || []), ...(video.posts || [])];

        const editions = await select('editions', `select=*&run_id=eq.${runId}&limit=1`);
        const edition = editions[0] || null;

        if (edition) {
          await remove('social_posts', `edition_id=eq.${edition.id}`).catch(() => {});
          const rows = posts.map(post => ({
            edition_id: edition.id,
            platform: post.platform || '',
            format: post.format || '',
            status: discrepancy.humanReviewRequired ? 'queued' : 'queued',
            content: post,
            scheduled_for: null,
          }));
          if (rows.length) await insert('social_posts', rows, { returning: false });
        }

        const results = editor?.edition?.publicationStatus === 'published'
          ? await dispatchPosts(posts, editor?.edition || {})
          : posts.map(post => ({ platform: post.platform, status: 'waiting_human_review' }));

        output = {
          agent: agentKey,
          status: 'complete',
          results,
          postsQueued: posts.length,
          confidence: 1,
          discrepancies: [],
        };
      } else {
        throw new Error(`No stage implementation for ${agentKey}`);
      }
    }

    await finishJob(job, output);

    if (agentKey === 'social_distribution') {
      const discrepancy = await completedOutput(runId, 'discrepancy_exception') || {};
      const verified = await completedOutput(runId, 'source_verification') || {};
      const socialEditor = await completedOutput(runId, 'social_editor') || { posts: [] };
      const shortVideo = await completedOutput(runId, 'short_form_video') || { posts: [] };

      await update('agent_runs', `id=eq.${runId}`, {
        status: 'complete',
        publishable: true,
        human_review_required: Boolean(discrepancy.humanReviewRequired),
        summary: {
          verifiedStories: (verified.verifiedStories || []).length,
          blockingDiscrepancies: (discrepancy.blocking || []).length,
          socialPosts: (socialEditor.posts || []).length + (shortVideo.posts || []).length,
        },
        finished_at: now(),
      });
    }

    return { ok: true, output, continue: true };
  } catch (error) {
    await finishJob(
      job,
      { agent: agentKey, status: 'failed', confidence: 0, discrepancies: [{ type: 'agent_failure', description: error.message }] },
      'failed',
      error.message
    ).catch(() => {});

    const nonfatal = NONFATAL_KEYS.has(agentKey);
    if (!nonfatal) {
      await update('agent_runs', `id=eq.${runId}`, {
        status: 'failed',
        error: `${agentKey}: ${error.message}`,
        finished_at: now(),
      }).catch(() => {});
    }

    return { ok: false, error: error.message, nonfatal, continue: nonfatal };
  }
}
